# H2 下划线粗细不一致（排查记录）

> **状态：暂停修复。** 本文档记录排查过程与结论，供以后的自己 / agent 接手；以本文为准，不要在未重新评估前继续改 snap / 下划线实现。

## 现象

- 预览与导出（矢量 / 位图）中，`h2` 下方分隔线（`h2::after`）**粗细不一致**。
- 同一页内不同 `h2` 也可能一粗一细。
- 用户观察：多数标题线偏粗或互不一致；分页后的「获奖与证书」等少数标题看起来一致。

根因方向：1 CSS px 实线落在**半像素 Y** 上时，Blink / PDF 光栅会把线抗锯齿扩成约 2 物理像素，造成「同页两条线看起来不一样」。

## 排查时间线

### 1. 初判：`height: 1px` + background

样式用 `height` + `background` 画分隔线。在 DPR / PDF 光栅下，同一设计宽度会落成 **1px vs 2px** 物理像素。

### 2. 改 pt + `border-top`

尝试用 `pt` 与 `border-top` 统一描边。仍不够：

- 半像素 Y 上的抗锯齿依旧发粗；
- `border` 描边与 fill 在屏绘 / PDF 矢量路径上仍会分叉。

### 3. 改整数 px 填色 + `snapResumeSectionRules`

- `resolveResumeRuleWidthCss`：把设计单位取整为整数 CSS px。
- `snapResumeSectionRules`：按线顶 Y 的小数部分微调 `h2::after` 的 `margin-top`，试图对齐整 CSS 像素。

预览 / 导出仍有粗细不一。

### 4. 误判：nth 选择器漏选

一度怀疑 `nth-of-type` / 兄弟索引算错，导致部分 `h2` 未应用 snap。

**实测：选择器能命中。** 漏选不是主因。

### 5. 当前结论（暂停点）

效果区 `.resume-page { transform: scale(zoom) }` 下：

- `getBoundingClientRect()` 得到的是**视觉坐标**；
- `margin` 微调作用在**布局 CSS px**。

若用视觉坐标算出的 frac 直接去改 layout margin，实际位移只有约 `frac * zoom`，**snap 几乎无效**。

只有碰巧接近整 CSS 像素的标题（例如分页后的「获奖与证书」）看起来一致；多数标题仍落在半像素附近，线被画粗。

代码里可能已有相对 `.resume-page` 反算 scale 的尝试（见 `resumeDocumentStyles.ts` 注释与相关函数），但**产品侧决定先停**，后续修复须重新验证，不以「已有函数」视为已修好。

## 相关代码位置

| 文件 | 角色 |
|------|------|
| `src/utils/resumeDocumentStyles.ts` | `resolveResumeRuleWidthCss`、`snapResumeSectionRules`、`h2::after` 样式 |
| `src/components/MarkdownWysiwygEditor.vue` | 编辑区调用 snap |
| `src/utils/resumePageEngine.ts` | 预览 / 分页 iframe；`.resume-page { transform: scale(zoom) }`；snap |
| `src/utils/exportResumePdf.ts` | 导出路径上的 snap / 分隔线相关处理 |

## 以后再修时的建议

任选或组合，动手前先复现「同页多条 h2 + 效果区 zoom ≠ 1」：

1. **布局坐标系 snap**：相对 `.resume-page` 反算 `scale`，在 layout CSS px 上取整再写 margin；禁止在 zoom 下用视觉 rect 直接当 CSS 位移。
2. **量线时 zoom=1**：预览 / 导出统一在无缩放（或独立 measure 层）上计算线位置，再应用到展示层。
3. **换画法**：SVG / canvas 等不受「半像素 1px 盒模型线」影响的方式画分隔线。

修完验收要点：

- 同页多个 `h2` 线宽目视一致；
- 效果区（缩放）与矢量导出、位图导出三者一致；
- 改样式面板「线条粗细」、改 zoom、触发分页后仍稳定。

## 决定

**当前决定：暂停修复。** 不继续改 snap / 下划线实现，以本文档为状态来源。需要再动手时，从本文「当前结论」与「以后再修建议」起步，不要重复时间线里已证伪的路径（单纯改 pt/border、只改整数 width、只怀疑 nth 选择器）。
