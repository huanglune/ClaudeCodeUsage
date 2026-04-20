# Claude Code Usage

> **Community-maintained fork of [jack21/ClaudeCodeUsage](https://github.com/jack21/ClaudeCodeUsage).** Original author credit preserved in [LICENSE](LICENSE).

🌐 **Language | 语言**: **English** | [简体中文](README.md)

---

A comprehensive VSCode extension that monitors Claude Code usage and costs with detailed analytics and interactive visualizations.

## 🖼️ Screenshot

### Status Bar

![Status Bar Preview](images/status-bar-preview.jpg)

### Dashboard

![Dashboard Preview](images/dashboard-preview.jpg)

## ✨ Features

### 📊 Real-time Monitoring

- **Status Bar Display**: Shows today's usage costs in the VSCode status bar
- **Live Updates**: Automatic data refresh with configurable intervals (minimum 30 seconds)
- **Zero Dependencies**: Built with native Node.js modules for maximum compatibility

### 💰 Automated Pricing (v2.0)

- **Always-current rates**: Model pricing is fetched weekly from [LiteLLM's community dataset](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json), validated through three guardrails (schema, sanity bounds, 10x jump detector), and committed automatically — no more manual pricing updates when Anthropic announces a new model.
- **Tiered pricing**: Correctly applies the 200k-token threshold for Claude 4+ 1M-context variants (Opus 4.5+/Sonnet 4.5+).
- **Offline mode**: `pricingOfflineMode` setting lets you disable the runtime refresh; extension falls back to the snapshot bundled at release time.
- **Background refresh**: On launch, the extension loads the bundled snapshot instantly, then fires a detached fetch to overlay a fresher copy for next launch — activation is never blocked on the network.

### 📈 Interactive Analytics Dashboard

- **Multiple Time Views**: Today, This Month, and All Time perspectives
- **Interactive Charts**: Switchable bar charts with 6 different metrics:
  - Cost breakdown
  - Input/Output tokens
  - Cache creation/read tokens
  - Message counts
- **Hourly Breakdown**: Detailed hourly usage analysis for today and specific dates
- **Expandable Monthly Data**: Click on any month in "All Time" to view daily breakdown
- **Detailed Tables**: Comprehensive daily/monthly usage breakdowns with drill-down capabilities
- **Model Analysis**: Per-model cost and token consumption tracking

![Dashboard Preview](images/dashboard-preview.jpg)

### 🌐 Multi-language Support

- **5 Languages**: English, 繁體中文, 简体中文, 日本語, 한국어
- **Auto-detection**: Automatically detects system language
- **Manual Override**: Choose your preferred language in settings

### 🎨 Visual Features

- **Bottom-up Charts**: Industry-standard chart orientation
- **Monthly Trends**: All-time view shows monthly aggregated data for long-term analysis
- **VSCode Theme Integration**: Seamless light/dark theme support
- **Responsive Design**: Optimized for different screen sizes

## 📥 Download & Installation

This community fork is distributed via [GitHub Releases](https://github.com/huanglune/ClaudeCodeUsage/releases) (not VS Marketplace yet — see [Maintainer Setup](#maintainer-setup)).

1. Go to [Releases](https://github.com/huanglune/ClaudeCodeUsage/releases/latest) and download the `extension.vsix` asset.
2. Install it:
   ```bash
   code --install-extension extension.vsix
   ```
   Or in VS Code: `Extensions` panel → `…` menu → `Install from VSIX…`.
3. The extension will auto-detect your Claude Code data directory on startup; today's cost appears in the status bar.

## Configuration

Access settings via `File > Preferences > Settings` and search for "Claude Code Usage":

- **Refresh Interval**: How often to update usage data (minimum 30 seconds)
- **Data Directory**: Custom Claude data directory path (leave empty for auto-detection)
- **Language**: Display language preference
- **Decimal Places**: Number of decimal places for cost display
- **Pricing Offline Mode** (v2.0): If true, skip the background LiteLLM fetch and only use the pricing snapshot bundled with the installed extension. Useful for air-gapped environments.

## 🚀 Usage

### Status Bar

- Shows **today's usage cost** with a pulse icon
- Click to open the detailed analytics dashboard

### Analytics Dashboard

1. **Time Tabs**: Switch between Today, This Month, and All Time views
2. **Chart Metrics**: Click tabs above charts to switch between:
   - Cost breakdown
   - Input/Output tokens
   - Cache creation/read tokens
   - Message counts
3. **Hourly Analysis**: View hourly usage patterns in "Today" tab
4. **Expandable Data**:
   - Click on daily entries in "This Month" to see hourly breakdown
   - Click on monthly entries in "All Time" to see daily breakdown
5. **Interactive Tables**: Detailed daily/monthly breakdowns below charts
6. **Model Analysis**: Per-model usage statistics in each tab

## 📋 Requirements

- **Claude Code**: Must be installed and running
- **VSCode**: Version 1.74.0 or later
- **Node.js**: Built-in modules only (no external dependencies)

## 🛠️ Troubleshooting

### "No Claude Code Data" Error

1. Ensure Claude Code is installed and has been used
2. Check the data directory setting in extension preferences
3. Verify Claude Code is generating usage logs in `~/.claude/projects` or `~/.config/claude/projects`

### Charts Not Updating

1. Switch to a different tab and back to refresh the chart
2. Check if the time period has actual usage data
3. Verify cache tokens are available in your Claude usage

### Performance Issues

- Increase refresh interval if experiencing slowdowns
- Extension uses 1-minute caching to minimize file I/O

## License

MIT

## 📝 Changelog

### v2.0.0 (2026-04-20) — Community fork relaunch

- 🔀 Forked from [jack21/ClaudeCodeUsage](https://github.com/jack21/ClaudeCodeUsage) (inactive since Nov 2025) and re-published as `huanglune.claude-code-usage-community`
- 💰 Pricing now auto-synced weekly from LiteLLM with three guardrails — no more hand-editing `src/pricing.ts`
- 📊 Added tiered pricing support for 1M-context Claude 4+ models (200k threshold)
- 🌐 Runtime pricing refresh with `pricingOfflineMode` opt-out for air-gapped use
- 🧪 Added test suite (28 tests covering validate / filter / sanity-check / cost computation)
- 🤖 Added three GitHub Actions workflows: CI (PR/main verification), weekly pricing sync, tag-triggered release
- 🗂️ Trimmed documentation to English + Simplified Chinese (extension UI still supports 5 languages)

### v1.0.8 (2025-11-28)

- 📝 Converted all code comments from Traditional Chinese to English
- 🌍 Improved code internationalization standards
- 🔧 Enhanced code readability and maintainability
- 💰 Fixed pricing table with new Opus 4.5 / Haiku 4.5 prices (thanks to [@mxzinke](https://github.com/mxzinke))
- 🇩🇪 Added German (de-DE) translation support (thanks to [@mxzinke](https://github.com/mxzinke))

### v1.0.7 (2025-11-28)

- 🌐 Added multilingual translation support for hourly usage labels
- 🔧 Removed hardcoded Chinese text from code, replaced with i18n translation system
- ✨ Ensured multilingual consistency across user interface (English, Traditional Chinese, Simplified Chinese, Japanese, Korean)

### v1.0.6 (2025-08-10)

- 🆕 Added support for Claude Opus 4.1 model pricing
- 🔄 Updated pricing data to include `claude-opus-4-1-20250805` and `claude-opus-4-1` model IDs
- 📊 Pricing remains the same as Opus 4 ($15/1M input, $75/1M output tokens)

### v1.0.5 (2025-01)

- ⏰ Added hourly usage statistics and visualization
- 📈 Enhanced dashboard with hourly breakdown functionality
- 🔧 Improved data processing for hourly aggregation

### v1.0.4 (2025-01)

- 📊 Added all-time data calculation functionality
- 🎨 Updated UI to display all-time usage data with charts and labels
- 🔄 Fixed data update logic to support new data structure
- 🌐 Added "All Time" translations to multi-language support

### v1.0.3 (2025-01)

- 🔗 Updated GitHub repository URL
- 🖼️ Fixed README image links to point to new repository location
- 📦 Version bump and repository migration

### v1.0.0 (2025-01)

- 🎉 Initial complete release
- 📊 Real-time Claude Code usage monitoring in status bar
- 🌐 Multi-language support (English, 繁體中文, 简体中文, 日本語, 한국어)
- 📈 Interactive analytics dashboard with charts and tables
- 🎨 VSCode theme integration and responsive design
- ⚙️ Configurable refresh intervals and settings

## Contributing

Issues and pull requests are welcome on the GitHub repository.

## Maintainer Setup

### Current release flow

Creating and pushing a version tag triggers `.github/workflows/release.yml`, for example:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

It then:

1. Compiles the extension
2. Packages a `.vsix` file
3. Creates a GitHub Release with the `.vsix` attached

Users install by downloading the `.vsix` from Releases and running `code --install-extension <file>.vsix`.

### Automatic version bump (enabled)

`.github/workflows/bump-version.yml` uses a GitHub App token and runs on every push to `main`.

Before enabling it, complete these prerequisites:

1. Create a GitHub App with at least `Contents: Read and write` permission and install it on this repository
2. Add repo secrets `APP_ID` and `APP_PRIVATE_KEY` in `Settings → Secrets and variables → Actions`
3. If branch protection Rulesets are enabled, allow this GitHub App in the bypass actors list

The workflow will then:

1. Apply a `patch` bump to `package.json` / `package-lock.json`
2. Commit the version update back to `main` as `github-actions[bot]`

Default commit message format: `chore(version): bump to vX.Y.Z [skip version]`.  
To skip the auto bump for a specific commit, include `[skip version]` in the commit message.

### Enabling Marketplace auto-publish (not active yet)

When the maintainer registers publishing tokens, the release workflow can also push to the two marketplaces. To enable, add these as repo secrets at `Settings → Secrets and variables → Actions → New repository secret`:

| Secret | How to get |
|---|---|
| `VSCE_PAT` | https://dev.azure.com/ → User settings → Personal access tokens → New. Scope: *Marketplace (Manage)*. |
| `OVSX_PAT` | https://open-vsx.org → Profile → Access Tokens → Generate new token. |

Then uncomment / re-add the `vsce publish` and `ovsx publish` steps in `.github/workflows/release.yml`.

### Pricing updates

`src/pricing-data.json` is auto-refreshed from [LiteLLM](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) by `.github/workflows/update-pricing.yml` every Monday 03:00 UTC. The script applies three guardrails (schema, price sanity bounds, 10x jump detector) before committing. Manual trigger: `gh workflow run update-pricing.yml`.
