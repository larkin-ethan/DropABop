// Asks signed-in members to agree to the privacy policy and terms before using the app (P13.2a, ADR-0011).
// YouTube requires agreement before its player can be used; Ethan chose to ask everyone once (2026-10-09).
// People who ticked the box at sign-up aren't asked again: their agreement is saved on the first visit.

import { hasAcceptedCurrentPrivacy } from '@dropabop/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMe, useUpdateProfile } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../lib/errors';
import { agreedAtSignUp, forgetSignUpAgreement } from '../lib/privacy-consent';
import { SignOutButton } from './AppShell';
import { PageHeader } from './Page';
import { LoadingState } from './States';
import { Button, Card } from './ui';

export function PrivacyGate({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const me = useMe();
  const update = useUpdateProfile();
  const user = me.data?.user;
  const needsAgreement = user !== undefined && !hasAcceptedCurrentPrivacy(user);
  const fromSignUp = needsAgreement && agreedAtSignUp(userId);
  const triedSignUpAgreement = useRef(false);

  // Ticked at sign-up: save it now, once, without asking again.
  useEffect(() => {
    if (!fromSignUp || triedSignUpAgreement.current) return;
    triedSignUpAgreement.current = true;
    update.mutate({ acceptPrivacy: true }, { onSuccess: () => forgetSignUpAgreement() });
  }, [fromSignUp, update]);

  // While the profile loads (or fails to), the screens show their own loading and error states. This gate is about
  // the policy, not security: anything that needs the agreement (the YouTube player, P13.4) checks it again itself.
  if (!needsAgreement) return <>{children}</>;

  if (fromSignUp && !update.isError) {
    return <LoadingState label="Setting up your account…" rows={2} />;
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow="One quick thing"
        title="Privacy policy and terms"
        description="Drop a Bop now has a privacy policy and terms of use. Please read them and agree to keep using the app."
      />
      <Card>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-muted">
          <li>We keep only what the app needs: your name, picture, settings, songs, ratings and comments.</li>
          <li>Only people in your parties can see them.</li>
          <li>
            Videos that members link play in YouTube’s player. By using Drop a Bop you agree to be bound by
            the YouTube Terms of Service.
          </li>
        </ul>
        <p className="mt-4">
          <Link to="/privacy" className="font-semibold text-blue hover:underline">
            Read the privacy policy and terms
          </Link>
        </p>
        {update.isError && (
          <p role="alert" className="mt-4 text-sm text-red-200">
            {errorMessage(update.error)}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            disabled={update.isPending}
            onClick={() =>
              update.mutate({ acceptPrivacy: true }, { onSuccess: () => forgetSignUpAgreement() })
            }
          >
            {update.isPending ? 'Saving…' : 'I agree'}
          </Button>
          <SignOutButton />
        </div>
      </Card>
    </div>
  );
}
