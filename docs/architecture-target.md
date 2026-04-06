# 架构目标文档

## 1. 文档定位

本文件是本项目的长期架构方向说明。

它不是一次性任务单，也不是“理想目录展示图”。它的作用是：

- 约束新增代码应该落在哪里
- 约束重构时优先收口哪些边界
- 帮助后续的 Codex / GPT 在不重新推演全局的情况下，沿着同一个方向继续推进

如果一次性执行单与本文件冲突，以本文件的长期方向为准。

## 2. 项目特征

本项目不是普通 Web 后台，而是一个：

- `Tauri` 桌面应用
- 本地优先的数据与状态模型
- 强依赖 Windows 平台能力的时间追踪产品
- 前端包含 `Dashboard / History / Classification / Settings` 四个核心产品面板

这意味着我们更重视：

- 清晰边界
- 稳定行为
- 渐进迁移
- 可定位、可回归、可继续扩展

而不是追求一次性重构出“最标准”的目录。

## 3. 长期目标

长期上，本项目需要逐步收敛到以下形态：

### 前端

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

### Rust

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

其中：

- `app/` 负责应用装配、启动协调、生命周期、运行时编排
- `commands/` 负责 Tauri 命令入口，保持薄
- `platform/` 负责平台能力隔离，尤其是 Windows API 能力
- `engine/` 负责 tracking / timeline / runtime / stats 等核心时序与业务流程
- `data/` 负责数据库、迁移、持久化、仓储、备份恢复等数据边界
- `domain/` 负责核心模型、DTO、领域语义

## 4. 核心原则

### 4.1 渐进迁移

不做一次性全仓库重写。

我们接受过渡态，但不接受过渡态无限期扩散。每一轮任务都应该让边界更清楚，而不是更模糊。

### 4.2 优先收口职责，不优先重排目录

如果只是搬文件而不改变耦合关系，这不算有效架构重构。

优先级永远是：

1. 让职责更清楚
2. 让依赖方向更合理
3. 最后才是目录和命名

### 4.3 新增代码优先进入目标结构

新增代码默认不再回流到老的根层大文件或“万能 util 层”。

即使遗留代码还在，也不意味着新代码可以继续加在那里。

### 4.4 页面层尽量不直接碰基础设施

前端页面组件应尽量通过 feature service、shared facade、app service 等边界层消费能力，而不是直接触碰：

- `ProcessMapper`
- `SettingsService`
- 持久化细节
- 底层 tracking service

### 4.5 命令层必须保持薄

Rust `commands/*` 只做：

- 参数接收
- 调用协调层 / service / engine / data
- 返回 DTO / 发事件

命令文件不应重新成为业务逻辑中心。

## 5. 前端目标边界

## 5.1 `app/`

`app/` 负责应用壳层和全局运行时编排，例如：

- 应用启动 bootstrap
- 全局事件订阅
- 跨 feature 的视图切换
- 全局 toast / shell / providers
- 运行时初始化链路

不应在 `app/` 中继续堆积 feature 私有业务规则。

## 5.2 `features/`

每个产品面板都应拥有自己的：

- `components/`
- `services/`
- `hooks/`
- `types.ts`

其中：

- `components/` 是该 feature 的 UI
- `services/` 是该 feature 面向页面的业务入口
- `hooks/` 只承接该 feature 的局部交互编排
- `types.ts` 放该 feature 自己的公开类型

## 5.3 `shared/`

`shared/` 只放稳定的跨 feature 复用能力，例如：

- 通用组件
- 共享 hooks
- 共享 read-only facade
- 跨 feature 的纯展示格式化能力
- 稳定类型

只有当某项能力已经明显脱离某个 feature，才应进入 `shared/`。

## 5.4 `lib/`

`src/lib/` 当前仍然存在，是因为里面还有遗留底层能力尚未完全迁出。

它的长期角色应该收敛为：

- 确实跨前端全局的基础设施
- 与存储、底层服务、底层编译相关的遗留能力
- 在尚未完成迁移前的过渡落点

它不应继续增长成新的“万能层”。

## 5.5 前端新增代码落点规则

- 页面私有逻辑：进对应 `features/*`
- 跨页面稳定复用的只读能力：优先考虑 `shared/*`
- 应用启动、全局订阅、运行时初始化：进 `app/*`
- 不确定时，优先放在最小作用域，等稳定后再抽到 `shared`

