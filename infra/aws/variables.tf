variable "project_name" {
  description = "Base name used for AWS resources."
  type        = string
  default     = "sga-v2"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "demo"
}

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-west-2"
}

variable "aws_profile" {
  description = "Optional AWS CLI profile name."
  type        = string
  default     = ""
}

variable "app_port" {
  description = "Container port the API listens on."
  type        = number
  default     = 8000
}

variable "desired_count" {
  description = "Number of Fargate tasks to run."
  type        = number
  default     = 1
}

variable "cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory (MiB)."
  type        = number
  default     = 1024
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (ALB and Fargate tasks)."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (RDS and ElastiCache)."
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "allowed_ingress_cidrs" {
  description = "CIDRs allowed to access the public ALB."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "use_existing_iam_roles" {
  description = "If true, use existing IAM roles (e.g. LabRole) instead of creating new ones."
  type        = bool
  default     = true
}

variable "existing_task_role_name" {
  description = "Existing IAM role name for the ECS task role."
  type        = string
  default     = "LabRole"
}

variable "existing_execution_role_name" {
  description = "Existing IAM role name for the ECS task execution role."
  type        = string
  default     = "LabRole"
}

variable "image_uri" {
  description = "Full image URI for the app container. If empty, defaults to ECR repo with image_tag."
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Image tag to deploy when image_uri is empty."
  type        = string
  default     = "latest"
}

variable "db_name" {
  description = "PostgreSQL database name."
  type        = string
  default     = "sga"
}

variable "db_username" {
  description = "PostgreSQL master username."
  type        = string
  default     = "sga_admin"
}

variable "db_password" {
  description = "PostgreSQL master password."
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS storage size in GB."
  type        = number
  default     = 20
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "openrouter_api_key" {
  description = "OpenRouter API key for Claude access."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Secret used to sign JWT session tokens."
  type        = string
  sensitive   = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 14
}

variable "alb_idle_timeout" {
  description = "ALB idle timeout in seconds (SSE requires longer than default)."
  type        = number
  default     = 300
}

variable "sga_model" {
  description = "LLM model identifier passed to the orchestrator via SGA_MODEL env var."
  type        = string
  default     = "openai/gpt-5.4-mini"
}

variable "enable_cloudfront" {
  description = "If true, provision a CloudFront distribution in front of the ALB to provide HTTPS on the default *.cloudfront.net hostname. ALB remains HTTP-only."
  type        = bool
  default     = true
}
