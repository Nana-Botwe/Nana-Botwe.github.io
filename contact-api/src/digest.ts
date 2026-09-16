import { config } from './config';
import { sendMail } from './mailer';
import { countEntries, formatTimestamp, readSince, readState, withDigestLock, writeState } from './store';

export interface DigestResult {
  sent: boolean;
  count: number;
  reason?: string;
}

/** Emails every message received since the last digest. Sends nothing if there are none. */
export async function sendDailyDigest(now = new Date()): Promise<DigestResult> {
  const result = await withDigestLock(async (): Promise<DigestResult> => {
    const state = await readState();
    const { text, end } = await readSince(state.offset);
    const count = countEntries(text);

    if (count === 0) {
      if (end !== state.offset) await writeState({ ...state, offset: end });
      return { sent: false, count: 0, reason: 'no new messages' };
    }

    const day = new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, dateStyle: 'full' }).format(now);
    const plural = count === 1 ? 'message' : 'messages';

    await sendMail({
      subject: `Portfolio contact form: ${count} new ${plural} (${day})`,
      text: [
        `You received ${count} new ${plural} through nana-botwe.github.io since the last digest.`,
        `Digest created ${formatTimestamp(now)} (${config.timeZone}).`,
        '',
        text.trimEnd(),
        ''
      ].join('\n')
    });

    await writeState({ offset: end, lastSentAt: now.toISOString() });
    return { sent: true, count };
  });

  return result ?? { sent: false, count: 0, reason: 'another digest run is in progress' };
}

/** Milliseconds from now until the next HH:MM in the configured time zone. */
export function msUntil(time: string, now = new Date()): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`DIGEST_AT must look like 18:00, got "${time}"`);
  const target = Number(match[1]) * 3600 + Number(match[2]) * 60;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const current = get('hour') * 3600 + get('minute') * 60 + get('second');

  let seconds = target - current;
  if (seconds <= 0) seconds += 24 * 3600;
  return seconds * 1000;
}

// Run directly (for cron): node dist/digest.js
if (require.main === module) {
  sendDailyDigest()
    .then(result => {
      console.log(
        result.sent
          ? `Digest sent with ${result.count} message(s) to ${config.mail.to}.`
          : `No digest sent: ${result.reason}.`
      );
    })
    .catch(error => {
      console.error('Digest failed:', error);
      process.exitCode = 1;
    });
}
