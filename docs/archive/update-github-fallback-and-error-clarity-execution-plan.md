# GitHub 更新失败兜底与错误清晰化执行文档

## 1. 文档定位

这是一份当前有效的可勾选执行文档，用于收口“继续使用 GitHub 作为更新源，但自动更新失败时用户无法判断卡在哪一步、也没有清晰兜底入口”的问题。

这份文档的目标不是替换现有 updater 架构，也不是引入自建更新源，而是先把当前 GitHub 发布链路下的用户体验和失败可恢复性收完整。

适用前提：

- 当前没有自有域名或自建更新源。
- 继续使用 GitHub Release 作为安装包发布源。
- 继续使用 `raw.githubusercontent.com` 上的 `latest.json` 作为更新清单入口。

---

## 2. 问题定义

当前更新链路至少包含两段外部访问：

1. 检查更新：
   - 访问 `latest.json`
   - 当前来源是 `raw.githubusercontent.com`
2. 下载更新：
   - 访问 GitHub Release 安装包地址
   - 当前来源是 `github.com/.../releases/download/...`

这会导致两类不同失败场景：

- 用户 A：
  - 能检查更新
  - 但下载安装包失败
- 用户 B：
  - 连更新检查都失败

而当前产品问题是：

- [x] 错误提示没有清楚区分“检查失败”与“下载失败”
- [x] 用户无法直接判断失败发生在 `latest.json` 还是安装包下载
- [x] 自动更新失败后，没有稳定、显眼、低心智负担的手动下载兜底入口
- [x] 更新对话框与设置页中的更新面板，没有把“失败后下一步该做什么”讲清楚

---

## 3. 本轮目标

本轮要达到的完成态：

- [x] 用户能明确知道自己是“无法检查更新”还是“无法下载安装包”
- [x] 自动更新失败后，用户无需理解 GitHub / raw / release 细节，也能直接完成手动下载
- [x] 设置页更新面板与更新弹窗文案一致，不互相打架
- [x] 后端 updater owner 继续留在 Rust `engine/updater.rs`
- [x] 前端只消费明确的 update snapshot / update action，不自行拼接模糊逻辑

一句话目标：

> 自动更新能成功时正常走自动更新；自动更新失败时，用户必须能马上转入手动下载，而不是被困在错误状态里。

---

## 4. 非目标

本轮明确不做：

- [x] 不引入自建对象存储、CDN 或自定义更新域名
- [x] 不改 GitHub Release 的发布基础设施
- [x] 不改 updater 的签名体系
- [x] 不把更新机制整体迁移出 Tauri updater
- [x] 不把“所有网络问题自动修复”当成本轮目标

---

## 5. 用户场景

### 5.1 场景 A：检查更新失败

表现：

- 用户点击“检查更新”
- 无法拿到 `latest.json`
- 当前状态停在错误提示

完成态要求：

- [x] 明确提示“无法访问更新清单”
- [x] 给出“打开发布页”入口
- [x] 给出必要时的“稍后重试”入口

### 5.2 场景 B：检查成功但下载失败

表现：

- 用户能看到新版本号
- 但安装包下载失败

完成态要求：

- [x] 明确提示“无法下载安装包”
- [x] 保留已检查到的目标版本号
- [x] 给出“打开当前版本下载页”入口
- [x] 如果可以明确拼装安装包地址，允许提供“直接下载安装包”入口

### 5.3 场景 C：下载中断后用户继续处理

表现：

- 下载过程中失败或网络中断

完成态要求：

- [x] 状态能留在“已发现新版本，但自动下载失败”
- [x] 用户仍可直接走手动下载
- [x] 不要求用户重新理解更新流程

---

## 6. 架构收口原则

### 6.1 后端 owner

- [x] `src-tauri/src/engine/updater.rs` 继续拥有更新阶段状态与错误分类
- [x] Rust 侧负责判断当前失败更接近“检查阶段”还是“下载阶段”
- [x] Rust 侧负责输出足够明确的结构化 snapshot 字段，而不是只吐一段模糊字符串

### 6.2 前端 owner

