# 版本与发布规范

## 1. 文档定位

本文件定义本项目长期使用的软件版本管理、`CHANGELOG` 维护和 GitHub Release 发布规范。

它不是一次性任务单，也不是某一轮发布时临时补写的说明，而是以后每次准备发布版本时都应遵循的长期规则。

如果某轮执行单、临时发布说明与本文件冲突，以本文件的长期规则为准。

---

## 2. 与其他长期文档的关系

本文件主要回答：

- 版本号应该怎么升
- `CHANGELOG.md` 应该怎么维护
- Git tag、GitHub Release 标题与产物应该怎么统一
- 发布前最少要完成哪些校验

它与其他长期文档的关系如下：

- 与 [`architecture-target.md`](./architecture-target.md) 互补，架构文档定义长期收敛方向，本文件定义“什么样的变更可以形成一个正式版本”。
- 与 [`issue-fix-boundary-guardrails.md`](./issue-fix-boundary-guardrails.md) 互补，边界守则决定如何稳定协作，本文件决定如何稳定发布。

---

## 3. 本规范的目标

本规范要长期解决 5 件事：

- 让版本号有清楚、稳定、可预期的升级规则
- 让 `CHANGELOG.md` 成为 release 说明的长期单一来源
- 让 Git tag、代码版本、GitHub Release 标题保持一致
- 让发布流程中的验证项固定下来
- 避免以后再出现“版本号、tag、release 文案、代码配置彼此脱节”的情况

---

## 4. 当前仓库阶段

当前仓库处于：

- `0.x` 阶段
- 仍在持续打磨产品、结构与 Windows 桌面体验
- 已经超过原型期，适合按正式版本体系持续维护
- 已经存在公开稳定版发布历史，不再是“首个正式版本待定”阶段

按当前现状，应这样理解发布基线：

- 现行稳定发布线已进入 `0.2.x`
- 后续发布应沿既有稳定版序列继续前进
- 默认从 `main` 通过 GitHub Actions 的 `Publish Release` 工作流发布

补充说明：

- 过去出现过的 `0.1.0-1` 属于临时版本号，不再作为长期规范使用
- 本项目当前仍未到 `1.0.0`
- 但也不再适合继续用临时、无语义的版本后缀管理发布

---

## 5. 版本号的单一来源

每次发布时，以下位置应保持同一版本语义：

- `package.json` 中的 `version`
- `package-lock.json` 中的 `version`
- `src-tauri/tauri.conf.json` 中的 `version`
- `src-tauri/Cargo.toml` 中的 `[package].version`
- Git tag
- GitHub Release 标题中的版本号

统一规则：

- 代码版本号使用不带前缀的 SemVer 字符串
- Git tag 使用带 `v` 前缀的形式
- GitHub Release 标题使用 `Time Tracker vX.Y.Z`

示例：

- 代码版本：`0.2.2`
- Git tag：`v0.2.2`
- GitHub Release 标题：`Time Tracker v0.2.2`

长期上：

- `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml` 是发布前必须同步的代码内版本位
- Git tag 与 GitHub Release 是对外发布语义的同步来源
- 自动更新通道中的 `latest.json` 应与本次发布版本一致

补充规则：

- `src-tauri/Cargo.lock` 不是发布脚本的主同步入口，但如果本地发版准备导致其中的 `time_tracker` 包版本发生变化，应一并检查并按本次版本收口
- 如果版本已经是目标值，版本同步脚本应视为幂等成功，而不是报错

不允许出现：

- 代码版本和 tag 不一致
- tag 和 Release 标题不一致
- Release 文案写了一个版本，但仓库代码还是另一个版本

---

## 6. 版本格式规则

长期采用 `SemVer`：

`MAJOR.MINOR.PATCH`

### 6.1 稳定版本

稳定公开版本使用：

- `0.1.0`
- `0.2.0`
- `0.2.1`
- `0.2.2`

### 6.2 预发布版本

仅当明确需要“测试版 / 候选版”时，才使用预发布后缀：

- `0.2.0-beta.1`
- `0.2.0-beta.2`
- `0.2.0-rc.1`

### 6.3 不再推荐的格式

今后不再新增类似 `0.1.0-1` 这种语义不明确的版本后缀。

原因：

