output "role_arn" {
  description = "ARN of the deploy role — this is the value for the environment's AWS_ROLE_ARN secret"
  value       = aws_iam_role.deploy.arn
}

output "role_name" {
  description = "Name of the deploy role"
  value       = aws_iam_role.deploy.name
}
