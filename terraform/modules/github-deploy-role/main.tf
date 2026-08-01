terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  site_bucket  = "arn:aws:s3:::${var.site_bucket_name}"
  state_bucket = "arn:aws:s3:::${var.state_bucket_name}"
}

# One role per environment. Two things keep the environments apart: the trust
# policy below decides who may assume the role, and the permission policies
# decide what it can touch once assumed. The second half is what stops a
# staging deploy from writing over the live site — a wrong bucket variable in
# the workflow now fails with AccessDenied instead of emptying production.
resource "aws_iam_role" "deploy" {
  name        = var.role_name
  description = "GitHub Actions deploy role for the ${var.environment} frontend"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GitHubActionsOIDC"
        Effect = "Allow"
        Principal = {
          Federated = var.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = var.allowed_subs
          }
        }
      }
    ]
  })

  tags = {
    Name = var.role_name
  }
}

# Everything the deploy and rollback jobs do to the site itself: sync the build
# up, snapshot the previous one into backups/, clear it again on a rollback.
# Scoped to this environment's bucket by resource, not by action — the action
# list is long and keeps growing (Terraform reads a dozen bucket sub-resources
# just to refresh), and the resource is the part that matters here.
resource "aws_iam_role_policy" "site_bucket" {
  name = "site-bucket"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "OwnEnvironmentSiteBucketOnly"
        Effect   = "Allow"
        Action   = "s3:*"
        Resource = [local.site_bucket, "${local.site_bucket}/*"]
      }
    ]
  })
}

# CloudFront invalidations after a deploy, plus the distribution reads and
# writes Terraform needs to refresh and update it.
resource "aws_iam_role_policy" "cloudfront" {
  name = "cloudfront"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "OwnEnvironmentDistributionOnly"
        Effect = "Allow"
        Action = [
          "cloudfront:GetDistribution",
          "cloudfront:GetDistributionConfig",
          "cloudfront:UpdateDistribution",
          "cloudfront:DeleteDistribution",
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation",
          "cloudfront:ListInvalidations",
          "cloudfront:TagResource",
          "cloudfront:UntagResource",
          "cloudfront:ListTagsForResource",
        ]
        Resource = var.cloudfront_distribution_arn
      },
      {
        # CloudFront has no resource-level permissions for creating a
        # distribution or for origin access controls, so these have to be "*".
        # They can make new things; they can't reach the other environment's
        # existing distribution, which is covered above.
        Sid    = "CloudFrontActionsWithoutResourceScoping"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateDistribution",
          "cloudfront:ListDistributions",
          "cloudfront:CreateOriginAccessControl",
          "cloudfront:GetOriginAccessControl",
          "cloudfront:GetOriginAccessControlConfig",
          "cloudfront:UpdateOriginAccessControl",
          "cloudfront:DeleteOriginAccessControl",
          "cloudfront:ListOriginAccessControls",
        ]
        Resource = "*"
      }
    ]
  })
}

# The Terraform backend: this environment's state file and its lock. Splitting
# the state prefix means a staging apply cannot rewrite production's state and
# then "correct" the real infrastructure to match it.
resource "aws_iam_role_policy" "terraform_backend" {
  name = "terraform-backend"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListStateBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketVersioning"]
        Resource = local.state_bucket
      },
      {
        Sid      = "OwnEnvironmentStateFileOnly"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${local.state_bucket}/${var.state_key_prefix}/*"
      },
      {
        Sid    = "OwnEnvironmentStateLockOnly"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
        ]
        Resource = "arn:aws:dynamodb:${data.aws_region.current.name}:${local.account_id}:table/${var.lock_table_name}"
        Condition = {
          "ForAllValues:StringLike" = {
            "dynamodb:LeadingKeys" = ["${var.state_bucket_name}/${var.state_key_prefix}/*"]
          }
        }
      }
    ]
  })
}

# DNS and certificates for the environment's domain. Both environments share
# the storywriter.net hosted zone and IAM cannot scope below a zone, so this
# is the one place a staging apply can still reach a production record. The
# blast radius is a DNS change, which is reversible; overwriting the bucket
# was not.
resource "aws_iam_role_policy" "dns_and_certificates" {
  name = "dns-and-certificates"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SharedHostedZone"
        Effect = "Allow"
        Action = [
          "route53:GetHostedZone",
          "route53:ListResourceRecordSets",
          "route53:ChangeResourceRecordSets",
        ]
        Resource = "arn:aws:route53:::hostedzone/${var.hosted_zone_id}"
      },
      {
        Sid    = "Route53Lookups"
        Effect = "Allow"
        Action = [
          "route53:GetChange",
          "route53:ListHostedZones",
          "route53:ListHostedZonesByName",
          "route53:ListTagsForResource",
        ]
        Resource = "*"
      },
      {
        Sid    = "AcmCertificates"
        Effect = "Allow"
        Action = [
          "acm:RequestCertificate",
          "acm:DescribeCertificate",
          "acm:ListCertificates",
          "acm:ListTagsForCertificate",
          "acm:AddTagsToCertificate",
          "acm:DeleteCertificate",
        ]
        Resource = "*"
      }
    ]
  })
}
