// P10.3: the journey against the real dev stack (see dev-stack.config.ts). Two people: the host (test user 1) and a
// friend (test user 2). On weekdays a song is shared and rated; on weekends the test checks sharing is closed.
// Ends with the friend leaving, so the test can run again (people may be in at most 5 parties).

import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

interface TestUser {
  email: string;
  password: string;
}

const PARTY = 'Smoke test party';
// The test users are created by `node scripts/smoke-dev.mjs`; without them there's nobody to sign in as.
const usersFile = new URL('../.test-users.json', import.meta.url);
const users: TestUser[] = existsSync(usersFile)
  ? (JSON.parse(readFileSync(usersFile, 'utf8')) as TestUser[])
  : [];

async function signIn(browser: Browser, user: TestUser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Signed in once the app leaves the sign-in page (a wrong password would show an alert instead).
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 20_000 });
  // First sign-in on a fresh account asks for a name.
  const namePrompt = page.getByRole('heading', { name: /What should your party call you/ });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  if (await namePrompt.isVisible()) {
    await page.getByLabel('Display name').fill(name);
    await page.getByRole('button', { name: 'Save' }).click();
  }
  return page;
}

/** Makes `PARTY` the current party for this person (creating it if they host none). */
async function openParty(page: Page) {
  await page.goto('/settings');
  const switcher = page.getByRole('button', { name: /Party/ }).first();
  await switcher.click();
  const existing = page.getByRole('menuitemradio', { name: PARTY });
  if (await existing.count()) {
    await existing.first().click();
  } else {
    await page.keyboard.press('Escape');
    await page.goto('/parties/new');
    await page.getByLabel('Party name').fill(PARTY);
    await page.getByRole('button', { name: 'Create party' }).click();
    await expect(page.getByRole('heading', { name: PARTY })).toBeVisible();
  }
}

test('host and friend: invite → join → share → rate (weekdays) → leave', async ({ browser }) => {
  test.skip(users.length < 2, 'No test users yet: run `node scripts/smoke-dev.mjs` first.');
  const [host, friend] = users;
  test.skip(
    host === undefined || friend === undefined,
    'Run `node scripts/smoke-dev.mjs` once to create test users.',
  );

  const hostPage = await signIn(browser, host!, 'Smoke One');
  await openParty(hostPage);
  await hostPage.goto('/settings');
  const code = (await hostPage.getByText(/^Code: /).textContent())?.replace('Code: ', '').trim() ?? '';
  expect(code).toMatch(/^SONG-/);

  const friendPage = await signIn(browser, friend!, 'Smoke Two');
  await friendPage.goto(`/join/${code}`);
  await expect(friendPage.getByRole('heading', { name: PARTY })).toBeVisible();
  const joinButton = friendPage.getByRole('button', { name: 'Join party' });
  if (await joinButton.isVisible()) await joinButton.click();
  else await friendPage.getByRole('button', { name: 'Go to the party' }).click();
  await expect(
    friendPage.getByRole('heading', { name: /This week’s songs|between weeks|paused/i }),
  ).toBeVisible();

  // Share today's song as the host (weekdays only; the server's clock decides).
  await hostPage.goto('/share');
  const weekend = hostPage.getByText('Sharing is closed on weekends');
  const alreadyShared = hostPage.getByText('You’ve shared today’s song');
  const search = hostPage.getByLabel('Search for a song, artist, or album');
  await expect(weekend.or(alreadyShared).or(search).first()).toBeVisible({ timeout: 20_000 });
  if (await search.isVisible()) {
    await search.fill('midnight city m83');
    await hostPage
      .getByRole('button', { name: /^Choose / })
      .first()
      .click();
    await hostPage.getByRole('dialog').getByRole('button', { name: 'Share song' }).click();
    await expect(hostPage.getByText('You’ve shared today’s song')).toBeVisible({ timeout: 20_000 });
  }

  if (!(await weekend.isVisible())) {
    // The friend rates the host's song (anonymous to them).
    await friendPage.goto('/rate');
    const control = friendPage.getByRole('radiogroup').first();
    await expect(control).toBeVisible({ timeout: 20_000 });
    await control.getByRole('radio', { name: '8 out of 10' }).click();
    await expect(control.getByRole('radio', { name: '8 out of 10' })).toHaveAttribute('aria-checked', 'true');
    await friendPage.waitForTimeout(1_500); // the rating saves after a short pause
  }

  // Clean up: the friend leaves, so the next run can join again.
  await friendPage.goto('/settings');
  await friendPage.getByRole('button', { name: 'Leave' }).click();
  await friendPage.getByRole('dialog').getByRole('button', { name: 'Leave party' }).click();
  await expect(friendPage).toHaveURL(/\/$/);
});
