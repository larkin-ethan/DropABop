// Sign in, sign up, email verification, and forgot password (spec §19 screens 2–5; mockup screens 2–5).
// They talk to the AuthService (ADR-0008) and show friendly messages for every error (spec §30).

import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { friendlyAuthError, isUnconfirmedError } from '../auth/auth-errors';
import { TextField } from '../components/TextField';
import { BigLogo, Button, Card } from '../components/ui';

/** Illustration panel + form, like the mockup's auth screens. The panel becomes a header on phones. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-purple/60 via-active to-bg px-6 py-10 md:w-5/12">
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg/80 to-transparent"
          aria-hidden="true"
        />
        <div className="relative text-center">
          <BigLogo className="w-28 md:w-44" />
          <p className="mt-3 text-muted">One song a day. One group. Endless good vibes.</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200"
    >
      {message}
    </p>
  );
}

/** Runs an async form action with a busy flag and a friendly error. */
function useFormAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>, onError?: (error: unknown) => boolean) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (!onError?.(err)) setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

export function SignInScreen() {
  const { service, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useFormAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(
      async () => {
        const result = await service.signIn(email.trim(), password);
        if (result.status === 'needsConfirmation') {
          await navigate('/verify', { state: { email: email.trim() } });
          return;
        }
        await refresh();
        await navigate(returnTo, { replace: true });
      },
      (err) => {
        if (!isUnconfirmedError(err)) return false;
        void navigate('/verify', { state: { email: email.trim() } });
        return true;
      },
    );
  }

  return (
    <AuthLayout title="Welcome back!" subtitle="Sign in to continue to your party.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={busy} className="mt-2 w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/forgot-password" className="text-blue hover:underline">
            Forgot password?
          </Link>
          <Link to="/sign-up" className="text-blue hover:underline">
            Create an account
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

export function SignUpScreen() {
  const { service } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, setError, run } = useFormAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('The passwords don’t match.');
      return;
    }
    void run(async () => {
      await service.signUp(email.trim(), password);
      await navigate('/verify', { state: { email: email.trim() } });
    });
  }

  return (
    <AuthLayout title="Create your account" subtitle="Join Drop a Bop and start sharing music.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters, with upper- and lower-case letters and a number."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" disabled={busy} className="mt-2 w-full">
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/sign-in" className="text-blue hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailScreen() {
  const { service } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [code, setCode] = useState('');
  const [resent, setResent] = useState(false);
  const { busy, error, run } = useFormAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await service.confirmSignUp(email.trim(), code.trim());
      await navigate('/sign-in', { state: { verified: true } });
    });
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle="We sent a 6-digit code. Enter it to finish creating your account."
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Checking…' : 'Verify email'}
        </Button>
        <button
          type="button"
          className="text-sm text-blue hover:underline"
          onClick={() =>
            void run(async () => {
              await service.resendSignUpCode(email.trim());
              setResent(true);
            })
          }
        >
          {resent ? 'Code sent. Check your inbox.' : 'Didn’t get it? Send a new code'}
        </button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordScreen() {
  const { service } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useFormAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (step === 'request') {
        await service.resetPassword(email.trim());
        setStep('reset');
      } else {
        await service.confirmResetPassword(email.trim(), code.trim(), password);
        await navigate('/sign-in', { state: { passwordReset: true } });
      }
    });
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={
        step === 'request'
          ? 'Enter your email and we’ll send you a code.'
          : 'Enter the code from your email and a new password.'
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {step === 'reset' && (
          <>
            <TextField
              label="Code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters, with upper- and lower-case letters and a number."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {step === 'request' ? (busy ? 'Sending…' : 'Send code') : busy ? 'Saving…' : 'Set new password'}
        </Button>
        <Link to="/sign-in" className="text-center text-sm text-blue hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}
