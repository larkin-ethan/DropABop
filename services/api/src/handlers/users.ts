// GET /users/me and PATCH /users/me (docs/API.md → Profile).

import type { MeResponse } from '@dropabop/shared';
import { updateProfileRequestSchema } from '@dropabop/shared';
import { listUserParties } from '../data/parties';
import { getOrCreateUserProfile, updateUserProfile } from '../data/users';
import { buildNewUser, privacyAgreement } from '../domain/profile';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody } from '../http/request';

/** Your profile (created on first call) and the parties you're in. */
export const getMe: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const user = await getOrCreateUserProfile(data, buildNewUser(userId, now()));
  const parties = await listUserParties(data, userId);
  return ok({ user, parties } satisfies MeResponse);
};

/** Change your display name, avatar color, or preferred music app (D22), or agree to the privacy policy (ADR-0011). */
export const updateMe: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const { acceptPrivacy, ...profileChanges } = parseBody(event, updateProfileRequestSchema);
  const changes = acceptPrivacy === true ? { ...profileChanges, ...privacyAgreement(now()) } : profileChanges;
  await getOrCreateUserProfile(data, buildNewUser(userId, now())); // PATCH before the first GET still works
  const user = await updateUserProfile(data, userId, changes);
  return ok({ user } satisfies Omit<MeResponse, 'parties'>);
};

export const getMeHandler = createHandler(getMe);
export const updateMeHandler = createHandler(updateMe);
