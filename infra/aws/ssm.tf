resource "aws_ssm_parameter" "openrouter_api_key" {
  name      = "/${local.prefix}/OPENROUTER_API_KEY"
  type      = "SecureString"
  value     = var.openrouter_api_key
  overwrite = true

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-openrouter-api-key"
  })
}

resource "aws_ssm_parameter" "jwt_secret" {
  name      = "/${local.prefix}/JWT_SECRET"
  type      = "SecureString"
  value     = var.jwt_secret
  overwrite = true

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-jwt-secret"
  })
}

resource "aws_ssm_parameter" "database_url" {
  name      = "/${local.prefix}/DATABASE_URL"
  type      = "SecureString"
  value     = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.this.address}:5432/${var.db_name}"
  overwrite = true

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-database-url"
  })
}

resource "aws_ssm_parameter" "redis_url" {
  name      = "/${local.prefix}/REDIS_URL"
  type      = "SecureString"
  value     = "redis://${aws_elasticache_cluster.this.cache_nodes[0].address}:6379/0"
  overwrite = true

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-redis-url"
  })
}