- 虽然它是合法 SemVer，但对 release 读者不够直观
- 无法一眼看出它是稳定版、beta 还是 rc
- 不利于长期 changelog 和 GitHub Release 统一

---

## 7. 版本升级策略

### 7.1 在 `1.0.0` 之前

项目目前仍处于 `0.x` 阶段。

在这个阶段，建议按下面规则升级：

- `PATCH`：小范围 bug 修复、回归修复、构建修复、非行为级 UI 微调
- `MINOR`：用户可感知的新功能、行为变化、重要 UX 改进、发布级架构收口
- `MAJOR`：仅在真正定义了稳定兼容边界后再考虑；`1.0.0` 前通常不使用

### 7.2 在 `1.0.0` 之后

进入 `1.0.0` 后，严格按标准 SemVer：

- `PATCH`：向后兼容的修复
- `MINOR`：向后兼容的新功能
- `MAJOR`：不兼容变化

---

## 8. 本项目推荐的判断口径

为了避免每次都重新争论，本项目统一用下面的判断口径。

### 8.1 升 `PATCH`

适用于：

- 只修 bug
- 只修 UI 对齐、视觉细节、状态错误
- 不引入新能力
- 不改变默认行为
- 不影响用户理解“这个版本多了什么”

示例：

- `0.2.0 -> 0.2.1`

### 8.2 升 `MINOR`

适用于：

- 新增用户可见功能
- 改善关键使用流程
- 引入新的设置项、工作流或产品面板能力
- 一轮较大的架构收口使发布质量明显提升

示例：

- `0.2.1 -> 0.3.0`

### 8.3 升预发布后缀

适用于：

- 想先发测试版给少量用户验证
- 发布内容较大，但尚不想称为稳定版

示例：

- `0.3.0-beta.1 -> 0.3.0-beta.2`
- `0.3.0-beta.2 -> 0.3.0-rc.1`
- `0.3.0-rc.1 -> 0.3.0`

### 8.4 已发布版本后的补丁顺序

如果某个稳定版本已经完成对外发布，应将它视为“已发布版本”：

- 已存在对应 Git tag，例如 `v0.2.1`
- 已存在对应 GitHub Release
- 或已经通过 `Publish Release` 工作流完成正式发布

长期规则：

- 已发布的稳定版本不应为了补进迟到的小修复而直接替换
- 不应通过重写 tag、强推 tag、删除后重发同版本稳定版来覆盖既有发布
- 如果 `0.2.1` 已经正式发布，后续新修复默认进入 `0.2.2`
- 只有当目标版本尚未正式发布时，才继续沿用同一个版本号准备发布

示例：

- `0.2.1` 已发布，之后又修复了页面切换动效与系统噪音进程过滤，则下一版应为 `0.2.2`
- `0.2.1` 还只停留在本地准备阶段、尚未发布，则仍可继续整理后以 `0.2.1` 发布

---

## 9. CHANGELOG 规范

`CHANGELOG.md` 是本项目发布说明的长期单一来源。

### 9.1 文件位置

- 固定放在仓库根目录：`CHANGELOG.md`

### 9.2 基本结构

长期使用以下结构：

```md
# Changelog

## [Unreleased]

Release: 待定。

App note: 待定。

### Added
### Changed
### Fixed
### Removed
### Internal

## [0.2.0] - 2026-04-07

Release: 一句话概括这个版本最值得用户知道的变化。

App note: 一句话概括应用内更新弹窗中展示的变化。

### Added
### Changed
### Fixed
```

### 9.3 版本摘要字段

每个正式版本节顶部必须包含两个摘要字段：

- `Release:`：给 GitHub Release 正文使用的简短版本摘要。
- `App note:`：给应用内更新弹窗使用的一句话更新说明。

这两个字段都写在对应版本节的分类标题之前。

`Release:` 的写法：

- 面向最终用户，而不是面向开发者。
- 默认写成一句话，不超过 100 个中文字符。
- 优先说明“新增了什么、改善了什么、修复了什么体验问题”。
- 可以覆盖 1 到 3 个最重要变化，但不要塞满全部 changelog。
- 避免使用“正式基线”“架构收口”“内部优化”等用户不关心的表达。

`App note:` 的写法：

