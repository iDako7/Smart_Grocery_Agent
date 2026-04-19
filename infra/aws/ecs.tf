resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.prefix}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "/ecs/${local.prefix}"
  })
}

resource "aws_ecs_cluster" "this" {
  name = "${local.prefix}-cluster"

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-cluster"
  })
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${local.prefix}-app"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = local.execution_role_arn
  task_role_arn            = local.task_role_arn

  # Run on Graviton (ARM64). Fixes #146: Tailwind v4's @tailwindcss/oxide
  # linux-amd64 native binary emits a broken CSS bundle missing every
  # numeric spacing utility; linux-arm64 produces the correct bundle.
  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = local.image_uri
      essential = true
      portMappings = [
        {
          containerPort = var.app_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "PORT", value = tostring(var.app_port) },
        { name = "SERVE_FRONTEND", value = "true" },
        { name = "APP_ENV", value = "production" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "SGA_MODEL", value = var.sga_model }
      ]
      secrets = [
        { name = "OPENROUTER_API_KEY", valueFrom = aws_ssm_parameter.openrouter_api_key.arn },
        { name = "JWT_SECRET", valueFrom = aws_ssm_parameter.jwt_secret.arn },
        { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
        { name = "REDIS_URL", valueFrom = aws_ssm_parameter.redis_url.arn }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "app"
        }
      }
    }
  ])

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-app"
  })
}

resource "aws_ecs_service" "app" {
  name            = "${local.prefix}-app"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [for s in aws_subnet.public : s.id]
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.app_port
  }

  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  depends_on = [aws_lb_listener.http]

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-app"
  })
}
