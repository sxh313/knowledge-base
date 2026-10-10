// 搜索引擎（服务端运行，无 CORS 限制）
// 数据源：DuckDuckGo HTML 搜索（广泛覆盖）+ Open-Meteo 天气（实时、免费、无需 Key）

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#0*(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBingUrl(value: string): string {
  const decoded = decodeHtml(value);
  try {
    const url = new URL(decoded);
    const encoded = url.searchParams.get('u');
    if (url.hostname.endsWith('bing.com') && encoded?.startsWith('a1')) {
      const target = Buffer.from(encoded.slice(2), 'base64url').toString('utf8');
      if (/^https?:\/\//i.test(target)) return target;
    }
  } catch { /* 保留原始地址 */ }
  return decoded;
}

/** Bing 会频繁调整属性与 class，按结果块解析，避免依赖固定的标签属性顺序。 */
export function parseBingSearchHtml(html: string, limit = 8): SearchResult[] {
  const results: SearchResult[] = [];
  for (const blockMatch of html.matchAll(/<li\s+class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)(?=<li\s+class="[^"]*\bb_algo\b|<\/ol>)/gi)) {
    const block = blockMatch[1];
    const heading = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*\shref="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
    if (!heading) continue;
    const paragraph = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const title = decodeHtml(heading[2]);
    const snippet = decodeHtml(paragraph?.[1] || '');
    const url = decodeBingUrl(heading[1]);
    if (title && /^https?:\/\//i.test(url)) results.push({ title, snippet, url });
    if (results.length >= limit) break;
  }
  return results;
}

/** 解析 Brave Search 服务端 HTML；只读取普通网页结果，不读取广告和 AI 摘要。 */
export function parseBraveSearchHtml(html: string, limit = 8): SearchResult[] {
  const results: SearchResult[] = [];
  for (const blockMatch of html.matchAll(/<div\s+class="[^"]*\bsnippet\b[^"]*"[^>]*data-type="web"[^>]*>([\s\S]*?)(?=<div\s+class="[^"]*\bsnippet\b[^>]*data-type="web"|<\/main>)/gi)) {
    const block = blockMatch[1];
    const link = block.match(/<a\s+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*\bl1\b[^"]*"/i);
    const titleMatch = block.match(/<div\s+class="[^"]*\bsearch-snippet-title\b[^"]*"[^>]*title="([^"]+)"[^>]*>/i);
    const contentMatch = block.match(/<div\s+class="[^"]*\bcontent\b[^"]*\bdesktop-default-regular\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!link || !titleMatch) continue;
    const title = decodeHtml(titleMatch[1]);
    const snippet = decodeHtml(contentMatch?.[1] || '');
    if (title) results.push({ title, snippet, url: decodeHtml(link[1]) });
    if (results.length >= limit) break;
  }
  return results;
}

function filterRelevantResults(query: string, candidates: SearchResult[]): SearchResult[] {
  const terms = [...new Set(query.toLowerCase().match(/[\p{Letter}\p{Number}]{2,}/gu) ?? [])];
  if (terms.length === 0) return candidates;
  return candidates.filter((result) => {
    const text = `${result.title} ${result.snippet}`.toLowerCase();
    const matched = terms.filter((term) => text.includes(term)).length;
    return matched >= Math.min(2, terms.length);
  });
}

async function searchDuckDuckGoHtml(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: `q=${encodeURIComponent(query)}&kl=cn-zh`,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const titleRe = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const titles = [...html.matchAll(titleRe)];
    const snippets = [...html.matchAll(snippetRe)];
    const candidates: SearchResult[] = [];
    for (let i = 0; i < Math.min(titles.length, 8); i++) {
      const rawUrl = titles[i][1];
      const title = decodeHtml(titles[i][2]);
      const snippet = decodeHtml(snippets[i]?.[1] || '');
      const uddg = rawUrl.match(/uddg=([^&]+)/);
      const url = uddg ? decodeURIComponent(uddg[1]) : decodeHtml(rawUrl);
      if (title && /^https?:\/\//i.test(url)) candidates.push({ title, snippet, url });
    }
    return filterRelevantResults(query, candidates);
  } catch { return []; }
}

