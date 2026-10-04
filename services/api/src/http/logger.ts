// Structured logging (spec §33). One JSON object per line, which CloudWatch Logs can search and filter.
//
// Never log: tokens, passwords, secrets, Authorization headers, full request events, or emails. Every log call goes
// through redact(), so a sensitive field slipped into `fields` by mistake is replaced with "[REDACTED]".

type Level = 'info' | 'warn' | 'error';

/** Field names (case-insensitive, matched anywhere in nested objects) whose values are never written to logs. */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'token',
  'accesstoken',
  'idtoken',
  'refreshtoken',
  'access_token',
  'id_token',
  'refresh_token',
  'password',
  'secret',
  'clientsecret',
  'client_secret',
  'apikey',
  'api_key',
  'email',
  'headers',
  'body',
];

const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return '[TRUNCATED]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value instanceof Error) {
    // Error messages and stacks are useful and come from our own code or the AWS SDK, not user secrets.
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      result[key] = SENSITIVE_KEYS.includes(key.toLowerCase()) ? '[REDACTED]' : redact(inner, depth + 1);
    }
    return result;
  }
  return value;
}

function write(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(redact(fields) as object),
  });
  // stdout/stderr go straight to CloudWatch Logs in Lambda.
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
