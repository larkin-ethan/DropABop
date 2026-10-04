// Checks infra/bootstrap.yaml (P11.1): GitHub can deploy only from main or the approved production environment, and
// nothing it can do lets it widen its own permissions.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const text = readFileSync(new URL('../../../infra/bootstrap.yaml', import.meta.url), 'utf8');
const bootstrap = parse(text, { logLevel: 'silent' }) as {
  Resources: Record<string, { Type: string; Properties: Record<string, unknown> }>;
};

interface Statement {
  Sid?: string;
  Effect: string;
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, Record<string, unknown>>;
}

function statements(roleId: string): Statement[] {
  const role = bootstrap.Resources[roleId]?.Properties as {
    Policies: { PolicyDocument: { Statement: Statement[] } }[];
  };
  return role.Policies.flatMap((p) => p.PolicyDocument.Statement);
}

const asList = (value: string | string[]) => (Array.isArray(value) ? value : [value]);

describe('infra/bootstrap.yaml', () => {
  it('trusts only GitHub tokens for this repo’s main branch or its production environment', () => {
    const role = bootstrap.Resources.GitHubDeployRole?.Properties as {
      AssumeRolePolicyDocument: { Statement: Statement[] };
    };
    const [trust] = role.AssumeRolePolicyDocument.Statement;
    expect(trust?.Action).toBe('sts:AssumeRoleWithWebIdentity');
    expect(trust?.Condition?.StringEquals).toEqual({
      'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    });
    const subjects = trust?.Condition?.StringLike?.['token.actions.githubusercontent.com:sub'] as string[];
    expect(subjects).toEqual([
      'repo:${GitHubRepo}:ref:refs/heads/main',
      'repo:${GitHubRepo}:environment:production',
    ]);
  });

  it('lists specific actions only (no wildcards like "s3:*")', () => {
    expect(text).not.toMatch(/Action:\s*['"]?\*['"]?\s*$/m);
    for (const roleId of ['GitHubDeployRole', 'CloudFormationExecutionRole']) {
      for (const statement of statements(roleId)) {
        for (const action of asList(statement.Action)) {
          expect(action, `${roleId} ${statement.Sid ?? ''}`).not.toMatch(/(^\*$|:\*$)/);
        }
      }
    }
  });

  it('can manage only the app stacks’ own roles, never the deploy roles themselves', () => {
    const iamStatements = [
      ...statements('GitHubDeployRole'),
      ...statements('CloudFormationExecutionRole'),
    ].filter((s) => asList(s.Action).some((a) => a.startsWith('iam:')));
    for (const statement of iamStatements) {
      for (const resource of asList(statement.Resource)) {
        // The deploy role may only pass the CloudFormation role; CloudFormation may only touch dropabop-dev/prod-*.
        expect(
          resource === 'CloudFormationExecutionRole.Arn' || /role\/dropabop-(dev|prod)-\*$/.test(resource),
          resource,
        ).toBe(true);
      }
    }
    const roleNames = ['GitHubDeployRole', 'CloudFormationExecutionRole'].map(
      (id) => (bootstrap.Resources[id]?.Properties as { RoleName: string }).RoleName,
    );
    for (const name of roleNames) {
      expect(name).not.toMatch(/^dropabop-(dev|prod)-/);
    }
  });
});
