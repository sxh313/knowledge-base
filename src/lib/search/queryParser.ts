// 高级搜索查询解析器
// 支持：关键词 tag:编程 -tag:坏 subject:计算机 after:2026-01-01 before:2026-08-01
//       is:inbox is:active is:archived has:attachment link: -link: "精确短语"
// 设计：先用正则抽出所有 key:value 字段运算符，剩余文本作为自由关键词/短语交给 Fuse。

export type JournalStatusFilter = 'inbox' | 'active' | 'archived';

export interface ParsedQuery {
  /** 自由文本（关键词 + 短语合并，交给 Fuse 做相关度匹配；为空表示纯结构化过滤） */
  text: string;
  keywords: string[];
  phrases: string[];
  tags: string[];
  excludeTags: string[];
  subject?: string;
  after?: number;
  before?: number;
  status?: JournalStatusFilter;
  hasAttachment?: boolean;
  /** true=有链接, false=无链接, undefined=不过滤 */
  hasLink?: boolean;
}

// 字段运算符：可选前导 `-`，键名固定集合，值为 "带引号" 或 裸词(\S* 允许 link: 无值)
const FIELD_RE = /(-?)(tag|subject|after|before|is|has|link):(?:"([^"]+)"|(\S*))/g;

function parseDate(s: string): number | undefined {
  if (!s) return undefined;
  // 支持 YYYY-MM-DD 与 YYYY-MM-DDTHH:mm
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

/** 解析高级搜索查询字符串为结构化条件 */
export function parseQuery(raw: string): ParsedQuery {
  const result: ParsedQuery = { text: '', keywords: [], phrases: [], tags: [], excludeTags: [] };
  if (!raw || !raw.trim()) return result;

  let remaining = raw;
  let m: RegExpExecArray | null;
  FIELD_RE.lastIndex = 0;
  while ((m = FIELD_RE.exec(raw)) !== null) {
    const neg = m[1] === '-';
    const key = m[2];
    const val = (m[3] ?? m[4] ?? '').trim();

    switch (key) {
      case 'tag':
        if (val) (neg ? result.excludeTags : result.tags).push(val);
        break;
      case 'subject':
        if (val && !neg) result.subject = val;
        break;
      case 'after':
        if (!neg) result.after = parseDate(val);
        break;
      case 'before':
        if (!neg) result.before = parseDate(val);
        break;
      case 'is':
        if (val === 'inbox' || val === 'active' || val === 'archived') result.status = val;
        break;
      case 'has':
        if (val === 'attachment') result.hasAttachment = true;
        break;
      case 'link':
        result.hasLink = !neg;
        break;
    }
    // 从自由文本区移除已识别的字段
    remaining = remaining.replace(m[0], ' ');
  }

  // 提取 "精确短语"
  const phraseRe = /"([^"]+)"/g;
  let p: RegExpExecArray | null;
  while ((p = phraseRe.exec(remaining)) !== null) {
    if (p[1].trim()) result.phrases.push(p[1].trim());
  }
  remaining = remaining.replace(phraseRe, ' ');

  result.keywords = remaining
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  result.text = [...result.keywords, ...result.phrases].join(' ');
  return result;
}

/** 判断查询是否包含任何结构化字段（用于决定是否走结构化过滤路径） */
export function hasStructuredFilters(pq: ParsedQuery): boolean {
  return (
    pq.tags.length > 0 ||
    pq.excludeTags.length > 0 ||
    !!pq.subject ||
    pq.after !== undefined ||
    pq.before !== undefined ||
    pq.status !== undefined ||
    pq.hasAttachment === true ||
    pq.hasLink !== undefined
  );
}
