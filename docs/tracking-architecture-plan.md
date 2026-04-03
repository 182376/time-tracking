# 追踪核心迁移任务清单

## 1. 目标

本文档是追踪核心升级的执行清单。

目标是在保持现有技术栈不变的前提下，提升计时正确性、异常恢复能力和可审计性。

保持不变的技术栈如下：

- Tauri v2
- Rust
- React
- TypeScript
- SQLite，使用 `@tauri-apps/plugin-sql`
- Windows API，使用 `windows` crate

## 2. 约束原则

- 所有实现都必须是本仓库的原创实现。
- 可以借鉴外部产品的架构思路和产品行为，但不能复制任何第三方源码。
- 迁移过程必须是渐进式且可回滚的。
- 在新链路被验证之前，现有追踪能力必须持续可用。
- 在淘汰旧的 session 逻辑之前，原始事件必须先成为事实来源。

## 3. 目标终态

我们要从当前这种模式：

```text
轮询当前状态 -> 立即推断 session -> 直接写入最终 session
```

迁移到这种模式：

```text
采集原始事实 -> 持久化原始事件 -> 编译生成派生 sessions
```

## 4. 当前执行清单

## Phase 0 - 稳住当前链路

目标：

- 在准备迁移期间，保证当前应用可正常使用

任务：

- [x] 保留最近的 AFK 截断修复，作为短期保护措施。
- [x] 扩展 AFK、休眠、重启、异常退出恢复相关的生命周期测试。
- [x] 列出当前所有推断 session 边界的代码位置。
- [x] 把当前已知失效场景集中记录到一处。

退出条件：

- 当前追踪继续可用
- 生命周期缺口已被记录
- 基线测试足够可靠，能拦截回归

## Phase 1 - 增加原始事件存储

目标：

- 在不改变现有可见行为的前提下，开始存储原始事实

任务：

- [x] 为 `raw_window_events` 添加数据库迁移。
- [x] 为 `raw_presence_events` 添加数据库迁移。
- [x] 为 `raw_power_events` 添加数据库迁移。
- [x] 定义最小共享事件结构和命名规范。
- [x] 现阶段保持现有 `sessions` 表不动。
- [x] 在当前 session 流程旁边增加 raw event 双写。

退出条件：

- UI 行为与当前保持一致
- 原始事件和旧 `sessions` 覆盖相同时间段
- 如有需要，可以方便地关闭 raw event 写入

## Phase 2 - 增加可靠写入语义

目标：

- 在关闭、重启或临时写入失败时，避免原始事实丢失

任务：

- [x] 设计本地追加式队列，或等价的可靠写入路径。
- [x] 在事件被视为已接受前，先把原始事件持久化到队列。
- [x] 应用启动时安全重放队列中的事件。
- [x] 防止重复重放导致无效数据。
- [x] 增加“崩溃发生在 flush 前”和“重启后重放”的测试。

退出条件：

- 原始事件写入能扛住常见关闭竞争条件
- 启动重放是确定性的
- 已有重复保护

## Phase 3 - 采集电源与生命周期边界

目标：

- 将 suspend、resume、lock、unlock、startup、shutdown 视为一等事实

任务：

- [x] 实现 `startup` 事件采集。
- [x] 在可行范围内实现 `shutdown` 事件采集。
- [x] 实现 `lock` 和 `unlock` 事件采集。
- [x] 实现 `suspend` 和 `resume` 事件采集。
- [x] 将所有生命周期边界写入 `raw_power_events`。
- [x] 增加测试，证明这些边界会确定性地截断 active time。

退出条件：

- 电源与生命周期切换已被显式记录
- 在这些场景里，active session 不再只靠 AFK 间接推断

## Phase 4 - 构建 Session Compiler

目标：

- 在不切换 UI 的前提下，从原始事实推导出规范 session

任务：

- [x] 实现按时间排序的原始时间线加载器。
- [x] 合并身份相同的相邻窗口 heartbeat。
- [x] 合并状态相同的相邻 presence heartbeat。
- [x] 应用来自 raw power events 的硬边界。
- [x] 对 `可追踪窗口` 与 `presence=active` 取交集。
- [x] 生成 `derived_sessions`。
- [x] 对派生结束时间做钳制，防止出现负数时长。
- [x] 在派生完成后再应用最小时长过滤，而不是提前过滤。
- [x] 存储边界原因，例如 `window_change`、`idle`、`lock`、`suspend`、`shutdown`。

退出条件：

- `derived_sessions` 可以从同一批 raw data 反复稳定构建
- 重建结果稳定一致
- 在不依赖旧的直接 session 路径时，也能得到规范 session

## Phase 5 - 构建对比工具

目标：

- 在切 UI 之前，先证明新链路可靠

任务：

