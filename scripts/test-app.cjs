// 自动化测试:逐个加载知识库各页面路由,检测渲染错误
// 用法: npx electron scripts/test-app.cjs
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const DIST = path.join(__dirname, '..', 'dist');

// 与主进程一致:注册 app:// 协议
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const ROUTES = ['/', '/ai', '/review', '/cards', '/stats', '/knowledge', '/tags', '/settings', '/inbox', '/search', '/trash', '/edit/new'];

let failures = [];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadRoute(win, route) {
  return new Promise((resolve) => {
    let jsErrors = [];
    let settled = false;
    const finish = (reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      win.webContents.removeListener('console-message', onConsole);
      win.webContents.removeListener('did-fail-load', onDidFail);
      resolve({ route, ok: jsErrors.length === 0, jsErrors, reason });
    };
    const timeout = setTimeout(() => finish('timeout'), 12000);

    const onConsole = (evt) => {
      if (evt.level === 'error' || (evt.message && /Uncaught|Error|Failed/i.test(evt.message))) {
        jsErrors.push(evt.message);
      }
    };
    const onDidFail = (event, code, desc) => {
      jsErrors.push(`did-fail-load: ${code} ${desc}`);
    };

    win.webContents.on('console-message', onConsole);
    win.webContents.on('did-fail-load', onDidFail);

    // 用 hash 导航;等待足够时间让 React 懒加载页面渲染
    win.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(route)}; true`).catch(() => {});
    setTimeout(() => finish(), 4000);
  });
}

app.whenReady().then(async () => {
  // 注册 app:// 协议处理(与主进程一致)
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let filePath = decodeURIComponent(url.pathname);
    if (!filePath || filePath === '/') filePath = '/index.html';
    const resolved = path.normalize(path.join(DIST, filePath));
    if (!resolved.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(resolved).toString());
  });

  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  // 先加载首页
  await win.loadURL('app://./index.html');
  await sleep(2000);

  for (const route of ROUTES) {
    const result = await loadRoute(win, route);
    if (result.ok) {
      console.log(`✅ ${route} 正常`);
    } else {
      console.log(`❌ ${route} 失败: ${result.jsErrors.slice(0,3).join(' | ') || result.reason}`);
      failures.push({ route, ...result });
    }
  }

  win.destroy();
  app.quit();
  if (failures.length > 0) {
    console.log(`\n== ${failures.length} 个页面有问题 ==`);
    process.exitCode = 1;
  } else {
    console.log('\n== 所有页面均正常 ==');
  }
});