import { test, expect } from '@playwright/test';

test.describe('Application', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should load the main page', async ({ page }) => {
    // Check that the page loads successfully
    await expect(page).toHaveTitle(/SwingRadar/);
    await expect(page.locator('h1, h2, h3').first()).toBeVisible();
  });

  test('should display import festival dashboard', async ({ page }) => {
    // Look for the dashboard component
    await expect(page.locator('text=Import Festival Data')).toBeVisible();
    await expect(page.locator('text=Choose to scrape from a website or upload a JSON file')).toBeVisible();
  });

  test('should show URL scraping tab by default', async ({ page }) => {
    // Check that URL scraping tab is active
    const urlTab = page.locator('text=Scrape from URL');
    const fileTab = page.locator('text=Upload JSON File');

    await expect(urlTab).toBeVisible();
    await expect(fileTab).toBeVisible();

    // The URL tab should be active (have different styling)
    await expect(urlTab).toHaveClass(/text-blue-600/);
  });

  test('should switch to file upload tab when clicked', async ({ page }) => {
    // Click on file upload tab
    await page.click('text=Upload JSON File');

    // Check that file upload interface is shown
    await expect(page.locator('text=Drag and drop your JSON file here')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test('should show URL input form in scraping tab', async ({ page }) => {
    // Make sure we're on the URL tab
    await page.click('text=Scrape from URL');

    // Check for URL input field
    const urlInput = page.locator('input[type="url"]');
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveAttribute('placeholder', 'https://example-festival.com');

    // Check for submit button
    await expect(page.locator('button:has-text("Start Scraping")')).toBeVisible();
  });

  test('should validate URL input', async ({ page }) => {
    // Make sure we're on the URL tab
    await page.click('text=Scrape from URL');

    // Try to submit with empty URL
    await page.click('button:has-text("Start Scraping")');

    // Should show validation error
    await expect(page.locator('text=URL is required')).toBeVisible();

    // Try invalid URL
    await page.fill('input[type="url"]', 'invalid-url');
    await page.click('button:has-text("Start Scraping")');

    // Should show URL validation error
    await expect(page.locator('text=Please enter a valid URL')).toBeVisible();
  });

  test('should accept valid URL and show loading state', async ({ page }) => {
    // Make sure we're on the URL tab
    await page.click('text=Scrape from URL');

    // Enter a valid URL
    await page.fill('input[type="url"]', 'https://example-festival.com');

    // Click submit - this will likely fail but should show loading
    await page.click('button:has-text("Start Scraping")');

    // Should show loading state
    await expect(page.locator('text=Processing...')).toBeVisible({ timeout: 5000 });
  });

  test('should display file upload area', async ({ page }) => {
    // Switch to file upload tab
    await page.click('text=Upload JSON File');

    // Check for file upload area
    const uploadArea = page.locator('text=Drag and drop your JSON file here').first();
    await expect(uploadArea).toBeVisible();

    // Check for file input
    await expect(page.locator('input[type="file"]')).toBeVisible();

    // Check for upload instructions
    await expect(page.locator('text=Max 10MB • JSON only • Secured processing')).toBeVisible();
  });

  test('should handle file selection', async ({ page }) => {
    // Switch to file upload tab
    await page.click('text=Upload JSON File');

    // Create a test JSON file
    const testJson = {
      name: 'Test Festival',
      startDate: '2024-06-01',
      endDate: '2024-06-03',
      description: 'Test description'
    };

    // Set up file input to receive our test file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-festival.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(testJson))
    });

    // Should show the selected file
    await expect(page.locator('text=test-festival.json')).toBeVisible();

    // Should show file size
    await expect(page.locator('text=/\\d+\\.\\d+ KB/')).toBeVisible();
  });

  test('should show import button after file selection', async ({ page }) => {
    // Switch to file upload tab and select a file
    await page.click('text=Upload JSON File');

    const testJson = {
      name: 'Test Festival',
      startDate: '2024-06-01',
      endDate: '2024-06-03'
    };

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-festival.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(testJson))
    });

    // Should show import button
    await expect(page.locator('button:has-text("Import File")')).toBeVisible();
  });

  test('should have responsive design', async ({ page }) => {
    // Test on different viewport sizes
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile
    await expect(page.locator('text=Import Festival Data')).toBeVisible();

    await page.setViewportSize({ width: 768, height: 1024 }); // Tablet
    await expect(page.locator('text=Import Festival Data')).toBeVisible();

    await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop
    await expect(page.locator('text=Import Festival Data')).toBeVisible();
  });

  test('should show proper page structure', async ({ page }) => {
    // Check for main layout elements
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('div.max-w-4xl')).toBeVisible(); // Container

    // Check for header
    const header = page.locator('h2, h3').first();
    await expect(header).toBeVisible();
    await expect(header).toContainText(/festival/i);
  });
});