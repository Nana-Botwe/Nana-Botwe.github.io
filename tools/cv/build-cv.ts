/**
 * Builds the CV from tools/cv/cv.html:
 *   - a print-quality A4 PDF, kept on this computer (PDFs are git-ignored, so it is never published)
 *   - page images for the view-only CV viewer on the website (assets/img/cv)
 *   - the image list inside index.html and cv.html (between the cv-pages markers)
 *
 *   npm run build                        uses Playwright's Chromium
 *   PLAYWRIGHT_CHANNEL=msedge npm run build   uses the installed Microsoft Edge instead
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '..', '..');
const SOURCE = path.join(TOOL_DIR, 'cv.html');
const PDF_OUT = path.join(ROOT, process.env.CV_PDF_NAME || 'Isaac_Banson_Botwe_CV_Updated.pdf');
const IMG_DIR = path.join(ROOT, 'assets', 'img', 'cv');
const SCALE = 2;

const START = '<!-- cv-pages:start -->';
const END = '<!-- cv-pages:end -->';

function imageTags(count: number, width: number, height: number, lazyViewer: boolean, indent: string): string {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const src = `assets/img/cv/cv-page-${n}.jpg`;
    const alt = `CV of Isaac Banson Botwe, page ${n} of ${count}`;
    const source = lazyViewer ? `data-src="${src}"` : `src="${src}"`;
    const loading = !lazyViewer && n > 1 ? ' loading="lazy"' : '';
    return `${indent}<img ${source} alt="${alt}" width="${width}" height="${height}" draggable="false"${loading}>`;
  }).join('\n');
}

function replaceBlock(html: string, tags: string, file: string): string {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 || end === -1) throw new Error(`${file} is missing the ${START} / ${END} markers.`);
  const afterStart = html.indexOf('\n', start) + 1;
  const endLine = html.lastIndexOf('\n', end) + 1;
  return html.slice(0, afterStart) + tags + '\n' + html.slice(endLine);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: SCALE });
    await page.goto(pathToFileURL(SOURCE).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    // Refuse to build a CV where text is cut off at the bottom of a page
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('.page')].flatMap((pageEl, i) =>
        [...pageEl.querySelectorAll<HTMLElement>('.side, .main')]
          .filter(col => col.scrollHeight > col.clientHeight + 1)
          .map(col => `page ${i + 1} ${col.className} is ${col.scrollHeight - col.clientHeight}px too long`)
      )
    );
    if (overflow.length) throw new Error(`CV content overflows:\n  ${overflow.join('\n  ')}`);

    const room = await page.evaluate(() =>
      [...document.querySelectorAll('.page')].map((pageEl, i) => {
        const cols = [...pageEl.querySelectorAll<HTMLElement>('.side, .main')];
        const free = cols.map(col => {
          const last = col.lastElementChild as HTMLElement | null;
          const used = last ? last.offsetTop + last.offsetHeight : 0;
          return `${col.className} ${Math.round(((col.clientHeight - used) / col.clientHeight) * 100)}% free`;
        });
        return `page ${i + 1}: ${free.join(', ')}`;
      })
    );

    await page.pdf({
      path: PDF_OUT,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    await mkdir(IMG_DIR, { recursive: true });
    for (const file of await readdir(IMG_DIR)) {
      if (/^cv-page-\d+\.(jpg|webp|png)$/.test(file)) await rm(path.join(IMG_DIR, file));
    }
    const pages = page.locator('.page');
    const count = await pages.count();
    for (let i = 0; i < count; i++) {
      await pages.nth(i).screenshot({ path: path.join(IMG_DIR, `cv-page-${i + 1}.jpg`), type: 'jpeg', quality: 82 });
    }
    const box = await pages.first().boundingBox();
    const width = Math.round((box?.width ?? 794) * SCALE);
    const height = Math.round((box?.height ?? 1123) * SCALE);

    for (const [file, lazyViewer, indent] of [
      ['index.html', true, '      '],
      ['cv.html', false, '    ']
    ] as const) {
      const full = path.join(ROOT, file);
      let html = await readFile(full, 'utf8');
      html = replaceBlock(html, imageTags(count, width, height, lazyViewer, indent), file);
      html = html.replace(/Isaac Banson Botwe &middot; \d+ pages?/, `Isaac Banson Botwe &middot; ${count} pages`);
      await writeFile(full, html, 'utf8');
    }

    console.log(room.join('\n'));
    console.log(`\nPDF:    ${path.relative(ROOT, PDF_OUT)}`);
    console.log(`Images: ${count} pages (${width}×${height}) in assets/img/cv`);
    console.log('Updated the CV viewer in index.html and cv.html');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
