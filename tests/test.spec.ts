import { test, expect } from '@playwright/test';

test('Has Title', async ({ page }) => {
  await page.goto('https://b2b.partnerhub.sunrise.ch/');

  await expect(page).toHaveTitle(/Sunrise Business Hub/);
});

test('Click Employee ', async ({ page }) => {
  await page.goto('https://b2b.partnerhub.sunrise.ch/');

  await page.getByText('I am a Sunrise Employee').click();
});
