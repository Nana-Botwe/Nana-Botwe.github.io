import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Browser } from 'playwright';

export const SHOT_WIDTH = 1200;
export const SHOT_HEIGHT = 750;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    const { chromium } = await import('playwright');
    // Locally you can use an installed browser, e.g. PLAYWRIGHT_CHANNEL=msedge
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  }
  return browser;
}

/** Saves a 1200×750 JPEG of the page's first screen. */
export async function captureScreenshot(url: string, file: string): Promise<void> {
  const page = await (await getBrowser()).newPage({
    viewport: { width: SHOT_WIDTH, height: SHOT_HEIGHT },
    deviceScaleFactor: 1
  });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(3_500); // let sliders, fonts and hero images settle
    await mkdir(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}
