terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "storywriter-terraform-state-548846592016"
    key            = "frontend-github-oidc/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "storywriter-terraform-locks"
  }
}

# Applied by a human with admin credentials, not by CI. The deploy roles this
# stack creates deliberately have no IAM permissions, so they cannot widen
# their own access — which also means they cannot apply this stack. See
# README.md for the runbook.
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      app_name   = "storywriter"
      managed_by = "terraform"
    }
  }
}

# The provider already exists in the account — it was created by hand before
# any of this was in Terraform. Import it once rather than letting Terraform
# try to create a second one (see README.md). Thumbprints are ignored because
# AWS rotates them for the github.com issuer on its own.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  lifecycle {
    ignore_changes = [thumbprint_list]
  }

  tags = {
    Name = "github-actions"
  }
}

# The distribution IDs live in the environment stacks, so read them from there
# rather than pasting ARNs in by hand and letting them go stale.
data "terraform_remote_state" "staging" {
  backend = "s3"
  config = {
    bucket  = var.state_bucket_name
    key     = "frontend-staging/terraform.tfstate"
    region  = var.aws_region
    profile = var.aws_profile
  }
}

data "terraform_remote_state" "production" {
  backend = "s3"
  config = {
    bucket  = var.state_bucket_name
    key     = "frontend-production/terraform.tfstate"
    region  = var.aws_region
    profile = var.aws_profile
  }
}

data "aws_caller_identity" "current" {}

data "aws_route53_zone" "main" {
  name         = "storywriter.net"
  private_zone = false
}

locals {
  distribution_arn = {
    for env, state in {
      staging    = data.terraform_remote_state.staging
      production = data.terraform_remote_state.production
    } :
    env => "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${state.outputs.cloudfront_distribution_id}"
  }
}

# Staging is reachable from main and from anything running in the staging
# GitHub environment. That is on purpose: staging deploys are unattended and
# dispatchable from any branch.
module "staging_deploy_role" {
  source = "../modules/github-deploy-role"

  environment       = "staging"
  role_name         = "storywriter-frontend-deploy-staging"
  oidc_provider_arn = aws_iam_openid_connect_provider.github.arn

  allowed_subs = [
    "repo:${var.github_repository}:ref:refs/heads/main",
    "repo:${var.github_repository}:environment:staging",
  ]

  site_bucket_name            = "storywriter-staging-frontend"
  cloudfront_distribution_arn = local.distribution_arn["staging"]
  state_bucket_name           = var.state_bucket_name
  state_key_prefix            = "frontend-staging"
  lock_table_name             = var.lock_table_name
  hosted_zone_id              = data.aws_route53_zone.main.zone_id
}

# Production is reachable only from a release tag or from a job running in the
# production GitHub environment. Both entries are needed: deploy-frontend.yml
# runs from a `v*` tag, and rollback-frontend.yml is dispatched from a branch,
# so its only distinguishing claim is the environment.
#
# The environment entry depends on the AWS-using jobs keeping their
# `environment: production` key. Strip that key and the token stops carrying
# the claim, and the job can no longer assume this role.
module "production_deploy_role" {
  source = "../modules/github-deploy-role"

  environment       = "production"
  role_name         = "storywriter-frontend-deploy-production"
  oidc_provider_arn = aws_iam_openid_connect_provider.github.arn

  allowed_subs = [
    "repo:${var.github_repository}:ref:refs/tags/v*",
    "repo:${var.github_repository}:environment:production",
  ]

  site_bucket_name            = "storywriter-production-frontend"
  cloudfront_distribution_arn = local.distribution_arn["production"]
  state_bucket_name           = var.state_bucket_name
  state_key_prefix            = "frontend-production"
  lock_table_name             = var.lock_table_name
  hosted_zone_id              = data.aws_route53_zone.main.zone_id
}
