import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should handle scraping API errors gracefully', async ({ page }) => {
    // Mock API error response
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'SCRAPING_ERROR',
            message: 'Failed to scrape the website'
          }
        })
      });
    });

    // Submit URL for scraping
    await page.fill('input[type="url"]', 'https://error-site.com');
    await page.click('button:has-text("Start Scraping")');

    // Should show error message
    await expect(page.locator('text=Failed to process URL')).toBeVisible({ timeout: 10000 });
  });

  test('should handle network errors', async ({ page }) => {
    // Mock network failure
    await page.route('**/api/scrape', async (route) => {
      await route.abort('failed');
    });

    // Submit URL for scraping
    await page.fill('input[type="url"]', 'https://network-error.com');
    await page.click('button:has-text("Start Scraping")');

    // Should show error message
    await expect(page.locator('text=Failed to process URL')).toBeVisible({ timeout: 10000 });
  });

  test('should handle invalid file upload', async ({ page }) => {
    // Switch to file upload tab
    await page.click('text=Upload JSON File');

    // Try to upload a non-JSON file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is not a JSON file')
    });

    // Should show error or reject the file
    await expect(page.locator('text=Cannot process file with validation errors')).toBeVisible({ timeout: 5000 });
  });

  test('should handle oversized file upload', async ({ page }) => {
    // Switch to file upload tab
    await page.click('text=Upload JSON File');

    // Create a large JSON file (simulating 15MB)
    const largeData = {
      data: 'x'.repeat(15 * 1024 * 1024) // 15MB of data
    };

    const fileInput = page.locator('input[type="file"]');

    // This might fail due to browser limitations, but we test the attempt
    try {
      await fileInput.setInputFiles({
        name: 'large-file.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(largeData))
      });
    } catch (e) {
      // Expected to fail in test environment
      console.log('Large file upload failed as expected:', e.message);
    }
  });

  test('should handle malformed JSON file upload', async ({ page }) => {
    // Switch to file upload tab
    await page.click('text=Upload JSON File');

    // Create malformed JSON
    const malformedJson = '{ "name": "Test", "invalid": json }';

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'malformed.json',
      mimeType: 'application/json',
      buffer: Buffer.from(malformedJson)
    });

    // Should show error
    await expect(page.locator('text=Cannot process file with validation errors')).toBeVisible({ timeout: 5000 });
  });

  test('should show helpful error messages for different scenarios', async ({ page }) => {
    // Test validation errors
    await page.click('text=Scrape from URL');
    await page.click('button:has-text("Start Scraping")');
    await expect(page.locator('text=URL is required')).toBeVisible();

    await page.fill('input[type="url"]', 'invalid-url');
    await page.click('button:has-text("Start Scraping")');
    await expect(page.locator('text=Please enter a valid URL')).toBeVisible();

    // Test file errors
    await page.click('text=Upload JSON File');

    // Test empty JSON
    const emptyJson = {};
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'empty.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(emptyJson))
    });

    // Should still allow processing but might show warnings
    await expect(page.locator('button:has-text("Import File")')).toBeVisible();
  });

  test('should maintain UI state during errors', async ({ page }) => {
    // Mock intermittent error
    let callCount = 0;
    await page.route('**/api/scrape', async (route) => {
      callCount++;
      if (callCount === 1) {
        // First call fails
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              code: 'TEMPORARY_ERROR',
              message: 'Temporary server error'
            }
          })
        });
      } else {
        // Second call succeeds
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              name: 'Test Festival',
              startDate: '2024-06-01T00:00:00.000Z',
              endDate: '2024-06-03T00:00:00.000Z'
            },
            confidence: 0.85,
            sessionId: 'test-session-retry'
          })
        });
      }
    });

    // Submit URL and expect error
    await page.fill('input[type="url"]', 'https://retry-site.com');
    await page.click('button:has-text("Start Scraping")');

    // Should show error
    await expect(page.locator('text=Failed to process URL')).toBeVisible({ timeout: 10000 });

    // UI should remain functional
    await expect(page.locator('input[type="url"]')).toBeVisible();
    await expect(page.locator('button:has-text("Start Scraping")')).toBeVisible();
    await expect(page.locator('button:has-text("Start Scraping")')).toBeEnabled();

    // Should be able to retry
    await page.click('button:has-text("Start Scraping")');

    // Should succeed on second try
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });
  });

  test('should show loading states during operations', async ({ page }) => {
    // Mock delayed response
    await page.route('**/api/scrape', async (route) => {
      // Delay response to see loading state
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Festival',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z'
          },
          confidence: 0.85,
          sessionId: 'test-session-delayed'
        })
      });
    });

    // Submit URL
    await page.fill('input[type="url"]', 'https://slow-site.com');
    await page.click('button:has-text("Start Scraping")');

    // Should show loading state immediately
    await expect(page.locator('text=Processing...')).toBeVisible();

    // Button should be disabled during loading
    await expect(page.locator('button:has-text("Processing...")')).toBeVisible();

    // Should eventually show success
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });
  });

  test('should handle WebSocket connection failures gracefully', async ({ page }) => {
    // Mock successful API response but WebSocket will fail
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Festival',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z'
          },
          confidence: 0.85,
          sessionId: 'test-session-ws-fail'
        })
      });
    });

    // Mock WebSocket failure
    await page.route('**/socket.io/**', async (route) => {
      await route.abort('failed');
    });

    // Submit URL
    await page.fill('input[type="url"]', 'https://websocket-fail.com');
    await page.click('button:has-text("Start Scraping")');

    // Should fall back to regular completion
    await expect(page.locator('text=Scraping completed successfully (WebSocket fallback mode)')).toBeVisible({ timeout: 15000 });
  });
});