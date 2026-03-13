# 需求文档

## 简介

在现有的 CMBT Agent（基于 Kilo Code 的 VSCode 插件）中集成 ACP（Agent Client Protocol）协议客户端功能，使插件能够加载和使用符合 ACP 协议的外部智能体（如 OpenCode、Claude Code、GitHub Copilot、Gemini CLI 等）。该功能将参考 vscode-acp 项目的实现，并与现有的 Kilo Code chat 窗口共用界面。

## 术语表

- **ACP_Client**: Agent Client Protocol 客户端，负责与 ACP 智能体通信的核心模块
- **ACP_Agent**: 符合 ACP 协议的外部智能体进程（如 Claude Code、GitHub Copilot 等）
- **Agent_Manager**: 智能体管理器，负责启动和管理 ACP_Agent 子进程
- **Connection_Manager**: 连接管理器，负责建立和维护与 ACP_Agent 的 JSON-RPC 2.0 通信连接
- **Agent_Selector**: 智能体选择器 UI 组件，用于在界面上选择和切换 ACP_Agent
- **Extension_Configuration**: VSCode 扩展配置，存储 ACP_Agent 的启动命令和参数
- **Session_Manager**: 会话管理器，负责管理与 ACP_Agent 的会话状态
- **File_System_Handler**: 文件系统处理器，处理 ACP_Agent 的文件读写请求
- **Terminal_Handler**: 终端处理器，处理 ACP_Agent 的终端操作请求
- **Permission_Handler**: 权限处理器，处理 ACP_Agent 的权限请求

## 需求

### 需求 1: ACP SDK 集成

**用户故事:** 作为开发者，我希望集成 ACP SDK，以便能够使用标准的 ACP 协议与外部智能体通信。

#### 验收标准

1. THE Extension SHALL 添加 `@agentclientprotocol/sdk` (^0.14.1) 作为依赖项
2. THE Extension SHALL 在 src/ 目录下创建 ACP 客户端核心模块结构
3. THE ACP_Client SHALL 实现 Client 接口的所有必需方法

### 需求 2: 智能体配置管理

**用户故事:** 作为用户，我希望能够配置多个 ACP 智能体，以便根据需要选择不同的智能体使用。

#### 验收标准

1. THE Extension_Configuration SHALL 支持存储多个 ACP_Agent 配置项
2. WHEN 用户添加智能体配置时，THE Extension SHALL 验证配置包含 command、args 和 env 字段
3. THE Extension SHALL 预配置至少 3 个常用智能体（Claude Code、GitHub Copilot、OpenCode）
4. THE Extension_Configuration SHALL 使用 VSCode 配置项 `acp.agents` 存储智能体配置

### 需求 3: 智能体进程管理

**用户故事:** 作为系统，我需要能够启动和管理 ACP 智能体子进程，以便与智能体进行通信。

#### 验收标准

1. WHEN 用户选择一个 ACP_Agent 时，THE Agent_Manager SHALL 通过 spawn 启动对应的子进程
2. THE Agent_Manager SHALL 支持跨平台进程启动（Windows 使用 shell:true，macOS/Linux 使用登录 shell）
3. WHEN ACP_Agent 进程启动失败时，THE Agent_Manager SHALL 记录错误并通知用户
4. WHEN 用户切换智能体时，THE Agent_Manager SHALL 终止当前进程并启动新进程
5. WHEN 扩展关闭时，THE Agent_Manager SHALL 清理所有运行中的 ACP_Agent 进程

### 需求 4: ACP 协议通信

**用户故事:** 作为系统，我需要通过 JSON-RPC 2.0 over stdio 与 ACP 智能体通信，以便发送请求和接收响应。

#### 验收标准

1. THE Connection_Manager SHALL 通过 ndJsonStream 创建 Web Streams 与 ACP_Agent 通信
2. THE Connection_Manager SHALL 使用 ClientSideConnection 建立 JSON-RPC 2.0 连接
3. WHEN 建立连接时，THE Connection_Manager SHALL 发送包含 clientCapabilities（fs、terminal）的 initialize 握手消息
4. THE Connection_Manager SHALL 支持协议流量日志记录功能
5. WHEN 连接断开时，THE Connection_Manager SHALL 触发重连或通知用户

### 需求 5: 文件系统操作支持

**用户故事:** 作为 ACP 智能体，我需要能够读写文件，以便完成代码生成和修改任务。

#### 验收标准

1. WHEN ACP_Agent 请求读取文件时，THE File_System_Handler SHALL 读取指定文件内容并返回
2. WHEN ACP_Agent 请求写入文件时，THE File_System_Handler SHALL 写入文件内容到指定路径
3. THE File_System_Handler SHALL 验证文件路径在工作区范围内
4. WHEN 文件操作失败时，THE File_System_Handler SHALL 返回描述性错误信息

