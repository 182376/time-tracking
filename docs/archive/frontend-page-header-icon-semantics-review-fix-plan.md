# 前端页头图标语义统一修正单

## 1. 文档目的

本修正单用于统一 `Dashboard`、`History`、`App Mapping`、`Settings` 四个一级页面的页头图标语义。

本轮只处理页头图标语义，不处理页头布局、不处理页面主体、不处理 Sidebar 结构，也不扩展到 Rust / Tauri。

---

## 2. 当前问题

上一轮已经统一了四个一级页面的页头结构，但页头图标语义仍然混杂：

- 有的页头图标沿用了侧边栏导航图标
- 有的页头图标换成了内容语义图标
- `Settings` 页头当前使用的闪电图标语义不清晰

这会导致用户在识别页面时，面对两套不同的图标规则：

- Sidebar 图标代表页面
- 页头图标有时代表页面，有时代表内容

这种混用会削弱 Quiet Pro 需要的克制与一致性。

---

## 3. 本轮目标

本轮完成后，应达到：

1. 四个一级页面的页头图标语义完全统一。
2. 页头图标直接跟随侧边栏导航图标。
3. 不再保留“部分用导航语义、部分用内容语义”的混合状态。
4. 用户看到页头时，会立即把它识别为“当前所在页面”，而不是新的内容分类图标。

---

## 4. 范围

### 包含

- `src/features/dashboard/components/Dashboard.tsx`
- `src/features/history/components/History.tsx`
- `src/features/classification/components/AppMapping.tsx`
- `src/features/settings/components/Settings.tsx`

### 不包含

- `QuietPageHeader` 布局结构调整
- 页头文字内容调整
- Sidebar 图标本身改造
- 页面主体视觉重做
- Rust / Tauri 改动

---

## 5. 统一规则

四个一级页面的页头图标，统一采用与侧边栏导航完全一致的图标：

- `Dashboard` 页头图标 = Sidebar 中 `Dashboard` 的图标
- `History` 页头图标 = Sidebar 中 `History` 的图标
- `App Mapping` 页头图标 = Sidebar 中 `App Mapping` 的图标
- `Settings` 页头图标 = Sidebar 中 `Settings` 的图标

明确要求：

- 不要保留 `Settings` 当前的闪电图标
- 不要让 `History` 使用与 Sidebar 不同的日历图标
- 不要让 `Dashboard` 单独使用与 Sidebar 不一致的活动图标

---

## 6. 实施要求

### 阶段 A：统一页头图标接线

目标：

- 调整四个一级页面传给 `QuietPageHeader` 的 `icon`
- 使其与 Sidebar 导航图标一一对应

验收标准：

- 四个一级页面页头图标都能在代码层直接看出与 Sidebar 同源
- 本轮不引入额外图标映射层或复杂抽象

完成后执行：

- `npm run build`

### 阶段 B：收尾与归档

目标：

- 自检页头图标语义是否一致
- 勾选文档状态
- 执行单归档到 `docs/archive/`

完成后执行：

- `npm run build`
- 如果本轮改动影响既有测试链路，再补跑 `npm test`

---

## 7. 完成定义

同时满足以下条件才算完成：

1. 四个一级页面的页头图标与 Sidebar 导航图标一致。
2. 不再存在“内容语义图标”和“导航语义图标”混用的状态。
3. `npm run build` 通过。
4. 如触发测试链路，`npm test` 通过。
5. 执行单已归档，不留在顶层 `docs/`。

---

## 8. 给 GPT-5.3-Codex 的执行提示

请按本文档执行，只修复 `Dashboard / History / App Mapping / Settings` 四个一级页面的页头图标语义统一：页头图标直接跟随侧边栏导航图标，不再混用内容语义图标。不要扩展到页面主体，不改页头布局，不改 Sidebar 结构，不改 Rust / Tauri。每完成一个阶段，更新文档勾选状态并运行 `npm run build`；如果本轮改动影响既有测试链路，再补跑 `npm test`。

---

## 9. 执行勾选状态

### 阶段 A：统一页头图标接线

- [x] 调整四个一级页面传给 `QuietPageHeader` 的 `icon`
- [x] 使其与 Sidebar 导航图标一一对应
- [x] `npm run build` 通过

### 阶段 B：收尾与归档

- [x] 自检页头图标语义一致
- [x] 勾选文档状态
- [x] `npm run build` 通过
- [ ] 如果本轮改动影响既有测试链路，再补跑 `npm test`
