# Vercel 联网搜索部署

项目已将联网搜索封装为 `api/search.ts`，Vercel 会同时部署完整前端和搜索接口。部署后可以直接通过 Vercel 地址使用网页版 App，不需要在用户电脑上常驻搜索服务。

## 部署

1. 将项目推送到 GitHub。
2. 在 Vercel 中导入该仓库。Framework 选择 Vite，Build Command 使用 `npm run build`，Output Directory 使用 `dist`。`vercel.json` 会同时处理 SPA 页面和 `api/search.ts` Function。
3. 在 Vercel 项目的 Settings → Environment Variables 添加：
   - `TAVILY_API_KEY`：推荐填写 Tavily Key。没有 Key 时仍会走 DuckDuckGo/Bing 轻量兜底。
   - `OPEN_WEBSEARCH_BASE_URL`：只有使用远程 open-webSearch 服务时填写，例如 `https://你的服务域名`。
4. 重新部署，得到类似 `https://你的项目.vercel.app` 的完整网页版地址。

## 桌面端和安卓端

如果只使用 Vercel 网页版，不需要设置 `VITE_SEARCH_API_URL`，前端会自动调用同域的 `/api/search`。

如果还要打包桌面端或安卓端，打包前设置：

```text
VITE_SEARCH_API_URL=https://你的项目.vercel.app
```

桌面端/安卓端必须填写，因为它们不是从 Vercel 页面同域打开的。本地开发时也可以填写该地址，让本地 App 调用线上搜索接口。

## 说明

Vercel Function 本身通常只占很短的转发时间；总耗时主要来自 Tavily、搜索引擎响应以及网页正文抽取。部署配置已为搜索函数设置 30 秒上限，避免请求无限等待。
