# 架构目标文档

## 1. 文档定位

本文件是本项目的长期架构方向说明。

它不是一次性执行单，也不是为了把目录排得“更漂亮”的理想树状图。它的作用是：

- 约束新增代码应该落在哪里
- 约束重构时优先收口哪些边界
- 解释当前源码结构与长期目标之间的关系
- 帮助后续的 Codex / GPT 在不重新推演全局的情况下，沿着同一方向继续推进

如果某份一次性执行单与本文件冲突，以本文件的长期方向为准。

---

## 2. 项目特征

本项目不是普通 Web 后台，而是一个：

- `Tauri` 桌面应用
- 本地优先的数据与状态模型
- 强依赖 Windows 平台能力的时间追踪产品
- 同时包含前端产品面板与 Rust 本地运行时的双栈工程

这意味着我们更重视：

- 清晰边界
- 稳定行为
- 渐进迁移
- 可定位、可回归、可继续扩展

而不是追求一次性重构出“最标准”的目录。

---

## 3. 当前源码相关根目录总览

当前仓库里，和长期架构最相关的根目录大致是：

```text
repo/
  docs/
  public/
  src/
  src-tauri/
  tests/
```

其中：

- `docs/` 存放长期文档与归档执行单
- `src/` 是前端源码主目录
- `src-tauri/` 是 Tauri 与 Rust 侧主目录
- `tests/` 是前端脚本级测试入口

另外还会存在：

- `dist/`
- `node_modules/`
- `src-tauri/target/`
- `src-tauri/icons/`
- `src-tauri/capabilities/`
- `src-tauri/gen/`

这些目录并不属于“核心业务源码边界”的判断重点。它们是构建产物、打包资源、Tauri 配置资源或工具产物，不构成当前长期架构问题的主战场。

---

## 4. 长期目标总览

长期上，本项目需要稳定收敛到下面这两个源码骨架。

### 4.1 前端目标骨架

```text
src/
  app/
  features/
    dashboard/
    history/
    classification/
    settings/
  shared/
  lib/           # 仅保留确实还未迁出的底层遗留能力
```

### 4.2 Rust 目标骨架

```text
src-tauri/src/
  main.rs
  lib.rs
  app/
  commands/
  platform/
  engine/
  data/
  domain/
```

这些目标骨架描述的是“职责边界”，不是要求每个目录都立刻长成同样大小。

长期重点不是：

- 目录越多越好
- 每个 feature 必须形式上完全对称
- 一次性把所有遗留层清空

长期重点是：

- 职责更清楚
- 依赖方向更合理
- 新增代码默认落在正确边界
- 过渡层不再持续膨胀

---

## 5. 当前阶段判断

基于当前仓库现状，可以把长期收敛进度概括为：

### 前端

- `feature-first` 主骨架已基本建立
- 页面层对根层基础设施的直接依赖已明显减少
- `app / features / shared` 三层已经开始承担清晰职责
- 最大遗留压力仍在 `src/lib/*` 与部分跨层 adapter / persistence 角色上

### Rust

- `app / commands / platform / engine / data / domain` 主骨架已建立
- `commands/*`、`platform/*`、`data/*` 的边界已经比过去清楚很多
- `data/` 已经成形
- `domain/` 与 `engine/` 仍偏薄，仍处于持续深化阶段

也就是说：

- 当前问题已不再是“有没有目标结构”
- 当前问题是“如何继续把遗留实现收口到已经存在的目标结构里”

---

## 6. 前端目标边界

### 6.1 当前前端实际形态

当前前端源码已经大体收敛为：

```text
src/
  app/
    AppShell.tsx
    hooks/
    services/
    providers/
    styles/
  assets/
  features/
    classification/
    dashboard/
    history/
    settings/
  shared/
    components/
    hooks/
    lib/
    types/
  lib/
  types/
  App.tsx
  App.css
  main.tsx
```

