# Phase 0 现状审计

## 1. 目的

本文档用于完成迁移清单中 `Phase 0` 的两项基础工作：

- 梳理当前 session 边界推断代码路径
- 记录当前已知失效场景

这份文档描述的是当前实现的真实行为，不代表目标架构。

## 2. 当前 session 边界推断路径

## 2.1 采样入口

当前活跃窗口与 AFK 状态由 Rust 侧定时采样：

- `src-tauri/src/lib.rs`
  - 后台循环每 2 秒调用一次 `tracker::get_active_window()`
  - 通过 `active-window-changed` 事件发给前端
- `src-tauri/src/tracker.rs`
  - 读取前台窗口
  - 读取系统原生 `idle_time_ms`
  - 按 AFK 阈值判断 `is_afk`

当前这里采集到的是一个合并后的窗口状态对象：

- `title`
- `exe_name`
- `process_path`
- `is_afk`
- `idle_time_ms`

## 2.2 前端初始化路径

当前应用启动后，`src/hooks/useWindowTracking.ts` 负责 session 主控：

1. 读取设置
2. 把 AFK 阈值同步到 Rust
3. 读取数据库里是否存在未结束的 active session
4. 如果有，就直接调用 `endActiveSession(_settings.min_session_secs)`
5. 读取当前窗口
6. 调用 `syncCurrentWindow(currentWin)`
7. 开始监听 `active-window-changed`

这意味着：

- 启动恢复目前是“看到未结束 session 就按当前时间直接收尾”
- 启动恢复没有复用当前窗口的 `idle_time_ms`
- 启动恢复没有显式区分崩溃、休眠、锁屏、正常关闭

## 2.3 实时边界推断路径

当前每次收到窗口采样后，会进入：

- `useWindowTracking.ts -> applyWindowSync`
- `trackingLifecycle.ts -> planWindowTransition`

当前规则如下：

### 可追踪窗口条件

窗口只有在同时满足下面条件时才被认为是可追踪的：

- 有 `exe_name`
- `is_afk === false`
- `ProcessMapper.shouldTrack(exe_name) === true`

### 触发边界的条件

只要发生以下任一情况，就会被认为发生了切换：

- `exe_name` 变化
- `title` 变化
- 上一个窗口是否可追踪，与当前窗口是否可追踪，状态发生变化

### 产生的动作

- 上一个窗口可追踪且发生切换 -> 结束旧 session
- 当前窗口可追踪且发生切换 -> 开启新 session
- 如果是“从可追踪 -> AFK”，结束时间会回溯为 `now - idle_time_ms`

这说明当前实现是：

- 以“窗口切换”作为主边界
- 以“标题变化”作为次边界
- 以“AFK 进入”作为截断边界

## 2.4 数据库存储路径

当前最终结果直接写到 `src/lib/db.ts` 的 `sessions` 表。

### 开始 session

- `startSession()`
  - 先读取当前 active session
  - 如果 `exe_name + window_title` 与当前完全相同，则跳过
  - 否则直接插入一条新的未结束 session

### 结束 session

- `endActiveSession(minSessionSecs, endTimeOverride?)`
  - 一次性取出所有 `end_time IS NULL` 的 session
  - 用 `endTimeOverride ?? Date.now()` 作为收尾时间
  - 如果结束时间早于开始时间，则钳制到 `start_time`
  - 如果时长小于最小时长阈值，则删除

这说明当前 `sessions` 既是原始事实，也是最终结果。

## 2.5 应用关闭路径

当前关闭路径在 `useWindowTracking.ts` 中：

- 监听 `beforeunload`
- 直接调用 `endActiveSession(settingsRef.current.min_session_secs)`

这里没有 `await`，也没有更底层的生命周期保障。

## 2.6 查询与展示路径

当前 dashboard/history 会直接从 `sessions` 读取：

- 已结束 session 使用持久化的 `duration`
- 未结束 session 使用 `now - start_time` 临时计算

这意味着只要有遗留 active session，查询层就会继续把它当成正在增长的时长。

## 3. 当前已知失效场景

## 3.1 启动恢复会按当前时间直接收尾遗留 session

现状：

- 如果应用异常退出或关闭收尾失败，数据库里会留下未结束 session
- 下次启动时，代码会直接按“当前时间”结束它

风险：

- 休眠、锁屏、离开电脑、夜间关机后的时间，仍可能被计进上一段 session

当前状态：

- 这是已知风险，尚未解决

## 3.2 `beforeunload` 收尾是 fire-and-forget

现状：

- 关闭窗口时会调用 `endActiveSession(...)`
- 但调用没有等待完成，也没有更可靠的系统级退出信号兜底

风险：

- 如果关闭过快、进程异常退出或 WebView 生命周期太短，最后一次 session 收尾可能写不进去

当前状态：

- 这是已知风险，尚未解决

## 3.3 没有显式的 lock / unlock / suspend / resume / shutdown 事件

现状：

- 当前只依赖轮询窗口状态和 AFK 状态
- 没有独立的电源/生命周期事件流

风险：

- 某些场景只能靠“下一次采样”或“下次启动”倒推出边界
- 边界解释力不足，难以做审计

当前状态：

- 这是目标架构要解决的核心缺口之一

## 3.4 `sessions` 直接承担了事实和结果两种角色

现状：

- 当前没有 raw event 层
- 历史数据一旦写成 `sessions`，后面很难重算

风险：

- 如果边界算法有 bug，历史数据已经被最终化，修复后也无法方便重建

当前状态：

- 这是架构性风险，尚未解决

## 3.5 查询层会把遗留 active session 继续算增长

现状：

- `getDailyStats`、`getHistoryByDate`、`getWeeklyStats` 对未结束 session 都会用 `now - start_time` 计算

风险：

- 只要有遗留 active session，统计就会持续虚高

当前状态：

- 该风险与“启动恢复直接按当前时间收尾”相互耦合

## 4. Phase 0 已补充的测试关注点

本阶段已经把以下当前行为用测试钉住：

- 同一 exe 仅标题变化时，也会产生 session 边界
- 从可追踪窗口切换到未追踪但非 AFK 窗口时，会结束 session，但不会回溯截断
- 没有前一个可追踪窗口时，AFK 轮询不会凭空结束 session
- 当结束时间早于开始时间时，最小时长过滤会把这类 session 当作零时长清理候选

这些测试的作用是：

- 在后续重构前先固定当前行为
- 避免迁移过程中把尚未明确决定要改的行为悄悄改掉

## 5. Phase 0 结论

当前链路已经具备基础可用性，但它的核心问题不是单点 bug，而是结构问题：

- 边界推断过早
- 生命周期信息不足
- 恢复逻辑依赖事后猜测
- `sessions` 过早承担最终真相角色

因此，Phase 0 的结论是：

- 当前链路可以继续作为迁移期间的运行路径
- 但不适合作为长期正确性模型继续叠补丁