- [x] `src/app/hooks/useUpdateState.ts` 继续只负责订阅 runtime snapshot 和驱动交互
- [x] `src/features/update/services/updateViewModel.ts` 负责把结构化错误转成用户可读文案
- [x] `src/features/update/components/*` 只负责展示和动作触发，不直接理解网络阶段细节

### 6.3 外部跳转 owner

- [x] 打开 GitHub Release 页面或安装包链接的行为应通过现有 runtime / opener 边界完成
- [x] 不在页面组件里直接写硬编码 `window.open(...)`

---

## 7. 实现切片

## 切片 A：错误阶段模型收口

目标：
让 updater snapshot 能明确表达“检查失败”还是“下载失败”，而不是只留下原始错误字符串。

任务：

- [x] 审查当前 `UpdateSnapshot` 与 updater runtime 状态字段
- [x] 新增结构化错误阶段字段
  - 建议形态：`error_stage = "check" | "download" | "install" | null`
- [x] 保留原始错误消息字段，作为调试补充
- [x] 明确“检查失败但尚未知版本”和“下载失败但已知目标版本”两类状态能同时表达
- [x] Rust domain / TS shared 类型同步更新

完成标准：

- [x] 前端不再需要从错误字符串猜测失败发生在哪个阶段
- [x] snapshot 本身就能说明错误阶段

涉及文件：

- [x] `src-tauri/src/domain/update.rs`
- [x] `src-tauri/src/engine/updater.rs`
- [x] `src/shared/types/update.ts`

---

## 切片 B：GitHub 手动下载兜底模型

目标：
失败时能提供明确的手动下载目标，而不是只告诉用户“失败了”。

任务：

- [x] 明确当前可稳定提供的兜底链接类型
  - `GitHub Release 页面`
  - 当前目标版本对应的 Release 页面
  - 如果安全且稳定，可选：安装包直链
- [x] 在 update snapshot 中补充手动下载所需字段
  - 建议字段：
    - `release_page_url`
    - `asset_download_url`（可选）
- [x] 对“检查失败”和“下载失败”分别决定展示哪一种兜底链接
- [x] 确保这些链接来源清晰，不由前端页面临时拼接业务规则

完成标准：

- [x] 更新失败时，前端已经拿到可打开的兜底链接
- [x] 用户无需复制错误文本去自己找 Release 页面

涉及文件：

- [x] `src-tauri/src/engine/updater.rs`
- [x] `src-tauri/src/domain/update.rs`
- [x] `src/shared/types/update.ts`
- [x] 如有需要：`scripts/release.ts`

---

## 切片 C：设置页更新面板状态文案重写

目标：
把错误状态说清楚，并给出下一步行动。

任务：

- [x] 重写 `buildUpdateStatusPanelModel(...)` 中的错误分支
- [x] 为不同阶段输出不同标题
  - 例如：
    - “无法检查更新”
    - “无法下载安装包”
    - “安装更新失败”
- [x] 为不同阶段输出不同细节说明
- [x] 为错误状态定义主动作
  - 重新检查
  - 打开下载页
  - 打开 Release 页面
- [x] 保持 Quiet Pro：信息清晰、克制，不堆过多技术名词

完成标准：

- [x] 用户在设置页一眼能知道卡在哪一步
- [x] 用户知道下一步是“重试”还是“改走手动下载”

涉及文件：

- [x] `src/features/update/services/updateViewModel.ts`
- [x] `src/features/update/components/UpdateStatusPanel.tsx`

---

## 切片 D：更新弹窗失败兜底收口

目标：
更新弹窗不是只在“发现版本”时有用，失败后也能帮助用户完成后续动作。

任务：

- [x] 重写 `buildUpdateConfirmDialogModel(...)` 的错误与下载失败态
- [x] 明确下载失败后，弹窗还能显示目标版本、失败原因摘要和手动下载入口
- [x] 决定弹窗是否应在错误状态下允许保留打开
- [x] 如果弹窗不保留，也要保证设置页面板具备同等兜底能力
- [x] 保证“下载中 / 已下载 / 下载失败”三种状态的文案连续、逻辑一致

完成标准：

- [x] 更新弹窗不会在失败后变成死路
- [x] 用户可以直接从弹窗进入手动下载路径

涉及文件：

