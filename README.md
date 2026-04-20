# Claude Code 使用量监控

> **社区维护版 [jack21/ClaudeCodeUsage](https://github.com/jack21/ClaudeCodeUsage) 分支。** 原作者署名保留于 [LICENSE](LICENSE)。

🌐 **Language | 语言**: **简体中文** | [English](README-en.md)

---

全面的 VSCode 扩展，提供 Claude Code 使用量监控、详细分析和交互式可视化图表。

## 🖼️ 截图

### 状态栏

![状态栏预览](images/status-bar-preview.jpg)

### 仪表板

![仪表板预览](images/dashboard-preview.jpg)

## ✨ 功能特色

### 📊 实时监控

- **状态栏显示**：在 VSCode 状态栏显示今日使用成本
- **实时更新**：自动数据刷新，可配置更新间隔（最少 30 秒）
- **零外部依赖**：使用原生 Node.js 模块，确保最大兼容性

### 💰 自动化定价（v2.0）

- **价格始终最新**：每周从 [LiteLLM 社区数据集](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) 自动拉取模型价格，通过三道 guardrail（schema 校验、价格合理区间、10x 跳变检测）后自动提交——Anthropic 发布新模型后不再需要手动改价表。
- **分档计费**：正确处理 Claude 4+ 1M context 模型的 200k token 阈值（Opus 4.5+ / Sonnet 4.5+）。
- **离线模式**：`pricingOfflineMode` 配置项可关闭运行时刷新，只用发版时打包的快照。
- **后台刷新**：启动时瞬间加载打包的快照，然后异步向 LiteLLM 拉最新值写入缓存供下次启动用——启动永不阻塞网络。

### 📈 交互式分析仪表板

- **多重时间视图**：今日、本月和所有时间的使用视角
- **交互式图表**：可切换的柱状图表，支持 6 种不同指标：
  - 成本分析
  - 输入/输出 tokens
  - 缓存创建/读取 tokens
  - 消息数量
- **每小时使用量分析**：提供今日及特定日期的详细每小时使用分析
- **可展开的月度数据**：点击"所有时间"中的任何月份查看每日明细
- **详细表格**：完整的每日/每月使用量分析，支持向下深入查询
- **模型分析**：各模型的成本和 token 消耗跟踪

![仪表板预览](images/dashboard-preview.jpg)

### 🌐 多语言支持

- **5 种语言**：English, 繁體中文, 简体中文, 日本語, 한국어
- **自动检测**：自动检测系统语言
- **手动覆盖**：在设置中选择偏好语言

### 🎨 视觉功能

- **自下而上图表**：符合行业标准的图表方向
- **月度趋势**：所有时间视图显示月度聚合数据，便于长期趋势分析
- **VSCode 主题集成**：完美配合浅色/深色主题
- **响应式设计**：针对不同屏幕尺寸优化

## 📥 下载与安装

当前通过 [GitHub Releases](https://github.com/huanglune/ClaudeCodeUsage/releases) 分发（尚未上架 VS Marketplace，详见 [Maintainer Setup](#maintainer-setup)）。

1. 到 [Releases](https://github.com/huanglune/ClaudeCodeUsage/releases/latest) 下载 `extension.vsix`。
2. 安装：
   ```bash
   code --install-extension extension.vsix
   ```
   或在 VS Code 里：`扩展` 面板 → `…` 菜单 → `从 VSIX 安装…`。
3. 扩展启动时自动检测你的 Claude Code 数据目录，今日成本会出现在状态栏。

## 配置

通过 `文件 > 首选项 > 设置` 并搜索「Claude Code Usage」来访问设置：

- **刷新间隔**：更新使用数据的频率（最少 30 秒）
- **数据目录**：自定义 Claude 数据目录路径（留空以自动检测）
- **语言**：显示语言偏好
- **小数位数**：成本显示的小数位数
- **离线定价模式**（v2.0）：开启后跳过运行时 LiteLLM fetch，只用扩展打包时的快照。适用于内网 / 离线环境。

## 🚀 使用方式

### 状态栏

- 显示**今日使用成本**，附带脉冲图标
- 点击打开详细分析仪表板

### 分析仪表板

1. **时间标签**：在今日、本月和所有时间视图之间切换
2. **图表指标**：点击图表上方的标签切换不同指标：
   - 成本分析
   - 输入/输出 tokens
   - 缓存创建/读取 tokens
   - 消息数量
3. **每小时分析**：在"今日"标签中查看每小时使用模式
4. **可展开数据**：
   - 点击"本月"中的每日项目可查看每小时明细
   - 点击"所有时间"中的每月项目可查看每日明细
5. **交互式表格**：图表下方的详细每日/每月分析
6. **模型分析**：各标签中的模型使用统计


## 📋 系统要求

- **Claude Code**：必须安装并运行
- **VSCode**：1.74.0 或更新版本
- **Node.js**：仅使用内置模块（无外部依赖）

## 🛠️ 故障排除

### "无 Claude Code 数据"错误

1. 确保已安装并使用过 Claude Code
2. 检查扩展首选项中的数据目录设置
3. 验证 Claude Code 正在 `~/.claude/projects` 或 `~/.config/claude/projects` 生成使用记录

### 图表不更新

1. 切换到不同标签再切回来刷新图表
2. 检查该时间段是否有实际使用数据
3. 验证 Claude 使用记录中是否有缓存 tokens

### 性能问题

- 如遇到速度变慢，可增加刷新间隔
- 扩展使用 1 分钟缓存来减少文件 I/O

## 📝 版本更新日志

### v2.0.0 (2026-04-20) — 社区分支重启

- 🔀 从 [jack21/ClaudeCodeUsage](https://github.com/jack21/ClaudeCodeUsage)（2025-11 起停止维护）fork 出来，以 `huanglune.claude-code-usage-community` 身份重新发布
- 💰 模型定价每周自动从 LiteLLM 同步，三道 guardrail 把关——不再手改 `src/pricing.ts`
- 📊 新增 Claude 4+ 1M context 模型的 200k token 分档计费支持
- 🌐 运行时定价刷新，`pricingOfflineMode` 可关闭（内网场景）
- 🧪 新增测试套件（28 个测试覆盖 validate / filter / sanity-check / 成本计算）
- 🤖 新增三个 GitHub Actions workflow：CI（PR/main 验证）、每周定价同步、tag 触发发版
- 🗂️ 文档精简到英文 + 简体中文（扩展 UI 仍支持 5 种语言）

### v1.0.8 (2025-11-28)

- 📝 将所有代码注释从繁体中文改为英文
- 🌍 提升代码的国际化标准
- 🔧 优化代码可读性与维护性
- 💰 修正定价表，加入新的 Opus 4.5 / Haiku 4.5 价格（感谢 [@mxzinke](https://github.com/mxzinke)）
- 🇩🇪 新增德语（de-DE）翻译支持（感谢 [@mxzinke](https://github.com/mxzinke)）

### v1.0.7 (2025-11-28)

- 🌐 新增每小时使用量标签的多语言翻译支持
- 🔧 移除代码中硬编码的中文文字，改用 i18n 翻译系统
- ✨ 确保用户界面的多语言一致性（英文、繁体中文、简体中文、日文、韩文）

### v1.0.6 (2025-08-10)

- 🆕 新增 Claude Opus 4.1 模型定价支持
- 🔄 更新定价数据以包含 `claude-opus-4-1-20250805` 和 `claude-opus-4-1` 模型 ID
- 📊 定价与 Opus 4 相同（$15/1M 输入，$75/1M 输出 tokens）

### v1.0.5 (2025-01)

- ⏰ 新增每小时使用量统计与可视化
- 📈 增强仪表板的每小时细分功能
- 🔧 改善每小时汇总的数据处理

### v1.0.4 (2025-01)

- 📊 新增全时间数据计算功能
- 🎨 更新 UI 以显示全时间使用数据与图表和标签
- 🔄 修正数据更新逻辑以支持新数据结构
- 🌐 在多语言支持中新增「全时间」翻译

### v1.0.3 (2025-01)

- 🔗 更新 GitHub 仓库 URL
- 🖼️ 修正 README 图片链接指向新仓库位置
- 📦 版本升级与仓库迁移

### v1.0.0 (2025-01)

- 🎉 首次完整发行版
- 📊 状态栏实时 Claude Code 使用量监控
- 🌐 多语言支持（English, 繁體中文, 简体中文, 日本語, 한국어）
- 📈 交互式分析仪表板与图表和表格
- 🎨 VSCode 主题整合与响应式设计
- ⚙️ 可设定的重新整理间隔与设定

## 许可证

MIT

## 贡献

欢迎在 GitHub 仓库提出 Issue 和 Pull Request。

## Maintainer Setup

### 当前发版流程

创建并推送版本标签会触发 `.github/workflows/release.yml`，例如：

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

它会：

1. 编译扩展
2. 打包出 `.vsix` 文件
3. 建 GitHub Release 并把 `.vsix` 挂为附件

用户从 Releases 下载 `.vsix`，用 `code --install-extension <file>.vsix` 安装。

### 自动版本递增（已启用）

`.github/workflows/bump-version.yml` 会使用 GitHub App Token 在每次 push 到 `main` 时自动执行。

启用前需要先完成：

1. 创建一个有 `Contents: Read and write` 权限的 GitHub App（安装到本仓库）
2. 在 `Settings → Secrets and variables → Actions` 新建仓库 Secrets：`APP_ID`、`APP_PRIVATE_KEY`
3. 若启用了分支保护（Rulesets），将该 GitHub App 加入允许 bypass 的主体

工作流会自动：

1. 对 `package.json` / `package-lock.json` 执行 `patch` 版本递增
2. 以 `github-actions[bot]` 身份提交回主分支

默认提交信息形如：`chore(version): bump to vX.Y.Z [skip version]`。  
如果某次提交不想触发自动升版本，可在提交信息里加入 `[skip version]`。

### 启用 Marketplace 自动发布（尚未激活）

Maintainer 注册好两个发布 token 之后，release workflow 可以同时推到两个 marketplace。启用方式：在 `Settings → Secrets and variables → Actions → New repository secret` 添加：

| Secret | 获取方式 |
|---|---|
| `VSCE_PAT` | https://dev.azure.com/ → User settings → Personal access tokens → New。Scope: *Marketplace (Manage)*。 |
| `OVSX_PAT` | https://open-vsx.org → Profile → Access Tokens → Generate new token。 |

然后在 `.github/workflows/release.yml` 里把 `vsce publish` 和 `ovsx publish` 两行 step 加回去。

### 定价更新

`src/pricing-data.json` 由 `.github/workflows/update-pricing.yml` 每周一 03:00 UTC 自动从 [LiteLLM](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) 同步。脚本在提交前过三道 guardrail（schema / 价格区间 / 10x 跳变检测）。手动触发：`gh workflow run update-pricing.yml`。
