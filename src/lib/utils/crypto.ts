const STORAGE_KEY = 'study-journal-key';

function getKey(): string {
  let key = localStorage.getItem(STORAGE_KEY);
  if (!key) {
    key = crypto.randomUUID() + '-' + crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, key);
  }
  return key.slice(0, 32);
}

function toBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function fromBuffer(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

async function getCryptoKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toBuffer(key) as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(text: string): Promise<string> {
  const key = getKey();
  const cryptoKey = await getCryptoKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    toBuffer(text) as BufferSource,
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded: string): Promise<string> {
  const key = getKey();
  const cryptoKey = await getCryptoKey(key);
  const combined = new Uint8Array(atob(encoded).split('').map(c => c.charCodeAt(0)));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data,
  );
  return fromBuffer(new Uint8Array(decrypted));
}
