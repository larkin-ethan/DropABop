// Has this person agreed to the current privacy policy and terms? (ADR-0011, P13.2a)

import { PRIVACY_POLICY_VERSION } from './limits';
import type { User } from './types';

export function hasAcceptedCurrentPrivacy(user: Pick<User, 'privacyAcceptedAt' | 'privacyVersion'>): boolean {
  return (
    typeof user.privacyAcceptedAt === 'string' &&
    user.privacyAcceptedAt !== '' &&
    user.privacyVersion === PRIVACY_POLICY_VERSION
  );
}
