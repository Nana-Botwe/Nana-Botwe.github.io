/**
 * Finds every hostname under the domain from public Certificate Transparency logs.
 * cPanel's AutoSSL issues a certificate for each new subdomain, so new systems show up here
 * within hours of being created.
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000), headers: { Accept: 'application/json' } });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(5_000 * (i + 1));
  }
  throw lastError;
}

async function fromCrtSh(domain: string): Promise<string[]> {
  const rows = (await fetchJson(`https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`)) as Array<{
    name_value?: string;
  }>;
  return rows.flatMap(row => (row.name_value ?? '').split('\n'));
}

async function fromCertSpotter(domain: string): Promise<string[]> {
  const names: string[] = [];
  let after = '';
  for (let page = 0; page < 20; page++) {
    const url =
      `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}` +
      `&include_subdomains=true&expand=dns_names${after ? `&after=${after}` : ''}`;
    const rows = (await fetchJson(url)) as Array<{ id: string; dns_names?: string[] }>;
    if (!rows.length) break;
    rows.forEach(row => names.push(...(row.dns_names ?? [])));
    after = rows[rows.length - 1].id;
  }
  return names;
}

/** Lower-cases, strips wildcards and "www.", and keeps only names under the domain. */
export function normaliseHost(name: string, domain: string): string | null {
  let host = name.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host.startsWith('*.')) return null;
  if (host.startsWith('www.')) host = host.slice(4);
  if (host !== domain && !host.endsWith(`.${domain}`)) return null;
  return host;
}

export async function discoverHosts(domain: string): Promise<{ hosts: Set<string>; sources: string[] }> {
  const hosts = new Set<string>();
  const sources: string[] = [];

  for (const [label, source] of [
    ['crt.sh', fromCrtSh],
    ['Cert Spotter', fromCertSpotter]
  ] as const) {
    try {
      const names = await source(domain);
      names.forEach(name => {
        const host = normaliseHost(name, domain);
        if (host) hosts.add(host);
      });
      sources.push(`${label}: ok`);
    } catch (error) {
      sources.push(`${label}: failed (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return { hosts, sources };
}