### 需求 6: 终端操作支持

**用户故事:** 作为 ACP 智能体，我需要能够创建和控制终端，以便执行命令和查看输出。

#### 验收标准

1. WHEN ACP_Agent 请求创建终端时，THE Terminal_Handler SHALL 创建新的 VSCode 终端实例
2. WHEN ACP_Agent 请求终端输出时，THE Terminal_Handler SHALL 捕获并返回终端输出内容
3. WHEN ACP_Agent 请求等待终端退出时，THE Terminal_Handler SHALL 监听终端退出事件并返回退出码
4. WHEN ACP_Agent 请求终止终端时，THE Terminal_Handler SHALL 终止指定终端进程
5. WHEN ACP_Agent 请求释放终端时，THE Terminal_Handler SHALL 清理终端资源

### 需求 7: 权限管理

**用户故事:** 作为用户，我希望能够控制 ACP 智能体的权限，以便保护我的代码和数据安全。

#### 验收标准

1. WHEN ACP_Agent 请求敏感操作权限时，THE Permission_Handler SHALL 弹出确认对话框
2. THE Permission_Handler SHALL 记录用户的权限决策（允许/拒绝）
3. THE Permission_Handler SHALL 支持"记住此决策"选项
4. THE Permission_Handler SHALL 将权限决策结果返回给 ACP_Agent

### 需求 8: 会话管理

**用户故事:** 作为系统，我需要管理与 ACP 智能体的会话状态，以便维护对话上下文和历史记录。

#### 验收标准

1. WHEN 用户开始与 ACP_Agent 对话时，THE Session_Manager SHALL 创建新会话
2. THE Session_Manager SHALL 维护会话的消息历史记录
3. WHEN ACP_Agent 发送会话更新通知时，THE Session_Manager SHALL 更新会话状态
4. WHEN 会话结束时，THE Session_Manager SHALL 保存会话历史到本地存储

### 需求 9: UI 集成 - 智能体选择器

**用户故事:** 作为用户，我希望在界面上看到智能体选择器，以便方便地选择和切换 ACP 智能体。

#### 验收标准

1. THE Agent_Selector SHALL 显示在 BottomApiConfig.tsx 的 `<div className="w-auto acp-agent">` 位置
2. THE Agent_Selector SHALL 显示所有已配置的 ACP_Agent 列表
3. WHEN 用户点击智能体时，THE Agent_Selector SHALL 切换到选中的智能体
4. THE Agent_Selector SHALL 显示当前选中智能体的状态（运行中/已停止/错误）
5. THE Agent_Selector SHALL 与现有的 ModelSelector 组件保持一致的视觉风格

### 需求 10: 与现有 Chat 窗口集成

**用户故事:** 作为用户，我希望 ACP 智能体能够使用现有的 chat 窗口，以便保持一致的用户体验。

#### 验收标准

1. WHEN 用户选择 ACP_Agent 时，THE Extension SHALL 在现有 chat 窗口中显示对话
2. THE Extension SHALL 支持在 Kilo Code 模型和 ACP_Agent 之间切换
3. WHEN 使用 ACP_Agent 时，THE Extension SHALL 在消息中标识消息来源为 ACP_Agent
4. THE Extension SHALL 保持 chat 窗口的所有现有功能（历史记录、设置等）

### 需求 11: 错误处理和日志

**用户故事:** 作为开发者，我需要详细的错误信息和日志，以便调试 ACP 集成问题。

#### 验收标准

1. WHEN ACP 相关操作发生错误时，THE Extension SHALL 记录详细的错误日志
2. THE Extension SHALL 支持配置 ACP 协议流量日志级别
3. WHEN ACP_Agent 启动失败时，THE Extension SHALL 显示用户友好的错误消息
4. THE Extension SHALL 在输出面板提供 ACP 专用日志通道

### 需求 12: 代码标记规范

**用户故事:** 作为维护者，我需要正确标记 CMBT Agent 特定的代码更改，以便在合并上游更新时减少冲突。

#### 验收标准

1. THE Extension SHALL 在所有新增的 ACP 相关代码文件开头添加 `// cmbt-agent_change - new file` 标记
2. WHEN 修改现有核心文件时，THE Extension SHALL 使用 `// cmbt-agent_change` 标记单行更改
3. WHEN 修改现有核心文件的多行代码时，THE Extension SHALL 使用 `// cmbt-agent_change start` 和 `// cmbt-agent_change end` 包裹更改
4. THE Extension SHALL 保留现有的 `kilocode_change` 标记不做修改
