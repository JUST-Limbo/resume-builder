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

当前项目面向 Windows 上的 Chrome 或 Edge，不需要后端服务。

```powershell
npm install
npm run dev
```

打开终端显示的本地地址即可使用。简历内容只保存在当前浏览器的 IndexedDB 中，不会上传到服务器。

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

点击“导出 PDF”后，在 Chrome 或 Edge 的打印对话框中选择“另存为 PDF”。纸张保持 A4，边距选择“无”，缩放保持 100%。

## 隐私

仓库内只有匿名示例。请优先使用 `.resume.json` 在本地备份真实简历，不要将手机号、邮箱等个人信息提交到 Git 历史。
