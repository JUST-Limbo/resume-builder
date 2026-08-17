# Resume Builder

本地优先的 Markdown 简历生成器。使用 Vue 3、Vite 和 Monaco Editor 构建，支持实时 A4 分页预览、样式调整、自动优化一页以及浏览器导出 PDF。

## 项目定位

本项目主要用于学习和实践 Monaco Editor、Markdown 在线编辑、实时预览、分页排版与浏览器导出等前端功能。简历编辑与生成能力是上述学习和实验过程中的附属产物。

## 功能

- Markdown 与 Custom CSS 实时编辑
- A4 自动分页与 `\newpage` 手动分页
- `左侧内容 || 右侧内容` 简历行布局
- 按二级标题删除、拖拽排序简历模块
- 字号、行高、页边距、间距、颜色和分隔线设置
- 在最低可读字号限制内自动优化到一页
- IndexedDB 自动保存
- `.resume.json` 无损备份、Markdown 单独导出
- 通过浏览器打印对话框导出可选择文字的 PDF

## 本地运行

当前项目面向 Windows 上的 Chrome 或 Edge。`npm run dev` 会同时启动 Vite 前端与本机导出服务（`concurrently`，互不拖垮：导出服务挂了前端仍可继续用）。

运行环境要求 Node.js 22.12 或更高版本，推荐使用 Node.js 22 LTS；仓库提供 `.nvmrc` 供版本管理工具读取。

首次使用需安装依赖；若要用「PDF（矢量 · 本机服务）」静默下载，还需安装导出服务及其 Chromium：

```powershell
npm install
npm run export-server:install
npm run dev
```

打开终端里 Vite 显示的本地地址即可编辑。简历内容只保存在当前浏览器的 IndexedDB 中，不会上传到服务器。

导出服务默认监听 `http://127.0.0.1:3917`。未执行 `export-server:install`、或 Playwright/Chromium 缺失时，终端里 `[export]` 可能报错退出，不影响前端日常编辑；可用打印另存 / 位图导出作为替代。仅启动前端：`npm run dev:vite`；仅启动导出服务：`npm run export-server`。详见 `export-server/README.md`。

## 在线访问

项目通过 GitHub Actions 构建并发布到 GitHub Pages：

<https://just-limbo.github.io/resume-builder/>

每次向 `main` 分支推送后会自动重新部署。线上版本使用 Hash 路由，简历数据仍只保存在访问者当前浏览器的 IndexedDB 中。GitHub Pages 无法运行本机 Playwright 导出服务，因此线上不显示「PDF（矢量 · 本机服务）」；仍可使用打印另存矢量 PDF 或浏览器位图 PDF。

## Markdown 约定

```markdown
# 姓名

手机号 | 邮箱 | 所在地

## 工作经历

### 公司名称 · 前端工程师 || 2022.06 - 至今

- 负责核心业务系统开发
- 推动工程化和性能优化

\newpage

## 项目经历
```

- `### 左侧 || 右侧`：生成左侧主体、右侧日期的双端布局。
- `\newpage`：强制后续内容从下一页开始。
- 原始 HTML 默认禁用；高级样式请在 Custom CSS 标签中填写。

## PDF 导出

导出菜单提供三条路径：

1. **PDF（矢量 · 本机服务）**：`npm run dev` 会一并拉起导出服务（首次需 `export-server:install`）；静默下载可选中文字的矢量 PDF（与预览同源 HTML + Playwright）。
2. **PDF（打印另存 · 矢量）**：打开浏览器打印对话框，选择「另存为 PDF」；纸张 A4、边距「无」、缩放 100%。
3. **PDF（位图下载）**：浏览器内 html2canvas 栅格化，无需本机服务，文字不可选中。

## 隐私

仓库内只有匿名示例。请优先使用 `.resume.json` 在本地备份真实简历，不要将手机号、邮箱等个人信息提交到 Git 历史。

后续规划与已知限制见 [docs/known-limitations.md](docs/known-limitations.md)。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
