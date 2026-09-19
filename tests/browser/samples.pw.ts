import { test, expect } from '@playwright/test';
import { demos } from '../../fixtures/demos';

test('all samples replace every field, including clearing the previous identity', async ({
  page,
}) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { configured: true, harness: true, mcp: true, sandbox: false } }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Investigate', exact: true })).toBeEnabled();
  // Start with all fields populated, then switch between every sample.
  for (const demo of [demos[4], ...demos]) {
    await page.getByRole('button', { name: new RegExp(demo.label) }).click();
    await expect(page.getByRole('textbox', { name: 'Message to investigate' })).toHaveValue(
      demo.text,
    );
    await expect(page.getByRole('textbox', { name: 'Link to investigate' })).toHaveValue(demo.url);
    await expect(page.getByRole('textbox', { name: 'Phone number' })).toHaveValue(demo.senderPhone);
    await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveValue(
      demo.senderEmail,
    );
    await expect(page.getByRole('textbox', { name: 'Claimed organization' })).toHaveValue(
      demo.claimedOrganization,
    );
    await expect(page.getByRole('textbox', { name: 'Message to investigate' })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Investigation results' })).toHaveCount(0);
  }
});

for (const demo of demos) {
  test(`${demo.label} submits all supplied signals together`, async ({ page }) => {
    await page.route('**/api/health', (route) =>
      route.fulfill({ json: { configured: true, harness: true, mcp: true, sandbox: false } }),
    );
    await page.route('**/api/cases', (route) =>
      route.fulfill({ status: 503, json: { error: 'Synthetic test: investigation not started.' } }),
    );
    await page.goto('/');
    const button = page.getByRole('button', { name: new RegExp(demo.label) });
    await expect(button).toBeEnabled();
    await button.click();
    const submission = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/cases' && request.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Investigate', exact: true }).click();
    expect((await submission).postDataJSON()).toEqual({
      text: demo.text,
      ...(demo.senderPhone ? { senderPhone: demo.senderPhone } : {}),
      ...(demo.senderEmail ? { senderEmail: demo.senderEmail } : {}),
      ...(demo.claimedOrganization ? { claimedOrganization: demo.claimedOrganization } : {}),
    });
    // Detected URLs travel in the original message, never as duplicate manual input.
    if (demo.url) expect(demo.text).toContain(demo.url);
  });
}
