# 代码质量目标

## 1. 文档定位

本文定义 `Time Tracker` 当前阶段的代码质量目标。

这里的“代码质量”只讨论：

- 可读性
- 可维护性
- 可测试性
- 热点复杂度
- owner 清晰度

它不直接讨论软件是否跑得快，也不直接替代可靠性与验证目标。

相关文档：

- 工程质量总览见 [`engineering-quality-target.md`](./engineering-quality-target.md)
- 性能目标见 [`performance-target.md`](./performance-target.md)
- 可靠性与验证目标见 [`reliability-and-validation-target.md`](./reliability-and-validation-target.md)

---

## 2. 当前判断

基于当前仓库状态，可以先给出一个保守判断：

- 架构健康度：高于代码质量健康度
- 代码质量总体状态：中上，已进入“值得专项整理”的阶段
- 当前主要风险：不是全面失控，而是热点聚集、复杂度上升、验证保护不够贴近热点

当前代码的优点是：

- 前后端主分层已经基本成型
- 大多数边界命名和 owner 方向已经能讲通
- Rust `commands/*` 仍较薄，入口层尚未明显回流
- tracking 主链和读模型核心已有测试基础

当前代码质量的主要问题是：

- 前端存在明显的大型热点文件  
  例：`src/features/classification/components/AppMapping.tsx` 约 887 行，`src/features/settings/components/Settings.tsx` 约 633 行。
- Rust 运行时存在单点复杂度热点  
  例：`src-tauri/src/engine/tracking/runtime.rs` 约 605 行。
- 前端壳层与服务层已有“薄片化”风险  
  例：`src/app/services/*` 当前已有 9 个文件，部分文件更像 forwarding 或运行时编排碎片。
- 共享逻辑热点价值很高，但边界仍可继续提纯  
  例：`src/shared/lib/sessionReadCompiler.ts` 约 375 行。
- 测试保护主要集中在 tracking/session 核心链路，热点页面和热点适配层的保护还不均衡。
- 仓库目前缺少明确的代码质量静态 gate。

---

## 3. 当前阶段的代码质量目标

当前阶段，代码质量优化的目标不是“把代码变得更抽象”，而是让代码变得：

- 更容易读
- 更容易改
- 更容易补测试
- 更不容易在高风险层回流
- 更能持续保持和架构边界一致

展开来说，当前阶段主要追求 5 个目标。

## 3.1 目标一：复杂度留在真实 owner 内

代码优化的第一原则不是“拆小”，而是“让复杂度留在真实 owner 内”。

如果只是把大文件拆成很多无 owner 的 helper，它不算成功。

## 3.2 目标二：先削热点，再谈普遍整洁

当前最值得优化的是少数已经明显变重、变难读、变难改的热点文件和热点链路，而不是全仓库均匀地做表层整理。

## 3.3 目标三：减少无效重复，保留有边界价值的重复

更应该消除的是：

- 重复的状态编排模式
- 重复的 bootstrap/cache 装配模式
- 重复的 patch/commit 写法
- 重复但语义不一致的适配代码

不应为了“少几行”而抽出跨 owner 的通用层。

## 3.4 目标四：高风险层继续变薄，而不是继续长厚

当前要额外盯防的区域包括：

- 前端 `app/*`
- 前端 `shared/*`
- 前端 `platform/*`
- Rust `lib.rs`
- Rust `commands/*`

这些层可以编排、转发、暴露边界，但不应重新变成厚业务中心。

## 3.5 目标五：为长期母文档积累真实规则

这轮专项优化的重要输出之一，是为未来的长期母文档积累真正有效的代码质量规则，而不是先写一份空泛原则。

---

## 4. 当前明确非目标

这轮代码质量优化不追求：

- 大爆炸重构
- 为了“目录更整齐”而搬运大量文件
- 为了消除表面重复而新增抽象层
- 把 feature 私有逻辑抽进 `shared/*`
- 把兼容壳重新写成长期主路径
- 大规模风格化重命名
- 把 UI 改版、产品扩展和代码质量优化混在同一轮里

---

## 5. 第一批重点优化区域

## 5.1 前端热点页面

- `src/features/classification/components/AppMapping.tsx`
- `src/features/settings/components/Settings.tsx`

这两类文件的问题不是“文件大”本身，而是页面状态、草稿管理、交互动作、持久化提交和反馈编排耦合得偏紧。

## 5.2 前端壳层与运行时编排

- `src/app/AppShell.tsx`
- `src/app/services/*`

这里当前还没有明显失控，但已经出现典型稳定期风险：

- 壳层容易继续长厚
- 运行时服务容易碎成过多薄片文件
- forwarding service 与真实 owner service 的边界需要继续收紧

## 5.3 共享逻辑热点

- `src/shared/lib/sessionReadCompiler.ts`
- `src/shared/lib/historyReadModelService.ts`
- `src/shared/lib/settingsPersistenceAdapter.ts`

这里的问题不是越界，而是兼容壳、共享逻辑和具体 adapter 的边界仍值得继续提纯。

## 5.4 Rust tracking 运行时热点

- `src-tauri/src/engine/tracking/runtime.rs`

这里的问题是单点复杂度偏高，但仍留在正确 owner 内，非常适合在不破坏架构边界的前提下继续细化职责。

---

## 6. 阶段性完成标准

这轮代码质量专项可以认为“基本完成”，至少应满足大部分条件：

- 第一批热点已经完成一轮有效收口
- 大页面和大运行时文件的职责边界明显更清楚
- 新增代码默认不会继续往高风险区堆叠
- 仓库建立起至少一个明确的代码质量 gate
- 关键热点重构有对应测试补强
- 团队已经能总结出一批稳定有效、可长期复用的代码质量规则

达到这些条件后，才适合进一步沉淀长期母文档。

---

## 7. 给 Codex 与后续协作者的默认约束

- 先判断 owner，再谈抽象
- 优先削减热点复杂度，不优先做全仓库表层整理
- 每次优化都要说明它降低了什么长期维护成本
- 如果一次优化需要跨层迁移职责，先升级为执行单
- 如果某个“优化”会让边界更模糊，它默认不是正向优化