这说明前端“目录骨架层面”已经很接近长期目标。

真正还在进行中的，是下面几个问题：

- `src/lib/*` 仍保留较多历史基础设施
- `src/shared/lib/*` 中已有高价值共享能力，但也必须防止继续增长成新的跨层过渡桶
- `src/types/*` 仍与 `features/*/types.ts`、`shared/types/*` 并存
- 某些 `hooks/`、`providers/`、`styles/` 子目录已经预留，但还只是轻量占位

---

### 6.2 `app/`

`app/` 负责应用壳层和全局运行时编排，例如：

- 应用启动 bootstrap
- 全局事件订阅
- 跨 feature 的视图切换
- 全局 shell / providers
- 运行时初始化链路

当前已经比较符合该角色的代码包括：

- `AppShell.tsx`
- app runtime/bootstrap 相关 service
- 与窗口追踪、运行时网关相关的应用级编排

`app/` 不应继续堆积：

- feature 私有业务规则
- feature 私有格式化
- feature 私有表单状态
- 持久化细节

换句话说：

- `app/` 是壳层和运行时协调层
- 它不是新的“全局业务逻辑层”

---

### 6.3 `features/`

每个产品面板都应优先拥有自己的最小闭环：

- `components/`
- `services/`
- `hooks/`
- `types.ts`

但这里有一个重要原则：

- “建议具备这些落点”不等于“每个目录必须立刻有同样多文件”

例如：

- 有些 feature 当前并不一定需要专门的 `hooks/`
- 有些 feature 的服务层可能暂时只有一个入口

允许这种非对称存在，只要职责边界是清楚的。

每个 feature 的职责应是：

- `components/`：该 feature 的 UI
- `services/`：该 feature 面向页面的业务入口
- `hooks/`：该 feature 的局部交互编排
- `types.ts`：该 feature 自己的公开类型

当前四个核心 feature：

- `dashboard`
- `history`
- `classification`
- `settings`

已经都具备明确落点，这一阶段可以视为“已基本完成”。

---

### 6.4 `shared/`

`shared/` 只放稳定的跨 feature 复用能力，例如：

- 通用组件
- 共享 hooks
- 共享只读 facade
- 跨 feature 的纯展示格式化能力
- 稳定类型

当前比较符合 `shared/` 角色的能力包括：

- `Sidebar`
- `ToastStack`
- `QuietPageHeader`
- `appClassificationFacade`
- session/history 只读汇编能力

但是要特别警惕：

- 不要把 `shared/lib/*` 做成新的“历史遗留过渡层”
- 不是所有“看起来多个地方都能用”的东西都应该进 `shared`

进入 `shared` 的前提应该是：

- 已经明显脱离某个 feature
- 职责稳定
- 不依赖单个页面私有上下文

---

### 6.5 `lib/`

`src/lib/` 当前仍然存在，是因为里面还有遗留底层能力尚未完全迁出。

它的长期角色应该收敛为：

- 确实跨前端全局的底层基础设施
- 与存储、底层服务、底层编译相关的遗留能力
- 尚未完成迁移前的过渡落点

当前仍位于 `src/lib/` 的典型角色包括：

- DB / settings / store / mapper 一类底层能力
- config / copy / normalization 一类历史公共模块

长期上，这一层不应继续自然膨胀。

判断一段代码是否不该再进 `src/lib/`，可以看这几个问题：

- 它是不是某个 feature 私有逻辑
- 它是不是应用启动编排逻辑
- 它是不是稳定共享的 UI / facade / hook
- 它是不是其实更像 `shared` 或 `features` 的能力

如果答案是“是”，就不应优先落到 `src/lib/`。

---

### 6.6 `types/` 与 `assets/`

这两个目录不是长期架构冲突点，但需要明确角色。

`src/types/`：

- 更适合放仍未归位的全局级类型
- 长期上，feature 私有类型应回到 `features/*/types.ts`
- 稳定共享类型应回到 `shared/types/*`

