// Electron 预加载脚本:目前不向渲染进程暴露 Node 能力(应用完全本地优先,基于 IndexedDB)。
// 预留位置,后续若需要原生能力(系统通知增强、文件对话框等)可在此 contextBridge 暴露。
// 所有 window 检测必须判断存在性,确保与浏览器环境兼容。
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
});
