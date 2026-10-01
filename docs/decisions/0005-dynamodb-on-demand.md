# ADR-0005: DynamoDB on-demand capacity with a throughput cap

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec sections:** §2, §4, §7, §44

## Context

DynamoDB bills reads and writes in one of two modes. We want close to $0, but never at the cost of errors
for users (spec §2: don't sacrifice correctness to save a few dollars). See `docs/DATABASE.md` for the table design.

Facts checked 2026-10-01:

- **On-demand** (us-east-1, Standard table class): $0.125 per million read request units, $0.625 per million write
  request units. https://aws.amazon.com/dynamodb/pricing/
- **Always-free tier:** 25 GB storage, plus 25 WCU and 25 RCU of **provisioned** capacity per account per region. The
  free capacity units don't apply to on-demand tables. https://aws.amazon.com/dynamodb/pricing/ ,
  https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html
- **Storage:** $0.25/GB-month beyond the free 25 GB. **Point-in-time recovery:** $0.20/GB-month of table size.
- CloudFormation `AWS::DynamoDB::Table` supports `OnDemandThroughput` (`MaxReadRequestUnits`,
  `MaxWriteRequestUnits`) to cap an on-demand table's throughput.
  https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-dynamodb-table.html

## Options considered

1. **Provisioned, inside the free 25 RCU/WCU.** $0 for requests. But the 25 units are shared by every table in the
   account and region, so dev + prod each get about 10–12. Opening the stats page reads a party's whole history at
   once (around 1,000+ read units after a year), which at that capacity means throttling: errors or slow pages for
   users. It also needs capacity planning, which a beginner shouldn't have to do.
2. **On-demand.** Pay per request, no throttling at our scale, nothing to plan.

## Decision

**On-demand (`PAY_PER_REQUEST`)**, with `OnDemandThroughput` caps so a bug (for example, a polling loop gone wrong)
can't run up an open-ended bill:

- Dev: `MaxReadRequestUnits: 50`, `MaxWriteRequestUnits: 25`
- Prod: `MaxReadRequestUnits: 100`, `MaxWriteRequestUnits: 50`

These are per-second ceilings, far above real use: 20 people, mostly reading. Requests above the cap are throttled
instead of billed.

Also: point-in-time recovery **on in prod** (about $0.002/month for our data size; protects against accidental data
loss), off in dev. Deletion protection on in prod.

## Cost

- **Why needed:** it's the app's database (spec §4).
- **Estimated cost at 20 users:** everyday use is roughly 200k reads and 15k writes a month ≈ **$0.03**. Stats views
  re-read party history; even at 1.5M reads a month that's ≈ **$0.19**. Expect **$0.05–$0.25/month**. Storage
  (10–20 MB/year) stays in the free 25 GB.
- **Free allowance:** storage yes; request units no (those are provisioned-only).
- **Worst case with caps:** prod at the read cap for a whole month would be ~$32. In practice the AWS Budget
  alert (P4.1/P4.4) fires within hours, long before that.
- **Existing service instead?** N/A: DynamoDB *is* the existing allowed service. This decision only picks its
  billing mode.

## Consequences

- If stats reads ever become the main cost, precompute stats at week close (ADR-0006, decided in P5.10).
- Revisit if traffic becomes steady and predictable (provisioned would then be cheaper). Not expected at this scale.
