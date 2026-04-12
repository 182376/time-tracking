# Time Tracker

Time Tracker 是一个本地优先的 Windows 桌面时间追踪应用。

它会自动记录你当前正在使用的前台应用，并把这些活动整理成清晰的今日概览、历史视图和可读的专注时间线。

项目基于 **Rust**、**Tauri v2**、**React** 和 **TypeScript** 构建。

## 这个项目是做什么的

很多时间追踪工具要么依赖手动开关计时器，要么虽然会自动记录前台窗口，但统计结果很快就会变得不可信。

Time Tracker 想解决的是更基础的问题：

- 自动记录真实的桌面使用行为
- 尽量把数据留在本地
- 更认真地处理 AFK、锁屏、睡眠等桌面边界
- 把结果整理成每天都看得懂、用得上的界面

它首先是一个个人桌面工具，而不是团队协作 SaaS，也不是带强游戏化的效率产品。

## 当前已经支持

- 自动追踪当前正在使用的前台应用
- 今日概览，包括应用排行、分类分布、小时活跃情况
- 历史页，用于回看当天和近 7 天的活动
- 应用映射工作台，支持：
  - 应用重命名
  - 分类覆盖
  - 颜色覆盖
  - 排除出统计
  - 按应用关闭标题记录
  - 删除历史记录
- 设置页显式保存 / 取消流程
- 本地备份导出与恢复
- 历史保留期清理
- 托盘、最小化、开机启动等桌面行为设置

## 为什么它的统计更可信

时间追踪只有在“数字看起来可信”的前提下才有意义。当前项目主要依赖这些机制来保证统计结果更可靠：

- **原生窗口追踪**：通过 Rust 和 Windows API 获取前台窗口信息
- **AFK 感知**：空闲时间不会被悄悄算成有效工作时间
- **锁屏 / 睡眠边界处理**：避免会话跨休息时间错误延长
- **异常恢复**：程序中断后会尽量在最后有效心跳附近封口会话
- **系统应用过滤**：减少系统级噪音对统计结果的污染
- **真实时长统计**：总时长基于真实活跃时间，而不是视觉拼接结果

## 如何理解首页和时间线

当你对比首页统计和历史页时间线时，记住 3 条规则：

1. 首页和统计卡片使用真实活跃时长。
2. 历史时间线为了可读性，可能会合并短暂打断。
3. 时间线最小时长筛选只影响显示，不影响总时长。

所以你会看到：时间线看起来更简洁，但统计总量依然保持准确。

## 隐私与数据

- 核心数据保存在本地 **SQLite**
- 正常使用不依赖账号、云同步或远程服务
- 可以按应用关闭标题记录
- 当前备份会覆盖 `sessions`、`settings` 和 `icon_cache`

## 当前范围

项目目前聚焦在一个刻意收紧的范围内：

- **Windows 10 / 11 优先**
- **个人使用优先**
- **本地优先存储与控制**

当前不以这些方向为目标：

- 团队协作
- 云优先工作流
- 移动端优先
- 多平台完全一致

## 快速开始

### 环境要求

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) 18 或更高版本

### 安装依赖

```bash
git clone https://github.com/182376/time-tracking.git
cd time-tracking
npm install
```

### 开发运行

```bash
npm run tauri dev
```

### 运行测试

```bash
npm test
npm run test:replay
cd src-tauri
cargo test
```

### 构建发布包

```bash
npm run build
npm run tauri build
```

打包后的安装器会输出到：

```text
src-tauri/target/release/bundle/
```

## 技术栈

- 桌面壳：Tauri v2
- 后端：Rust
- 前端：React + Vite + TypeScript
- 样式：Tailwind CSS
- 动画：Framer Motion
- 图表：Recharts
- 数据库：SQLite（`@tauri-apps/plugin-sql`）
- Windows 集成：`windows` crate

## 项目文档

长期有效的项目文档可从这里开始：

- [`docs/product-principles-and-scope.md`](docs/product-principles-and-scope.md)
- [`docs/roadmap-and-prioritization.md`](docs/roadmap-and-prioritization.md)
- [`docs/architecture-target.md`](docs/architecture-target.md)
- [`docs/quiet-pro-component-guidelines.md`](docs/quiet-pro-component-guidelines.md)
- [`docs/versioning-and-release-policy.md`](docs/versioning-and-release-policy.md)

## 反馈与发布

- Releases：<https://github.com/182376/time-tracking/releases>
- Issues：<https://github.com/182376/time-tracking/issues/new/choose>

## License

MIT
