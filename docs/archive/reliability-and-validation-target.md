# 可靠性与验证目标

## 1. 文档定位

本文定义 `Time Tracker` 当前阶段的可靠性与验证目标。

这里的“可靠性与验证”主要讨论：

- tracking 结果是否可信
- runtime 行为是否稳定
- 数据边界是否安全
- 关键路径是否有足够测试保护
- 发布前是否有足够 gate

它不直接替代代码质量，也不直接替代性能目标。

相关文档：

- 工程质量总览见 [`engineering-quality-target.md`](./engineering-quality-target.md)
- 代码质量目标见 [`code-quality-target.md`](./code-quality-target.md)
- 性能目标见 [`performance-target.md`](./performance-target.md)

---

## 2. 为什么这一维度对当前项目特别重要

`Time Tracker` 不是普通内容应用，而是一个以“可信记录”为核心价值的桌面时间追踪工具。

对这个项目来说，用户真正关心的不是：

- 代码漂不漂亮
- 页面切换快了 20ms 没

而是：

- 它有没有记错
- 它是不是把我的时间串了
- 它恢复备份会不会出问题
- 更新后数据还在不在
- 我能不能持续相信它

因此，可靠性与验证在当前阶段的优先级应高于纯代码整洁和无证据性能优化。

---

## 3. 当前判断

当前仓库在可靠性与验证方面已经有不错基础：

- tracking 主链已有较强测试基础  
  例：`tests/trackingLifecycle.test.ts`
- replay 路径已有单独测试  
  例：`tests/trackingReplay.test.ts`
- update view model 已有单独测试  
  例：`tests/updateViewModel.test.ts`
- runtime 侧已有 watchdog / restart loop 思路  
  例：`src-tauri/src/app/runtime_tasks.rs`
- backup/restore 已有事务回滚测试  
  例：`src-tauri/src/data/backup.rs`

但当前仍存在几个问题：

- 保护仍偏集中在 tracking/session 主链
- 前端热点页面与热点适配层的验证还不够均衡
- 缺少更明确的“改动某类热点时需要补什么验证”的长期口径
- 可靠性目标目前散落在架构、发布和测试中，还没有独立母规则

---

## 4. 当前阶段的可靠性目标

当前阶段主要追求 5 个目标。

## 4.1 目标一：tracking 主链持续可信

重点保护：

- session 切分
- heartbeat
- `AFK / 锁屏 / 睡眠`
- startup seal
- tracking pause / resume

## 4.2 目标二：数据边界持续安全

重点保护：

- SQLite 读写边界
- settings/classification 的持久化行为
- 备份/恢复
- 清理历史

## 4.3 目标三：关键热点有更直接的测试保护

不仅要保护 tracking 核心，还要逐步补足：

- classification 热点行为
- settings 热点行为
- update / backup / gateway 关键路径

## 4.4 目标四：发布前验证有硬门槛

当前最低验证门槛至少应持续保持：

- `npm test`
- `npm run test:replay`
- `npm run build`

涉及 Rust tracking 主链或数据边界时，还应补上：

- `cargo check`

## 4.5 目标五：让“可信”成为可验证的工程事实

长期目标不是口头说“这个产品很可信”，而是让可信性落实为：

- 测试
- 验证门槛
- 数据安全规则
- 发布前检查

---

## 5. 当前明确非目标

这轮可靠性与验证专项不追求：

- 为了覆盖率数字而写大量低价值测试
- 用过度 mock 替代关键逻辑验证
- 把所有验证都堆在单个超大测试文件里
- 在没有风险分层的情况下平均分配验证投入

---

## 6. 当前建议优先看的可靠性热点

## 6.1 tracking 主链

- `tests/trackingLifecycle.test.ts`
- `src-tauri/src/engine/tracking/runtime.rs`
- `src-tauri/src/engine/tracking/startup.rs`
- `src-tauri/src/engine/tracking/transition.rs`

## 6.2 读模型与 replay

- `tests/trackingReplay.test.ts`
- `src/shared/lib/sessionReadCompiler.ts`
- `src/features/dashboard/services/dashboardReadModel.ts`
- `src/features/history/services/historyReadModel.ts`

## 6.3 数据安全与恢复

- `src-tauri/src/data/backup.rs`
- `src-tauri/src/domain/backup.rs`
- `src/features/settings/services/settingsRuntimeAdapterService.ts`

## 6.4 前端热点交互

- `src/features/classification/components/AppMapping.tsx`
- `src/features/settings/components/Settings.tsx`

这些地方当前未必最危险，但如果没有更直接的验证，后续优化很容易把可靠性问题带进去。

---

## 7. 阶段性完成标准

当前可靠性与验证专项可以认为“基本收住”，至少应满足大部分条件：

- tracking 主链关键风险点有明确保护
- backup/restore 与数据清理路径有可重复验证
- 前端热点至少开始拥有更贴近行为的测试保护
- 发布前最低门槛持续稳定执行
- 团队对“高风险改动需要补什么验证”已经形成明确口径

---

## 8. 给 Codex 与后续协作者的默认约束

- 任何改动都要先判断它影响的是哪类风险
- 影响 tracking 主链、数据边界或发布路径的改动，默认提高验证强度
- 不把“功能能跑”当成“可靠”
- 不把“已有大测试文件”当成“已经足够验证”
- 不为了省测试成本而牺牲可信性
