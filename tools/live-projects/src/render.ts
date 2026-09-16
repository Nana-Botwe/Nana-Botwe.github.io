import type { GalleryItem } from './types.ts';

export const START_MARK = '<!-- live-projects:start';
export const END_MARK = '<!-- live-projects:end -->';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderItem(item: GalleryItem): string {
  const title = escapeHtml(item.title);
  const lines = [
    `          <figure class="shot reveal" data-cat="${item.category}"${item.host ? ` data-host="${item.host}"` : ''}>`,
    `            <a class="shot-open" href="${item.image}" aria-label="Enlarge screenshot of ${title}">`,
    `              <img src="${item.image}" alt="${escapeHtml(item.alt)}" width="${item.width}" height="${item.height}" loading="lazy">`
  ];
  if (item.host) {
    lines.push(
      `              <span class="shot-badge"><span class="pulse" aria-hidden="true"></span> ${item.isNew ? 'New &middot; Live' : 'Live'}</span>`
    );
  }
  lines.push(
    '            </a>',
    '            <figcaption>',
    `              <span class="shot-kicker">${escapeHtml(item.kicker)}</span>`,
    `              <strong>${title}</strong>`,
    `              <span class="shot-desc">${escapeHtml(item.description)}</span>`
  );
  if (item.host) {
    lines.push(
      `              <a class="shot-link" href="https://${item.host}/" target="_blank" rel="noopener">${item.host} <i class='bx bx-link-external' aria-hidden="true"></i></a>`
    );
  }
  lines.push('            </figcaption>', '          </figure>');
  return lines.join('\n');
}

/** Replaces everything between the live-projects markers in index.html. */
export function renderGallery(html: string, items: GalleryItem[]): string {
  const start = html.indexOf(START_MARK);
  const end = html.indexOf(END_MARK);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('index.html is missing the <!-- live-projects:start --> / <!-- live-projects:end --> markers.');
  }
  const startLineEnd = html.indexOf('\n', start) + 1;
  const endLineStart = html.lastIndexOf('\n', end) + 1;
  return html.slice(0, startLineEnd) + items.map(renderItem).join('\n') + '\n' + html.slice(endLineStart);
}
