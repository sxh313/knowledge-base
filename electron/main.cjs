// Electron 主进程:把 Vite 构建产物(dist/)包装为桌面应用
// 桌面端使用 HashRouter + loadFile,避免 file:// 协议下的路由问题
const { app, BrowserWindow, shell, Menu, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const DIST_DIR = path.join(__dirname, '..', 'dist');

// 把 app:// 注册为标准 + 安全协议,使其拥有独立 origin(app://),
// 否则 Chromium 会把 origin 视为 null,导致 ES module/CSS 被 CORS 阻止而白屏。
// 必须在 app 就绪前调用。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// 单实例锁:防止多开导致本地 IndexedDB 写入冲突
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      const w = wins[0];
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '知识库',
    backgroundColor: '#f5f6f7',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 首次绘制完成后再显示,避免白屏闪烁
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 外部 http(s) 链接在系统默认浏览器打开,不走应用内导航
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 用自定义协议 app:// 加载,chunk 同源加载,不会白屏
  mainWindow.loadURL('app://./index.html');
}

app.whenReady().then(() => {
  // 注册自定义协议:app:// 映射到 dist/ 目录,以同源方式服务静态资源(含 ES module chunk)
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    // app://./index.html → 取路径部分
    let filePath = decodeURIComponent(url.pathname);
    if (!filePath || filePath === '/') filePath = '/index.html';
    // 防止路径穿越
    const resolved = path.normalize(path.join(DIST_DIR, filePath));
    if (!resolved.startsWith(DIST_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });

  // 精简菜单栏(macOS 保留最小菜单;Windows 自动隐藏)
  if (process.platform === 'darwin') {
    const template = [
      { role: 'appMenu', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { role: 'viewMenu', submenu: [{ role: 'reload' }, { role: 'toggledevtools' }, { type: 'separator' }, { role: 'resetzoom' }, { role: 'zoomin' }, { role: 'zoomout' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    Menu.setApplicationMenu(null);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
