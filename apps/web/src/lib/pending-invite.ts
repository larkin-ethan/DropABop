// Remembers an invite code while someone signs up or logs in, so /join/:code works logged out (roadmap P8.2).
// sessionStorage: it lasts for this browser tab only, and losing it just means pasting the link again.

const KEY = 'dropabop.pendingInvite';

export function rememberInvite(code: string): void {
  try {
    window.sessionStorage.setItem(KEY, code);
  } catch {
    // Storage blocked: the person can open the invite link again after signing in.
  }
}

export function takePendingInvite(): string | null {
  try {
    const code = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}

/** The shareable link for an invite code. */
export function inviteLink(code: string): string {
  return `${window.location.origin}/join/${encodeURIComponent(code)}`;
}

/** "song-7k4p" or a pasted link → "SONG-7K4P". */
export function normalizeInviteInput(input: string): string {
  const trimmed = input.trim();
  const fromLink = /\/join\/([^/?#\s]+)/.exec(trimmed)?.[1];
  return decodeURIComponent(fromLink ?? trimmed).toUpperCase();
}
