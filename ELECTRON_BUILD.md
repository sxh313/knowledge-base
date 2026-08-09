# Electron 打包 Windows .exe 指南

> 本文档记录了知识库项目打包成 Windows 安装包(.exe)的**完整成功步骤**与踩坑笔记。
> 以后打包**照此流程执行**即可,不要再摸索。

## 快速开始(一条命令)

```bash
npm run electron:build
```

> ⚠️ **注意**:直接运行 `npm run electron:build` 在 D 盘项目目录会因 `rename EPERM` 失败。
> **正确做法**:输出目录必须放到 **C 盘临时目录**,打包成功后再复制回 `release/`。
> 详见下方「完整步骤」。

---

## 前置条件

- 已安装 `electron` + `electron-builder`(本项目已装)
- 图标必须是**真正的 PNG**(`build/icon.png`),不能是改了名的 SVG
- 国内网络需要配置镜像(否则 NSIS 工具下载超时)

### 图标要求

- 位置:`build/icon.png`(512x512,真 PNG)
- ⚠️ **坑**:`public/icons/*.png` 之前实际是 **SVG 内容**(改名的文件),electron-builder 无法用。
- 生成真 PNG 图标:

```bash
node scripts/gen-icon.cjs
```

这个脚本会用纯 Node(zlib)手写生成 512 和 192 尺寸的真 PNG 图标(深蓝底 + 白色书本图形),并写入 `build/icon.png` 和 `public/icons/*.png`。

---

## 完整打包步骤(已验证成功)

### 第 1 步:清理旧产物

```powershell
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:TEMP\kb-release" -ErrorAction SilentlyContinue
```

### 第 2 步:设置镜像环境变量(国内网络必需)

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
```

这几个镜像用于下载:
- Electron 运行时 zip
- NSIS 安装器工具(`nsis-3.0.4.1.7z`、`7zip-win-x64`、`nsis-resources-3.4.1.7z`)

不设镜像 → `connect ETIMEDOUT 20.205.243.166:443`(GitHub 443 被墙)。

### 第 3 步:打包到 C 盘临时目录(关键!)

**必须**把 `directories.output` 指向 C 盘,否则在 D 盘项目目录会报:

```
EPERM: operation not permitted, rename 'win-unpacked.tmp' -> 'win-unpacked'
```

这是 D 盘的实时杀毒/文件系统对解压目录 rename 的限制。

```powershell
npx electron-builder --win --config.directories.output="$env:TEMP\kb-release"
```

### 第 4 步:复制产物回项目 release/

```powershell
New-Item -ItemType Directory -Force -Path release | Out-Null
Copy-Item "$env:TEMP\kb-release\*" release -Recurse -Force
```

### 第 5 步:输出产物位置

- **安装包**:`release\知识库 Setup 1.0.0.exe`(约 101 MB,发给用户安装)
- **便携版**:`release\win-unpacked\知识库.exe`(约 215 MB,解压即用)
- `release\win-unpacked\` 完整目录(403 MB,免安装运行)

---

## 一键脚本

为避免每次手输那么多命令,建议把完整流程放进 `deploy-exe.ps1`(或直接手动执行上面步骤)。

```powershell
# deploy-exe.ps1 — 直接运行即可
cd "d:\desktop\AI\Study Journal"

# 1. 清理
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:TEMP\kb-release" -ErrorAction SilentlyContinue

# 2. 生成真 PNG 图标(可选,图标没变可跳过)
node scripts/gen-icon.cjs

# 3. 镜像
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# 4. 打包到 C 盘临时目录
npx electron-builder --win --config.directories.output="$env:TEMP\kb-release"

# 5. 复制回 release/
New-Item -ItemType Directory -Force -Path release | Out-Null
Copy-Item "$env:TEMP\kb-release\*" release -Recurse -Force

Write-Host "✅ 打包完成:release\知识库 Setup 1.0.0.exe"
```

---

## package.json 相关配置

```json
{
  "main": "electron/main.cjs",
  "scripts": {
    "electron:build": "tsc -b && cross-env BUILD_TARGET=electron vite build && electron-builder --win"
  },
  "build": {
    "appId": "com.sxh313.knowledge-base",
    "productName": "知识库",
    "directories": { "output": "release", "buildResources": "build" },
    "files": ["dist/**/*", "electron/**/*"],
    "win": { "target": [{ "target": "nsis", "arch": ["x64"] }], "icon": "build/icon.png" },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "知识库"
    }
  }
}
```

---

## 踩坑记录

| 问题 | 症状 | 解法 |
|------|------|------|
| **D 盘 rename 失败** | `EPERM: rename 'win-unpacked.tmp' -> 'win-unpacked'` | 输出目录改到 **C 盘 `%TEMP%`**,完成后再复制回来 |
| **NSIS 下载超时** | `connect ETIMEDOUT 20.205.243.166:443` | 设 `ELECTRON_BUILDER_BINARIES_MIRROR` 指向 npmmirror |
| **图标无效** | `VipsForeignLoad: buffer is not in a known format` | `public/icons/*.png` 实际是 SVG;用 `scripts/gen-icon.cjs` 生成真 PNG |
| **PWA 虚拟模块缺失** | `Failed to resolve virtual:pwa-register/react` | vite 里给 Electron 构建加 `pwa-register-stub` 桩插件(已配置) |

---

## 桌面端路由说明

- Electron 桌面端用 **HashRouter**(`file://` 协议下 BrowserRouter 会失效)
- 由 `electron/main.cjs` 的 `loadFile(dist/index.html)` 加载
- Electron 构建(`BUILD_TARGET=electron`)会:相对路径 `base: './'` + 禁用 PWA + 加载 PWA 桩模块