- 比 `Release:` 更短，默认不超过 40 个中文字符。
- 用于应用内更新弹窗，只提醒用户这次更新的大方向。
- 不写安装步骤、验证信息、内部技术细节。

示例：

```md
## [0.2.2] - 2026-04-13

Release: 改善页面切换稳定性，并过滤系统噪音记录。

App note: 改善切页动效，并过滤系统噪音记录。
```

### 9.4 分类规则

推荐分类：

- `Added`
- `Changed`
- `Fixed`
- `Removed`
- `Internal`

其中：

- `Added / Changed / Fixed / Removed` 面向 release 读者
- `Internal` 只用于记录确实影响发布质量判断的内部改动，不要塞满纯技术噪音

### 9.5 编写规则

每条 changelog 应遵循：

- 以用户或发布读者能理解的语言描述
- 优先记录“能力、行为、体验、稳定性”的变化
- 不要逐条抄 commit message
- 不要把纯目录移动、无感知重命名写成主要更新

### 9.6 维护规则

开发进行中：

- 新变化先写进 `Unreleased`
- `Unreleased` 的 `Release:` 和 `App note:` 可以暂时写 `待定。`

准备发布时：

- 将 `Unreleased` 内容整理到新的版本节
- 填上正式版本号和发布日期
- 将 `Release:` 和 `App note:` 改成该版本的最终短文案
- 新建空的 `Unreleased` 节保留给后续开发

### 9.7 与 GitHub Release 的分工

`CHANGELOG.md` 与 GitHub Release 正文相关，但两者不应机械地逐字相同。

长期规则：

- `CHANGELOG.md` 是仓库内的长期版本档案
- GitHub Release 正文是面向用户的该版本更新说明
- `CHANGELOG.md` 是唯一来源，但不是整段复制来源

因此：

- `CHANGELOG.md` 可以比 GitHub Release 更完整
- `CHANGELOG.md` 主要服务版本追溯、后续维护与内部回顾
- GitHub Release 应优先使用对应版本节的 `Release:` 字段
- GitHub Release 可从 `Added / Changed / Fixed / Removed` 中挑选 3 到 6 条用户可见变化
- GitHub Release 不应直接整段复制完整版本节
- GitHub Release 默认采用“简短版”写法，除非该版本确实存在必须详细解释的安装、迁移或兼容性风险

---

## 10. GitHub Release 规范

### 10.1 发布来源

当前项目默认从 `main` 发布。

除非以后明确引入 release branch，否则：

- 发布前先把 `main` 调整到可发布状态
- 再打 tag
- 再创建 GitHub Release

### 10.2 Tag 规则

统一使用：

- `v0.2.1`
- `v0.2.2`
- `v0.3.0-beta.1`

不要使用：

- `release-0.2`
- `0.2`
- `build-12`

### 10.3 GitHub Release 标题

统一使用：

- `Time Tracker v0.2.2`
- `Time Tracker v0.3.0-beta.1`

### 10.4 GitHub Release 内容来源

GitHub Release 正文必须来自 `CHANGELOG.md` 中对应版本节，但不是完整复制该版本节。

推荐结构：

1. 使用对应版本节的 `Release:` 作为开头摘要
2. 从 `Added / Changed / Fixed / Removed` 中挑选 3 到 6 条用户可见变化
3. 验证信息
4. 需要时补充安装包、已知注意事项或迁移提示
5. 附件说明

应用内更新弹窗使用对应版本节的 `App note:`，不使用完整 GitHub Release 正文。

推荐 GitHub Release 正文格式：

```md
改善页面切换稳定性，并过滤 `openwith.exe` 这类系统噪音记录。

### 主要变化

- 收紧主页面切换时的入场方式，减少切页时的二段位移感。
- 修复 `openwith.exe` 被当作普通应用进入追踪与分类主路径的问题。
- 保持自动更新说明与安装包发布流程的一致性。

### 下载

- Windows 安装包：请下载本页附件中的 `.exe` 安装包。
```

补充规则：

