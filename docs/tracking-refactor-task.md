# Tracking 重构任务

## 文档状态

- [x] 阶段 1：文档落地
- [x] 阶段 2：tracking 生命周期调整
- [x] 阶段 3：原始查询更新
- [x] 阶段 4：session compiler
- [x] 阶段 5：消费方接线
- [x] 阶段 6：验证与测试

## 背景

当前 tracker 已经可以比较稳定地记录基于窗口切换的 session，但原先的统计链路仍存在几类精度问题：

- session 边界依赖 `window_title`，会把同一个应用内的连续使用切碎
- 短 session 在写入阶段就被删除，导致原始事实永久丢失
- 按天查询依赖 `start_time`，导致跨天 session 归属错误
- 时间线分组会把打断间隙也算进持续时长
- 统计、时间线、图表没有复用同一套编译管线

这个任务的目标，是把存储层收敛为“保留原始事实”，再由 UI 在读取阶段把这些原始数据编译为按天裁剪、带过滤规则、适合展示的结果。

## 目标

- [x] 标题变化不再切分同一应用 session
- [x] SQLite 保留原始片段，最小时长过滤改到编译阶段
- [x] 查询按时间重叠范围进行，保证跨天统计正确
- [x] 引入统一的 session compiler，供 dashboard、history 和 timeline 复用
- [x] timeline 为了可读性允许合并，但不能虚增 active duration
- [x] 增加测试，锁定新的行为

## 非目标

- 本轮不做原始 event 存储 schema migration
- 本轮不迁移到 WinEvent hook
- 本轮不重做 dashboard 或 history UI 设计

## 目标行为

### tracking 状态机

- tracking identity 基于 `exe_name` 推导出的 track key
- 标题变化只更新元数据，不触发 session 关闭与重开
- AFK 仍然会关闭当前 session，并把结束时间回溯到最后输入点
- 启动补封口仍然依赖已保存 heartbeat 来截断旧 session

### 存储规则

- SQLite 保留 tracker 写入的原始 session 片段
- 关闭 session 只更新 `end_time` 与 `duration`
- 最小时长过滤在编译阶段执行，而不是写入阶段执行

### 查询与编译规则

- 按天查询时，凡是与目标时间范围重叠的 session 都要被读出
- 编译后的 session 会先裁剪到目标范围，再做聚合
- 相邻且同应用的碎片，如果 gap 很短，会先合并再做过滤
- app stats 从编译后的 session 构建
- timeline 可以跨短中断进行分组，但 `duration` 必须只累计真实 active segment，而不是整段 wall-clock span

## 实施计划

### 阶段 1：文档落地

任务清单：

- [x] 添加本任务文档，记录范围、验收标准和验证方式

### 阶段 2：tracking 生命周期调整

任务清单：

- [x] 修改 transition planner，让 `window_title` 变化不再触发 session 切分
- [x] 保持 AFK 逻辑不变
- [x] 保持启动补封口逻辑不变

### 阶段 3：原始查询更新

任务清单：

- [x] 增加复用型时间范围查询，支持查询与 `[start, end)` 重叠的 session
- [x] 更新 day/history 查询，改为基于 overlap 而不是仅依赖 `start_time`
- [x] 停止在关闭 active session 时删除短 session

### 阶段 4：session compiler

任务清单：

- [x] 新增 compiler，把原始 session 裁剪到目标范围
- [x] 合并短 gap 内的同应用碎片
- [x] 在合并后执行最小时长过滤
- [x] 从编译结果构建 app stats
- [x] 构建 timeline 分组，且不把 interruption gap 算入 active duration
- [x] 构建 7 天汇总，并把跨天时长分配到正确日期

### 阶段 5：消费方接线

任务清单：

- [x] 更新 `useStats`，在构建 dashboard stats 前先编译今日 session
- [x] 更新 `History`，使用编译后的选中日期 session 和 7 天汇总
- [x] 保持 dashboard hourly activity 基于按天裁剪后的编译结果

### 阶段 6：验证与测试

任务清单：

- [x] 增加“同一 exe 下标题变化不再切 session”的测试
- [x] 增加“先合并再过滤短 session”的测试
- [x] 增加“跨天裁剪和按天归属”的测试
- [x] 增加“timeline 合并保持 active duration 正确”的测试

## 验收标准

- [x] 在同一可执行文件内切换文件或标签页，不再产生新 session
- [x] 短于最小时长阈值的片段仍保留在存储中，但会在编译后的 dashboard/history 输出中按规则隐藏
- [x] 跨越午夜的 session 能正确分摊到两个自然日
- [x] timeline 条目可以在短中断下保持视觉连续，但不会虚增 active duration
- [x] 自动化测试覆盖新行为，并能在本地通过

## 风险

- 标题变化不再切分后，历史视图里的碎片数量会比以前更少
- 保留原始微小 session 会轻微增加存储行数
- 跨天修复后，历史总时长可能与旧实现显示不一致，因为旧逻辑本身归属错误

## 验证说明

- 使用现有 Node 测试入口 `tests/trackingLifecycle.test.ts`
- 本轮重点验证确定性的编译逻辑，而不是 UI snapshot
