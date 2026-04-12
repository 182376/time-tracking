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

当前长期发布基线是：

- 代码版本基线：`0.1.0`

补充说明：

- 过去出现过的 `0.1.0-1` 属于临时版本号，不再作为长期规范使用
- 本项目当前仍未到 `1.0.0`
- 但也不再适合继续用临时、无语义的版本后缀管理发布

---

## 5. 版本号的单一来源

每次发布时，以下 4 处必须保持一致：

- `package.json` 中的 `version`
- `src-tauri/tauri.conf.json` 中的 `version`
- Git tag
- GitHub Release 标题中的版本号

统一规则：

- 代码版本号使用不带前缀的 SemVer 字符串
- Git tag 使用带 `v` 前缀的形式
- GitHub Release 标题使用 `Time Tracker vX.Y.Z`

示例：

- 代码版本：`0.2.0`
- Git tag：`v0.2.0`
- GitHub Release 标题：`Time Tracker v0.2.0`

长期上：

- `package.json` 与 `src-tauri/tauri.conf.json` 是代码内的双同步来源
- Git tag 与 GitHub Release 是对外发布语义的同步来源

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

### Added
### Changed
### Fixed
### Removed
### Internal

## [0.2.0] - 2026-04-07

### Added
### Changed
### Fixed
```

### 9.3 分类规则

推荐分类：

- `Added`
- `Changed`
- `Fixed`
- `Removed`
- `Internal`

其中：

- `Added / Changed / Fixed / Removed` 面向 release 读者
- `Internal` 只用于记录确实影响发布质量判断的内部改动，不要塞满纯技术噪音

### 9.4 编写规则

每条 changelog 应遵循：

- 以用户或发布读者能理解的语言描述
- 优先记录“能力、行为、体验、稳定性”的变化
- 不要逐条抄 commit message
- 不要把纯目录移动、无感知重命名写成主要更新

### 9.5 维护规则

开发进行中：

- 新变化先写进 `Unreleased`

准备发布时：

- 将 `Unreleased` 内容整理到新的版本节
- 填上正式版本号和发布日期
- 新建空的 `Unreleased` 节保留给后续开发

### 9.6 与 GitHub Release 的分工

`CHANGELOG.md` 与 GitHub Release 正文相关，但两者不应机械地逐字相同。

长期规则：

- `CHANGELOG.md` 是仓库内的长期版本档案
- GitHub Release 正文是面向用户的该版本更新说明

因此：

- `CHANGELOG.md` 可以比 GitHub Release 更完整
- `CHANGELOG.md` 主要服务版本追溯、后续维护与内部回顾
- GitHub Release 应更短、更好扫读，更强调用户可感知的变化
- GitHub Release 不应直接整段复制 `CHANGELOG.md`
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

- `v0.2.0`
- `v0.2.1`
- `v0.3.0-beta.1`

不要使用：

- `release-0.2`
- `0.2`
- `build-12`

### 10.3 GitHub Release 标题

统一使用：

- `Time Tracker v0.2.0`
- `Time Tracker v0.3.0-beta.1`

### 10.4 GitHub Release 内容来源

GitHub Release 正文应优先来自 `CHANGELOG.md` 中对应版本节。

推荐结构：

1. 一段简短版本摘要
2. `Added / Changed / Fixed` 主要内容
3. 验证信息
4. 需要时补充安装包、已知注意事项或迁移提示
5. 附件说明

补充规则：

- GitHub Release 正文应从 `CHANGELOG.md` 对应版本节中提炼，而不是整段照抄
- GitHub Release 应优先使用面向用户的简短语言
- GitHub Release 只保留最重要、最值得让用户知道的变化
- 更完整的版本历史保留在 `CHANGELOG.md`
- 默认控制为“一段短摘要 + 3 到 6 条核心变化 + 必要时的安装或附件说明”
- 若没有明显必要，不要把 `Added / Changed / Fixed / Internal` 全部分节原样搬进 GitHub Release
- GitHub Release 的首要目标是让用户在几十秒内看懂“这版是什么、值不值得更新、该下哪个包”

### 10.5 Pre-release 规则

只有带显式预发布后缀的版本，才勾选 GitHub 的 `Pre-release`。

例如：

- `v0.3.0-beta.1`：勾选 `Pre-release`
- `v0.3.0-rc.1`：勾选 `Pre-release`
- `v0.3.0`：不勾选

---

## 11. 发布流程

每次正式发布前，按以下顺序执行：

1. 确定本次目标版本号
2. 同步更新 `package.json`
3. 同步更新 `src-tauri/tauri.conf.json`
4. 更新 `CHANGELOG.md`
5. 运行最小发布校验
6. 提交版本相关改动
7. 打 Git tag
8. 推送 commit 和 tag
9. 在 GitHub 创建 Release 并上传产物

这个顺序不只是操作步骤，也是长期约束：

- 先定版本
- 再同步代码与文档
- 最后对外发布

不要反过来先打 tag、先写 Release，再回头补代码版本和 changelog。

### 11.1 与 Codex 的默认协作方式

如无特殊说明，后续发布流程默认由 Codex 先完成以下工作：

1. 检查并同步版本号
2. 更新 `CHANGELOG.md`
3. 运行最小发布校验
4. 构建发布产物
5. 提交版本相关改动
6. 推送 `main`
7. 创建或移动 Git tag
8. 推送 tag
9. 生成简短版 GitHub Release 正文

在当前工具边界下，用户通常只需要完成最后的 GitHub 网页操作：

- 选择正确的 tag
- 粘贴或确认简短版 release notes
- 上传发布附件
- 点击 `Publish release`

如果未来具备可稳定操作 GitHub Release 页面或 API 的能力，再将最后一步一并自动化；在此之前，默认采用“Codex 完成发布准备，用户完成最终发布按钮”的协作模式。

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

## 14. 当前仓库的落地建议

当前长期发布基线建议保持为：

- 当前发布基线版本：`0.1.0`
- Git tag：`v0.1.0`
- GitHub Release 标题：`Time Tracker v0.1.0`

这样定义的原因是：

- 当前 GitHub 仓库还没有任何公开 release / tag 历史
- 这更适合作为首个正式公开版本，而不是看起来像已经发布过多个小版本后的 `0.4.0`
- 当前产品已经超出原型阶段，适合从 `0.1.0` 开始建立对外版本序列
- 但产品仍处于 Windows 聚焦、持续打磨和逐步成熟阶段，还不适合直接称为 `1.0.0`

如果未来要做公开测试版，可以从后续版本开始使用：

- `0.2.0-beta.1`
- `0.2.0-rc.1`

---

## 15. 常见错误

- 版本号只改了前端，没有同步改 Tauri 配置
- 先发了 tag，后补 changelog
- GitHub Release 文案完全照抄 changelog
- changelog 只写技术动作，没有写用户可感知变化
- 用没有明确语义的预发布后缀
- 没跑最小发布校验就把版本标为稳定版

---

## 16. 长期执行原则

以后每次要发 GitHub Release，都默认遵循以下原则：

- 先定版本，再改文档，再发 release
- `CHANGELOG.md` 是 release notes 的长期单一来源
- 版本号必须在代码、tag、release 标题中一致
- 没有完成最小发布校验，不应标记为正式稳定发布
- 不再临时发明新的 tag 格式、版本后缀或 release 文案结构
- 默认由 Codex 执行大部分发布准备，GitHub 页面中的最终发布动作由用户完成，除非后续工具能力明确覆盖该步骤