- GitHub Release 正文应从 `CHANGELOG.md` 对应版本节中生成，而不是另建一份文档
- GitHub Release 应优先使用面向用户的简短语言
- GitHub Release 只保留最重要、最值得让用户知道的变化
- 更完整的版本历史保留在 `CHANGELOG.md`
- 默认控制为“一段短摘要 + 3 到 6 条核心变化 + 必要时的安装或附件说明”
- 若没有明显必要，不要把 `Added / Changed / Fixed / Removed / Internal` 全部分节原样搬进 GitHub Release
- 默认不把 `Internal` 写进 GitHub Release，除非它直接影响安装、升级、数据安全或用户可感知稳定性
- GitHub Release 的首要目标是让用户在几十秒内看懂“这版是什么、值不值得更新、该下哪个包”

### 10.5 GitHub Release 附件命名

应用显示名保持 `Time Tracker`。

为了避免 GitHub、浏览器或 shell 对空格做不同处理，GitHub Release 中的 Windows 安装包附件统一使用无空格文件名：

```text
TimeTracker_X.Y.Z_x64-setup.exe
```

示例：

```text
TimeTracker_0.2.2_x64-setup.exe
```

### 10.6 Pre-release 规则

只有带显式预发布后缀的版本，才勾选 GitHub 的 `Pre-release`。

例如：

- `v0.3.0-beta.1`：勾选 `Pre-release`
- `v0.3.0-rc.1`：勾选 `Pre-release`
- `v0.3.0`：不勾选

---

## 11. 发布流程

每次正式发布默认通过 GitHub Actions 完成。

推荐操作入口：

1. 先确认目标版本是否已经正式发布。
2. 如果上一个稳定版已经发布，且这之后又新增修复，则改发下一个 `PATCH` 版本。
3. 在 `CHANGELOG.md` 准备好目标版本节，并写好 `Release:` 与 `App note:`。
4. 将发版准备提交并推到 `main`，确保工作流看到的是最新仓库状态。
5. 打开 GitHub Actions 中的 `Publish Release`。
6. 点击 `Run workflow`。
7. 输入目标版本号，例如 `0.2.2`。
8. 等待 Actions 自动完成版本同步、校验、打 tag、构建、创建 GitHub Release 与更新通道发布。

自动化流程按以下顺序执行：

1. Checkout 当前仓库状态
2. 检查目标 tag 是否已经存在
3. 如 tag 已存在，则 checkout 该 tag 并走补发 / 重跑路径
4. 安装 Node 依赖
5. 如 tag 不存在，则同步更新 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml`
6. 检查 `CHANGELOG.md` 中是否存在对应版本节、`Release:` 与 `App note:`
7. 生成 GitHub Release 正文
8. 如 tag 不存在，则运行前端构建、测试与 Rust 校验
9. 如 tag 不存在，则提交 `release: vX.Y.Z` 并创建、推送 tag
10. 校验 updater signing key
11. 从目标 commit / tag 构建 Tauri 安装包与 updater 产物
12. 生成 `latest.json`
13. 自动创建 GitHub Release 并上传用户安装包
14. 将 `latest.json` 发布到固定更新通道

这个顺序不只是操作步骤，也是长期约束：

- 先定版本
- 再同步代码与文档
- 最后对外发布

不要反过来先打 tag、先写 Release，再回头补代码版本和 changelog。

### 11.1 自动化工作流

仓库长期只保留一个 GitHub Actions 发布入口：

- `Publish Release`

`Publish Release` 是正常发版入口，由用户手动触发，输入目标版本号后负责：

- 校验目标 tag 是否已经存在。
- 同步 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json` 与 `src-tauri/Cargo.toml` 版本号。
- 检查 `CHANGELOG.md` 中对应版本的 `Release:` 与 `App note:` 是否已完成。
- 先生成 GitHub Release 正文，再进入构建与发布步骤。
- 运行最小发布校验。
- 如果目标 tag 不存在，提交 `release: vX.Y.Z` commit 并创建、推送 `vX.Y.Z` tag。
- 如果目标 tag 已存在，直接从该 tag 构建并补发 Release。
- 从 tag 对应 commit 构建 Tauri Windows 安装包。
- 使用 GitHub Secrets 中的 updater 私钥生成安装包签名。
- 从 `CHANGELOG.md` 生成简短 GitHub Release 正文。
- 自动创建 GitHub Release，只上传用户需要下载的安装包。
- 生成 updater 使用的 `latest.json`。
- 将 `latest.json` 发布到 `updates` 分支。

