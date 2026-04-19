locals {
  prefix = "${var.project_name}-${var.environment}"

  execution_role_arn = var.use_existing_iam_roles ? data.aws_iam_role.existing_execution[0].arn : aws_iam_role.ecs_task_execution[0].arn
  task_role_arn      = var.use_existing_iam_roles ? data.aws_iam_role.existing_task[0].arn : aws_iam_role.ecs_task[0].arn

  image_uri = var.image_uri != "" ? var.image_uri : "${aws_ecr_repository.this.repository_url}:${var.image_tag}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
