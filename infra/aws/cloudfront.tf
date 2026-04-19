##
# CloudFront distribution in front of the ALB.
#
# Provides HTTPS on the default *.cloudfront.net hostname so browsers don't
# flag the showcase as "Not secure". The ALB listener stays HTTP-only — TLS
# terminates at the CloudFront edge and the origin request is plain HTTP.
#
# SSE streaming (/chat) requires:
#   - CachingDisabled cache policy (no buffering of event streams)
#   - AllViewer origin request policy (forwards Authorization, Accept, etc.)
#   - Compression off (gzip can buffer SSE)
#
# Fixes #145.
##

resource "aws_cloudfront_distribution" "this" {
  count = var.enable_cloudfront ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.prefix} — HTTPS in front of ALB (showcase)"
  price_class     = "PriceClass_100"

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.this.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60
    }
  }

  default_cache_behavior {
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    # Managed-CachingDisabled — required for SSE.
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    # Managed-AllViewer — forwards all headers (Authorization, Accept, ...).
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-cf"
  })
}
