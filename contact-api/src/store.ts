import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config';
import type { ContactMessage } from './validate';

export const MESSAGES_FILE = path.join(config.dataDir, 'messages.txt');
const STATE_FILE = path.join(config.dataDir, 'digest-state.json');
const LOCK_FILE = path.join(config.dataDir, 'digest.lock');

// Every entry starts with this line. Message bodies are indented, so they can never fake one.
export const ENTRY_MARK = '='.repeat(60);

interface DigestState {
  offset: number;
  lastSentAt?: string;
}

export const formatTimestamp = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timeZone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
}

/** Appends one message to messages.txt as a readable text block. */
export async function appendMessage(msg: ContactMessage, meta: { ip: string; receivedAt?: Date }): Promise<void> {
  await ensureDataDir();
  const received = meta.receivedAt ?? new Date();
  const body = msg.message
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');

  const entry = [
    ENTRY_MARK,
    `Received: ${formatTimestamp(received)} (${config.timeZone})`,
    `Name:     ${msg.name}`,
    `Email:    ${msg.email}`,
    `Company:  ${msg.company || '-'}`,
    `Reason:   ${msg.reason}`,
    `IP:       ${meta.ip}`,
    'Message:',
    body,
    '',
    ''
  ].join('\n');

  // A single append per message keeps concurrent writes from interleaving
  await fs.appendFile(MESSAGES_FILE, entry, { encoding: 'utf8', mode: 0o600 });
}

export const countEntries = (text: string): number =>
  text.split('\n').filter(line => line === ENTRY_MARK).length;

export async function readState(): Promise<DigestState> {
  try {
    const raw = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) as Partial<DigestState>;
    return { offset: Number(raw.offset) || 0, lastSentAt: raw.lastSentAt };
  } catch {
    return { offset: 0 };
  }
}

export async function writeState(state: DigestState): Promise<void> {
  await ensureDataDir();
  const tmp = `${STATE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, STATE_FILE);
}

/** Reads everything added to messages.txt after the given byte offset. */
export async function readSince(offset: number): Promise<{ text: string; end: number }> {
  let size = 0;
  try {
    size = (await fs.stat(MESSAGES_FILE)).size;
  } catch {
    return { text: '', end: 0 };
  }
  // The file was replaced or trimmed by hand: start again from the top
  const start = offset > size ? 0 : offset;
  if (size === start) return { text: '', end: size };

  const handle = await fs.open(MESSAGES_FILE, 'r');
  try {
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return { text: buffer.toString('utf8'), end: size };
  } finally {
    await handle.close();
  }
}

/** Stops two digest runs (cron and the in-server timer) from sending twice. */
export async function withDigestLock<T>(task: () => Promise<T>): Promise<T | null> {
  await ensureDataDir();
  try {
    const stat = await fs.stat(LOCK_FILE);
    // Clear a lock left behind by a crashed run
    if (Date.now() - stat.mtimeMs > 10 * 60 * 1000) await fs.rm(LOCK_FILE, { force: true });
  } catch {
    // No lock yet
  }

  let handle: fs.FileHandle;
  try {
    handle = await fs.open(LOCK_FILE, 'wx');
  } catch {
    return null;
  }
  try {
    return await task();
  } finally {
    await handle.close();
    await fs.rm(LOCK_FILE, { force: true });
  }
}
