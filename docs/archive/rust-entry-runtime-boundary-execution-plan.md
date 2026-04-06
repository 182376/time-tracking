# Rust 入口与运行时边界收口执行方案

Document Type: One-off Execution Plan

## 1. 目标

本轮目标：只处理 Rust 入口与运行时边界收口，不扩展前端或新的大规模架构重构。

重点：
- 继续瘦身 `src-tauri/src/lib.rs`
- 收紧 `src-tauri/src/app/mod.rs` 职责
- 迁移根目录高价值实现到 `app/commands/platform/engine/data/domain`
- 让 `commands` 更像薄入口

## 2. 完成标准

- [x] `lib.rs` 主要承担模块装配、plugin 注册、invoke 注册与启动 wiring
- [x] `app/mod.rs` 不再膨胀承接大段实现
- [x] `tracking_runtime/tracker/power_watcher` 高价值实现已迁入目标目录
- [x] `commands/backup.rs` 降低对底层细节直接依赖
- [x] sqlite pool / app setup / runtime spawn 落点更清晰
- [x] 不新增新的根目录大文件承接业务逻辑
- [x] `cargo check` 通过
- [x] `npm run build` 通过

## 3. 分阶段结果

### 阶段 A：`lib.rs` 入口瘦身
- [x] A1 盘点直接依赖
- [x] A2 命令注册统一到 `commands::*`
- [x] A3 runtime/setup wiring 收口到 app/runtime
- [x] A4 `lib.rs` 回归装配层

### 阶段 B：App 层职责拆分
- [x] B1 盘点 `app/mod.rs` 职责
- [x] B2 桌面行为同步、sqlite pool、runtime 启动下沉子模块
- [x] B3 `app/mod.rs` 保持协调入口
- [x] B4 子模块命名与职责一致

### 阶段 C：根目录实现迁移
- [x] C1 `tracking_runtime.rs` -> `engine/tracking_runtime.rs`
- [x] C2 `tracker.rs` -> `platform/windows/foreground.rs`
- [x] C3 `power_watcher.rs` -> `platform/windows/power.rs`
- [x] C4 `icon_extractor.rs` -> `platform/windows/icon.rs`，`db_schema.rs` -> `data/migrations.rs`

### 阶段 D：Commands 边界收口
- [x] D1 复核 `commands/settings.rs` 与 `commands/backup.rs` 调用边界
- [x] D2 降低 backup 命令对 app/runtime 内部细节依赖
- [x] D3 可复用语义下沉到合适模块
- [x] D4 command handler 保持薄且可读

### 阶段 E：文档校正
- [x] E1 同步 `docs/architecture-target.md` Rust 阶段状态
- [x] E2 记录迁移与暂留文件
- [x] E3 仅做最小文档修正

## 4. 文件迁移记录

已迁移：
- `src-tauri/src/tracking_runtime.rs` -> `src-tauri/src/engine/tracking_runtime.rs`
- `src-tauri/src/tracker.rs` -> `src-tauri/src/platform/windows/foreground.rs`
- `src-tauri/src/power_watcher.rs` -> `src-tauri/src/platform/windows/power.rs`
- `src-tauri/src/icon_extractor.rs` -> `src-tauri/src/platform/windows/icon.rs`
- `src-tauri/src/db_schema.rs` -> `src-tauri/src/data/migrations.rs`

新增：
- `src-tauri/src/app/runtime.rs`
- `src-tauri/src/commands/tracking.rs`

根目录暂留：
- `src-tauri/src/lib.rs`（入口装配）
- `src-tauri/src/main.rs`（thin launcher）

## 5. 每阶段输出要求（已执行）

- [x] 更新本文档勾选状态
- [x] 说明迁移文件
- [x] 说明根目录迁移与暂留原因
- [x] 运行 `cargo check`
- [x] 运行 `npm run build`
