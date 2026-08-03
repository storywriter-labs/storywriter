# GitHub Actions deploy roles

The AWS roles the deploy workflows assume, one per environment.

Before this stack existed there was a single hand-made role shared by staging
and production, and its trust policy accepted any repository in the
`storywriter-labs` org. Anything that could deploy staging could also write to
the production bucket, so a wrong bucket variable, or the wrong pick in the
manual-dispatch dropdown, would have run
`aws s3 sync ./dist s3://<prod bucket>/ --delete` against the live site. The
approval gate did not help: the credentials themselves could not tell the two
environments apart.

Now there are two roles:

| Role | Assumable from | Reaches |
|---|---|---|
| `storywriter-frontend-deploy-staging` | `refs/heads/main`, or the `staging` environment | `storywriter-staging-frontend`, the staging distribution, the staging IP-allowlist function, `frontend-staging/` state |
| `storywriter-frontend-deploy-production` | a `v*` tag, or the `production` environment | `storywriter-production-frontend`, the production distribution, `frontend-production/` state |

Neither role has any IAM permissions, so neither can widen its own access —
which is also why this stack is applied by a human with admin credentials
rather than by CI.

Staging has one thing production does not: the CloudFront function that holds
`staging.storywriter.net` to a short list of viewer IPs. Terraform owns that
function's code, so the staging deploy needs to publish new versions of it.
The permission is granted by name, through `cloudfront_function_names` on the
module, so the staging role reaches that function and nothing else. Production
passes an empty list and gets no function permissions at all.

Rename the function in `terraform/frontend-staging/main.tf` and the name has to
change here too. Miss it and the staging deploy fails with `AccessDenied` on
`cloudfront:UpdateFunction`.

## Applying it

This is not part of `deploy-frontend.yml`. Run it by hand:

```bash
cd terraform/github-oidc
terraform init
```

The OIDC provider already exists in the account — it was created in the console
long before any of this was in Terraform — so import it before the first apply,
or the apply fails with `EntityAlreadyExists`:

```bash
terraform import aws_iam_openid_connect_provider.github \
  arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com
```

Then:

```bash
terraform plan
terraform apply
```

`terraform plan` reads the two environment stacks' remote state to find the
CloudFront distribution IDs, so `frontend-staging` and `frontend-production`
have to have been applied first. They have been; this only matters if you are
rebuilding the account from nothing.

## Cutting over

The new roles have new ARNs, so the GitHub secrets have to be repointed. Until
that happens the workflows keep using the old shared role and nothing changes.

1. Take the ARNs from the apply:

   ```bash
   terraform output staging_role_arn
   terraform output production_role_arn
   ```

2. Set each one as `AWS_ROLE_ARN` on the matching GitHub **environment** (not
   as a repository secret — the environment scoping is half of what keeps them
   apart):

   ```bash
   gh secret set AWS_ROLE_ARN --env staging     --body "<staging_role_arn>"
   gh secret set AWS_ROLE_ARN --env production  --body "<production_role_arn>"
   ```

3. Deploy staging (merge anything to `main`, or dispatch the workflow) and
   confirm it goes green. A trust-policy mistake shows up as
   `Not authorized to perform sts:AssumeRoleWithWebIdentity` on the
   **Configure AWS credentials** step.

4. Cut a release, or dispatch **Deploy Frontend** on the last release tag, and
   confirm production goes green too.

5. Only then delete the old shared role in IAM. Keeping it around leaves the
   org-wide trust policy live, which is the thing this was meant to remove.

## What this does not cover

- **The shared hosted zone.** Both environments' records live in
  `storywriter.net`, and Route 53 permissions cannot be scoped below a zone, so
  a staging apply can still change a production DNS record. That is a
  reversible change, unlike emptying the bucket.
- **ACM certificates.** `acm:RequestCertificate` has no resource-level
  permissions, so certificate actions are account-wide for both roles.
- **CloudFront creation.** `CreateDistribution` and the origin-access-control
  actions have no resource-level permissions either. Both roles can make new
  distributions; neither can touch the other's existing one.
- **The backend repo.** `backend/` deploys over SSH and does not use these
  roles at all.

## If a distribution is ever replaced

The CloudFront permissions are pinned to the current distribution ARNs, read
from the environment stacks' state. If an apply ever replaces a distribution
rather than updating it, re-apply this stack afterwards or invalidations will
start failing with `AccessDenied`.
