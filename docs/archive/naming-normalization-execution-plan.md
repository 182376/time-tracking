# 命名规范化执行清单

## 文档定位

这是一份阶段性执行文档，用来规范 `Time Tracker` 的 Rust、Tauri IPC、SQLite、TypeScript/React 命名边界。

它不是一次性全仓库重命名计划。执行目标是把不同技术栈的命名习惯隔离在正确边界内，避免 Rust / SQLite 的 `snake_case` 泄露到前端业务代码，也避免前端的 `camelCase` 反向污染 Rust 和数据协议。

完成后，需要把稳定规则回写到 `docs/architecture.md`，再将本执行文档移入 `docs/archive/`。

## 总目标

- [x] Rust 侧命名统一遵守 Rust 习惯。
- [x] 前端业务代码统一遵守 TypeScript / React 习惯。
- [x] Tauri IPC、SQLite、event、reason 等协议命名保持稳定，不为表面统一破坏兼容。
- [x] Raw DTO 只出现在边界层，不进入 `app/*`、`features/*`、`shared/types/*` 的前端模型。
- [x] 建立可验证的命名防线，后续新代码不再把 raw 字段散到业务层。

## 非目标

- [x] 不为了命名美观重排整个目录。
- [x] 不批量改 Tauri command 名称，例如 `cmd_get_update_snapshot`。
- [x] 不批量改 event / reason 字符串，例如 `tracking-status-changed`。
- [x] 不批量改 SQLite 表名或字段名。
- [x] 不在同一轮里同时重构 tracking、update、history、settings 的全部数据形态。
- [x] 不改产品行为，只做命名边界和类型转换收口。

## 命名规则

### Rust 侧

- [x] 文件名、模块名、函数名、变量名、struct 字段使用 `snake_case`。
- [x] 类型、struct、enum、trait 使用 `PascalCase`。
- [x] 常量使用 `SCREAMING_SNAKE_CASE`。
- [x] 多词 Rust 文件名使用 `_`，例如 `loop_state.rs`、`power_lifecycle.rs`。
- [x] 单词 Rust 文件名不强行加 `_`，例如 `support.rs`。
- [x] serde 输出默认允许 `snake_case`，枚举协议值继续使用既有 `kebab-case`。

### 前端侧

- [x] React 组件文件使用 `PascalCase.tsx`。
- [x] Hook 文件和函数使用 `useXxx.ts` / `useXxx`。
- [x] Service、gateway、helper 文件使用 `lowerCamelCase.ts`。
- [x] 类型和 interface 使用 `PascalCase`。
- [x] 普通变量、函数、props 使用 `camelCase`。
- [x] 常量使用 `SCREAMING_SNAKE_CASE`。

### 协议和数据边界

- [x] Tauri command 名称保持 `snake_case`。
- [x] Tauri command 参数在 invoke 边界按现状处理，不做无收益重命名。
- [x] Tauri event 名称保持 `kebab-case`。
- [x] tracking data changed reason 保持 `kebab-case`。
- [x] SQLite 表名和字段名保持 `snake_case`。
- [x] Raw DTO 类型命名为 `RawXxxDto` 或 `RawXxxSnapshot`。
- [x] 前端业务模型类型命名为 `Xxx` / `XxxSnapshot`，字段使用 `camelCase`。

## 允许 raw 命名出现的位置

- [x] `src/platform/**`
- [x] `src/features/*/services/*ReadModel.ts` 内部的数据库 raw row 区域
- [x] `src-tauri/**`
- [x] 测试中的 raw payload fixture，前提是类型名明确带 `Raw`

## 不允许 raw 命名长期出现的位置

- [x] `src/app/**`
- [x] `src/features/*/components/**`
- [x] `src/features/*/hooks/**`
- [x] `src/features/*/services/*ViewModel.ts`
- [x] `src/shared/types/**` 的前端模型类型
- [x] `src/shared/lib/**` 的通用业务函数入参和返回值

## 当前初步判断

- [x] Rust 文件命名整体已经符合 `snake_case`。
- [x] 前端文件命名整体已经符合 React / TS 习惯。
- [x] `src/shared/types/tracking.ts` 仍暴露 Rust 风格字段，例如 `is_tracking_active`、`changed_at_ms`。
- [x] `src/shared/types/update.ts` 仍暴露 Rust 风格字段，例如 `current_version`、`release_notes`。
- [x] dashboard / history / settings 仍有 SQLite row 字段进入 feature 代码，例如 `start_time`、`end_time`、`exe_name`、`total_duration`。
- [x] widget / app shell 仍直接读取 tracking raw 字段，例如 `trackingStatus.is_tracking_active`。

## 阶段 0：执行前保护

- [x] 查看当前工作区变更，确认不覆盖用户或其他任务的未提交修改。
- [x] 记录本轮只处理命名边界，不混入产品行为改动。
- [x] 如果已有 tracking 行为改动未稳定，先完成对应验证后再开始命名迁移。
- [x] 每个阶段结束后单独验证，避免一次性改太多。

