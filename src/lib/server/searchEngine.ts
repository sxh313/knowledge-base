// 搜索引擎（服务端运行，无 CORS 限制）
// 数据源：DuckDuckGo HTML 搜索（广泛覆盖）+ Open-Meteo 天气（实时、免费、无需 Key）

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function decodeHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
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

  // 1. DuckDuckGo HTML 搜索（POST 到 html.duckduckgo.com）
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: `q=${encodeURIComponent(query)}&kl=cn-zh`,
    });
    const html = await res.text();
    const titleRe = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const titles = [...html.matchAll(titleRe)];
    const snippets = [...html.matchAll(snippetRe)];
    for (let i = 0; i < Math.min(titles.length, 8); i++) {
      const rawUrl = titles[i][1];
      const title = titles[i][2].replace(/<[^>]*>/g, '').trim();
      const snippet = (snippets[i]?.[1] || '').replace(/<[^>]*>/g, '').trim();
      const uddg = rawUrl.match(/uddg=([^&]+)/);
      const url = uddg ? decodeURIComponent(uddg[1]) : rawUrl;
      if (title) results.push({ title, snippet, url });
    }
  } catch { /* ignore */ }

  // DuckDuckGo HTML 偶尔会返回验证页或调整标记，使用官方 Instant Answer JSON
  // 作为轻量兜底，至少保证测试和摘要搜索能拿到可用内容。
  if (results.length === 0) {
    try {
      const apiRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.AbstractText) {
          results.push({
            title: data.Heading || query,
            snippet: data.AbstractText,
            url: data.AbstractURL || 'https://duckduckgo.com/',
          });
        }
        const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
        for (const topic of topics) {
          if (topic?.Text && topic?.FirstURL) {
            results.push({ title: topic.Text.split(' - ')[0] || query, snippet: topic.Text, url: topic.FirstURL });
          }
          if (Array.isArray(topic?.Topics)) {
            for (const nested of topic.Topics) {
              if (nested?.Text && nested?.FirstURL) results.push({ title: nested.Text.split(' - ')[0] || query, snippet: nested.Text, url: nested.FirstURL });
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  // 某些本地运行环境无法连接 DuckDuckGo，使用 Bing HTML 作为服务端最终兜底。
  if (results.length === 0) {
    try {
      const bingRes = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (bingRes.ok) {
        const html = await bingRes.text();
        const resultRe = /<li class="b_algo"[\s\S]*?<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?(?:<p>([\s\S]*?)<\/p>)?/g;
        for (const match of html.matchAll(resultRe)) {
          const title = decodeHtml(match[2]);
          const snippet = decodeHtml(match[3] || '');
          if (title && match[1]) results.push({ title, snippet, url: match[1] });
          if (results.length >= 8) break;
        }
      }
    } catch { /* ignore */ }
  }

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