`src/assets/`：

- 用于前端静态资源
- 它不属于当前边界问题核心
- 不要把“资源目录是否优雅”误判为当前架构优先级

---

### 6.7 前端新增代码落点规则

新增前端代码时，默认按下面规则判断：

- 页面私有逻辑：进对应 `features/*`
- 页面私有格式化：进对应 `features/*/services/*`
- 页面局部交互编排：进对应 `features/*/hooks/*`
- 跨页面稳定复用的只读能力：优先考虑 `shared/*`
- 应用启动、全局订阅、运行时初始化：进 `app/*`
- 还没迁完的底层兼容层：暂留 `src/lib/*`

不确定时，优先放在最小作用域，等稳定后再抽到 `shared`，而不是一开始就丢进根层公共目录。

---

## 7. Rust 目标边界

### 7.1 当前 Rust 实际形态

当前 Rust 源码已经大体收敛为：

```text
src-tauri/src/
  main.rs
  lib.rs
  app/
  commands/
  platform/
    windows/
  engine/
  data/
    repositories/
  domain/
```

这说明 Rust 侧的“主层级骨架”已经基本对齐长期目标。

当前最值得继续打磨的不是顶层目录名，而是：

- `engine/` 继续细化
- `domain/` 继续充实
- `data/` 继续承接仓储与数据边界
- `commands/*` 继续保持薄

---

### 7.2 `main.rs` 与 `lib.rs`

长期上：

- `main.rs` 保持为程序入口
- `lib.rs` 保持为主装配入口

不应让它们重新长回：

- 大量业务流程
- 大量平台细节
- 大量数据库细节
- 大量运行时判断

---

### 7.3 `app/`

Rust `app/` 负责：

- 应用装配
- 全局状态
- runtime 协调
- tray / window 生命周期协作

当前 `runtime.rs`、`state.rs`、`tray.rs` 的存在方向是对的。

但 `app/` 不应重新变成：

- 业务实现大杂烩
- settings 直连仓储层的中转站
- 命令层之外的第二套“万能入口”

---

### 7.4 `commands/`

Rust `commands/*` 只做：

- `#[tauri::command]` 入口
- 参数接收
- DTO 输入输出
- 调用 runtime / engine / data / app

不做：

- 大段业务判断
- 长事务编排
- 平台细节
- 仓储细节

如果某个命令文件越来越厚，长期上应优先把厚度迁出，而不是继续接受它变成隐性业务中心。

---

### 7.5 `platform/`

`platform/` 负责：

- Windows 前台窗口能力
- icon / power / foreground 等平台接口
- 未来其他平台能力的隔离落点

当前 `platform/windows/*` 的存在说明平台隔离已经起步并有效。

长期上，平台层应做到：

- 隔离 Windows API 细节
- 不泄漏平台细节到 engine / commands / app
- 与业务语义解耦

---

### 7.6 `engine/`

`engine/` 负责：

- tracking runtime
- session / timeline / reducer / stats 等核心业务流程
- 事件与时序逻辑

这里应当是“产品核心行为”的主要落点。

当前 `engine/` 已建立，但整体仍偏薄，说明：

- 主骨架是对的
- 但核心流程仍有继续拆分和下沉空间

长期上，如果某段逻辑属于：

- tracking 主链
- timeline / session 时序
- 核心行为编排

那它更应该考虑进入 `engine/*`，而不是继续堆在壳层或命令层。

---

### 7.7 `data/`

`data/` 负责：

- sqlite pool
- migrations
- repositories
- backup / restore
- 数据访问边界

当前 `data/` 是 Rust 侧最成形的一层，已经具备：

- `sqlite_pool.rs`
- `migrations.rs`
- `backup.rs`
- `repositories/*`

这说明：

- 数据边界已经从“目录存在”进入“职责深化”阶段

长期上，这一层应继续扩充仓储角色，而不是让数据细节回流到：

