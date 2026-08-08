import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import { encrypt, decrypt } from './crypto';

beforeAll(() => {
  // node 环境确保 Web Crypto subtle 可用
  const g = globalThis as { crypto?: Crypto };
  if (!g.crypto?.subtle) g.crypto = webcrypto as unknown as Crypto;
});

beforeEach(() => {
  // crypto.ts 用 localStorage 存储随机密钥种子，这里用内存版 mock
  const store: Record<string, string> = {};
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    key: (i: number) => Object.keys(store)[i] ?? null,
    length: Object.keys(store).length,
  } as Storage;
});

describe('crypto', () => {
  it('加密后解密应还原原文', async () => {
    const plain = 'sk-deepseek-1234567890';
    const cipher = await encrypt(plain);
    expect(cipher).not.toBe(plain);
    expect(await decrypt(cipher)).toBe(plain);
  });

  it('同一明文两次加密应产生不同密文（IV 随机）', async () => {
    const a = await encrypt('hello');
    const b = await encrypt('hello');
    expect(a).not.toBe(b);
  });

  it('支持中文与特殊字符', async () => {
    const plain = '中文测试 🚀 <script>alert(1)</script>';
    expect(await decrypt(await encrypt(plain))).toBe(plain);
  });
});
