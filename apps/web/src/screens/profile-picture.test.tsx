// Profile pictures (D18, 2026-10-04). The test browser (jsdom) can't decode images, so the shrinking step is
// replaced with a stand-in; lib/avatar-image.ts does the real work in browsers.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render-app';

const SMALL_JPEG = `data:image/jpeg;base64,${'A'.repeat(200)}`;

vi.mock('../lib/avatar-image', () => ({
  AvatarImageError: class AvatarImageError extends Error {},
  toAvatarDataUrl: vi.fn(() => Promise.resolve(SMALL_JPEG)),
}));

describe('profile picture', () => {
  it('uploads, saves, shows, and removes a picture', async () => {
    const { state } = renderApp('/profile');
    const input = await screen.findByLabelText('Choose a profile picture');
    await userEvent.upload(input, new File(['x'], 'me.png', { type: 'image/png' }));
    expect(await screen.findByRole('button', { name: 'Remove picture' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.user.avatarImage).toBe(SMALL_JPEG));
    // Shown in the app frame and in the party's member list, not just on this page.
    await waitFor(() =>
      expect(document.querySelectorAll(`img[src="${SMALL_JPEG}"]`).length).toBeGreaterThan(1),
    );
    expect(state.members.find((m) => m.userId === 'me')?.avatarImage).toBe(SMALL_JPEG);

    await userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.user.avatarImage).toBeNull());
  });
});
