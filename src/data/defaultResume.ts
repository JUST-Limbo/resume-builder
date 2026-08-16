import type { ResumeDocumentV1 } from '../types/resume'
import { BUILTIN_CLASSIC_ID, classicStyles } from './defaultTemplates'

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// 这是产品内置的匿名起始正文，不是测试数据或临时 mock 数据。
// 刻意写满约 1.5–2 页 A4，便于分页与多页预览；新建简历与模板缩略图共用。
export const defaultMarkdown = `# 林晓

138 0000 0000 | linxiao@example.com | 江苏南京
掘金：https://juejin.cn/user/example | GitHub：https://github.com/example
6 年前端开发经验 | 本科 | 可随时到岗

## 自我评价

具备完整的前端工程化落地经验，擅长在业务节奏快、协作面广的场景中把需求拆成可交付模块。关注可读性、可维护性与性能，能独立推进技术方案评审、落地与复盘，也习惯用文档和示例降低团队协作成本。

## 专业技能

- 熟练使用 Vue 2、Vue 3、TypeScript 完成 SPA、SSR 和复杂后台系统开发
- 熟悉 Vite、Webpack 等工程化工具，能够独立完成项目构建、分包与性能优化
- 熟悉 HTML、CSS、JavaScript、Element Plus、Ant Design Vue、ECharts 等常用技术栈
- 熟悉 Pinia / Vuex、Vue Router，能设计可扩展的状态与路由权限方案
- 了解 Node.js、NestJS 基础，能配合后端完成接口联调与简单 BFF 改造
- 熟悉 Git 协作、Code Review、单元测试与基础 CI 流程
- 能够结合 AI 编程工具提升需求分析、编码、测试和文档维护效率

## 教育背景与工作经历

### 江南理工大学 · 计算机科学与技术 · 本科 || 2014.09 - 2018.06

主修数据结构、操作系统、计算机网络与软件工程；参与校内 Web 实验室项目，负责前端页面与组件实现。

### 星云科技有限公司 · 高级前端工程师 || 2021.07 - 至今

- 负责核心业务平台的 Vue 3 技术升级、组件体系建设与性能优化
- 推进团队工程规范和代码评审流程，显著降低线上问题率
- 主导设计权限、字典、低代码表单等通用能力，支撑多个业务线快速接入
- 组织前端技术分享与新人 onboarding，沉淀脚手架与最佳实践文档

### 海川信息技术有限公司 · 前端工程师 || 2018.07 - 2021.06

- 负责多个中后台系统和移动端项目的交付与持续迭代
- 参与组件库与主题体系搭建，统一视觉与交互规范
- 配合产品完成需求评审，输出技术方案与排期拆分，保障版本按时上线

### 青禾网络科技有限公司 · 前端开发实习生 || 2017.07 - 2017.12

- 参与运营后台页面开发与 bug 修复，熟悉前后端协作与发版流程
- 完成活动页、数据看板等需求，积累 Vue 与工程化实践基础

## 项目经历

### 智能运营平台 || 2023.08 - 至今

**技术栈：** Vue 3、TypeScript、Vite、Pinia、ECharts

**业务产出：**

1. 从零搭建运营平台前端架构，覆盖权限、配置、报表和流程审批等核心模块
2. 建立通用表格、表单和图表组件，减少重复开发并统一交互体验
3. 通过路由拆分、虚拟列表和缓存策略优化首屏及大数据量页面性能
4. 落地埋点与错误监控面板，缩短线上问题定位时间

### 移动业务中台 || 2021.10 - 2023.07

**技术栈：** Vue 2、TypeScript、Webpack、uni-app

1. 负责移动端业务模块、公共组件及多环境构建流程
2. 推动 Webpack 构建升级，将开发冷启动和生产打包时间显著缩短
3. 抽象多端适配层，降低 H5 与小程序双端同步改动成本
4. 配合测试完善回归清单，降低版本发布回滚频率

### 数据可视化大屏 || 2022.03 - 2022.11

**技术栈：** Vue 3、ECharts、WebSocket、TypeScript

1. 实现多主题大屏布局与自适应缩放方案，适配多种会议室分辨率
2. 接入实时推送数据流，完成指标卡片、趋势图与告警列表联动刷新
3. 抽离图表配置与主题令牌，支持运营侧快速替换品牌视觉

### 内部低代码表单引擎 || 2020.05 - 2021.05

**技术栈：** Vue 2、JSON Schema、Element UI

1. 设计字段协议与渲染器插件机制，支持文本、选择、上传、联动校验等控件
2. 提供可视化配置面板，业务同学可独立完成常见表单搭建
3. 与审批流打通，复用于入职、报销、设备申领等内部场景

## 获奖与证书

- 公司年度优秀员工（2022、2024）
- 前端技术专项「性能优化」一等奖（内部黑客松，2023）
- 大学英语六级；计算机技术与软件专业技术资格（中级）
`

export const createDefaultResume = (
  overrides?: Partial<ResumeDocumentV1>,
): ResumeDocumentV1 => ({
  schemaVersion: 1,
  id: createId(),
  title: '林晓-前端开发简历',
  markdown: defaultMarkdown,
  styles: classicStyles(),
  customCss: '',
  autoFitScale: 1,
  smartPagination: false,
  templateId: BUILTIN_CLASSIC_ID,
  updatedAt: new Date().toISOString(),
  ...overrides,
})