- [ ] 构建 legacy `sessions` 和 `derived_sessions` 的按天 diff。
- [ ] 展示每个 app、每个 session 块的时长差异。
- [ ] 尽可能展示某个差异产生的原因。
- [ ] 区分“预期差异”和“真实回归”。
- [ ] 建立一套可重复的差异审查流程。

退出条件：

- 可以对同一天的新旧结果做并排比较
- 预期差异可以被解释
- 剩余不匹配项是可行动的

## Phase 6 - 将读取链路切到 Derived Sessions

目标：

- 让报表读取新来源，同时保持回滚简单

任务：

- [ ] 将 dashboard 查询切到 `derived_sessions`。
- [ ] 将 history 查询切到 `derived_sessions`。
- [ ] 在切换期间保留一个简单开关，可回退到 legacy `sessions` 查询。
- [ ] 验证反复刷新和重建后，总量仍然稳定。

退出条件：

- 用户可见报表已从 `derived_sessions` 读取
- 必要时仍可回滚到 legacy 读取路径

## Phase 7 - 退役旧的 Session 主控逻辑

目标：

- 不再把当前 React hook 当作规范 session 引擎

任务：

- [ ] 移除前端 hook 对 session 边界的直接主控。
- [ ] 保留前端编排职责，但原始事件成为唯一写入目标。
- [ ] 只有在新链路可信后，才删除旧的 transition 逻辑。
- [ ] 清理无用的兼容分支。

退出条件：

- 系统中只剩下一条规范派生路径
- 旧的直接 session 变更逻辑已消失

## Phase 8 - 增加产品控制能力

目标：

- 在核心稳定后，补上成熟产品能力

任务：

- [ ] 增加 off-the-record 模式。
- [ ] 增加追踪时间计划能力。
- [ ] 增加 do-not-track 规则。
- [ ] 增加审计视图，解释为什么某段 session 会存在。
- [ ] 评估长时间离开后的 offline-time prompt。

退出条件：

- 用户可以控制哪些内容被追踪
- 审计能力在产品中可见

## 5. 跨阶段测试清单

- [ ] 同窗口 heartbeat 合并
- [ ] 可追踪窗口切换
- [ ] AFK 回溯截断
- [ ] 活跃中进入 suspend
- [ ] suspend 后 resume
- [ ] 活跃中 lock
- [ ] unlock 后窗口未变化
- [ ] 优雅关闭前发生异常退出
- [ ] 启动时重放排队中的原始事件
- [ ] 派生后再执行最小时长过滤
- [ ] UI 展示合并不改变规范总时长

## 6. 评审关口

在以下节点暂停并评审：

- [ ] raw event schema 设计完成后
- [ ] dual-write 开始产出数据后
- [ ] 生命周期事件采集完成后
- [ ] compiler 输出可用后
- [ ] legacy 与 derived diff 报告审查后
- [ ] 切换 UI 读取前
- [ ] 删除旧 session 逻辑前

## 7. 回滚规则

- 如果 raw event 写入不稳定，关闭 dual-write，继续使用 legacy sessions。
- 如果队列重放不稳定，先回退到直接写 raw event，再继续推进。
- 如果 compiler 一致性较差，让它继续离线运行并收集比较数据。
- 如果 UI 数据出现回归，立即切回 legacy `sessions` 读取。

## 8. 完成定义

只有满足以下全部条件，迁移才算完成：

- [ ] suspend 和 resume 不再虚增追踪时长
- [ ] lock 和 unlock 会产生确定性边界
- [ ] 异常重启不会把 idle time 统计过多
- [ ] 同一批 raw events 可以反复重建出相同 sessions
- [ ] 用户可见统计来自 derived sessions
- [ ] 可以通过审计链路解释某段 session 为什么存在
- [ ] 旧的直接 session 变更逻辑已经退役

## 9. 立刻可做的下一批任务

如果现在就启动，先做这些：

- [x] 梳理当前 session 边界推断代码路径
- [x] 定义 raw event schema
- [x] 为 raw event tables 增加 SQLite migrations
- [x] 接上 raw window 和 raw presence 的 dual-write
- [ ] 先做一天数据的 baseline diff 工具

## 10. 参考说明

以下资料仅用于产品与架构灵感参考，不用于源码复用：

- ActivityWatch documentation: https://docs.activitywatch.net/en/latest/
- ActivityWatch FAQ: https://docs.activitywatch.net/en/latest/faq.html
- ActivityWatch GitHub overview: https://github.com/ActivityWatch/activitywatch
- ManicTime tracking documentation: https://docs.manictime.com/win-client/tracking
- RescueTime help center: https://help.rescuetime.com/
- WakaTime plugin and offline heartbeat options: https://wakatime.com/help/creating-plugin