建议验证：

```bash
npm run check:full
```

如果只改文档，可不运行构建。

## 阶段 1：固化规则文档

- [x] 在 `docs/architecture.md` 增加“命名与跨层协议”章节。
- [x] 明确 Rust / 前端 / IPC / SQLite / event / reason 的命名规则。
- [x] 明确 raw DTO 只能留在边界层。
- [x] 明确 `src/shared/types/**` 默认承载前端模型，不承载 raw DTO。
- [x] 明确例外必须带 `Raw` 前缀或放入允许目录。
- [x] 保持中文文档为 UTF-8，不通过 PowerShell 重定向写入。

验收：

- [x] 长期规则能解释为什么 `loop_state.rs` 有 `_` 而 `support.rs` 没有。
- [x] 长期规则能解释为什么前端不应该继续使用 `is_tracking_active`。
- [x] 长期规则不要求破坏现有 IPC、event、SQLite 兼容。

## 阶段 2：Tracking IPC 样板迁移

目标：先把 tracking 作为第一条完整样板链路。

### 类型拆分

- [x] 在边界层定义 `RawTrackingWindowSnapshot`。
- [x] 在边界层定义 `RawTrackingStatusSnapshot`。
- [x] 在边界层定义 `RawCurrentTrackingSnapshot`。
- [x] 在边界层定义 `RawTrackingDataChangedPayload`。
- [x] 将 raw parser 限定在 `src/platform/runtime/**` 或明确的 raw DTO 文件。
- [x] 在前端模型中使用 `TrackingWindowSnapshot`、`TrackingStatusSnapshot`、`CurrentTrackingSnapshot`，字段改为 `camelCase`。

字段映射建议：

- [x] `root_owner_hwnd` -> `rootOwnerHwnd`
- [x] `process_id` -> `processId`
- [x] `window_class` -> `windowClass`
- [x] `exe_name` -> `exeName`
- [x] `process_path` -> `processPath`
- [x] `is_afk` -> `isAfk`
- [x] `idle_time_ms` -> `idleTimeMs`
- [x] `is_tracking_active` -> `isTrackingActive`
- [x] `sustained_participation_active` -> `sustainedParticipationActive`
- [x] `sustained_participation_kind` -> `sustainedParticipationKind`
- [x] `sustained_participation_state` -> `sustainedParticipationState`
- [x] `sustained_participation_signal_source` -> `sustainedParticipationSignalSource`
- [x] `sustained_participation_reason` -> `sustainedParticipationReason`
- [x] `sustained_participation_diagnostics` -> `sustainedParticipationDiagnostics`
- [x] `changed_at_ms` -> `changedAtMs`

### Gateway 收口

- [x] `trackingRuntimeGateway.ts` 接收 raw payload。
- [x] `trackingRuntimeGateway.ts` 对外只返回 camelCase 前端模型。
- [x] event listener 内部先 parse raw，再 map 成前端模型。
- [x] 业务层不直接 import raw 类型。

### 业务层替换

- [x] 更新 `src/app/hooks/useWindowTracking.ts`。
- [x] 更新 `src/app/services/appRuntimeBootstrapService.ts`。
- [x] 更新 `src/app/AppShell.tsx`。
- [x] 更新 `src/app/widget/widgetViewModel.ts`。
- [x] 更新 `src/app/widget/WidgetShell.tsx`。
- [x] 更新 tracking lifecycle 相关测试 fixture。
- [x] 更新 widget view model 相关测试 fixture。

### 验证

- [x] `npm test`
- [x] `npm run test:replay`
- [x] `npm run build`
- [x] 如果 Rust tracking 也有同步改动，追加 `npm run check:rust`。

## 阶段 3：Update IPC 迁移

目标：复用 tracking 样板，把 update 也收成 raw DTO + frontend model。

### 类型拆分

- [x] 定义 `RawUpdateSnapshot`。
- [x] 保留 raw enum 字符串协议，例如 `up_to_date`。
- [x] 定义前端 `UpdateSnapshot`，字段使用 `camelCase`。

字段映射建议：

- [x] `current_version` -> `currentVersion`
- [x] `latest_version` -> `latestVersion`
- [x] `release_notes` -> `releaseNotes`
- [x] `release_date` -> `releaseDate`
- [x] `error_message` -> `errorMessage`
- [x] `error_stage` -> `errorStage`
- [x] `downloaded_bytes` -> `downloadedBytes`
- [x] `total_bytes` -> `totalBytes`
- [x] `release_page_url` -> `releasePageUrl`
- [x] `asset_download_url` -> `assetDownloadUrl`

### Gateway 和 UI 替换

