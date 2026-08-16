# Resume Builder

本地优先的 Markdown 简历生成器。使用 Vue 3、Vite 和 Monaco Editor 构建，支持实时 A4 分页预览、样式调整、自动优化一页以及浏览器导出 PDF。

## 功能

- Markdown 与 Custom CSS 实时编辑
- A4 自动分页与 `\newpage` 手动分页
- `左侧内容 || 右侧内容` 简历行布局
- 字体、字号、行高、页边距、间距、颜色和分隔线设置
- 在最低可读字号限制内自动优化到一页
- IndexedDB 自动保存
- `.resume.json` 无损备份、Markdown 单独导出
- 通过浏览器打印对话框导出可选择文字的 PDF

## 本地运行

当前项目面向 Windows 上的 Chrome 或 Edge。`npm run dev` 会同时启动 Vite 前端与本机导出服务（`concurrently`，互不拖垮：导出服务挂了前端仍可继续用）。

首次使用需安装依赖；若要用「PDF（矢量 · 本机服务）」静默下载，还需安装导出服务及其 Chromium：

```powershell
npm install
npm run export-server:install
npm run dev
```

打开终端里 Vite 显示的本地地址即可编辑。简历内容只保存在当前浏览器的 IndexedDB 中，不会上传到服务器。

导出服务默认监听 `http://127.0.0.1:3917`。未执行 `export-server:install`、或 Playwright/Chromium 缺失时，终端里 `[export]` 可能报错退出，不影响前端日常编辑；可用打印另存 / 位图导出作为替代。仅启动前端：`npm run dev:vite`；仅启动导出服务：`npm run export-server`。详见 `export-server/README.md`。

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

## 后续可做 / 已知限制

主链路（编辑 → 预览分页 → 导出）已基本达标。优先补「我的」库管理与导出服务在线可见性；其余按需排期。

### 体验缺口

1. 「我的」缺复制、列表重命名、导入成新简历（现导入在编辑页且覆盖）
2. 矢量导出服务在线状态工具栏无预告
3. 双栏 / 表格非真正所见即所得，要点源码块
4. 「自动一页」失败缺少改哪的引导
5. 保存失败反馈弱
6. 换模板不换内容骨架

### 导出 / 一致性残余风险

1. 位图 PDF 是降级路径
2. 打印另存依赖对话框选项
3. Playwright 需 `export-server:install`
4. 效果区与导出分页仍可能差约 1 行
5. Web 字体离线可能分叉
6. Custom CSS 防护浅
7. H2 分隔线在预览/导出下可能粗细不一（已排查、暂停修复）：见 [docs/h2-rule-thickness.md](docs/h2-rule-thickness.md)

### 工程 / 产品可选项

1. 几乎无自动化测试
2. 模板集不能文件级导入导出
3. 导出服务未一体打包
4. 非 Windows / Chromium 验证不足
5. 字体 / 版式选项有限（本地字体、照片等）
6. 多标签页无冲突处理
