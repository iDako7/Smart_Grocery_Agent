data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

data "aws_iam_role" "existing_task" {
  count = var.use_existing_iam_roles ? 1 : 0
  name  = var.existing_task_role_name
}

data "aws_iam_role" "existing_execution" {
  count = var.use_existing_iam_roles ? 1 : 0
  name  = var.existing_execution_role_name
}

resource "aws_iam_role" "ecs_task_execution" {
  count              = var.use_existing_iam_roles ? 0 : 1
  name               = "${local.prefix}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  count      = var.use_existing_iam_roles ? 0 : 1
  role       = aws_iam_role.ecs_task_execution[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  count              = var.use_existing_iam_roles ? 0 : 1
  name               = "${local.prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = local.common_tags
}

data "aws_iam_policy_document" "ecs_task_inline" {
  statement {
    sid       = "SSMRead"
    effect    = "Allow"
    actions   = ["ssm:GetParameters", "ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${local.prefix}/*"]
  }

  statement {
    sid       = "KMSDecryptDefault"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ecs_task_inline" {
  count  = var.use_existing_iam_roles ? 0 : 1
  name   = "${local.prefix}-ecs-task-inline"
  role   = aws_iam_role.ecs_task[0].id
  policy = data.aws_iam_policy_document.ecs_task_inline.json
}

resource "aws_iam_role_policy" "ecs_execution_inline" {
  count  = var.use_existing_iam_roles ? 0 : 1
  name   = "${local.prefix}-ecs-execution-inline"
  role   = aws_iam_role.ecs_task_execution[0].id
  policy = data.aws_iam_policy_document.ecs_task_inline.json
}