- [x] `updateRuntimeGateway.ts` 对外只返回前端 `UpdateSnapshot`。
- [x] 更新 `src/features/update/services/updateViewModel.ts`。
- [x] 更新 `src/features/update/components/**`。
- [x] 更新 `src/app/hooks/useUpdateState.ts`。
- [x] 更新 `src/features/settings/components/Settings.tsx` 中的初始 update snapshot。

### 验证

- [x] `npm run test:update`
- [x] `npm run build`

## 阶段 4：Settings 与桌面行为边界

目标：不要让 SQLite / Rust 风格字段继续作为 settings 页面状态长期扩散。

### 盘点

- [x] 盘点 `AppSettings` 当前字段来源。
- [x] 区分 SQLite raw settings、运行时 settings、前端 settings draft。
- [x] 确认哪些字段必须保留为数据库 key，例如 `min_session_secs`。
- [x] 确认前端 draft 是否需要转换为 `minSessionSecs` 等 camelCase 字段。

### 收口

- [x] 若变更范围可控，定义 `RawAppSettings` 和 `AppSettings`。
- [x] persistence gateway 内部负责 raw <-> model 转换。
- [x] settings 页面只读取 camelCase draft。
- [x] 保存时由 service/gateway 映射回 raw key。

### 验证

- [x] `npm run test:settings`
- [x] `npm run build`

## 阶段 5：Dashboard / History Read Model 收口

目标：SQLite row 可以是 `snake_case`，但 UI 和 view model 不直接使用 raw row 字段。

### History

- [x] 定义 `RawHistorySessionRow`。
- [x] 将 `start_time` -> `startTime`。
- [x] 将 `end_time` -> `endTime`。
- [x] 将 `exe_name` -> `exeName`。
- [x] 将 `total_duration` -> `totalDuration`。
- [x] 确认 timeline、merge、formatting 函数只接收前端模型。

### Dashboard

- [x] 定义 `RawDashboardStatRow`。
- [x] 将 `app_name` -> `appName`。
- [x] 将 `exe_name` -> `exeName`。
- [x] 将 `total_duration` -> `totalDuration`。
- [x] 将 `suspicious_duration` -> `suspiciousDuration`。
- [x] 确认 dashboard component 不直接读取 raw row 字段。

### 验证

- [x] `npm test`
- [x] `npm run test:replay`
- [x] `npm run build`

## 阶段 6：命名防线

目标：迁移后防止 raw 命名重新扩散。

- [x] 增加轻量检查脚本或测试。
- [x] 默认扫描 `src/app/**`、`src/features/**`、`src/shared/types/**`。
- [x] 禁止常见 raw 字段进入业务层，例如 `is_tracking_active`、`changed_at_ms`、`start_time`、`end_time`、`exe_name`。
- [x] 允许名单包括 `src/platform/**`、明确的 `Raw*` 类型定义、测试 raw fixture。
- [x] 将检查接入合适的 npm script。
- [x] 如果误报太多，先用 allowlist 收敛，不要让检查阻塞真实修复。

验证：

- [x] 新检查能发现一个故意放入业务层的 raw 字段。
- [x] 新检查不会阻止 `src/platform/**` 中的 raw DTO。
- [x] `npm run check` 通过。

## 阶段 7：长期文档回写与归档

- [x] 将最终命名规则回写到 `docs/architecture.md`。
- [x] 如果新增了检查脚本，将规则简要写入 `docs/engineering-quality.md`。
- [x] 确认本执行文档不再是 active plan。
- [x] 将本文件移动到 `docs/archive/`。

## 最终验收标准

- [x] Rust 文件、模块、函数、字段没有为了迎合前端而改成 camelCase。
- [x] 前端业务代码不再读取 tracking / update IPC 的 raw snake_case 字段。
- [x] 前端组件不再读取 SQLite raw row 字段。
- [x] Raw DTO 命名清晰，边界明确。
- [x] `src/platform/**` 成为跨端命名转换的主要位置。
- [x] `src/shared/types/**` 面向前端模型，而不是协议转储。
- [x] 命名检查能阻止新 raw 字段扩散。
- [x] `npm run check:full` 通过。

## 风险与处理

- [x] 如果某阶段改动超过 15 个文件，拆成更小阶段。
- [x] 如果出现大量测试 fixture 变更，优先补 mapper 测试，避免只改快照。
- [x] 如果 SQLite read model 收口影响范围过大，先保留 raw row 在 read model 内部，不向 component 继续扩散。
- [x] 如果某个协议字段已有外部兼容风险，不重命名协议，只在前端边界映射。
- [x] 如果命名检查误伤稳定代码，先加明确 allowlist，再逐步收紧。

## 推荐执行顺序

- [x] 阶段 1：固化规则文档。
- [x] 阶段 2：Tracking IPC 样板迁移。
- [x] 阶段 3：Update IPC 迁移。
- [x] 阶段 6：先加基础命名防线。
- [x] 阶段 4：Settings 边界收口。
- [x] 阶段 5：Dashboard / History read model 收口。
- [x] 阶段 7：长期文档回写与归档。
