variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Local AWS profile used to apply this stack by hand"
  type        = string
  default     = "storywriter"
}

variable "github_repository" {
  description = "owner/repo allowed to assume the deploy roles"
  type        = string
  default     = "storywriter-labs/storywriter"
}

variable "state_bucket_name" {
  description = "S3 bucket holding the Terraform remote state"
  type        = string
  default     = "storywriter-terraform-state-548846592016"
}

variable "lock_table_name" {
  description = "DynamoDB table used for Terraform state locking"
  type        = string
  default     = "storywriter-terraform-locks"
}
