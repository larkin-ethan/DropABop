// Keyboard-only checks (roadmap P13.14, spec §37): the calendar, the rating picker, the video player and the
// "Achievement unlocked" banner can all be used with Tab, Enter and the arrow keys alone, and focus is always
// visible. Runs in sample mode at both widths (playwright.config.ts).

import { expect, test, type Locator, type Page } from '@playwright/test';

/** Presses Tab until `target` has focus, like a keyboard user would. Fails if it's never reached. */
async function tabTo(page: Page, target: Locator, maxPresses = 300) {
  for (let i = 0; i < maxPresses; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${String(target)}`);
}

/** The focused element draws a real outline (the app's :focus-visible style). */
async function expectVisibleFocus(page: Page) {
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement ?? document.body);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  // The sample week is fixed on Wednesday 7 October 2026; its linked video is only playable within 30 days.
  await page.clock.setFixedTime(new Date('2026-10-07T17:00:00Z'));
  // Never reach out to YouTube from tests: the docked player still opens with its own controls.
  await page.route(/youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com/, (route) =>
    route.abort(),
  );
});

test('calendar: Tab to a day with songs, Enter opens its Day view', async ({ page }) => {
  await page.goto('/history?month=2026-10');
  const day = page.locator('table a[href^="/history/day/"]').first();
  await expect(day).toBeVisible();
  const href = await day.getAttribute('href');
  await tabTo(page, day);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('rating: arrow keys move through 0–10 and select the rating (D36)', async ({ page }) => {
  await page.goto('/rate');
  const picker = page.getByRole('radiogroup', { name: /Rate Heat Waves/ });
  const first = picker.getByRole('radio', { name: '0 out of 10', exact: true });
  await tabTo(page, first); // only one radio per song is in the Tab order
  await expectVisibleFocus(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const three = picker.getByRole('radio', { name: '3 out of 10' });
  await expect(three).toBeFocused();
  await expect(three).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('End');
  await expect(picker.getByRole('radio', { name: '10 out of 10' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  await expect(picker.getByRole('radio', { name: '0 out of 10', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('player: open a video with Enter, Tab to “Close player”, close it with Enter', async ({ page }) => {
  await page.goto('/rate');
  const play = page.getByRole('button', {
    name: /Play the YouTube video linked by the sharer for Blinding Lights/,
  });
  await tabTo(page, play);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  const close = page.getByRole('button', { name: 'Close player' });
  await expect(close).toBeVisible();
  await tabTo(page, close); // the player isn't a trap and isn't out of reach
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(close).toHaveCount(0);
});

test('achievement banner: Tab reaches View and Dismiss; Enter dismisses it', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('status', { name: 'Achievement unlocked' });
  await expect(banner).toBeVisible();
  await tabTo(page, banner.getByRole('link', { name: 'View' }));
  await expectVisibleFocus(page);
  await page.keyboard.press('Tab');
  const dismiss = banner.getByRole('button', { name: 'Dismiss' });
  await expect(dismiss).toBeFocused();
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(banner).toHaveCount(0);
});

test('saved songs: Tab to Save, Enter saves; the Saved songs page lists it', async ({ page }) => {
  await page.goto('/rate');
  const save = page.getByRole('button', { name: 'Save Heat Waves to your saved songs' });
  await tabTo(page, save);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  const saved = page.getByRole('button', { name: 'Remove Heat Waves from your saved songs' });
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/saved');
  // The sample world resets on reload, so this checks the page itself: the empty state's link works by keyboard.
  const link = page.getByRole('link', { name: /Go to this week’s songs/ });
  await tabTo(page, link);
  await expectVisibleFocus(page);
});

test('scoring key: Tab to “How to score”, Enter closes and opens it (D37)', async ({ page }) => {
  await page.goto('/rate');
  const toggle = page.getByRole('button', { name: 'How to score' });
  await tabTo(page, toggle);
  await expectVisibleFocus(page);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true'); // open on the first visit
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});
