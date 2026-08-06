import { test, expect } from '@playwright/test';

test('TodayView renders without crashing', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  // just a dummy check to verify the app doesn't crash on load
  await expect(page.locator('.today-title')).toBeVisible();
});
