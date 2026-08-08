// ──── 密钥保险库（基于主密码的加密 Key 包） ────
// 用于跨设备迁移 API Key：用主密码经 PBKDF2 派生 AES-256 密钥加密，
// 生成的密文可安全放置于任意位置（含 GitHub 公开仓库），无主密码不可解密。

const ITERATIONS = 310_000; // PBKDF2-SHA256 推荐迭代次数
const PREFIX = 'KBVAULT1:';  // 版本前缀，便于识别与未来升级

export interface KeyBundle {
  providers: Record<string, { baseUrl?: string; apiKey: string; enabled?: boolean }>;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function b64encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function b64decode(b64: string): Uint8Array {
  return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
}

/** 用主密码加密 Key 包，返回可安全传输的密文（含 salt + iv，base64） */
export async function exportKeys(bundle: KeyBundle, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle)) as BufferSource;
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const cipher = new Uint8Array(encrypted);
  // 组合：version(1) + salt(16) + iv(12) + 密文
  const combined = new Uint8Array(1 + 16 + 12 + cipher.byteLength);
  combined[0] = 1;
  combined.set(salt, 1);
  combined.set(iv, 17);
  combined.set(cipher, 29);
  return PREFIX + b64encode(combined);
}

/** 用主密码解密 Key 包；密码错误或密文损坏会抛错 */
export async function importKeys(ciphertext: string, password: string): Promise<KeyBundle> {
  const raw = ciphertext.trim();
  if (!raw.startsWith(PREFIX)) throw new Error('密文格式不正确');
  const combined = b64decode(raw.slice(PREFIX.length));
  if (combined.length < 29) throw new Error('密文已损坏');
  const salt = combined.slice(1, 17);
  const iv = combined.slice(17, 29);
  const data = combined.slice(29);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data as BufferSource);
  return JSON.parse(new TextDecoder().decode(decrypted)) as KeyBundle;
}
