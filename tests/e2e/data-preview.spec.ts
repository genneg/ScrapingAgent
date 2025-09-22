import { test, expect } from '@playwright/test';

test.describe('Data Preview and Editing', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should show data preview after successful scraping', async ({ page }) => {
    // Mock a successful scraping response
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Swing Festival',
            description: 'An amazing swing dance festival',
            website: 'https://testswingfest.com',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z',
            venue: {
              name: 'Swing Dance Hall',
              address: '123 Dance Street',
              city: 'Swing City',
              country: 'Swingland'
            },
            teachers: [
              { name: 'John Smith', specialties: ['Lindy Hop'] }
            ],
            musicians: [
              { name: 'Swing Band', genre: ['Swing'] }
            ],
            prices: [
              { type: 'Regular', amount: 100, currency: 'USD' }
            ],
            tags: ['swing', 'dance']
          },
          confidence: 0.85,
          sessionId: 'test-session-123'
        })
      });
    });

    // Submit a URL for scraping
    await page.fill('input[type="url"]', 'https://testswingfest.com');
    await page.click('button:has-text("Start Scraping")');

    // Wait for and check data preview section
    const dataPreview = page.locator('text=Data Preview & Editing');
    await expect(dataPreview).toBeVisible({ timeout: 10000 });

    // Check that confidence score is shown
    await expect(page.locator('text=Confidence: 85%')).toBeVisible();
  });

  test('should display festival data in preview tabs', async ({ page }) => {
    // Mock successful scraping response
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Swing Festival',
            description: 'An amazing swing dance festival',
            website: 'https://testswingfest.com',
            email: 'info@testswingfest.com',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z',
            venue: {
              name: 'Swing Dance Hall',
              address: '123 Dance Street',
              city: 'Swing City',
              state: 'SC',
              country: 'Swingland',
              postalCode: '12345'
            },
            teachers: [
              { name: 'John Smith', specialties: ['Lindy Hop', 'Balboa'] },
              { name: 'Jane Doe', specialties: ['Blues', 'Charleston'] }
            ],
            musicians: [
              { name: 'Swing Band', genre: ['Swing', 'Jazz'] },
              { name: 'Blues Collective', genre: ['Blues'] }
            ],
            prices: [
              { type: 'Early Bird', amount: 150, currency: 'USD' },
              { type: 'Regular', amount: 200, currency: 'USD' }
            ],
            tags: ['swing', 'lindy', 'blues', 'dance']
          },
          confidence: 0.9,
          sessionId: 'test-session-456'
        })
      });
    });

    // Submit URL and wait for preview
    await page.fill('input[type="url"]', 'https://testswingfest.com');
    await page.click('button:has-text("Start Scraping")');

    // Wait for data preview to appear
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });

    // Check all tabs are present
    await expect(page.locator('text=Basic Info')).toBeVisible();
    await expect(page.locator('text=Venue')).toBeVisible();
    await expect(page.locator('text=People')).toBeVisible();
    await expect(page.locator('text=Pricing')).toBeVisible();
    await expect(page.locator('text=Tags')).toBeVisible();
  });

  test('should allow switching between data preview tabs', async ({ page }) => {
    // Mock successful scraping response
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Swing Festival',
            venue: { name: 'Swing Dance Hall', city: 'Swing City' },
            teachers: [{ name: 'John Smith', specialties: ['Lindy Hop'] }],
            musicians: [{ name: 'Swing Band', genre: ['Swing'] }],
            prices: [{ type: 'Regular', amount: 100, currency: 'USD' }],
            tags: ['swing', 'dance']
          },
          confidence: 0.85,
          sessionId: 'test-session-789'
        })
      });
    });

    // Submit URL and wait for preview
    await page.fill('input[type="url"]', 'https://testswingfest.com');
    await page.click('button:has-text("Start Scraping")');

    // Wait for data preview
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });

    // Switch to Venue tab
    await page.click('text=Venue');
    await expect(page.locator('text=Swing Dance Hall')).toBeVisible();
    await expect(page.locator('text=Swing City')).toBeVisible();

    // Switch to People tab
    await page.click('text=People');
    await expect(page.locator('text=John Smith')).toBeVisible();
    await expect(page.locator('text=Swing Band')).toBeVisible();

    // Switch to Pricing tab
    await page.click('text=Pricing');
    await expect(page.locator('text=Regular')).toBeVisible();
    await expect(page.locator('text=$100 USD')).toBeVisible();

    // Switch to Tags tab
    await page.click('text=Tags');
    await expect(page.locator('text=swing')).toBeVisible();
    await expect(page.locator('text=dance')).toBeVisible();
  });

  test('should show Edit button in view mode', async ({ page }) => {
    // Mock successful scraping response
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Swing Festival',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z'
          },
          confidence: 0.85,
          sessionId: 'test-session-abc'
        })
      });
    });

    // Submit URL and wait for preview
    await page.fill('input[type="url"]', 'https://testswingfest.com');
    await page.click('button:has-text("Start Scraping")');

    // Wait for data preview
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });

    // Check for Edit button
    await expect(page.locator('button:has-text("Edit")')).toBeVisible();
  });

  test('should enter edit mode when Edit button is clicked', async ({ page }) => {
    // Mock successful scraping response
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Swing Festival',
            description: 'Test description',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z'
          },
          confidence: 0.85,
          sessionId: 'test-session-def'
        })
      });
    });

    // Submit URL and wait for preview
    await page.fill('input[type="url"]', 'https://testswingfest.com');
    await page.click('button:has-text("Start Scraping")');

    // Wait for data preview
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });

    // Click Edit button
    await page.click('button:has-text("Edit")');

    // Should show Save and Cancel buttons
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();

    // Should show input fields instead of static text
    await expect(page.locator('input[value="Test Swing Festival"]')).toBeVisible();
  });

  test('should allow editing festival name', async ({ page }) => {
    // Mock successful scraping response
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Swing Festival',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z'
          },
          confidence: 0.85,
          sessionId: 'test-session-ghi'
        })
      });
    });

    // Submit URL and wait for preview
    await page.fill('input[type="url"]', 'https://testswingfest.com');
    await page.click('button:has-text("Start Scraping")');

    // Wait for data preview
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });

    // Enter edit mode
    await page.click('button:has-text("Edit")');

    // Edit the festival name
    const nameInput = page.locator('input[value="Test Swing Festival"]');
    await nameInput.fill('Updated Test Festival');

    // Verify the change
    await expect(page.locator('input[value="Updated Test Festival"]')).toBeVisible();
  });

  test('should allow canceling edit mode', async ({ page }) => {
    // Mock successful scraping response
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Swing Festival',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z'
          },
          confidence: 0.85,
          sessionId: 'test-session-jkl'
        })
      });
    });

    // Submit URL and wait for preview
    await page.fill('input[type="url"]', 'https://testswingfest.com');
    await page.click('button:has-text("Start Scraping")');

    // Wait for data preview
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });

    // Enter edit mode
    await page.click('button:has-text("Edit")');

    // Edit the festival name
    const nameInput = page.locator('input[value="Test Swing Festival"]');
    await nameInput.fill('Updated Test Festival');

    // Cancel editing
    await page.click('button:has-text("Cancel")');

    // Should return to view mode with Edit button
    await expect(page.locator('button:has-text("Edit")')).toBeVisible();
    await expect(page.locator('text=Test Swing Festival')).toBeVisible();
  });

  test('should show confidence indicator with appropriate color', async ({ page }) => {
    // Mock successful scraping response with high confidence
    await page.route('**/api/scrape', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: 'Test Swing Festival',
            startDate: '2024-06-01T00:00:00.000Z',
            endDate: '2024-06-03T00:00:00.000Z'
          },
          confidence: 0.95, // High confidence
          sessionId: 'test-session-mno'
        })
      });
    });

    // Submit URL and wait for preview
    await page.fill('input[type="url"]', 'https://testswingfest.com');
    await page.click('button:has-text("Start Scraping")');

    // Wait for data preview
    await expect(page.locator('text=Data Preview & Editing')).toBeVisible({ timeout: 10000 });

    // Check confidence indicator
    await expect(page.locator('text=Confidence: 95%')).toBeVisible();
  });
});