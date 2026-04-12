# Changelog

本文件记录会进入 GitHub Release 的长期版本说明。

格式遵循仓库内的 [`docs/versioning-and-release-policy.md`](C:/Users/SYBao/Documents/Code/Time%20Tracking/docs/versioning-and-release-policy.md)。

## [Unreleased]

### Added

- 预留给下一个版本的新增能力。

### Changed

- 预留给下一个版本的重要行为或体验变化。

### Fixed

- 预留给下一个版本的修复项。

### Removed

- 预留给下一个版本的移除项。

### Internal

- 预留给下一个版本中与发布质量相关的内部收口项。

## [0.1.0] - 2026-04-07

### Added

- 首次建立正式 GitHub Release 基线，并同步引入长期版本、changelog 与发布规范。
- 初步完成本地优先的 Windows 桌面时间追踪工作流，支持自动前台应用追踪、今日概览、历史视图与应用分类管理。
- 新增应用映射工作台，支持应用重命名、分类覆盖、颜色覆盖、统计开关、标题记录开关、恢复默认与历史删除。
- 新增设置页显式保存 / 取消流程，补齐应用内切页未保存提示。
- 新增本地备份导出与恢复能力，以及历史保留期清理能力。

### Changed

- 前端主路径已统一收口到 Quiet Pro 组件体系，包含对话框、下拉、开关、颜色入口、分段筛选、行内轻操作、图表 tooltip 与 toast。
- 前端边界进一步收紧到 `app / features / shared / lib` 的目标方向，多个 legacy service 与历史壳层已退场。
- Rust 侧继续推进 `app / engine / data / domain` 分层，tracking runtime、settings repository、sqlite pool 等边界已明显收口。
- 应用映射与设置页改为更稳定的显式提交流程，减少自动持久化带来的误操作。

### Fixed

- 修复多处 App Mapping 编辑、保存、未保存提示与局部刷新问题，避免截图软件或实时 tracking 刷新误触发整页重载。
- 修复分类控制、颜色选择器、行内控件和 Quiet Pro 收口过程中的多处 UI 对齐、遮挡、编码与交互问题。
- 改善 AFK、锁屏、睡眠边界以及 runtime 健康链路下的会话稳定性与统计可信度。
- 修复首页与历史页在冷启动、重装后偶发未及时应用最新应用映射的问题，确保自定义名称、分类与颜色覆盖能够稳定生效。
- 修复首页统计中偶发回退到旧应用名或落入“未分类”的情况，统一页面加载时的分类映射刷新链路。

### Internal

- 建立长期架构目标文档与 Quiet Pro 规范文档，后续重构和 UI 扩展已有稳定依据。
- 为版本发布新增长期版本与 GitHub Release 规范，后续版本管理不再依赖一次性说明。
- 调整前端读模型加载边界，将分类运行时刷新编排收回 `app/services`，保持 `shared` 层聚焦稳定共享只读能力。