## 6. Rust 目标边界

## 6.1 `app/`

负责：

- 应用装配
- 全局状态
- runtime 协调
- tray / window 生命周期协作

不负责承载大量业务实现细节。

## 6.2 `commands/`

负责：

- `#[tauri::command]` 入口
- DTO 输入输出
- 调用 runtime / engine / data

不负责：

- 长事务编排
- 大段路径解析
- 大段业务判断
- 数据层细节

## 6.3 `platform/`

负责：

- Windows 前台窗口能力
- idle / power / tray / startup / icon 等平台能力

平台能力应与业务语义解耦，不把 Windows API 细节泄漏到上层。

## 6.4 `engine/`

负责：

- tracking runtime
- session / timeline / reducer / stats 等核心业务流程
- 事件与时序逻辑

这里是“产品核心行为”的主要落点。

## 6.5 `data/`

负责：

- 数据库连接
- migrations
- repositories
- backup / restore
- 数据访问边界

长期上，更多与持久化、备份恢复、仓储有关的能力都应进入这里。

## 6.6 `domain/`

负责：

- 核心实体
- DTO
- 领域级类型定义
- 共享语义模型

长期上，`domain/` 不应长期空心化。

## 7. 当前架构阶段判断

以下判断是当前仓库状态的长期摘要，不是执行单。

### 阶段 1：前端 feature 归位

状态：`已基本完成`

已完成的关键点：

- `Dashboard / History / Classification / Settings` 已进入 `features/*`
- `Sidebar / ToastStack / shared hooks` 等共享能力已具备明确落点
- `AppShell` 已成为前端主壳层入口

### 阶段 2：前端状态与服务边界收口

状态：`已基本完成`

已完成的关键点：

- 页面组件层已基本不再直接触碰 `SettingsService`
- 页面组件层已基本不再直接触碰 `ProcessMapper`
- 共享只读分类 facade 已建立
- `ProcessMapper` 首次初始化已下沉到 app/runtime 初始化链路

仍可继续优化但不影响阶段判断的遗留项：

- `src/lib/db.ts`
- `src/lib/settings.ts`
- `src/lib/services/sessionCompiler.ts`

这些属于“根层基础设施继续分层”的后续问题，不代表页面边界仍未完成。

### 阶段 3：Rust 入口与运行时边界收口

状态：`已基本完成`

已完成的关键点：

- `lib.rs` 入口装配显著瘦身
- `app/runtime.rs` 已建立
- 高价值实现已迁入 `engine/` / `platform/windows/`
- sqlite pool 等运行时基础能力已收口
- `backup` 命令已明显薄化，核心逻辑进入 `data/backup.rs`

仍可继续优化但不影响阶段判断的遗留项：

- `data/` 仍可继续扩充仓储边界
- `domain/` 仍偏薄

### 阶段 4：数据与领域边界深化

状态：`未完成`

这是接下来最值得做的长期方向之一，重点包括：

- Rust `data/` 中补齐仓储与数据职责
- Rust `domain/` 中补齐核心模型与 DTO 落点
- 前端根层基础设施继续去耦
- 减少遗留 `src/lib/*` 的边界模糊性

## 8. 禁止事项

- 不为了目录整齐做大规模无收益迁移
- 不把 `shared/` 做成新的跨层垃圾桶
- 不把 `src/lib/` 继续当作默认新代码入口
- 不让 `commands/*` 继续回胖
- 不让页面组件重新直接依赖基础设施
- 不引入新的“万能 service / util / helper”模糊边界

## 9. 如何判断这份长期目标“基本做完”

本文件不会像一次性执行单那样被“全部打勾后结束”，但它可以进入“长期稳定态”。

当满足以下条件时，可以认为这份长期方向已经基本落地：

- 新增前端代码默认落在 `app / features / shared` 的正确边界
- 页面组件层默认不再直接依赖根层基础设施
- Rust 新增逻辑默认不再回流到 `lib.rs`、根目录大文件或厚命令文件
- `data/` 与 `domain/` 不再空心化
- 重大功能开发不再需要额外做一次全局架构清理

## 10. 给 Codex 的执行约束

- 按本文件方向收敛，但不要做一次性全仓库重构
- 优先迁移当前任务真正触及的高价值区域
- 若某次任务只涉及局部改动，应只把相关代码向目标结构推进一步
- 若一次性执行单与本文件冲突，以本文件为长期方向修正执行单
