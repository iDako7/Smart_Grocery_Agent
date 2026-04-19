resource "aws_elasticache_cluster" "this" {
  cluster_id           = "${local.prefix}-redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [aws_security_group.redis.id]
  apply_immediately    = true

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-redis"
  })
}
