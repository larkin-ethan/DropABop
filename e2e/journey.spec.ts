// The critical journey (roadmap P10.2, spec §34): join a party → share today's song → rate others' songs → the week
// ends (ratings lock) → see the weekly results. Runs at 375 px and 1440 px (playwright.config.ts).
// Sign-up and sign-in use real Cognito and are covered against the dev stack (P10.3 / scripts/smoke-dev.mjs);
// the sample world starts signed in.

import { expect, test, type Page } from '@playwright/test';

/** Main navigation: the sidebar on desktop, the bottom bar on phones. Whichever is visible. */
async function goTo(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name, exact: true })
    .locator('visible=true')
    .first()
    .click();
}

test('join → share → rate → week ends → results', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This week’s songs' })).toBeVisible();

  // Join a friend's party from an invite link.
  await page.goto('/join/SONG-2ABC');
  await expect(page.getByRole('heading', { name: 'Road Trip Crew' })).toBeVisible();
  await page.getByRole('button', { name: 'Join party' }).click();
  await expect(page).toHaveURL(/\/$/);

  // Share today's song: search, choose, confirm.
  await page.getByRole('link', { name: 'Share today’s song' }).first().click();
  await page.getByLabel('Search for a song, artist, or album').fill('sun');
  await page.getByRole('button', { name: 'Choose Here Comes the Sun' }).click();
  const confirm = page.getByRole('dialog', { name: 'Share this song?' });
  await expect(confirm.getByText('You can’t change it after sharing.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Share song' }).click();
  await expect(page.getByText('You’ve shared today’s song')).toBeVisible();

  // Rate someone else's song.
  await goTo(page, 'Rate');
  await expect(page.getByText('6 of 11 rated')).toBeVisible();
  await page.getByRole('button', { name: /Unrated/ }).click();
  await page
    .getByRole('radiogroup', { name: /Rate Heat Waves/ })
    .getByRole('radio', { name: '9 out of 10' })
    .click();
  await expect(page.getByText('7 of 11 rated')).toBeVisible();

  // Sunday night passes: the week closes (sample mode's stand-in for the server clock).
  await page.evaluate(() =>
    (window as unknown as { __dropabopSample: { closeWeek: () => void } }).__dropabopSample.closeWeek(),
  );

  // Results are out, with today's song in them and the rating we gave.
  await goTo(page, 'Results');
  await expect(page.getByRole('heading', { name: 'Week complete!' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bop of the Day/ })).toBeVisible();
  await expect(page.getByText('Here Comes the Sun').first()).toBeVisible();
  await expect(page.getByText('Heat Waves').first()).toBeVisible();

  // Ratings are locked: there's nothing left to rate.
  await goTo(page, 'Rate');
  await expect(page.getByText('No week is running right now')).toBeVisible();

  // Nothing ever scrolls sideways (spec §21).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
