/**
 * Keeps the "Live on the web" gallery in index.html in step with what is actually running
 * on the domain's subdomains.
 *
 *   npm run update                       check every host, take screenshots, write files
 *   npm run update -- --dry-run          report only, change nothing
 *   npm run update -- --no-screenshots   skip new screenshots (new systems wait for the next run)
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHost } from './check.ts';
import { discoverHosts } from './discover.ts';
import { renderGallery } from './render.ts';
import { captureScreenshot, closeBrowser, SHOT_HEIGHT, SHOT_WIDTH } from './screenshot.ts';
import type { Category, Config, GalleryItem, HostState, State } from './types.ts';

const TOOL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(TOOL_DIR, '..', '..');
const CONFIG_FILE = path.join(TOOL_DIR, 'projects.config.json');
const STATE_FILE = path.join(TOOL_DIR, 'state.json');
const INDEX_FILE = path.join(REPO_ROOT, 'index.html');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const NO_SCREENSHOTS = args.has('--no-screenshots');

const KICKERS: Record<Category, string> = { software: 'Web application', ecommerce: 'Online store', web: 'Website' };
const DAY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const today = () => new Date().toISOString().slice(0, 10);
const daysSince = (isoDate: string) => (Date.now() - Date.parse(isoDate)) / DAY_MS;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Stable JSON (sorted hosts) so unchanged runs don't create commits. */
function serialiseState(state: State): string {
  const hosts = Object.fromEntries(Object.keys(state.hosts).sort().map(host => [host, state.hosts[host]]));
  return `${JSON.stringify({ hosts }, null, 2)}\n`;
}

function slugFor(host: string, domain: string): string {
  const label = host === domain ? 'home' : host.slice(0, -(domain.length + 1));
  return label.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
}

function isIgnored(host: string, config: Config): boolean {
  if (host === config.domain) return false;
  const firstLabel = host.split('.')[0];
  return config.ignore.includes(firstLabel);
}

async function main(): Promise<void> {
  const config = await readJson<Config | null>(CONFIG_FILE, null);
  if (!config) throw new Error(`Could not read ${CONFIG_FILE}`);
  const state = await readJson<State>(STATE_FILE, { hosts: {} });

  // 1. Every host we know about: certificate logs, previous runs and the config
  const { hosts: discovered, sources } = await discoverHosts(config.domain);
  console.log(`Discovery: ${sources.join('; ')}`);
  const hosts = [...new Set([config.domain, ...discovered, ...Object.keys(state.hosts), ...Object.keys(config.projects)])]
    .filter(host => !isIgnored(host, config))
    .sort();
  console.log(`Checking ${hosts.length} hosts…\n`);

  // 2. Check each host, gently (shared hosting rate-limits bursts)
  const added: string[] = [];
  const removed: string[] = [];
  for (const host of hosts) {
    let result = await checkHost(host, config.domain);
    if (!result.ok && result.transient) {
      await sleep(20_000);
      result = await checkHost(host, config.domain);
    }

    const curated = config.projects[host];
    let entry: HostState | undefined = state.hosts[host];
    if (!entry && curated) entry = state.hosts[host] = { firstSeen: today(), live: true, failures: 0 };

    if (result.ok) {
      if (!entry) entry = state.hosts[host] = { firstSeen: today(), live: false, failures: 0 };
      if (!entry.live) added.push(host);
      entry.live = true;
      entry.failures = 0;
      delete entry.lastError;
      // Hand-written details win; only auto-discovered systems use what the page says
      if (!curated) {
        entry.title = result.title;
        entry.description = result.description;
        entry.category = result.category;
      }
      console.log(`  ✓ ${host}  (${result.title})`);
    } else if (entry) {
      entry.failures += 1;
      entry.lastError = result.reason;
      if (entry.live && entry.failures >= config.removeAfterFailures) {
        entry.live = false;
        removed.push(host);
      }
      console.log(`  ✗ ${host}  ${result.reason}  [${entry.failures}/${config.removeAfterFailures}]`);
    } else {
      console.log(`  · ${host}  ${result.reason}`);
    }

    await sleep(config.checkDelayMs);
  }

  // 3. Screenshots for live systems without a hand-picked image
  for (const [host, entry] of Object.entries(state.hosts)) {
    const curated = config.projects[host];
    if (!entry.live || curated?.image || curated?.hidden) continue;
    const image = `assets/img/work/auto/${slugFor(host, config.domain)}.jpg`;
    const file = path.join(REPO_ROOT, image);
    const stale = !entry.screenshotAt || daysSince(entry.screenshotAt) > config.screenshotRefreshDays;
    if (existsSync(file) && !stale) {
      entry.image = image;
      continue;
    }
    if (NO_SCREENSHOTS || DRY_RUN) {
      console.log(`  (screenshot skipped for ${host})`);
      continue;
    }
    try {
      await captureScreenshot(`https://${host}/`, file);
      entry.image = image;
      entry.screenshotAt = today();
      console.log(`  📷 ${host} → ${image}`);
    } catch (error) {
      console.log(`  ! screenshot failed for ${host}: ${(error as Error).message}`);
    }
    await sleep(config.checkDelayMs);
  }
  await closeBrowser();

  // 4. Build the gallery: live systems first, then older work
  const live: Array<GalleryItem & { order: number; firstSeen: string }> = [];
  for (const [host, entry] of Object.entries(state.hosts)) {
    const curated = config.projects[host] ?? {};
    if (!entry.live || curated.hidden) continue;
    const image = curated.image ?? entry.image;
    if (!image || !existsSync(path.join(REPO_ROOT, image))) continue; // wait until we have a screenshot
    const category = curated.category ?? entry.category ?? 'software';
    const title = curated.title ?? entry.title ?? host;
    live.push({
      host,
      title,
      kicker: curated.kicker ?? KICKERS[category],
      category,
      description: curated.description ?? entry.description ?? `Live system at ${host}.`,
      image,
      alt: curated.alt ?? `${title} homepage`,
      width: curated.width ?? SHOT_WIDTH,
      height: curated.height ?? SHOT_HEIGHT,
      isNew: !config.projects[host] && daysSince(entry.firstSeen) <= config.newBadgeDays,
      order: curated.order ?? 100,
      firstSeen: entry.firstSeen
    });
  }
  live.sort((a, b) => a.order - b.order || b.firstSeen.localeCompare(a.firstSeen) || a.title.localeCompare(b.title));
  const items: GalleryItem[] = [...live.map(({ order, firstSeen, ...item }) => item), ...config.archive];

  const html = await readFile(INDEX_FILE, 'utf8');
  const updated = renderGallery(html, items);

  console.log(`\nGallery: ${live.length} live systems + ${config.archive.length} older projects`);
  if (added.length) console.log(`Now live: ${added.join(', ')}`);
  if (removed.length) console.log(`No longer live: ${removed.join(', ')}`);

  if (DRY_RUN) {
    console.log(updated === html ? 'Dry run: index.html would not change.' : 'Dry run: index.html would change.');
    return;
  }
  if (updated !== html) await writeFile(INDEX_FILE, updated, 'utf8');
  await writeFile(STATE_FILE, serialiseState(state), 'utf8');
  console.log(updated === html ? 'index.html unchanged.' : 'index.html updated.');
}

main().catch(async error => {
  console.error(error);
  await closeBrowser().catch(() => {});
  process.exitCode = 1;
});
