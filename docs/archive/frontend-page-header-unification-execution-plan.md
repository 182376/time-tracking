# 前端页面页头统一执行单

## 1. 文档目的

本执行单用于统一 `Dashboard`、`History`、`App Mapping`、`Settings` 四个主页面的顶部页头结构，让它们回到同一套 Quiet Pro 页面级 header archetype。

本轮只处理“页头/标题区”的统一，不扩展到页面主体布局、图表、列表、表单或 Rust / Tauri。

---

## 2. 当前问题

当前四页虽然都使用了 `qp-panel` 作为顶部容器，但左侧标题块并没有复用同一套结构，导致视觉上像是四种近似但不一致的页面：

- `Dashboard`：左侧有图标块、标题、状态型副标题
- `History`：没有与其他页一致的图标块，左侧标题信息更紧
- `App Mapping`：左侧图标块、标题、副标题更像“设置页”
- `Settings`：左侧图标块、标题、副标题与 `App Mapping` 相近，但尺寸与整体节奏仍是页面私有实现

结果就是：

- 左侧标题块宽度、留白、图标存在感不一致
- 标题与副标题的层级节奏不一致
- 用户会感觉“四页是分别做的”，而不是一个统一产品

---

## 3. 本轮目标

本轮完成后，应达到：

1. 四个页面的左侧页头信息块使用同一 Quiet Pro 结构语法。
2. 图标块尺寸、标题字号、副标题字号、标题块内边距、垂直节奏统一。
3. 右侧操作区保留各页各自功能，不为了统一而牺牲交互。
4. 用户一眼看过去，会觉得这四页属于同一个应用的同一级页面。

---

## 4. 范围

### 包含

- `src/features/dashboard/components/Dashboard.tsx`
- `src/features/history/components/History.tsx`
- `src/features/classification/components/AppMapping.tsx`
- `src/features/settings/components/Settings.tsx`
- 新增或接入共享页头原语（推荐 `QuietPageHeader`）
- 必要的 `App.css` Quiet Pro 语义样式补充

### 不包含

- 页面主体内容布局重做
- 图表样式调整
- 筛选器、表单、列表卡片的二次改版
- Sidebar / Titlebar 改造
- Rust / Tauri 逻辑修改

---

## 5. 设计结论

本轮不建议四页分别“调到看起来差不多”，而应统一为一个共享页头原语。

推荐方向：

- 新增共享组件：`QuietPageHeader`
- 该组件只统一页面顶部的大框架：
  - 左侧：图标块 + 标题 + 副标题
  - 右侧：actions / status / controls slot
- 右侧区域允许每页保留差异：
  - `Dashboard`：运行状态 badge
  - `History`：日期切换 controls
  - `App Mapping`：未保存状态 + 保存/取消
  - `Settings`：未保存状态 + 保存/取消

换句话说：

- 左侧信息架构统一
- 右侧功能布局保留页面差异

---

## 6. 组件要求

### 6.1 新增共享页头原语

建议新增：

- `src/shared/components/QuietPageHeader.tsx`

建议职责：

- 提供统一的页头外层 `qp-panel`
- 提供统一的左侧 title block
- 接收：
  - `icon`
  - `title`
  - `subtitle`
  - `rightSlot`
  - 如有必要可选 `subtitleTone`，但不要扩成复杂变体系统

### 6.2 视觉统一要求

需要统一以下要素：

- 图标块大小
- 图标块圆角、边框、背景
- 标题字号与字重
- 副标题字号与颜色
- 左侧块的 gap
- 整个 header 的 padding
- header 的最小高度与对齐方式

### 6.3 不要做的事情

- 不要把 `Dashboard` 做成更像概览页 hero，而其他三页保留设置页样式
- 不要给某一页单独加更大图标、更粗标题或特殊背景
- 不要把右侧 controls 强行统一成同一尺寸，如果会破坏原交互

---

## 7. 页面接入要求

### 阶段 A：抽共享页头原语

目标：

- 新增 `QuietPageHeader`
- 在 `App.css` 中补齐 Quiet Pro 页头语义样式

验收标准：

- 不带页面私有语义时，也能独立渲染出完整 Quiet Pro 页头

完成后执行：

- `npm run build`

### 阶段 B：接入 Dashboard / History

目标：

- `Dashboard` 接入共享页头
- `History` 接入共享页头
- `History` 补上与其他页一致的左侧图标块

验收标准：

- 两页左侧页头结构一致
- `History` 不再显得比其他页“少一层”
- 右侧 badge / 日期切换保持原行为

完成后执行：

- `npm run build`

### 阶段 C：接入 App Mapping / Settings

目标：

- `App Mapping` 接入共享页头
- `Settings` 接入共享页头
- 保存状态与按钮逻辑保持原行为

验收标准：

- 四页左侧标题块节奏统一
- `App Mapping` 与 `Settings` 不再只是“彼此相似”，而是真正和前两页归到同一体系

完成后执行：

- `npm run build`

### 阶段 D：收尾与文档归档

目标：

- 再次自检四页一致性
- 勾选执行单
- 将完成后的执行单归档到 `docs/archive/`

完成后执行：

- `npm run build`
- 如本轮改动影响既有测试链路，再补跑 `npm test`

---

## 8. 完成定义

同时满足以下条件，才算本轮完成：

1. 四页都接入同一页头原语或同一共享页头语义层。
2. 左侧图标块、标题、副标题的视觉节奏一致。
3. 右侧 controls 保持原页面行为，不出现功能回归。
4. `npm run build` 全部通过。
5. 若触发测试链路，则 `npm test` 通过。
6. 执行单已归档，不留在顶层 `docs/`。

---

## 9. 给 GPT-5.3-Codex 的执行提示

请按本文档执行，只处理 `Dashboard / History / App Mapping / Settings` 四页顶部页头统一，优先通过共享 `QuietPageHeader` 原语实现。统一左侧标题块，不强行统一右侧功能区；不要扩展到页面主体布局、图表、表单、Sidebar、Titlebar、Rust / Tauri。每完成一个阶段，更新文档勾选状态并运行 `npm run build`；如果本轮改动影响既有测试链路，再补跑 `npm test`。

---

## 10. 执行勾选状态

### 阶段 A：抽共享页头原语

- [x] 新增 `QuietPageHeader`
- [x] 在 `App.css` 中补齐 Quiet Pro 页头语义样式
- [x] `npm run build` 通过

### 阶段 B：接入 Dashboard / History

- [x] `Dashboard` 接入共享页头
- [x] `History` 接入共享页头
- [x] `History` 补上与其他页一致的左侧图标块
- [x] `npm run build` 通过

### 阶段 C：接入 App Mapping / Settings

- [x] `App Mapping` 接入共享页头
- [x] `Settings` 接入共享页头
- [x] 保存状态与按钮逻辑保持原行为
- [x] `npm run build` 通过

### 阶段 D：收尾与文档归档

- [x] 再次自检四页一致性
- [x] 勾选执行单
- [x] `npm run build` 通过
- [ ] 如影响既有测试链路，补跑 `npm test`
