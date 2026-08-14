import type { ResumeDocumentV1 } from '../types/resume'

// 这是产品内置的匿名起始模板，不是测试数据或临时 mock 数据。
const defaultMarkdown = `# 林晓

138 0000 0000 | linxiao@example.com | 江苏南京
掘金：https://juejin.cn/user/example | GitHub：https://github.com/example
6 年前端开发经验 | 本科 | 可随时到岗

## 专业技能

- 熟练使用 Vue 2、Vue 3、TypeScript 完成 SPA、SSR 和复杂后台系统开发
- 熟悉 Vite、Webpack 等工程化工具，能够独立完成项目构建与性能优化
- 熟悉 HTML、CSS、JavaScript、Element Plus、ECharts 等前端技术
- 能够结合 AI 编程工具提升需求分析、编码、测试和文档维护效率

## 教育背景与工作经历

### 江南理工大学 · 计算机科学与技术 · 本科 || 2014.09 - 2018.06

### 星云科技有限公司 · 高级前端工程师 || 2021.07 - 至今

- 负责核心业务平台的 Vue 3 技术升级、组件体系建设与性能优化
- 推进团队工程规范和代码评审流程，显著降低线上问题率

### 海川信息技术有限公司 · 前端工程师 || 2018.07 - 2021.06

- 负责多个中后台系统和移动端项目的交付与持续迭代

## 项目经历

### 智能运营平台 || 2023.08 - 至今

**技术栈：** Vue 3、TypeScript、Vite、Pinia、ECharts

**业务产出：**

1. 从零搭建运营平台前端架构，覆盖权限、配置、报表和流程审批等核心模块
2. 建立通用表格、表单和图表组件，减少重复开发并统一交互体验
3. 通过路由拆分、虚拟列表和缓存策略优化首屏及大数据量页面性能

### 移动业务中台 || 2021.10 - 2023.07

**技术栈：** Vue 2、TypeScript、Webpack、uni-app

1. 负责移动端业务模块、公共组件及多环境构建流程
2. 推动 Webpack 构建升级，将开发冷启动和生产打包时间显著缩短
`

export const createDefaultResume = (): ResumeDocumentV1 => ({
  schemaVersion: 1,
  title: '林晓-前端开发简历',
  markdown: defaultMarkdown,
  styles: {
    marginX: 12,
    marginY: 11,
    baseFontSize: 10,
    lineHeight: 1.5,
    sectionGap: 10,
    itemGap: 3,
    fontPreset: 'system',
    nameAlignment: 'left',
    textColor: '#202124',
    mutedColor: '#7a8388',
    dividerColor: '#202124',
    dividerWidth: 1,
  },
  customCss: '',
  autoFitScale: 1,
  updatedAt: new Date().toISOString(),
})
