import path from 'node:path';

const root = path.resolve(__dirname, '..');

// Load .env when present (Node 20.12+). On hosts without it, set real environment variables.
try {
  process.loadEnvFile?.(path.join(root, '.env'));
} catch {
  // No .env file: rely on the environment
}

const env = process.env;

const list = (value: string | undefined, fallback: string[]): string[] =>
  value ? value.split(',').map(item => item.trim()).filter(Boolean) : fallback;

const flag = (value: string | undefined, fallback = false): boolean =>
  value === undefined || value === '' ? fallback : /^(1|true|yes|on)$/i.test(value);

const int = (value: string | undefined, fallback: number): number => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: int(env.PORT, 3000),
  allowedOrigins: list(env.ALLOWED_ORIGINS, ['https://nana-botwe.github.io']),
  dataDir: path.resolve(root, env.DATA_DIR || 'data'),
  timeZone: env.TIME_ZONE || 'Africa/Accra',
  digestAt: (env.DIGEST_AT || '').trim(),
  rateLimit: {
    max: int(env.RATE_LIMIT_MAX, 5),
    windowMs: 60 * 60 * 1000
  },
  mail: {
    to: env.MAIL_TO || 'isaacnanabotwe@gmail.com',
    from: env.MAIL_FROM || env.SMTP_USER || '',
    dryRun: flag(env.MAIL_DRY_RUN),
    smtp: {
      host: env.SMTP_HOST || '',
      port: int(env.SMTP_PORT, 465),
      secure: flag(env.SMTP_SECURE, true),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || ''
    }
  }
} as const;
