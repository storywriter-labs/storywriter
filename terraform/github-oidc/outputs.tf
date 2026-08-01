output "staging_role_arn" {
  description = "Set this as AWS_ROLE_ARN on the staging GitHub environment"
  value       = module.staging_deploy_role.role_arn
}

output "production_role_arn" {
  description = "Set this as AWS_ROLE_ARN on the production GitHub environment"
  value       = module.production_deploy_role.role_arn
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider"
  value       = aws_iam_openid_connect_provider.github.arn
}
