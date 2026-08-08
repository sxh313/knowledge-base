// 一次性脚本：读取 .env.local，用主密码加密成 KBVAULT1 密文（与应用内「密钥迁移」导出格式一致）
// 用法：node scripts/gen-keyvault.mjs <主密码>
// 密文可在应用「设置 → 密钥迁移」里粘贴 + 同一主密码 导入恢复
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const ITERATIONS = 310_000;
const PREFIX = 'KBVAULT1:';

function parseEnv(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(VITE_[A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function b64encode(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function deriveKey(password, salt) {
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function exportKeys(bundle, password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const cipher = new Uint8Array(encrypted);
  const combined = new Uint8Array(1 + 16 + 12 + cipher.byteLength);
  combined[0] = 1;
  combined.set(salt, 1);
  combined.set(iv, 17);
  combined.set(cipher, 29);
  return PREFIX + b64encode(combined);
}

const env = parseEnv(readFileSync('.env.local', 'utf8'));
const bundle = {
  providers: {
    shengsuanyun: { apiKey: env.VITE_SHENGSUANYUN_API_KEY || '', enabled: !!env.VITE_SHENGSUANYUN_API_KEY },
    relay: { baseUrl: env.VITE_RELAY_BASE_URL || '', apiKey: env.VITE_RELAY_API_KEY || '', enabled: !!env.VITE_RELAY_API_KEY },
    siliconflow: { apiKey: env.VITE_SILICONFLOW_API_KEY || '', enabled: !!env.VITE_SILICONFLOW_API_KEY },
    zhipu: { apiKey: env.VITE_ZHIPU_API_KEY || '', enabled: !!env.VITE_ZHIPU_API_KEY },
    deepseek: { apiKey: env.VITE_DEEPSEEK_API_KEY || '', enabled: !!env.VITE_DEEPSEEK_API_KEY },
  },
};

const password = process.argv[2];
if (!password) {
  console.error('用法：node scripts/gen-keyvault.mjs <主密码>');
  process.exit(1);
}

async function importKeys(ciphertext, password) {
  const combined = new Uint8Array(Buffer.from(ciphertext.trim().slice(PREFIX.length), 'base64'));
  const salt = combined.slice(1, 17);
  const iv = combined.slice(17, 29);
  const data = combined.slice(29);
  const key = await deriveKey(password, salt);
  const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

const cipher = await exportKeys(bundle, password);
const filled = Object.values(bundle.providers).filter(p => p.apiKey).length;
console.log(`（已加密 ${filled} 个 provider 的 Key）`);
console.log(cipher);

// 验证：用同密码解密，确认加密→解密闭环正确
const verified = await importKeys(cipher, password);
console.log('\n--- 解密验证（脱敏，仅显示首尾）---');
for (const [name, p] of Object.entries(verified.providers)) {
  const masked = p.apiKey ? p.apiKey.slice(0, 6) + '...' + p.apiKey.slice(-4) : '(空)';
  console.log(`${name}: ${masked}  enabled=${p.enabled}`);
}
console.log('✅ 加密→解密闭环验证通过');