- [x] `src/features/update/services/updateViewModel.ts`
- [x] `src/features/update/components/UpdateConfirmDialog.tsx`
- [x] `src/app/providers/UpdateDialogProvider.tsx`

---

## 切片 E：外部链接动作边界收口

目标：
把“打开发布页 / 下载页”的动作放到正确边界，不让组件自己处理外链细节。

任务：

- [x] 确认当前是否已有合适的 opener/runtime gateway
- [x] 如无，则新增 update 专属 runtime gateway 方法
  - 例如：
    - `openUpdateReleasePage(url)`
    - `openUpdateDownloadUrl(url)`
- [x] 前端组件只接收 action callback，不自己处理 URL
- [x] 确保 URL 为空或非法时有安全降级

完成标准：

- [x] 更新兜底外链动作有明确 owner
- [x] 页面组件不硬编码浏览器打开逻辑

涉及文件：

- [x] `src/platform/runtime/updateRuntimeGateway.ts`
- [x] 可能涉及 `src/features/settings/services/settingsRuntimeAdapterService.ts`
- [x] 可能涉及 Tauri opener 权限边界

---

## 切片 F：错误文案与可观测性补强

目标：
让用户看得懂，同时让我们后续判断问题更轻松。

任务：

- [x] 把技术错误文本降级成“用户文案 + 原始错误补充”
- [x] 对常见 GitHub 网络失败模式做最低限度归类
  - 请求发送失败
  - TLS / 证书问题
  - 连接超时
  - 404 / 资源不存在
- [x] 控制用户面可见的原始错误长度，避免整段 URL 淹没界面
- [x] 保留日志侧原始信息，便于后续排查

完成标准：

- [x] 用户文案可读
- [x] 调试信息没有完全丢失

涉及文件：

- [x] `src-tauri/src/engine/updater.rs`
- [x] `src/features/update/services/updateViewModel.ts`

---

## 8. UI 行为要求

- [x] 更新面板错误态必须出现明确动作按钮，不能只有静态错误文字
- [x] “重新检查”与“手动下载”不能混成一个动作
- [x] 下载失败后，优先展示手动下载入口，而不是只强调重试
- [x] Quiet Pro 风格下保持克制，不做夸张警示样式
- [x] 失败态信息密度可以略高于正常态，但仍要一眼能扫懂

---

## 9. 验证清单

### 9.1 自动化验证

- [x] `cargo check --manifest-path src-tauri/Cargo.toml --quiet`
- [x] `cargo test --manifest-path src-tauri/Cargo.toml --quiet`
- [x] `npm run check`
- [x] `npm run release:validate-changelog`

### 9.2 手工场景验证

- [x] 正常检查成功，正常下载成功
- [x] 检查失败时显示“无法检查更新”与手动下载兜底
- [x] 下载失败时显示“无法下载安装包”与手动下载兜底
- [x] 已知目标版本时，兜底入口能打开对应 Release 页面
- [x] 设置页更新面板与更新弹窗文案一致
- [x] 下载中进度条与失败后的错误态切换正常

---

## 10. 完成定义

满足以下条件，才算本轮完成：

- [x] 用户能区分“检查失败”和“下载失败”
- [x] 用户能从失败状态直接进入手动下载路径
- [x] 后端 snapshot 提供结构化错误阶段信息
- [x] 前端不再从错误字符串猜阶段
- [x] 设置页与弹窗的失败兜底体验一致
- [x] 自动化验证全部通过

---

## 11. 执行顺序建议

推荐按这个顺序推进：

1. [ ] 切片 A：错误阶段模型收口
2. [ ] 切片 B：手动下载兜底字段
3. [ ] 切片 E：外部链接动作边界
4. [ ] 切片 C：设置页更新面板
5. [ ] 切片 D：更新弹窗
6. [ ] 切片 F：文案与可观测性补强
7. [ ] 跑验证清单

---

## 12. 当前结论

在没有自有域名的前提下，当前最现实、最值得做的方案不是更换更新基础设施，而是：

- [x] 继续使用 GitHub 更新源
- [x] 把自动更新失败分阶段说清楚
- [x] 给出明确的手动下载兜底
- [x] 让用户在失败时仍能完成更新

这份执行文档就是围绕这条路线展开。
