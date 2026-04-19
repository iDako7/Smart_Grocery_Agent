resource "aws_db_instance" "this" {
  identifier     = "${local.prefix}-db"
  engine         = "postgres"
  engine_version = "16.13"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 0
  apply_immediately       = true
  multi_az                = false

  performance_insights_enabled = false
  auto_minor_version_upgrade   = true

  tags = merge(local.common_tags, {
    Name = "${local.prefix}-db"
  })
}