- `commands/*`
- `app/*`
- `engine/*`

---

### 7.8 `domain/`

`domain/` 负责：

- 核心实体
- DTO
- 领域级类型定义
- 共享语义模型

当前 `domain/` 已经不再空心，但仍偏薄。

这不是坏事，它说明：

- 方向已经建立
- 但领域语义模型仍需要持续补齐

长期上，`domain/` 不应只是一个“顺手放几个 type 的地方”，而应成为数据和业务之间的稳定语义中层。

---

## 8. 当前最值得继续打磨的方向

基于当前仓库现状，后续长期打磨的优先级建议如下。

### 8.1 前端优先级一：继续缩减 `src/lib/*`

这是前端最明确的遗留过渡层。

重点不是一口气删空它，而是：

- 新增代码不再流入
- 现有高价值任务触及时继续迁一小步
- 逐步把 feature 私有逻辑、app runtime 逻辑、shared 稳定能力从这里收口出去

### 8.2 前端优先级二：防止 `shared/lib/*` 回胖

`shared/*` 当前很有价值，但要防止“因为不想判断边界，所以都塞进 shared/lib”。

判断标准是：

- 真稳定复用再进 `shared`
- 仍然偏 feature / runtime / persistence 的能力，不要过早抽出来

### 8.3 前端优先级三：继续统一 feature archetype

四个 feature 的主骨架已经有了，但还可以继续：

- 让类型落点更稳定
- 让格式化/service/hook 角色更一致
- 让页面组件继续远离底层基础设施

### 8.4 Rust 优先级一：继续深化 `data/` 与 `domain/`

这一块是当前长期阶段里最明确的进行中任务。

目标不是“多建几个目录”，而是让：

- 仓储更清楚
- 领域模型更稳定
- 数据访问边界不再回流

### 8.5 Rust 优先级二：继续让 `engine/` 成为核心行为落点

如果核心 tracking / timeline / stats / reducer 主链仍混杂在其他层，就继续向 `engine/*` 收口。

### 8.6 Rust 优先级三：命令层持续瘦身

只要 `commands/*` 开始重新变厚，就应优先考虑把逻辑迁出，而不是接受它重新成为业务中心。

---

## 9. 禁止事项

- 不为了目录整齐做大规模无收益迁移
- 不把 `shared/` 做成新的跨层垃圾桶
- 不把 `src/lib/` 继续当作默认新代码入口
- 不让 `commands/*` 继续回胖
- 不让页面组件重新直接依赖基础设施
- 不引入新的“万能 service / util / helper”
- 不把“有空目录骨架”误当作“职责已经真正收口”

---

## 10. 如何判断长期方向是否正在落地

本文件不会像一次性执行单那样“全部打勾后结束”，但它可以进入长期稳定态。

当满足下面这些条件时，可以认为长期方向正在健康落地：

- 新增前端代码默认落在 `app / features / shared` 的正确边界
- 页面组件层默认不再直接依赖根层基础设施
- `src/lib/*` 不再自然膨胀
- Rust 新增逻辑默认不再回流到 `lib.rs`、根目录大文件或厚命令文件
- `data/` 与 `domain/` 持续变得更有内容、更有边界
- 重大功能开发不再需要先做一轮全局架构清理

---

## 11. 给 Codex 的执行约束

- 按本文件方向收敛，但不要做一次性全仓库重构
- 优先迁移当前任务真正触及的高价值区域
- 如果某次任务只涉及局部改动，应只把相关代码向目标结构推进一步
- 若某个实现只是“把文件搬到看起来更整齐的位置”，但职责没更清楚，就不算有效重构
- 若某次任务与本文件冲突，以本文件的长期方向修正实现方案
- 当仓库处于稳定期且问题归属存在歧义时，先按 [`issue-fix-boundary-guardrails.md`](./issue-fix-boundary-guardrails.md) 做边界分流，再决定是否直接实现
