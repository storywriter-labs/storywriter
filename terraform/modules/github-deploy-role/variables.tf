variable "environment" {
  description = "Environment this role deploys (staging/production)"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either 'staging' or 'production'."
  }
}

variable "role_name" {
  description = "Name of the IAM role GitHub Actions assumes"
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider in this account"
  type        = string
}

variable "allowed_subs" {
  description = <<-EOT
    Values of the token's `sub` claim allowed to assume this role. Wildcards
    are matched with StringLike. GitHub sets `sub` to
    `repo:OWNER/REPO:environment:NAME` for a job that declares `environment:`,
    and `repo:OWNER/REPO:ref:refs/...` for one that doesn't — so a job's form
    depends on the workflow, and both usually need listing.
  EOT
  type        = list(string)
}

variable "site_bucket_name" {
  description = "S3 bucket holding this environment's built site"
  type        = string
}

variable "cloudfront_distribution_arn" {
  description = "ARN of this environment's CloudFront distribution"
  type        = string
}

variable "cloudfront_function_names" {
  description = <<-EOT
    CloudFront functions this environment's stack manages, by name. Staging
    uses one to hold the viewer IP allowlist; production has none, so it gets
    an empty list and no function permissions at all.

    Names, not ARNs. The module builds the ARNs, so a role can only reach the
    functions named here and not the other environment's.
  EOT
  type        = list(string)
  default     = []
}

variable "state_bucket_name" {
  description = "S3 bucket holding the Terraform remote state"
  type        = string
}

variable "state_key_prefix" {
  description = "Key prefix inside the state bucket this role may read and write"
  type        = string
}

variable "lock_table_name" {
  description = "DynamoDB table used for Terraform state locking"
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone the environment's DNS records live in"
  type        = string
}
