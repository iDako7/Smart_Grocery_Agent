"""Test H — infra-only cost model calculator for Fly.io vs AWS.

Reads billing inputs from data/billing_inputs.json (template written if missing),
computes monthly infra cost for each platform, and writes data/test_h_cost.json.

NOT a live test. Pure cost-model calculation using public AWS list prices.

Usage:
    python scripts/test_h_cost.py [--billing-inputs PATH]

AWS pricing sources (us-west-2, as of 2026-Q1):
    Fargate Linux/ARM64:
        https://aws.amazon.com/fargate/pricing/
        vCPU: $0.04048/hr, GB mem: $0.004445/hr
        (ARM64 same price as amd64 on Fargate)
    RDS db.t4g.micro on-demand PostgreSQL:
        https://aws.amazon.com/rds/postgresql/pricing/
        $0.016/hr instance; gp3 storage $0.115/GB-month
    ALB:
        https://aws.amazon.com/elasticloadbalancing/pricing/
        $0.0225/hr fixed + $0.008/LCU-hr
    CloudFront PriceClass_100 (US/EU/Asia PoPs):
        https://aws.amazon.com/cloudfront/pricing/
        Data transfer out: first 10TB $0.085/GB
        HTTPS requests: first 10,000/month free; then $0.0075/10,000 requests
    ECR:
        https://aws.amazon.com/ecr/pricing/
        $0.10/GB-month storage
    CloudWatch Logs:
        https://aws.amazon.com/cloudwatch/pricing/
        $0.50/GB ingested
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Public AWS list prices — us-west-2, Linux (ARM64 = same as amd64 on Fargate)
# Source: https://aws.amazon.com/fargate/pricing/ (accessed 2026-Q1)
# ---------------------------------------------------------------------------
FARGATE_VCPU_PER_HR: float = 0.04048       # USD / vCPU-hr
FARGATE_GB_MEM_PER_HR: float = 0.004445    # USD / GB-hr

# Source: https://aws.amazon.com/rds/postgresql/pricing/
RDS_INSTANCE_PER_HR: float = 0.016         # USD / hr  (db.t4g.micro on-demand)
RDS_STORAGE_GP3_PER_GB_MO: float = 0.115   # USD / GB-month

# Source: https://aws.amazon.com/elasticloadbalancing/pricing/
ALB_FIXED_PER_HR: float = 0.0225           # USD / hr  (base ALB charge)
ALB_LCU_PER_HR: float = 0.008             # USD / LCU-hr

# Source: https://aws.amazon.com/cloudfront/pricing/ (PriceClass_100)
CF_DATA_OUT_PER_GB: float = 0.085          # USD / GB out (first 10 TB)
CF_REQUESTS_FREE_THRESHOLD: int = 10_000   # first N HTTPS requests/month free
CF_REQUESTS_PER_10K: float = 0.0075        # USD per 10,000 HTTPS requests (after free tier)

# Source: https://aws.amazon.com/ecr/pricing/
ECR_STORAGE_PER_GB_MO: float = 0.10        # USD / GB-month

# Source: https://aws.amazon.com/cloudwatch/pricing/
CW_LOGS_PER_GB_INGESTED: float = 0.50      # USD / GB ingested


# ---------------------------------------------------------------------------
# Billing input template
# ---------------------------------------------------------------------------

BILLING_TEMPLATE: dict = {
    "fly": {
        "monthly_app_cost_usd": 5.00,
        "monthly_postgres_cost_usd": 0.00,
        "monthly_total_infra_usd": 5.00,
        "estimated_monthly_requests": 1000,
        "source": "fly.io dashboard",
    },
    "aws": {
        "billing_source": "AWS Cost Explorer",
        "fargate": {
            "vcpu_hours": None,
            "gb_hours": None,
            "task_hours": None,
        },
        "rds": {
            "instance_hours": None,
            "storage_gb_months": None,
        },
        "alb": {
            "lcu_hours": None,
        },
        "cloudfront": {
            "requests": None,
            "gb_transfer_out": None,
        },
        "ecr": {
            "storage_gb": None,
        },
        "cloudwatch": {
            "logs_gb_ingested": None,
        },
        "aws_region": "us-west-2",
        "estimated_monthly_requests": 1000,
    },
}


def _resolve_paths(billing_inputs_arg: str) -> tuple[Path, Path]:
    """Resolve billing_inputs and output paths relative to this script's parent dir."""
    script_dir = Path(__file__).resolve().parent
    parent_dir = script_dir.parent  # evals/infra_comparison/

    if billing_inputs_arg:
        billing_path = Path(billing_inputs_arg)
        if not billing_path.is_absolute():
            billing_path = parent_dir / billing_inputs_arg
    else:
        billing_path = parent_dir / "data" / "billing_inputs.json"

    output_path = parent_dir / "data" / "test_h_cost.json"
    return billing_path, output_path


