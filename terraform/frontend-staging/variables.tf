variable "environment" {
  description = "Environment name (staging/production)"
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either 'staging' or 'production'."
  }
}

variable "domain_name" {
  description = "Domain name for the frontend application"
  type        = string
  default     = "staging.storywriter.net"
}

variable "s3_bucket_name" {
  description = "S3 bucket name for static website hosting"
  type        = string
  default     = "storywriter-staging-frontend"
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
}

variable "allowed_viewer_ips" {
  description = <<-EOT
    Exact viewer IP addresses allowed to load staging.storywriter.net. Everything
    else gets a 403 from a CloudFront viewer-request function. Addresses, not
    CIDRs: the function does exact matching (see functions/ip-allowlist.js).

    Set to [] to disable the allowlist and serve staging publicly again.

    Deploys read this from the STAGING_ALLOWED_VIEWER_IPS repository secret,
    because the real terraform.tfvars is gitignored and never reaches the
    runner. Changing the address means changing it in both places, or in the
    secret alone if you only ever apply from CI.

    This does not protect staging-api.storywriter.net, which is a separate EC2
    instance behind its own security group.
  EOT
  type        = list(string)
  default     = []
}
