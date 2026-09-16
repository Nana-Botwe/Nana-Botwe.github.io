import type { Category, CheckResult } from './types.ts';

const USER_AGENT = 'Mozilla/5.0 (compatible; nana-botwe-portfolio-checker/1.0; +https://nana-botwe.github.io/)';

// Pages that mean "nothing real is deployed here"
const PLACEHOLDER = /(resource limit|account (has been )?suspended|default web site page|site not found|cgi-sys|future home of)/i;
const PLACEHOLDER_TITLE = /(coming soon|under construction|maintenance|parked)/i;
// Unfinished installs must never be advertised
const SETUP = /\b(setup|install|installer|installation|wizard)\b/i;
const GENERIC_SEGMENT = /^(home|homepage|welcome|login|log in|sign in|signin|sign-in|staff sign in|dashboard|index|admin|portal|main)$/i;
const ECOMMERCE = /\b(shop|store|mall|marketplace|market|cart|checkout|import|wholesale|order online|buy now|add to cart)\b/i;

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', copy: '©', reg: '®', trade: '™', bull: '•'
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const squash = (text: string) => decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

interface Page {
  title: string;
  siteName: string;
  description: string;
  headings: string[];
  paragraphs: string[];
  text: string;
  hasPasswordField: boolean;
}

export function parsePage(html: string): Page {
  const meta = (name: string): string => {
    const a = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html);
    const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i').exec(html);
    return squash((a ?? b)?.[1] ?? '');
  };
  const body = html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');

  return {
    title: squash(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''),
    siteName: meta('og:site_name'),
    description: meta('description') || meta('og:description'),
    headings: [...body.matchAll(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi)].map(m => squash(m[1])).filter(Boolean),
    paragraphs: [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => squash(m[1])).filter(Boolean),
    text: squash(body),
    hasPasswordField: /<input[^>]+type=["']?password/i.test(html)
  };
}

const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "INB SCHOOL SYSTEM" → "INB School System"; short all-caps words stay as acronyms. */
function tidyCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.replace(/[A-Z]{4,}/g, word => word[0] + word.slice(1).toLowerCase());
}

export function deriveTitle(page: Page, host: string, domain: string): string {
  if (page.siteName) return tidyCase(page.siteName);
  const label = host === domain ? compact(domain.split('.')[0]) : compact(host.slice(0, -(domain.length + 1)));
  const segments = page.title
    .split(/\s+[|·•—–-]\s+|\s*[|·•—–]\s*/)
    .map(s => s.trim())
    .filter(s => s && !GENERIC_SEGMENT.test(s));

  const matching = segments.find(s => compact(s).includes(label) || (compact(s).length > 3 && label.includes(compact(s))));
  const shortest = [...segments].sort((a, b) => a.length - b.length)[0];
  const chosen = matching ?? shortest ?? page.headings[0];
  if (chosen) return tidyCase(chosen);
  return label.replace(/^\w/, c => c.toUpperCase());
}

function truncate(text: string, max = 220): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '')}…`;
}

export function deriveDescription(page: Page, host: string): string {
  const paragraph = page.paragraphs.find(p => p.length >= 60 && !/cookie|javascript|©|copyright/i.test(p));
  const text = page.description || paragraph || page.headings.slice(0, 2).join('. ');
  return truncate(text || `Live system at ${host}.`);
}

export function guessCategory(page: Page, host: string): Category {
  const haystack = `${host} ${page.title} ${page.description} ${page.headings.slice(0, 6).join(' ')}`;
  return ECOMMERCE.test(haystack) ? 'ecommerce' : 'software';
}

/** Loads the host's homepage once and decides whether a real system is running there. */
export async function checkHost(host: string, domain: string): Promise<CheckResult> {
  let res: Response;
  try {
    res = await fetch(`https://${host}/`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }
    });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name;
    // Certificate and DNS problems won't fix themselves within a retry
    const transient = !/CERT|TLS|SSL|ENOTFOUND/i.test(cause);
    return { ok: false, transient, reason: `unreachable (${cause})` };
  }

  if (res.status === 429 || res.status >= 500) return { ok: false, transient: true, reason: `HTTP ${res.status}` };
  if (res.status !== 200) return { ok: false, transient: false, reason: `HTTP ${res.status}` };
  if (!(res.headers.get('content-type') ?? '').includes('html')) {
    return { ok: false, transient: false, reason: 'not an HTML page' };
  }

  const page = parsePage((await res.text()).slice(0, 750_000));
  const path = new URL(res.url).pathname;

  if (/^index of\b/i.test(page.title)) return { ok: false, transient: false, reason: 'empty folder (no site deployed)' };
  if (PLACEHOLDER.test(page.title) || PLACEHOLDER.test(page.text.slice(0, 600))) {
    const transient = /resource limit/i.test(`${page.title} ${page.text.slice(0, 600)}`);
    return { ok: false, transient, reason: `placeholder page: ${page.title || 'untitled'}` };
  }
  if (PLACEHOLDER_TITLE.test(page.title)) return { ok: false, transient: false, reason: `not launched: ${page.title}` };
  if (SETUP.test(path) || SETUP.test(page.title)) return { ok: false, transient: false, reason: 'setup/installer page' };
  if (page.text.length < 80) return { ok: false, transient: false, reason: 'page has almost no content' };

  return {
    ok: true,
    title: deriveTitle(page, host, domain),
    description: deriveDescription(page, host),
    category: guessCategory(page, host)
  };
}