def _has_aws_data(aws: dict) -> bool:
    """Return True if all required AWS numeric fields are non-null."""
    try:
        return (
            aws["fargate"]["vcpu_hours"] is not None
            and aws["fargate"]["gb_hours"] is not None
            and aws["rds"]["instance_hours"] is not None
            and aws["rds"]["storage_gb_months"] is not None
            and aws["alb"]["lcu_hours"] is not None
            and aws["cloudfront"]["requests"] is not None
            and aws["cloudfront"]["gb_transfer_out"] is not None
            and aws["ecr"]["storage_gb"] is not None
            and aws["cloudwatch"]["logs_gb_ingested"] is not None
        )
    except (KeyError, TypeError):
        return False


def _compute_fly(fly: dict) -> dict:
    """Compute Fly.io cost model from dashboard totals."""
    monthly = float(fly.get("monthly_total_infra_usd", 0.0))
    monthly_requests = int(fly.get("estimated_monthly_requests", 1000))
    cost_per_1k = (monthly / monthly_requests * 1000) if monthly_requests > 0 else 0.0
    return {
        "monthly_total_usd": round(monthly, 6),
        "cost_per_1000_requests_usd": round(cost_per_1k, 6),
        "source": fly.get("source", "fly.io dashboard"),
    }


def _compute_aws(aws: dict) -> dict:
    """Compute AWS cost model from metered billing inputs and public list prices."""
    fargate = aws["fargate"]
    rds = aws["rds"]
    alb = aws["alb"]
    cf = aws["cloudfront"]
    ecr = aws["ecr"]
    cw = aws["cloudwatch"]

    # Fargate compute
    fargate_cost = (
        float(fargate["vcpu_hours"]) * FARGATE_VCPU_PER_HR
        + float(fargate["gb_hours"]) * FARGATE_GB_MEM_PER_HR
    )

    # RDS PostgreSQL
    rds_cost = (
        float(rds["instance_hours"]) * RDS_INSTANCE_PER_HR
        + float(rds["storage_gb_months"]) * RDS_STORAGE_GP3_PER_GB_MO
    )

    # ALB (fixed hourly + LCU)
    # task_hours used for ALB fixed-hour count when available; fall back to RDS instance_hours
    # as a proxy for "hours the service was running" (both are always-warm in the AWS stack).
    alb_running_hours = float(fargate.get("task_hours") or rds["instance_hours"])
    alb_cost = (
        alb_running_hours * ALB_FIXED_PER_HR
        + float(alb["lcu_hours"]) * ALB_LCU_PER_HR
    )

    # CloudFront
    cf_data_cost = float(cf["gb_transfer_out"]) * CF_DATA_OUT_PER_GB
    cf_requests = int(cf["requests"])
    billable_cf_requests = max(0, cf_requests - CF_REQUESTS_FREE_THRESHOLD)
    cf_request_cost = (billable_cf_requests / 10_000) * CF_REQUESTS_PER_10K
    cf_cost = cf_data_cost + cf_request_cost

    # ECR
    ecr_cost = float(ecr["storage_gb"]) * ECR_STORAGE_PER_GB_MO

    # CloudWatch Logs
    cw_cost = float(cw["logs_gb_ingested"]) * CW_LOGS_PER_GB_INGESTED

    monthly_total = fargate_cost + rds_cost + alb_cost + cf_cost + ecr_cost + cw_cost
    monthly_requests = int(aws.get("estimated_monthly_requests", 1000))
    cost_per_1k = (monthly_total / monthly_requests * 1000) if monthly_requests > 0 else 0.0

    return {
        "monthly_total_usd": round(monthly_total, 6),
        "cost_per_1000_requests_usd": round(cost_per_1k, 6),
        "breakdown": {
            "fargate": round(fargate_cost, 6),
            "rds": round(rds_cost, 6),
            "alb": round(alb_cost, 6),
            "cloudfront": round(cf_cost, 6),
            "ecr": round(ecr_cost, 6),
            "cloudwatch": round(cw_cost, 6),
        },
        "source": aws.get("billing_source", "AWS Cost Explorer"),
    }


