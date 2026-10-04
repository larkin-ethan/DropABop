// Frontend configuration from environment variables (spec §37). These are public values (URLs and ids), never
// secrets: anything starting with VITE_ is bundled into the JavaScript every visitor downloads.
// Local values go in apps/web/.env.development.local (git-ignored); see apps/web/.env.example.

export interface AppConfig {
  apiUrl: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  awsRegion: string;
}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing ${name}. Copy apps/web/.env.example to apps/web/.env.development.local and fill it in.`,
    );
  }
  return value;
}

let cached: AppConfig | undefined;

/** Reads the config the first time it's needed (the sample-data preview doesn't need it) and fails loudly if incomplete. */
export function getConfig(): AppConfig {
  cached ??= {
    apiUrl: required('VITE_API_URL', import.meta.env.VITE_API_URL as string | undefined),
    cognitoUserPoolId: required(
      'VITE_COGNITO_USER_POOL_ID',
      import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined,
    ),
    cognitoClientId: required(
      'VITE_COGNITO_CLIENT_ID',
      import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined,
    ),
    awsRegion: required('VITE_AWS_REGION', import.meta.env.VITE_AWS_REGION as string | undefined),
  };
  return cached;
}
