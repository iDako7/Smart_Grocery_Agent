output "alb_dns_name" {
  description = "Public DNS name of the load balancer."
  value       = aws_lb.this.dns_name
}

output "alb_url" {
  description = "HTTP URL of the load balancer."
  value       = "http://${aws_lb.this.dns_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL for the app image."
  value       = aws_ecr_repository.this.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.app.name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint."
  value       = aws_db_instance.this.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary node address."
  value       = aws_elasticache_cluster.this.cache_nodes[0].address
  sensitive   = true
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for app container logs."
  value       = aws_cloudwatch_log_group.app.name
}

output "aws_region" {
  description = "AWS region of the deployment."
  value       = var.aws_region
}

output "resource_prefix" {
  description = "Prefix applied to all resource names."
  value       = local.prefix
}

output "cloudfront_url" {
  description = "Public HTTPS URL (CloudFront). Empty when enable_cloudfront = false."
  # try() guards against index-panic when count = 0 — terraform evaluates both
  # branches of ?: in some versions even when enable_cloudfront = false.
  value = var.enable_cloudfront ? "https://${try(aws_cloudfront_distribution.this[0].domain_name, "")}" : ""
}