def _compute_comparison(fly_result: dict, aws_result: dict) -> dict:
    fly_cost = fly_result["monthly_total_usd"]
    aws_cost = aws_result["monthly_total_usd"]
    if fly_cost > 0:
        multiplier = aws_cost / fly_cost
    else:
        multiplier = None
    absolute = aws_cost - fly_cost
    return {
        "aws_premium_multiplier": round(multiplier, 3) if multiplier is not None else None,
        "aws_premium_absolute_usd": round(absolute, 6),
        "note": (
            f"AWS monthly infra is {'%.2fx' % multiplier if multiplier is not None else 'N/A'} "
            f"the cost of Fly.io (${fly_cost:.2f} Fly vs ${aws_cost:.2f} AWS). "
            "LLM cost (OpenRouter) is identical on both platforms and excluded from this model."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Test H — infra cost model: Fly.io vs AWS per-1000-request cost."
    )
    parser.add_argument(
        "--billing-inputs",
        default="",
        help="Path to billing_inputs.json (default: data/billing_inputs.json relative to script parent)",
    )
    args = parser.parse_args()

    billing_path, output_path = _resolve_paths(args.billing_inputs)

    # --- Template creation ---
    if not billing_path.exists():
        billing_path.parent.mkdir(parents=True, exist_ok=True)
        billing_path.write_text(json.dumps(BILLING_TEMPLATE, indent=2))
        print(f"Template written to {billing_path}")
        print("Fill in values from billing dashboards and re-run.")
        sys.exit(0)

    # --- Load inputs ---
    try:
        inputs = json.loads(billing_path.read_text())
    except json.JSONDecodeError as err:
        print(f"ERROR: {billing_path} is not valid JSON: {err}", file=sys.stderr)
        sys.exit(1)

    fly = inputs.get("fly", {})
    aws = inputs.get("aws", {})

    # --- Compute Fly cost ---
    fly_result = _compute_fly(fly)

    # --- Compute AWS cost (or skip if data not yet provided) ---
    run_at = datetime.now(timezone.utc).isoformat()

    if not _has_aws_data(aws):
        result = {
            "run_at": run_at,
            "fly": fly_result,
            "aws": None,
            "comparison": {
                "aws_premium_multiplier": None,
                "aws_premium_absolute_usd": None,
                "note": "AWS billing data not yet provided; fly-only cost model",
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, indent=2))
        print(f"Partial results written to {output_path} (Fly only — AWS data missing).")
        print(f"  Fly monthly total:           ${fly_result['monthly_total_usd']:.4f}")
        print(f"  Fly cost per 1000 requests:  ${fly_result['cost_per_1000_requests_usd']:.4f}")
        return

    aws_result = _compute_aws(aws)
    comparison = _compute_comparison(fly_result, aws_result)

    result = {
        "run_at": run_at,
        "fly": fly_result,
        "aws": aws_result,
        "comparison": comparison,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2))

    print(f"Results written to {output_path}")
    print()
    print("=== Test H Cost Model ===")
    print(f"  Fly  monthly total:           ${fly_result['monthly_total_usd']:.4f}")
    print(f"  AWS  monthly total:           ${aws_result['monthly_total_usd']:.4f}")
    print()
    print(f"  Fly  cost / 1000 requests:    ${fly_result['cost_per_1000_requests_usd']:.4f}")
    print(f"  AWS  cost / 1000 requests:    ${aws_result['cost_per_1000_requests_usd']:.4f}")
    print()
    if comparison["aws_premium_multiplier"] is not None:
        print(f"  AWS premium (multiplier):     {comparison['aws_premium_multiplier']:.2f}x")
    print(f"  AWS premium (absolute USD):   ${comparison['aws_premium_absolute_usd']:.4f}/month")
    print()
    bd = aws_result["breakdown"]
    print("  AWS breakdown:")
    for svc, cost in bd.items():
        print(f"    {svc:<12} ${cost:.4f}")


if __name__ == "__main__":
    main()
