# 性能目标

## 1. 文档定位

本文定义 `Time Tracker` 当前阶段的软件性能目标。

这里的“性能”只讨论：

- 启动速度
- 页面响应与刷新速度
- CPU / 内存 / I/O 占用
- SQLite 查询压力
- 后台轮询、缓存与预热的收益和代价

它不直接讨论代码是否优雅，也不直接替代可靠性与验证目标。

相关文档：

- 工程质量总览见 [`engineering-quality-target.md`](./engineering-quality-target.md)
- 代码质量目标见 [`code-quality-target.md`](./code-quality-target.md)
- 可靠性与验证目标见 [`reliability-and-validation-target.md`](./reliability-and-validation-target.md)

---

## 2. 为什么现在要单独看性能

当前仓库已经出现了一些非常现实的性能相关信号：

- 前端已经在做启动预热  
  例：`src/app/services/startupPrewarmService.ts`
- dashboard/history 已经在做 snapshot cache  
  例：`src/features/dashboard/services/dashboardSnapshotCache.ts`
- tracking runtime 正在做固定周期采样与 heartbeat  
  例：`src-tauri/src/engine/tracking/runtime.rs`
- 前端存在固定刷新与健康轮询逻辑  
  例：`src/app/hooks/useWindowTracking.ts`

这说明性能已经不是“以后再说”的问题，而是已经进入当前实现现实。

如果没有独立的性能文档，后续很容易出现两种偏差：

- 把所有响应慢的问题都误判成代码质量问题
- 为了“性能”做大量没有测量依据的高风险改动

---

## 3. 当前性能关注点

当前阶段，性能更应该关注下面这些真实场景，而不是抽象 benchmark。

## 3.1 启动与首屏

重点关注：

- 冷启动后首个可交互页面出现的时间
- `Dashboard / History / Settings / App Mapping` 首次进入体验
- 预热与缓存是否真的降低了等待感

## 3.2 刷新与读模型

重点关注：

- dashboard/history 的读取、编译、格式化和重算频率
- snapshot cache 是否有效减少不必要重算
- mapping 变更后数据刷新是否存在明显重复计算

## 3.3 运行时轮询与后台资源

重点关注：

- tracking 轮询周期带来的 CPU 压力
- heartbeat / tracker health / 同步逻辑的后台成本
- 长时间运行时是否存在明显资源浪费

## 3.4 SQLite 与持久化压力

重点关注：

- 高频查询是否在 UI 刷新链路上过重
- 读模型查询是否存在可以减少的重复访问
- 备份/恢复与设置读写是否保持在合理成本内

---

## 4. 当前阶段的性能目标

当前阶段的性能优化，不追求“极限跑分”，而追求：

- 启动和首屏感知更稳
- 高频页面切换和刷新更顺
- 后台轮询和健康检测成本合理
- 查询与缓存策略可解释
- 长时间运行不过度消耗资源

换句话说，当前性能目标更偏向：

- `可感知流畅`
- `资源开销合理`
- `长期运行稳定`

而不是：

- 牺牲可维护性的极端微优化

---

## 5. 当前明确非目标

这轮性能优化默认不追求：

- 没有测量依据的低层微优化
- 为性能而引入大规模抽象层
- 用难懂特例换取不明确的小收益
- 以牺牲可靠性为代价压缩路径
- 用复杂缓存掩盖边界或正确性问题

---

## 6. 当前建议优先看的性能热点

## 6.1 启动预热与缓存策略

- `src/app/services/startupPrewarmService.ts`
- `src/features/dashboard/services/dashboardSnapshotCache.ts`
- `src/features/history/services/historySnapshotCache.ts`

这里最重要的问题不是“有没有缓存”，而是：

- 缓存是否命中真正高频场景
- 预热是否减少了感知等待
- 预热失败时是否仍然保持稳定

## 6.2 读模型重算链路

- `src/shared/lib/sessionReadCompiler.ts`
- `src/features/dashboard/services/dashboardReadModel.ts`
- `src/features/history/services/historyReadModel.ts`

这里是当前性能与可靠性同时交汇的热点，应优先避免无证据的重写，而先弄清楚重算频率和成本。

## 6.3 tracking runtime 与后台轮询

- `src-tauri/src/engine/tracking/runtime.rs`
- `src/app/hooks/useWindowTracking.ts`
- `src/app/services/trackerHealthPollingService.ts`

这里最重要的是：

- 固定轮询与事件驱动是否平衡
- 健康检测是否有不必要的重复开销
- 长时间运行下的资源消耗是否保持合理

---

## 7. 阶段性完成标准

当前性能专项可以认为“基本收住”，至少应满足大部分条件：

- 性能目标已从模糊感觉变成明确场景
- 有一份可重复使用的性能基线口径
- 高优先级性能热点有了低风险改进方案
- 缓存、预热、轮询等策略的收益与代价更清楚
- 后续性能优化不再依赖拍脑袋判断

---

## 8. 给 Codex 与后续协作者的默认约束

- 先定义性能场景，再做优化
- 没有测量依据，不做高风险性能重构
- 不把性能问题伪装成代码整洁问题
- 不用复杂缓存去掩盖边界或正确性问题
- 任何性能优化都不能削弱 [`reliability-and-validation-target.md`](./reliability-and-validation-target.md) 中的可信性目标
