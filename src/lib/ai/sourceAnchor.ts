const ANCHOR_PREFIX = 'text-v1-';

/** Stable, non-cryptographic fingerprint used to relocate a cited text chunk. */
export function createTextAnchor(content: string): string {
  let hash = 0x811c9dc5;
  const normalized = content.replace(/\r\n?/g, '\n').trim();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${ANCHOR_PREFIX}${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function isTextAnchor(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith(ANCHOR_PREFIX));
}
