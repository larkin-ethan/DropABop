// Checks infra/template.yaml against the code, so the two can't silently drift apart (roadmap P4.2):
// the table's keys, every function's handler and build target, the routes in docs/API.md, and IAM permissions.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { TABLE_KEY_SCHEMA } from './data/table-definition';
import * as lambdaExports from './lambda';

const repoRoot = new URL('../../../', import.meta.url);
const readRepoFile = (path: string) => readFileSync(new URL(path, repoRoot), 'utf8');

// CloudFormation short tags (!Ref, !Sub, !GetAtt…) aren't standard YAML. The yaml library keeps their plain value
// and drops the tag, which is all these checks need (e.g. `!GetAtt Table.Arn` reads as "Table.Arn").
const template = parse(readRepoFile('infra/template.yaml'), { logLevel: 'silent' }) as {
  Resources: Record<
    string,
    { Type: string; Properties: Record<string, unknown>; Metadata?: Record<string, unknown> }
  >;
  Rules?: Record<string, unknown>;
};

interface FunctionProps {
  Handler: string;
  Policies?: { Statement: { Effect: string; Action: string[]; Resource: string }[] }[];
  Events: Record<string, { Type: string; Properties: { Method: string; Path: string } }>;
}

const functions = Object.entries(template.Resources)
  .filter(([, resource]) => resource.Type === 'AWS::Serverless::Function')
  .map(([logicalId, resource]) => ({
    logicalId,
    metadata: resource.Metadata,
    props: resource.Properties as unknown as FunctionProps,
  }));

