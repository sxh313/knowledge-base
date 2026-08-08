import { marked } from 'marked';
import TurndownService from 'turndown';

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const html = `<p>文前</p><img src="${dataUrl}" alt="截图"><p>文后</p>`;

const md = td.turndown(html);
console.log('=== HTML → Markdown ===');
console.log(md);

const html2 = marked.parse(md);
console.log('=== Markdown → HTML ===');
console.log(html2);

console.log('=== 往返是否保留 img ===');
console.log(html2.includes('<img') ? '✅ 保留' : '❌ 丢失');
