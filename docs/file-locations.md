# Test Agent File Locations

Test Agent stores configuration, data, and cache files in several locations depending on context (VS Code extension vs CLI) and operating system.

## VS Code Extension

When running as a VS Code extension, Test Agent uses VS Code's built-in `globalStorageUri` for data storage. The exact path depends on your OS and VS Code variant:

| OS      | Base path                                                                   |
| ------- | --------------------------------------------------------------------------- |
| Linux   | `~/.config/Code/User/globalStorage/kilocode.kilo-code/`                     |
| macOS   | `~/Library/Application Support/Code/User/globalStorage/kilocode.kilo-code/` |
| Windows | `%APPDATA%\Code\User\globalStorage\kilocode.kilo-code\`                     |

> **Note:** If you use VS Code Insiders, VSCodium, Cursor, or another variant, replace `Code` with the appropriate directory name (e.g. `Code - Insiders`, `VSCodium`, `Cursor`).

> **Remote contexts:** In remote sessions (Dev Containers, SSH, WSL), VS Code Server uses a different base path such as `~/.vscode-server/data/User/globalStorage/kilocode.kilo-code/`. The extension follows whatever path VS Code provides via `globalStorageUri`, so the paths above only apply to local desktop sessions.

Within this directory:

| Path                         | Description                                |
| ---------------------------- | ------------------------------------------ |
| `tasks/<id>/`                | Per-task conversation history and metadata |
| `settings/`                  | Global settings (custom modes, MCP config) |
| `settings/custom_modes.yaml` | Global custom mode definitions             |
| `settings/mcp_settings.json` | Global MCP server configuration            |
| `cache/`                     | Cached model lists and endpoint data       |
| `vector/`                    | Local vector store for code indexing       |
| `puppeteer/`                 | Downloaded Chromium for browser tool       |

You can override the storage base path via the `kilo-code.customStoragePath` VS Code setting.

## CLI / Agent Runtime

When running via the Kilo CLI (`@kilocode/agent-runtime`), files are stored under `~/.testcode/cli/` (on Windows: `%USERPROFILE%\.kilocode\cli\`):

| Path                                            | Description                          |
| ----------------------------------------------- | ------------------------------------ |
| `~/.testcode/cli/global/`                       | Global storage (tasks, settings)     |
| `~/.testcode/cli/global/tasks/`                 | Task conversation history            |
| `~/.testcode/cli/workspaces/`                   | Per-workspace state and session data |
| `~/.testcode/cli/workspaces/workspace-map.json` | Maps workspace paths to folder names |
| `~/.testcode/cli/logs/`                         | Log files                            |

## Per-Project Files

These files live in your project/workspace root:

| Path                      | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `.testcode/rules/`        | Project-specific rule files (instructions for the agent) |
| `.testcode/rules-<mode>/` | Mode-specific rule files                                 |
| `.testcode/workflows/`    | Project-specific workflow definitions                    |
| `.testcode/mcp.json`      | Project-specific MCP server configuration                |
| `.testcode/skills/`       | Project-specific skill definitions                       |
| `.testcodemodes`          | Project-specific custom mode definitions (YAML)          |
| `.testcodeignore`         | Files/directories the agent should not access            |
| `.testcoderules`          | Legacy rule file (prefer `.testcode/rules/` directory)   |

Global rules and workflows can also be placed in your home directory:

- `~/.testcode/rules/` — Global rule files applied to all projects
- `~/.testcode/workflows/` — Global workflow definitions
- `~/.testcode/skills/` — Global skill definitions

## VS Code User Configuration

Test Agent reads VS Code's `settings.json` for extension settings. The location follows the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/) on Linux:

| OS      | Path                                                                                      |
| ------- | ----------------------------------------------------------------------------------------- |
| Linux   | `$XDG_CONFIG_HOME/Code/User/settings.json` (default: `~/.config/Code/User/settings.json`) |
| macOS   | `~/Library/Application Support/Code/User/settings.json`                                   |
| Windows | `%APPDATA%\Code\User\settings.json`                                                       |

## Notes

- The VS Code extension storage path follows VS Code's own conventions, not XDG directly. However, on Linux, VS Code itself respects `$XDG_CONFIG_HOME`.
- The CLI uses `~/.testcode/` as a fixed base directory regardless of XDG settings.
- All paths above use default values. Environment variables like `$XDG_CONFIG_HOME` or `$APPDATA` may change the actual locations.