describe('infra/template.yaml', () => {
  it('defines the table with the same key schema the code and DynamoDB Local use', () => {
    const table = template.Resources.Table?.Properties;
    expect(table?.KeySchema).toEqual(TABLE_KEY_SCHEMA.KeySchema);
    expect(table?.AttributeDefinitions).toEqual(TABLE_KEY_SCHEMA.AttributeDefinitions);
    expect(table?.BillingMode).toBe('PAY_PER_REQUEST'); // ADR-0005
    expect(table?.GlobalSecondaryIndexes).toBeUndefined(); // docs/DATABASE.md: no secondary indexes
  });

  it('points every function at a handler exported by src/lambda.ts, each used once', () => {
    const handlerNames = functions.map((fn) => fn.props.Handler.replace(/^index\./, ''));
    expect(handlerNames.toSorted()).toEqual(Object.keys(lambdaExports).toSorted());
  });

  it('builds every function with a target that services/api/Makefile defines', () => {
    const makefile = readRepoFile('services/api/Makefile');
    // The FUNCTIONS list runs from "FUNCTIONS =" to the first blank line, split over lines ending in "\".
    const listBlock = makefile.split('FUNCTIONS =')[1]?.split('\n\n')[0] ?? '';
    const listed = listBlock.split(/[\s\\]+/).filter((word) => word !== '');
    expect(listed.toSorted()).toEqual(functions.map((fn) => fn.logicalId).toSorted());
    for (const fn of functions) {
      expect(fn.metadata?.BuildMethod, fn.logicalId).toBe('makefile');
    }
  });

  it('has exactly the routes documented in docs/API.md', () => {
    const documented = [
      ...readRepoFile('docs/API.md').matchAll(/^#### `(GET|POST|PUT|PATCH|DELETE) ([^`?\s]+)/gm),
    ].map((match) => `${match[1]} ${match[2]}`);
    const inTemplate = functions.flatMap((fn) =>
      Object.values(fn.props.Events).map((event) => `${event.Properties.Method} ${event.Properties.Path}`),
    );
    expect(inTemplate.toSorted()).toEqual(documented.toSorted());
  });

  it('gives functions only specific DynamoDB actions on the app table (least privilege, no Scan)', () => {
    const allowed = new Set([
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:DeleteItem',
    ]);
    for (const fn of functions) {
      for (const policy of fn.props.Policies ?? []) {
        for (const statement of policy.Statement) {
          expect(statement.Effect, fn.logicalId).toBe('Allow');
          expect(statement.Resource, fn.logicalId).toBe('Table.Arn');
          for (const action of statement.Action) {
            expect(allowed.has(action), `${fn.logicalId}: ${action}`).toBe(true);
          }
        }
      }
    }
  });

  it('gives the functions that never touch the table no permissions at all', () => {
    for (const logicalId of ['HealthFunction', 'SearchSongsFunction', 'ResolveSongFunction']) {
      const fn = functions.find((candidate) => candidate.logicalId === logicalId);
      expect(fn?.props.Policies, logicalId).toBeUndefined();
    }
  });

  it('requires a Cognito access token on every route (spec §9, §24)', () => {
    const api = template.Resources.HttpApi?.Properties as {
      Auth: {
        DefaultAuthorizer: string;
        Authorizers: Record<
          string,
          { JwtConfiguration: { issuer: string; audience: string[] }; AuthorizationScopes: string[] }
        >;
      };
    };
    expect(api.Auth.DefaultAuthorizer).toBe('CognitoAccessToken');
    const authorizer = api.Auth.Authorizers.CognitoAccessToken;
    expect(authorizer?.JwtConfiguration.issuer).toContain('cognito-idp');
    expect(authorizer?.JwtConfiguration.audience).toEqual(['WebClient']);
    // ID tokens have no scope claim, so requiring this scope refuses them.
    expect(authorizer?.AuthorizationScopes).toEqual(['aws.cognito.signin.user.admin']);

    // No route may switch the authorizer off.
    for (const fn of functions) {
      for (const event of Object.values(fn.props.Events)) {
        expect(event.Properties, fn.logicalId).not.toHaveProperty('Auth');
      }
    }
  });

  it('allows browsers to call the API only from the website (and the local dev site in dev)', () => {
    const api = template.Resources.HttpApi?.Properties as { CorsConfiguration: unknown };
    // SAM only understands a condition around the WHOLE CORS block. A condition inside AllowOrigins alone becomes the
    // entire CORS setting, which API Gateway ignores, leaving prod with no CORS (2026-10-07). So: every possible
    // outcome of the !If tree must be a complete block. Once YAML tags are dropped, !If reads as [condition, a, b].
    const leaves: { AllowOrigins?: unknown; AllowMethods?: unknown; AllowCredentials?: boolean }[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node) && typeof node[0] === 'string' && node.length === 3) {
        collect(node[1]);
        collect(node[2]);
      } else {
        leaves.push(node as (typeof leaves)[number]);
      }
    };
    collect(api.CorsConfiguration);
    expect(leaves.length).toBe(5);
    for (const leaf of leaves) {
      expect(Array.isArray(leaf.AllowOrigins)).toBe(true);
      expect(leaf.AllowMethods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
      expect(leaf.AllowCredentials).toBeUndefined();
    }
    const origins = JSON.stringify(leaves.map((l) => l.AllowOrigins));
    expect(origins).toContain('https://${WebDistribution.DomainName}');
    expect(origins).toContain('DevOrigin');
    expect(origins).toContain('ExternalSiteOrigin'); // the temporary external host (ADR-0010)
    expect(origins).not.toContain('"*"');
  });

  it('serves the website from a private bucket, HTTPS only, with security headers (P9.2)', () => {
    const bucket = template.Resources.WebBucket?.Properties as {
      PublicAccessBlockConfiguration: Record<string, boolean>;
    };
    expect(Object.values(bucket.PublicAccessBlockConfiguration)).toEqual([true, true, true, true]);

    const policy = template.Resources.WebBucketPolicy?.Properties as {
      PolicyDocument: {
        Statement: { Effect: string; Action: string; Principal: unknown; Condition?: unknown }[];
      };
    };
    const allows = policy.PolicyDocument.Statement.filter((st) => st.Effect === 'Allow');
    expect(allows).toHaveLength(1);
    expect(allows[0]?.Action).toBe('s3:GetObject');
    expect(JSON.stringify(allows[0]?.Condition)).toContain('AWS:SourceArn');

    const distribution = template.Resources.WebDistribution?.Properties as {
      DistributionConfig: {
        DefaultCacheBehavior: { ViewerProtocolPolicy: string; ResponseHeadersPolicyId: string };
      };
    };
    expect(distribution.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy).toBe(
      'redirect-to-https',
    );
    expect(distribution.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId).toBe(
      'WebSecurityHeaders',
    );

    const headers = template.Resources.WebSecurityHeaders?.Properties as {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: { ContentSecurityPolicy: string };
          StrictTransportSecurity: unknown;
          ContentTypeOptions: unknown;
          ReferrerPolicy: unknown;
        };
      };
    };
    const security = headers.ResponseHeadersPolicyConfig.SecurityHeadersConfig;
    expect(security.StrictTransportSecurity).toBeDefined();
    expect(security.ContentTypeOptions).toBeDefined();
    expect(security.ReferrerPolicy).toBeDefined();
    const csp = security.ContentSecurityPolicy.ContentSecurityPolicy;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('sends every alarm to the alert topic, and keeps the alert email out of the repo', () => {
    const alarms = Object.entries(template.Resources).filter(
      ([, resource]) => resource.Type === 'AWS::CloudWatch::Alarm',
    );
    expect(alarms.length).toBeGreaterThanOrEqual(4);
    for (const [logicalId, alarm] of alarms) {
      expect(alarm.Properties.AlarmActions, logicalId).toEqual(['AlertTopic']);
      expect(alarm.Properties.TreatMissingData, logicalId).toBe('notBreaching');
    }

    const parameters = (template as unknown as { Parameters: Record<string, Record<string, unknown>> })
      .Parameters;
    expect(parameters.AlertEmail?.NoEcho).toBe(true);
    expect(parameters.AlertEmail?.Default).toBeUndefined();
    // The repo is public: no email address may ever be committed in the deploy settings.
    expect(readRepoFile('infra/samconfig.toml')).not.toMatch(/[^\s"'=]+@[^\s"']+\.[a-z]{2,}/i);
  });

  it('rate-limits the sensitive routes more tightly than the default, and only names real routes (P9.1)', () => {
    const api = template.Resources.HttpApi?.Properties as {
      DefaultRouteSettings: { ThrottlingRateLimit: number; ThrottlingBurstLimit: number };
      RouteSettings: Record<string, { ThrottlingRateLimit: number; ThrottlingBurstLimit: number }>;
    };
    const routes = new Set(
      functions.flatMap((fn) =>
        Object.values(fn.props.Events).map((event) => `${event.Properties.Method} ${event.Properties.Path}`),
      ),
    );
    // A typo in a route key would silently apply no limit, so every key must be a real route.
    for (const key of Object.keys(api.RouteSettings)) {
      expect(routes.has(key), key).toBe(true);
    }
    for (const key of [
      'GET /songs/search',
      'GET /invites/{code}',
      'POST /parties/{partyId}/join',
      'POST /parties',
    ]) {
      const limits = api.RouteSettings[key];
      expect(limits, key).toBeDefined();
      expect(limits!.ThrottlingRateLimit).toBeLessThan(api.DefaultRouteSettings.ThrottlingRateLimit);
      expect(limits!.ThrottlingBurstLimit).toBeLessThanOrEqual(api.DefaultRouteSettings.ThrottlingBurstLimit);
    }
  });

  it('never leaves prod without a website: CloudFront, or an https external host (ADR-0010)', () => {
    const samconfig = readRepoFile('infra/samconfig.toml');
    const prod = samconfig.slice(samconfig.indexOf('[prod.'));
    if (prod.includes('HostWebsite=false')) {
      expect(prod).toMatch(/ExternalSiteOrigin=https:\/\/[a-z0-9.-]+/);
    }
    // The template refuses it too (Rules), so a hand-typed deploy can't do it either.
    const rules = JSON.stringify(template.Rules);
    expect(rules).toContain('ProdHostsWebsite');
    expect(rules).toContain('ExternalSiteOnlyWithoutCloudFront');
  });

  it('keeps logs for a limited time only, and logs every API request (P9.4)', () => {
    const logGroups = Object.entries(template.Resources).filter(([, r]) => r.Type === 'AWS::Logs::LogGroup');
    expect(logGroups.length).toBeGreaterThanOrEqual(2);
    for (const [logicalId, group] of logGroups) {
      expect(group.Properties.RetentionInDays, logicalId).toBeDefined();
    }
    const api = template.Resources.HttpApi?.Properties as { AccessLogSettings: { Format: string } };
    const format = JSON.parse(api.AccessLogSettings.Format) as Record<string, string>;
    expect(Object.keys(format)).toEqual(
      expect.arrayContaining(['requestId', 'route', 'status', 'userId', 'authError']),
    );
    // No personal data beyond the user id: no IP address, no user agent, no headers.
    expect(api.AccessLogSettings.Format).not.toMatch(/sourceIp|userAgent|header/i);
  });

  it('sends a branded code email that always contains the code placeholder', () => {
    const pool = template.Resources.UserPool?.Properties as {
      VerificationMessageTemplate: { EmailMessage: unknown; EmailSubject: string };
    };
    // `!If [ShouldHostWebsite, cloudFrontLogo, !If [HasExternalSite, externalLogo, noLogo]]` reads as nested lists once
    // the YAML tags are dropped.
    const versions = [pool.VerificationMessageTemplate.EmailMessage]
      .flat(3)
      .filter((v): v is string => typeof v === 'string' && v.includes('<div'));
    expect(versions).toHaveLength(3);
    for (const html of versions) {
      expect(html).toContain('{####}');
      expect(html.length).toBeLessThan(20_000);
    }
    expect(versions.some((html) => html.includes('/logo.png'))).toBe(true);
    expect(pool.VerificationMessageTemplate.EmailSubject).toContain('Drop a Bop');
  });
});
