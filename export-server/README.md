# 本机矢量 PDF 导出服务

用 Playwright/Chromium 对前端已分页的 HTML 调用 `page.pdf()`，静默下载可选中文字的矢量 PDF。

## 启动

在仓库根目录，日常开发用一条命令即可（与 Vite 一起起）：

```powershell
npm run export-server:install
npm run dev
```

仅启动本服务时：

```powershell
npm run export-server:install
npm run export-server
```

或进入本目录：

```powershell
cd export-server
npm install
npm start
```

首次安装会通过 `postinstall` 下载 Chromium。默认地址：`http://127.0.0.1:3917`。

可用环境变量 `EXPORT_SERVER_PORT` 改端口（改后需同步前端 `EXPORT_SERVER_BASE_URL`）。

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/export/pdf` | JSON `{ html, filename? }` → `application/pdf` |

仅监听 `127.0.0.1`，CORS 只放行本地 Vite（5173）与 preview（4173）。

## 前端用法

1. 根目录 `npm run export-server:install`（仅首次）
2. `npm run dev`（同时起前端与本服务）
3. 导出菜单 → **PDF（矢量 · 本机服务）**

服务未启动或 Chromium 未装时会提示失败，并建议改用「PDF（打印另存 · 矢量）」；前端编辑不受影响。