async function searchDuckDuckGoInstant(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const candidates: SearchResult[] = [];
    if (data.AbstractText) {
      candidates.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL || 'https://duckduckgo.com/' });
    }
    const addTopic = (topic: { Text?: string; FirstURL?: string }) => {
      if (topic?.Text && topic?.FirstURL) candidates.push({ title: topic.Text.split(' - ')[0] || query, snippet: topic.Text, url: topic.FirstURL });
    };
    for (const topic of Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []) {
      addTopic(topic);
      for (const nested of Array.isArray(topic?.Topics) ? topic.Topics : []) addTopic(nested);
    }
    return filterRelevantResults(query, candidates);
  } catch { return []; }
}

async function searchBrave(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(`https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return filterRelevantResults(query, parseBraveSearchHtml(await res.text(), 8));
  } catch { return []; }
}

async function searchBing(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=en-US&setlang=en-US&cc=us&ensearch=1`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    return filterRelevantResults(query, parseBingSearchHtml(await res.text(), 8));
  } catch { return []; }
}

/** WMO 天气代码 → 中文描述 */
function wmoDesc(code: number): string {
  const map: Record<number, string> = {
    0: '☀️ 晴', 1: '🌤️ 多云', 2: '⛅ 局部多云', 3: '☁️ 阴',
    45: '🌫️ 雾', 48: '🌫️ 冻雾', 51: '🌦️ 小毛毛雨', 53: '🌦️ 毛毛雨', 55: '🌧️ 大毛毛雨',
    61: '🌧️ 小雨', 63: '🌧️ 中雨', 65: '⛈️ 大雨', 66: '🌧️ 冻雨', 67: '🌧️ 大冻雨',
    71: '🌨️ 小雪', 73: '🌨️ 中雪', 75: '❄️ 大雪', 77: '🌨️ 雪粒',
    80: '🌧️ 阵雨', 81: '🌧️ 中阵雨', 82: '⛈️ 大阵雨', 85: '🌨️ 阵雪', 86: '❄️ 大阵雪',
    95: '⛈️ 雷暴', 96: '⛈️ 雷暴+冰雹', 99: '⛈️ 强雷暴+冰雹',
  };
  return map[code] || `天气代码 ${code}`;
}

/**
 * 执行搜索：DuckDuckGo HTML（广泛）+ Open-Meteo 天气（实时）。
 * 服务端运行，无 CORS 限制。
 */
export async function doSearch(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // 免费搜索源并行执行，避免某个源的验证页或网络超时把总延迟累加。
  // 结果仍按质量优先级选择；不混合不相关的搜索页作为 RAG 证据。
  const sourceResults = await Promise.all([
    searchDuckDuckGoHtml(query),
    searchDuckDuckGoInstant(query),
    searchBrave(query),
    searchBing(query),
  ]);
  results.push(...(sourceResults.find((items) => items.length > 0) ?? []));

  // 2. 天气查询（Open-Meteo，免费 CORS 友好）
  if (/天气|weather|温度|气温|temperature/i.test(query)) {
    try {
      const city = query.replace(/天气|weather|温度|气温|temperature|的|今天|明天|现在|如何|怎么样|多少|实时|最新/gi, '').trim() || '北京';
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`);
      const geoData = await geoRes.json();
      if (geoData.results?.[0]) {
        const loc = geoData.results[0];
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true&hourly=relative_humidity_2m&timezone=auto`);
        const wData = await wRes.json();
        const cw = wData.current_weather;
        if (cw) {
          const desc = wmoDesc(cw.weathercode);
          const humidity = wData.hourly?.relative_humidity_2m?.[0];
          results.unshift({
            title: `${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}${loc.country ? ', ' + loc.country : ''} 实时天气`,
            snippet: `🌡️ 温度: ${cw.temperature}°C | ${desc} | 💨 风速: ${cw.windspeed} km/h${humidity ? ` | 💧 湿度: ${humidity}%` : ''} | 🕐 ${cw.time}`,
            url: 'https://open-meteo.com/',
          });
        }
      }
    } catch { /* ignore */ }
  }

  return results.slice(0, 8);
}
