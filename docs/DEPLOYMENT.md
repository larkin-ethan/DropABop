# Deployment

How Drop a Bop gets onto AWS, how to keep it safe and cheap, and how to shut it down.
Facts about AWS below were checked against official AWS pages on **2026-10-01**; AWS changes things, so
follow the linked page if a screen looks different.

> **Nothing in AWS is guaranteed free forever.** Free allowances depend on account age, plan, usage, and region.
> This app is built to stay within always-free allowances at 10–20 users, and the budget alerts below tell you
> quickly if it doesn't.

---

## 1. Install the tools (roadmap P4.0)

Both installers are official AWS packages for macOS.

**AWS CLI v2** ([official guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)):
download and run the installer package, choosing "Install for all users":
https://awscli.amazonaws.com/AWSCLIV2.pkg

**AWS SAM CLI** ([official guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)):
for Apple-silicon Macs download and run
https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-macos-arm64.pkg
(choose "Install for all users of this computer"). Intel Macs: use `aws-sam-cli-macos-x86_64.pkg` from the same
[release page](https://github.com/aws/aws-sam-cli/releases/latest). AWS no longer maintains a Homebrew formula for SAM, so use the package.

Check both, in a **new** terminal window:

```bash
aws --version
```

```bash
sam --version
```

---

## 2. Account safety (roadmap P4.1)

Do these once, in order. Each step says why it matters.

### 2.1 Create the AWS account — choose the **Paid plan**

Sign up at https://aws.amazon.com/free/. New accounts choose a plan:

| | Free plan | Paid plan |
|---|---|---|
| Credits | Up to $200 over 6 months | Up to $200 over 6 months |
| What happens at 6 months | **The account closes on its own** (or sooner, if credits run out) | Keeps running; you pay only for usage beyond free allowances and credits |
| Services | Limited set | All |
| "Always free" allowances (Lambda, DynamoDB storage, CloudFront, …) | Yes | Yes |

**Choose the Paid plan.** A Free-plan account closing after 6 months would take the app down with it. The
budget in step 2.4 is what keeps the Paid plan from surprising you.

Use an email address you'll keep long-term; it's the account's recovery address.

> **Which kind of account do you have?** AWS now signs most people up through its *new experience*: the console
> talks about **projects**, and settings live at https://settings.aws.com. In that kind of account **IAM Identity
> Center shows "Access to this service is not supported"** (on Free and Paid plans alike), so skip 2.2–2.3 and 2.7
> and use **2.8** instead. Everything this app needs (Lambda, API Gateway, DynamoDB, Cognito, CloudFormation, S3,
> CloudFront, CloudWatch, SNS, Budgets) is available. Don't choose "Explore advanced features": it can't be undone
> and isn't needed. Source: https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html
> (checked 2026-10-03). The account this project was built on is this kind.

### 2.2 Protect the root user with MFA

The root user (the email you signed up with) can do anything, including closing the account. Lock it down and then
stop using it for daily work.

1. Sign in as root → top-right account menu → **Security credentials**.
2. **Multi-factor authentication (MFA)** → **Assign MFA device** → use an authenticator app or a passkey.
3. Don't create access keys for the root user. This project never uses long-lived access keys.

### 2.3 Create your everyday login (IAM Identity Center)

This gives you a separate login for daily work, with short-lived credentials for the CLI. That's safer than access
keys sitting in a file.

1. In the console search bar open **IAM Identity Center** → **Enable** (it will set up AWS Organizations for you;
   that's free).
2. **Users** → **Add user**: your name and email. Accept the invite email and set a password and MFA.
3. **Permission sets** → **Create permission set** → predefined **AdministratorAccess** → session duration 8 hours.
   (Admin is reasonable for the single person running this account. CI gets its own narrow role later, in P11.1.)
4. **AWS accounts** → select your account → **Assign users or groups** → your user → the AdministratorAccess
   permission set.
5. On the IAM Identity Center dashboard, copy the **AWS access portal URL** and note the **Region** shown there.

### 2.4 Set a monthly budget with email alerts

This is the most important safety net. AWS emails you before costs get anywhere near meaningful.

**You don't need to make one by hand:** the dev stack creates a $5 budget called `dropabop-monthly` (emails at 50%,
80%, 100% actual and 100% forecast) on its first deploy. Don't create a budget with that name yourself, or the deploy
fails because the name is taken. If you want an alert before the first deploy, make one by hand with a **different**
name:

1. Console → **Billing and Cost Management** → **Budgets** → **Create budget**.
2. Choose **Use a template** → **Monthly cost budget**.
3. Budget name: e.g. `manual-monthly`. Amount: **$5.00**. Email recipients: your email.
4. Optional extra: create a second budget from the **Zero spend budget** template. It emails you the first time
   anything at all is charged.

### 2.5 Turn on Free Tier usage alerts

Console → **Billing and Cost Management** → **Billing preferences** → **Alert preferences** → enable **AWS Free
Tier alerts** and enter your email. You get a warning when any service approaches its free allowance.

### 2.6 Pick the region

This project uses **us-east-2 (Ohio)**: the home region of the account it was built on (see 2.8). Any region with
these services works; if you choose another, change it in the files listed in DEVELOPMENT.md ("The AWS region").

### 2.7 Connect the CLI to your login

In a terminal:

```bash
aws configure sso
```

Answer the prompts:

- **SSO session name:** `dropabop`
- **SSO start URL:** the AWS access portal URL from step 2.3
- **SSO region:** the region shown on the IAM Identity Center dashboard
- **SSO registration scopes:** press Enter to accept the default
- A browser window opens: approve the request
- Choose your account and the **AdministratorAccess** role
- **Default client Region:** `us-east-2`
- **CLI default output format:** `json`
- **Profile name:** `dropabop-dev`

Check it works:

```bash
aws sts get-caller-identity --profile dropabop-dev
```

You should see your account number and an `AWSReservedSSO_AdministratorAccess_…` role. When the login expires
(after the session duration), refresh it with:

```bash
aws sso login --profile dropabop-dev
```

### 2.8 New-experience accounts: sign in the CLI with `aws login`

Use this instead of 2.3 and 2.7 if your account uses projects (see the note in 2.1). It gives the CLI short-lived
credentials (12 hours, renewable for 90 days) without any access keys. Needs AWS CLI 2.32 or newer.

```bash
aws login --profile dropabop-dev
```

If asked for a region, enter your project's home region (`us-east-2` here). A browser opens: choose your project. Check it, then repeat the login
whenever the credentials expire:

```bash
aws sts get-caller-identity --profile dropabop-dev
```

The role shown is `AccountFullAccessRole`.

**Region:** a project has one home region (this one's: **us-east-2**). Regional services (Lambda, DynamoDB, CloudFormation,
Cognito, …) are denied everywhere else, and us-east-1 allows only global ones (IAM, billing, CloudFront, ACM). To find
yours, run `aws cloudformation list-stacks --region <region> --profile dropabop-dev` per region: only the home region
answers. `infra/samconfig.toml` sets it for deploys. For cost safety, also set a monthly **spend limit** (about $5) on the
project in https://settings.aws.com, as well as or instead of the 2.4 budget. (The lowest limit AWS offered here was $20/month;
the stack's $5 budget alert flags a cost long before that.)
Source: https://docs.aws.amazon.com/accounts/latest/reference/connect-ai-coding-tool.html (checked 2026-10-03).

**Done when:** `aws sts get-caller-identity --profile dropabop-dev` works. (Nobody working on this project, human or
AI, should ever ask you for passwords, keys, or codes.)

---

## 3. Where to see what you're paying

- **Billing and Cost Management → Home**: month-to-date cost and forecast.
- **Bills**: itemized charges per service.
- **Cost Explorer**: charts by service and day (data appears about 24 hours after first enabling it).
- **Free Tier** page (in Billing): how much of each free allowance you've used.

## 4. What can cost money

Expected total at 10–20 users: **well under $1/month**.

| Service | What we use it for | Free allowance | Expected cost at our scale |
|---|---|---|---|
| DynamoDB | The database (on-demand, capped) | 25 GB storage always free; requests are not | ~$0.05–$0.25/month (ADR-0005) |
| API Gateway (HTTP API) | Every app request | 1M requests/month, **first 12 months only** | $1.00 per million → ~$0.10–$0.30/month after year one |
| Lambda (arm64) | Runs each request | 1M requests + 400,000 GB-s/month, always | $0 (we use a small fraction) |
| Cognito (Essentials) | Accounts and sign-in | 10,000 monthly active users | $0 |
| CloudWatch Logs | Per stage: Lambda logs + API access logs, kept 14 days (30 in prod) | 5 GB/month | $0 |
| CloudWatch alarms | Failure/throttle alerts (4 per stage) | 10 alarm metrics/month | $0 (8 across dev + prod) |
| SNS | Delivers alarm emails | Pricing page doesn't list email (checked 2026-10-03) | A handful of emails a month: negligible |
| AWS Budgets | `dropabop-monthly` $5 alert | Budgets without actions are free | $0 |
| CloudFront | Serves the website over HTTPS | 1 TB + 10M requests/month, always | $0 |
| S3 | Website files; SAM's upload bucket (`aws-sam-cli-managed-default`) | 5 GB for 12 months only | A few MB: under $0.01/month |

Prices checked 2026-10-02 on aws.amazon.com/{api-gateway,lambda,cognito,cloudwatch}/pricing (US East).
Full resource list: `docs/ARCHITECTURE.md`.

## 4a. Build and deploy the API (from P4.3)

On a fresh checkout, first run `npm install` at the repo root. Then, from the `infra/` folder, **always build before
deploying** (deploy uploads whatever the last build produced):

```bash
sam build --config-env dev
```

```bash
sam deploy --config-env dev --profile dropabop-dev
```

`sam build` bundles the API with esbuild through `services/api/Makefile` (in place, so it can use the workspace's
packages). `sam deploy` shows the planned changes and asks before applying them.

**The alert email (first deploy of a stage only).** The template's `AlertEmail` parameter is where alarm and budget
emails go. It's deliberately not in `samconfig.toml` because the repo is public, so pass it once, repeating the
stage's other settings (a command-line `--parameter-overrides` replaces the file's):

