// Responsive & accessibility pass (roadmap P8.12, spec §21): every screen at the 7 widths the spec names.
// For each one: no sideways scrolling, every button/link/field has a name a screen reader can read, every image has
// alt text, and Tab moves focus to something visible. A full-page screenshot of each is saved in
// e2e/screenshots/ (git-ignored) for a person to look over.
// Runs in sample mode like the journey; it sets its own widths, so it runs under one project only.

import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];

const SCREENS = [
  { name: 'home', path: '/' },
  { name: 'share', path: '/share' },
  { name: 'rate', path: '/rate' },
  { name: 'results', path: '/results' },
  { name: 'history', path: '/history' },
  { name: 'stats', path: '/stats' },
  { name: 'group-stats', path: '/stats/group' },
  { name: 'leaderboard', path: '/leaderboard' },
  { name: 'settings', path: '/settings' },
  { name: 'profile', path: '/profile' },
  { name: 'join-code', path: '/join' },
  { name: 'join-link', path: '/join/SONG-2ABC' },
  { name: 'new-party', path: '/parties/new' },
  { name: 'welcome', path: '/welcome' },
  { name: 'sign-in', path: '/sign-in' },
  { name: 'sign-up', path: '/sign-up' },
  { name: 'forgot-password', path: '/forgot-password' },
  { name: 'how-it-works', path: '/how-it-works' },
];

/** Interactive elements and images that a screen reader would announce with no name. */
async function unnamedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || el.tagName === 'BODY';
    for (const img of Array.from(document.querySelectorAll('img'))) {
      if (visible(img) && !img.hasAttribute('alt')) problems.push(`img ${img.getAttribute('src')}`);
    }
    for (const el of Array.from(document.querySelectorAll('button, a[href], input, select, textarea'))) {
      if (!visible(el) || (el as HTMLInputElement).type === 'hidden') continue;
      const labelledBy = el.getAttribute('aria-labelledby');
      const fromLabelledBy = labelledBy
        ? labelledBy
            .split(' ')
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join('')
        : '';
      const fromLabels = (el as HTMLInputElement).labels
        ? Array.from((el as HTMLInputElement).labels ?? [])
            .map((label) => label.textContent ?? '')
            .join('')
        : '';
      const name =
        (el.getAttribute('aria-label') ?? '') +
        fromLabelledBy +
        fromLabels +
        (el.textContent ?? '') +
        (el.getAttribute('title') ?? '') +
        (el.querySelector('img[alt]')?.getAttribute('alt') ?? '');
      if (name.trim() === '') problems.push(el.outerHTML.slice(0, 120));
    }
    return problems;
  });
}

test.describe('every screen at every width', () => {
  for (const screen of SCREENS) {
    test(screen.name, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone-375', 'Sets its own widths; one project is enough.');
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(screen.path);
        await expect(page.getByRole('heading').first()).toBeVisible();
        // Let loading states settle before measuring.
        await page.waitForLoadState('networkidle');

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${screen.path} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);

        expect(await unnamedElements(page), `${screen.path} at ${width}px`).toEqual([]);

        await page.screenshot({ path: `e2e/screenshots/${screen.name}-${width}.png`, fullPage: true });
      }

      // Keyboard: the first Tab lands on something on screen (not lost on the page itself).
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(screen.path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toHaveCount(1);
      await expect(focused).toBeVisible();
    });
  }
});