Release 页面不展示 `latest.json` 或 `.sig`。用户只会看到普通安装包；签名内容会写进 `latest.json`，由应用通过固定 HTTPS 地址读取。

### 11.2 自动更新通道

应用内 updater 使用固定地址：

```text
https://raw.githubusercontent.com/182376/time-tracking/updates/latest.json
```

`latest.json` 由发布工作流生成，内容来自：

- `version`：本次 tag 版本号。
- `notes`：`CHANGELOG.md` 对应版本的 `App note:`。
- `platforms.windows-x86_64.url`：GitHub Release 中的 Windows 安装包地址。
- `platforms.windows-x86_64.signature`：Tauri updater 签名。

`updates` 分支是机器读取通道，不作为用户阅读入口。普通用户只需要 GitHub Release 页面中的 Windows 安装包。

启用真实自动更新前必须完成一次性配置：

- 生成 Tauri updater signing key。
- 将公钥写入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。
- 将私钥保存在本机项目目录 `.secrets/tauri/time-tracker.key`。
- `.secrets/` 必须保持在 `.gitignore` 中，私钥不得提交到仓库。
- 将 `.secrets/tauri/time-tracker.key` 的完整内容保存到 GitHub Secrets：`TAURI_SIGNING_PRIVATE_KEY`。
- 如果私钥有密码，将密码保存到 GitHub Secrets：`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 当前私钥未设置密码，因此暂时不需要 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

---

## 12. 最小发布校验

本项目当前推荐的最小发布校验为：

- `npm run build`
- `npm test`
- `npm run test:replay`
- `cargo check`

如本轮改动明确影响 Rust tracking/runtime 核心链路，建议追加：

- `cargo test`

长期上：

- 没有完成最小发布校验，不应标记为正式稳定发布

---

## 13. 发布产物规则

GitHub Release 附件应优先使用 Tauri 打包产物。

当前默认产物来源：

- `src-tauri/target/release/bundle/`

如果某轮只想先发布 tag 和 release notes，不上传安装包，应在 release 正文中明确说明。

如果上传安装包，长期上应保持：

- 产物来源一致
- 平台说明清楚
- release 正文与附件命名不冲突

---

## 14. 当前仓库的落地现状

当前仓库已经进入“沿既有正式版本持续迭代”的阶段，不再需要讨论“首个正式版本应该从哪里开始”。

按当前现状，发布时应遵循：

- 以已存在的稳定版历史为前提继续推进，不回退到 `0.1.0` 视角重做版本判断
- 当前主要维护线按 `0.2.x` 稳定版继续推进
- 若 `0.2.1` 已正式发布，而之后又新增 bug 修复或 UI / 稳定性补丁，则下一版应准备为 `0.2.2`
- 只有在明确引入新用户能力、重要设置项或较大流程变化时，才考虑升到下一个 `MINOR`
- 如果要重跑同一版本的发布，应优先依赖“目标 tag 已存在时的补发路径”，而不是重写既有稳定版 tag

这套规则的目的不是追求版本号好看，而是让：

- 已发布版本有稳定历史
- 后续补丁有明确顺序
- 工作流可以安全重跑
- `CHANGELOG`、tag、GitHub Release 与 updater 通道保持同一语义

---

## 15. 常见错误

- 版本号只改了前端，没有同步改 Tauri 配置
- 先发了 tag，后补 changelog
- GitHub Release 文案完全照抄 changelog
- changelog 只写技术动作，没有写用户可感知变化
- 已经正式发布稳定版后，又回头替换同版本 tag / release
- 用没有明确语义的预发布后缀
- 没跑最小发布校验就把版本标为稳定版

---

## 16. 长期执行原则

以后每次要发 GitHub Release，都默认遵循以下原则：

- 先定版本，再改文档，再发 release
- 已发布稳定版默认不替换；后续修复顺延到下一个 `PATCH`
- `CHANGELOG.md` 是 release notes 的长期单一来源
- 版本号必须在代码、tag、release 标题中一致
- 没有完成最小发布校验，不应标记为正式稳定发布
- 不再临时发明新的 tag 格式、版本后缀或 release 文案结构
- 默认由 Codex 执行大部分发布准备，GitHub 页面中的最终发布动作由用户完成，除非后续工具能力明确覆盖该步骤