```bash
sam deploy --config-env dev --profile dropabop-dev --parameter-overrides Stage=dev DevOrigin=http://localhost:5173 CreateBudget=true HostWebsite=false AlertEmail=you@example.com
```

Later deploys reuse the stack's stored value automatically. Then click the confirmation link in the email from
"AWS Notifications": alarms aren't delivered until you do (the budget emails directly and works either way).

(Leave out `HostWebsite=false` once the account is verified for CloudFront, §4c.) After a deploy, check every endpoint on dev (creates two throwaway test users the first time; their passwords
stay in the git-ignored `.test-users.json`):

```bash
node scripts/smoke-dev.mjs
```

## 4b. Publish the website (P9.2)

The website is served from a private S3 bucket through CloudFront (HTTPS only, security headers). After the stack has
the hosting resources (`HostWebsite` on), publish the current code to dev:

```bash
bash scripts/deploy-web.sh
```

It builds the site with the stack's public addresses, uploads it, and clears CloudFront's copy of `index.html`.
The address is the stack output `WebsiteUrl`.

## 4c. One-time AWS account requests (new accounts)

New AWS accounts start with two limits that only the account owner can lift. Both requests are free.

**CloudFront verification.** Until AWS verifies the account, creating a CloudFront distribution fails with "Your
account must be verified before you can add new CloudFront resources". Dev runs with `HostWebsite=false` in
`infra/samconfig.toml` until then.

