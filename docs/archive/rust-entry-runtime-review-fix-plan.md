# Rust 入口与运行时边界验收修正单

Document Type: One-off Review Fix Plan

## 1. 目的

本修正单用于处理 `docs/rust-entry-runtime-boundary-execution-plan.md` 的验收遗留问题。
本轮只修两类问题：
- sqlite pool 基础能力重复分散
- `commands/backup.rs` 仍过厚，尚未成为薄 command handler

## 2. 范围

### 要做
- 去掉重复 sqlite pool 获取实现
- 明确 sqlite pool 基础能力唯一落点
- 继续削薄 `commands/backup.rs`
- 将 backup 核心业务实现迁出 command 文件
- 同步文档状态与代码一致

### 不做
- 不重写 tracking 核心算法
- 不改 backup 数据格式
- 不改数据库 schema
- 不扩展前端重构
- 不继续发散新的大规模 Rust 重构

## 3. 问题 A：sqlite pool 能力分散

### 执行项
- [x] A1. 选定 sqlite pool 获取能力唯一落点
- [x] A2. 删除重复的 `wait_for_sqlite_pool(...)` 实现
- [x] A3. 统一 `tracking_runtime.rs`、`backup.rs`、`tray.rs` 调用入口
- [x] A4. 保留在 `app/runtime.rs` 并说明原因

### 验收
- [x] 仓库只保留一份 sqlite pool 获取实现
- [x] 调用方不再复制基础能力
- [x] 能清楚解释该能力为何落在当前位置

## 4. 问题 B：backup command 过厚

### 执行项
- [x] B1. 盘点 command 与业务实现边界
- [x] B2. 将路径解析、payload 读写、restore 事务、preview 兼容性迁出 command
- [x] B3. `commands/backup.rs` 保留为 Tauri 命令入口
- [x] B4. 测试随业务实现迁移，保留 restore 回滚验证

### 验收
- [x] `commands/backup.rs` 明显变薄
- [x] backup 业务实现归属更明确
- [x] restore / preview / export 行为不变

## 5. 文档修正

- [x] C1. A/B 都完成，保持 boundary 执行文档完成状态
- [x] C2. 不触发回调未完成项
- [x] C3. 在本修正单补充变更记录与验收结果
- [x] C4. architecture-target Rust 阶段状态不变（仍“进行中”）

## 6. 完成定义

- [x] sqlite pool 基础能力不再重复实现
- [x] `commands/backup.rs` 不再承载大段业务实现
- [x] 文档状态与代码一致
- [x] `cargo check` 通过
- [x] `npm run build` 通过

## 7. 本轮修正记录

- sqlite pool 单一落点：
  - 保留 `src-tauri/src/app/runtime.rs::wait_for_sqlite_pool(...)`。
  - 删除 `src-tauri/src/engine/tracking_runtime.rs` 内重复实现并统一复用。
- backup command 收口：
  - 新增 `src-tauri/src/data/backup.rs` 承接 backup 业务实现。
  - `src-tauri/src/commands/backup.rs` 收敛为薄命令入口，仅做参数接入与调度。
- 验证：
  - `cargo check` 通过。
  - `npm run build` 通过。
