#!/usr/bin/env node
// Claude Code PreToolUse hook for Bash commands.
// Blocks commands the AI must never run on its own (CLAUDE.md → "AWS actions the AI must not take").
// Exit code 2 blocks the command and shows the reason to Claude, which should then hand the step to the user.
// Uses Node (already required by the project) so it doesn't depend on jq or python being installed.

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let command = '';
  try {
    command = JSON.parse(raw).tool_input?.command ?? '';
  } catch {
    process.exit(0); // Not a payload we understand; let normal permissions decide.
  }

  const rules = [
    {
      // Only real AWS/SAM invocations: doc edits or commit messages that merely mention "prod" are fine.
      pattern: /\b(aws|sam)\s[^|;&]*(--config-env[= ]+prod\b|--profile[= ]+\S*prod\b|\bsotd-prod\b)/,
      reason:
        'Production actions are done by Ethan, not the AI. Give him the exact command and explain what it does.',
    },
    {
      pattern:
        /\b(aws|sam)\b[^|;&]*\b(delete|remove|rm|rb|terminate|purge|destroy|delete-stack|delete-table|delete-bucket)\b/,
      reason:
        'Deleting AWS resources or data is a human-only action. Explain what should be deleted and why, and let Ethan run it.',
    },
    {
      pattern: /\baws\s+iam\s+create-access-key\b|\baws\s+configure\s+set\b.*secret/,
      reason: 'Long-lived AWS access keys are not used in this project (SSO for people, OIDC for CI).',
    },
    {
      pattern:
        /\baws\s+(budgets|ce|billing|account|organizations)\b[^|;&]*\b(create|update|put|delete|close)\b/,
      reason: 'Billing and account settings are changed by Ethan only.',
    },
    {
      pattern: /\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b)/,
      reason: 'Force-pushing rewrites shared history. Not allowed for the AI.',
    },
    {
      pattern: /(\.aws\/credentials|\.aws\/config\b|(^|[\s/])\.env(\.(local|production|development))?(\s|$))/,
      reason: 'Credential and .env files must not be read or printed by the AI.',
    },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(command)) {
      process.stderr.write(`Blocked by project guardrail: ${rule.reason}\n`);
      process.exit(2);
    }
  }
  process.exit(0);
});