1. Console → **Support Center** (https://console.aws.amazon.com/support/home#/) → **Create case**.
2. Choose **Account and billing** (free on every plan). Topic: account / service activation.
3. Ask: "Please verify my account so I can create Amazon CloudFront distributions." Paste the error message above.
4. When AWS confirms, remove ` HostWebsite=false` from the dev `parameter_overrides` line in `infra/samconfig.toml`,
   deploy again (§4a), then publish the site (§4b).

**Lambda concurrency.** The account may run only **10** functions at the same moment (default for new accounts;
`aws lambda get-account-settings` shows `ConcurrentExecutions: 10`). Above that, API Gateway answers 503 (the
website retries once). Normal accounts get 1,000.

1. Console → **Service Quotas** (https://console.aws.amazon.com/servicequotas/home) → region **US East (Ohio)**.
2. **AWS Lambda** → **Concurrent executions** → **Request increase at account level** → **1000**.

## 5. Shutting things down

Deleting is a **human-only** action in this project (the AI assistant is blocked from it). The table and user pool are kept
on purpose when a stack is deleted (so a mistake can't wipe everyone's accounts and songs), so they're separate steps.

1. **Empty the website bucket** (only if the stack hosts the website; a non-empty bucket stops the stack deletion).
   Find its name in the stack outputs (`WebBucketName`), then:

   ```bash
   aws s3 rm s3://BUCKET-NAME --recursive --region us-east-2 --profile dropabop-dev
   ```

2. **Delete the stack.** Dev shown; for prod use `--stack-name dropabop-prod`, and first turn off deletion protection
   on the prod table and user pool in the AWS console (only if you really mean to delete everyone's data). Deleting
   **dev** also deletes the `dropabop-monthly` budget, which lives in the dev stack.

   ```bash
   sam delete --stack-name dropabop-dev --region us-east-2 --profile dropabop-dev
   ```

3. **Delete the kept table and user pool** (names in the AWS console, or the stack outputs before deleting):

   ```bash
   aws dynamodb delete-table --table-name TABLE-NAME --region us-east-2 --profile dropabop-dev
   ```

   ```bash
   aws cognito-idp delete-user-pool --user-pool-id POOL-ID --region us-east-2 --profile dropabop-dev
   ```

4. **Optional, when you're done with the whole project:** delete the `dropabop-github-deploy` stack (GitHub roles) and
   `aws-sam-cli-managed-default` (SAM's upload bucket stack; empty its bucket first, as in step 1) in the
   CloudFormation console, and remove the spend limit or any budget you made by hand.
5. Check **Billing → Bills** the next day to confirm nothing is still running.

## 6. Deploying with one command (ADR-0009)

GitHub can't deploy to this account: new-experience AWS accounts block GitHub's keyless sign-in (an AWS-managed
service control policy denies `iam:CreateOpenIDConnectProvider`), and storing long-lived AWS keys in GitHub is
what this project avoids. So GitHub runs the checks on every pull request, and **you deploy from your Mac**:

```bash
aws login --profile dropabop-dev
```

```bash
bash scripts/deploy.sh dev
```

`scripts/deploy.sh` refuses to run with uncommitted changes, runs `npm run verify`, builds, shows the planned stack
changes and asks before applying them, then publishes the website (`scripts/deploy-web.sh`, skipped while the stack
doesn't host it).

### Shipping to prod

1. **GitHub → your repo → Settings → Branches → Add rule for `main`:** require a pull request and the **CI** checks
   to pass. `main` is what prod is deployed from, so this is the gate.
2. **Merge your work into `main`** with a pull request on github.com (from `build`, the first time).
3. **On your Mac,** switch to `main` and bring it up to date (GitHub Desktop: *Current branch → main*, then
   *Fetch origin → Pull*), then deploy. The script only deploys prod from a clean `main` and asks you to type
   `prod` first:

   ```bash
   bash scripts/deploy.sh prod
   ```

   The **first** prod deploy needs the alert email (it creates prod's own user pool, table and alarms):

   ```bash
   ALERT_EMAIL=you@example.com bash scripts/deploy.sh prod
   ```

   Then confirm the "AWS Notification - Subscription Confirmation" email for prod, as you did for dev.

**Before the first prod deploy:** prod hosts the website on CloudFront, so wait until AWS has verified the account
for CloudFront (§4c); until then the prod deploy fails and rolls back.

**Leftover from the GitHub attempt (2026-10-04):** an empty stack `dropabop-github-deploy` in `ROLLBACK_COMPLETE`.
It has no resources and costs nothing; delete it in the CloudFormation console when convenient.
