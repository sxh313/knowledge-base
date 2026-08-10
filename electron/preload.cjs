// Electron 预加载脚本:通过 contextBridge 暴露自动更新等原生能力。
// 所有 window 检测必须判断存在性,确保与浏览器环境兼容。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  // ─── 自动更新 ───
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    // 订阅更新状态/进度事件,返回取消订阅函数
    onStatus: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on('update:status', listener);
      return () => ipcRenderer.removeListener('update:status', listener);
    },
    onProgress: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on('update:progress', listener);
      return () => ipcRenderer.removeListener('update:progress', listener);
    },
  },
});
