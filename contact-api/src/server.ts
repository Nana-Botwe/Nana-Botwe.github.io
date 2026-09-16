import http, { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config';
import { msUntil, sendDailyDigest } from './digest';
import { appendMessage } from './store';
import { validateContact } from './validate';

const CONTACT_ROUTES = new Set(['/contact', '/api/contact']);
const HEALTH_ROUTES = new Set(['/', '/health', '/api/health']);
const MAX_BODY_BYTES = 16 * 1024;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < config.rateLimit.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > config.rateLimit.max;
}

// Drop stale rate-limit entries once an hour so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    if (times.every(t => now - t >= config.rateLimit.windowMs)) hits.delete(ip);
  }
}, config.rateLimit.windowMs).unref();

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Message is too large.');
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = (req.headers['content-type'] || '').toLowerCase();

  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'Request body must be JSON.');
}

async function handleContact(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const result = validateContact(await readBody(req));
  if (!result.ok) return sendJson(res, 422, { ok: false, errors: result.errors });

  // Only accepted messages count, so a visitor fixing typos isn't locked out
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return sendJson(res, 429, { ok: false, error: 'Too many messages. Please try again later.' });
  }

  // Bots that fill the hidden field get a normal-looking reply, but nothing is stored
  if (!result.spam) await appendMessage(result.value, { ip });

  sendJson(res, 201, { ok: true });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const originAllowed = typeof origin === 'string' && config.allowedOrigins.includes(origin);
  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const route = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/';

  try {
    if (req.method === 'OPTIONS') {
      if (!originAllowed) return sendJson(res, 403, { ok: false, error: 'Origin not allowed.' });
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Max-Age': '86400'
      });
      return res.end();
    }

    if (req.method === 'GET' && HEALTH_ROUTES.has(route)) {
      return sendJson(res, 200, { ok: true, service: 'contact-api' });
    }

    if (!CONTACT_ROUTES.has(route)) return sendJson(res, 404, { ok: false, error: 'Not found.' });

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return sendJson(res, 405, { ok: false, error: 'Use POST.' });
    }

    // Only the portfolio site may submit messages
    if (!originAllowed) return sendJson(res, 403, { ok: false, error: 'Origin not allowed.' });

    await handleContact(req, res);
  } catch (error) {
    if (error instanceof HttpError) return sendJson(res, error.status, { ok: false, error: error.message });
    console.error('Request failed:', error);
    sendJson(res, 500, { ok: false, error: 'Something went wrong. Please try again.' });
  }
});

server.listen(config.port, () => {
  console.log(`contact-api listening on port ${config.port}; messages go to ${config.dataDir}`);
});

// Optional in-process schedule, for hosts without cron (set DIGEST_AT=18:00)
function scheduleDigest(): void {
  if (!config.digestAt) return;
  const wait = msUntil(config.digestAt);
  setTimeout(async () => {
    try {
      const result = await sendDailyDigest();
      console.log(result.sent ? `Evening digest sent (${result.count}).` : `No digest: ${result.reason}.`);
    } catch (error) {
      console.error('Evening digest failed:', error);
    }
    scheduleDigest();
  }, wait).unref();
  console.log(`Next digest in ${Math.round(wait / 60000)} minutes (${config.digestAt} ${config.timeZone}).`);
}

scheduleDigest();
