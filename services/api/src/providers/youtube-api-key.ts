// Reads the YouTube Data API key from SSM Parameter Store (ADR-0012). The key is a SecureString created by Ethan
// (DEPLOYMENT.md), because the repository is public. Only the YouTube search function is allowed to read it.

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { logger } from '../http/logger';

/** Re-read now and then, so a replaced key is picked up without a redeploy. */
const KEY_CACHE_MS = 60 * 60 * 1000;
/** When there's no key yet, check again sooner, so the feature turns on soon after Ethan adds one. */
const MISSING_KEY_RETRY_MS = 5 * 60 * 1000;

export function createYouTubeApiKeyReader(
  parameterName: string | undefined = process.env.YOUTUBE_API_KEY_PARAMETER,
): () => Promise<string | null> {
  const client = new SSMClient({});
  let cached: { at: number; key: string | null } | null = null;

  return async () => {
    if (parameterName === undefined || parameterName === '') return null;
    if (cached !== null && Date.now() - cached.at < KEY_CACHE_MS) return cached.key;
    try {
      const result = await client.send(
        new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
      );
      const key = result.Parameter?.Value ?? null;
      cached = { at: Date.now(), key };
      return key;
    } catch (error) {
      // Not set up yet (ParameterNotFound) or not readable: the feature stays off. Never log the value.
      const name = error instanceof Error ? error.name : 'Unknown';
      if (name !== 'ParameterNotFound') logger.warn('YouTube API key unavailable', { reason: name });
      cached = { at: Date.now() - KEY_CACHE_MS + MISSING_KEY_RETRY_MS, key: null }; // look again in 5 minutes
      return null;
    }
  };
}
