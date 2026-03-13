# 实现计划: ACP 客户端集成

## 概述

将 ACP（Agent Client Protocol）协议客户端集成到 CMBT Agent VSCode 插件中，使其能够加载和使用符合 ACP 协议的外部智能体。实现按依赖关系排序：基础设施 → 核心服务 → 请求处理器 → UI 集成 → 现有系统对接。

## 任务

- [x]   1. 项目基础设施搭建

    - [x] 1.1 安装 ACP SDK 依赖并创建目录结构

        - 在 `src/package.json` 中添加 `@agentclientprotocol/sdk` (^0.14.1) 依赖
        - 创建 `src/services/acp/` 目录
        - 创建 `src/handlers/acp/` 目录
        - 创建 `webview-ui/src/components/acp/` 目录
        - 运行 `pnpm install` 确保依赖安装成功
        - _需求: 1.1, 1.2_

    - [x] 1.2 扩展 package.json 添加 `acp.agents` 配置项

        - 在 `src/package.json` 的 `contributes.configuration.properties` 中添加 `cmbt-agent.acp.agents` 配置
        - 配置类型为 array，包含 id、name、command、args、env 字段
        - 预配置 Claude Code、GitHub Copilot、OpenCode 三个默认智能体
        - 使用 `// cmbt-agent_change` 标记修改
        - _需求: 2.1, 2.3, 2.4_

    - [x] 1.3 实现 AcpLogger 日志模块

        - 创建 `src/services/acp/AcpLogger.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 实现 AcpLogLevel 枚举（ERROR, WARN, INFO, DEBUG, TRACE）
        - 创建 VSCode 输出面板 "ACP Client" 专用日志通道
        - 实现日志级别过滤逻辑
        - 实现 trace 方法用于协议流量日志记录（send/receive 方向）
        - _需求: 11.1, 11.2, 11.3, 11.4_

    - [ ]\* 1.4 编写 AcpLogger 属性测试
        - **属性 20: 日志级别过滤正确性**
        - **验证需求: 11.2**

- [x]   2. 检查点 - 基础设施验证

    - 确保依赖安装成功，目录结构正确，日志模块可用。如有问题请询问用户。

- [ ]   3. 核心服务层实现 - 智能体管理

    - [x] 3.1 实现 AgentManager 智能体进程管理器

        - 创建 `src/services/acp/AgentManager.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 定义 AcpAgentConfig 和 AgentProcess 接口
        - 实现 startAgent 方法：通过 `child_process.spawn` 启动智能体子进程
        - 实现跨平台进程启动策略（Windows 使用 shell:true，macOS/Linux 使用登录 shell）
        - 实现 stopAgent 方法：终止指定智能体进程
        - 实现 switchAgent 方法：停止当前进程并启动新进程
        - 实现 getConfiguredAgents 方法：从 VSCode 配置读取���能体列表
        - 实现 disposeAll 方法：清理所有运行中的进程
        - 实现 onAgentStatusChanged 事件
        - 集成 AcpLogger 记录进程启动/停止/错误日志
        - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_

    - [ ]\* 3.2 编写 AgentManager 属性测试

        - **属性 3: 进程启动一致性** - 对于任何有效配置，选择智能体应使用正确命令和参数启动子进程
        - **验证需求: 3.1**

    - [ ]\* 3.3 编写跨平台进程选项属性测试

        - **属性 4: 跨平台进程选项正确性** - 对于任何平台值，spawn 选项应匹配该平台的预期配置
        - **验证需求: 3.2**

    - [ ]\* 3.4 编写进程生命周期清理属性测试

        - **属性 5: 进程生命周期清理完整性** - 对于任何运行中的进程集合，清理操作应终止所有相关进程
        - **验证需求: 3.4, 3.5**

    - [x] 3.5 实现配置验证逻辑

        - 在 AgentManager 中添加配置验证方法，确保配置包含 command、args、env 字段
        - 验证失败时记录错误并通知用户
        - _需求: 2.2_

    - [ ]\* 3.6 编写配置验证属性测试
        - **属性 2: 配置验证正确性** - 对于任何配置对象，验证器应接受它当且仅当它包含必需字段
        - **验证需求: 2.2**

- [ ]   4. 核心服务层实现 - 连接管理

    - [x] 4.1 实现 ConnectionManager 连接管理器

        - 创建 `src/services/acp/ConnectionManager.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 实现 createConnection 方法：基于子进程 stdio 创建 Web Streams（使用 ndJsonStream）
        - 实现 initialize 方法：发送包含 clientCapabilities（fs、terminal）的握手消息
        - 实现 closeConnection 方法：关闭指定智能体的连接
        - 实现 setTrafficLogging 方法：启用/禁用协议流量日志
        - 实现 onConnectionLost 事件
        - 集成 AcpLogger 记录连接建立/断开/错误日志
        - _需求: 4.1, 4.2, 4.3, 4.4_

    - [x] 4.2 实现连接断开重连机制

        - 在 ConnectionManager 中实现指数退避重连策略（最多 3 次，初始延迟 1s，最大延迟 10s）
        - 重连失败后通知用户并清理资源
        - _需求: 4.5_

    - [ ]\* 4.3 编写连接断开恢复属性测试
        - **属性 6: 连接断开恢复机制** - 对于任何连接丢失事件，系统应尝试重连或通知用户
        - **验证需求: 4.5**

- [ ]   5. 核心服务层实现 - 会话管理

    - [x] 5.1 实现 SessionManager 会话管理器

        - 创建 `src/services/acp/SessionManager.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 定义 AcpMessage 和 AcpSession 接口
        - 实现 createSession 方法：创建新会话并生成唯一 UUID
        - 实现 addMessage 方法：添加消息到会话
        - 实现 updateSessionState 方法：更新会话状态（来自 ACP 通知）
        - 实现 endSession 方法：结束会话并保存到 VSCode globalState
        - 实现 getSessionHistory 方法：从 globalState 读取会话历史
        - 实现 onSessionUpdated 事件
        - _需求: 8.1, 8.2, 8.3, 8.4_

    - [ ]\* 5.2 编写会话创建唯一性属性测试

        - **属性 11: 会话创建唯一性** - 对于任何智能体，开始对话应创建具有唯一 ID 的新会话
        - **验证需求: 8.1**

    - [ ]\* 5.3 编写会话消息历史完整性属性测试

        - **属性 12: 会话消息历史完整性** - 对于任何添加到会话的消息序列，会话应按顺序包含所有消息
        - **验证需求: 8.2, 8.3**

    - [ ]\* 5.4 编写会话持久化往返一致性属性测试
        - **属性 13: 会话持久化往返一致性** - 对于任何会话，结束会话然后从存储检索应返回相同数据
        - **验证需求: 8.4**

- [x]   6. 检查点 - 核心服务验证

    - 确保 AgentManager、ConnectionManager、SessionManager 正常工作。如有问题请询问用户。

- [ ]   7. 请求处理层实现 - 文件系统操作

    - [x] 7.1 实现 FileSystemHandler 文件系统处理器

        - 创建 `src/handlers/acp/FileSystemHandler.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 实现 handleReadFile 方法：读取指定文件内容并返回
        - 实现 handleWriteFile 方法：写入文件内容到指定路径
        - 实现 validatePath 方法：验证文件路径在工作区范围内
        - 文件操作失败时返回描述性错误信息
        - 集成 AcpLogger 记录文件操作日志
        - _需求: 5.1, 5.2, 5.3, 5.4_

    - [ ]\* 7.2 编写文件系统操作往返一致性属性测试

        - **属性 7: 文件系统操作往返一致性** - 对于任何工作区内的有效路径和内容，写入然后读取应返回相同内容
        - **验证需求: 5.1, 5.2**

    - [ ]\* 7.3 编写文件路径验证边界正确性属性测试
        - **属性 8: 文件路径验证边界正确性** - 对于任何文件路径，验证器应接受工作区内路径并拒绝工作区外路径
        - **验证需求: 5.3**

- [ ]   8. 请求处理层实现 - 终端操作

    - [x] 8.1 实现 TerminalHandler 终端处理器

        - 创建 `src/handlers/acp/TerminalHandler.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 实现 handleCreateTerminal 方法：创建新的 VSCode 终端实例并返回 terminalId
        - 实现 handleGetOutput 方法：捕获并返回终端输出内容
        - 实现 handleWaitForExit 方法：监听终端退出事件并返回退出码
        - 实现 handleKillTerminal 方法：终止指定终端进程
        - 实现 handleDisposeTerminal 方法：清理终端资源
        - 集成 AcpLogger 记录终端操作日志
        - _需求: 6.1, 6.2, 6.3, 6.4, 6.5_

    - [ ]\* 8.2 编写 TerminalHandler 单元测试
        - 测试创建终端、捕获输出、获取退出码、终止和清理功能
        - _需求: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]   9. 请求处理层实现 - 权限管理

    - [x] 9.1 实现 PermissionHandler 权限处理器

        - 创建 `src/handlers/acp/PermissionHandler.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 实现 handlePermissionRequest 方法：弹出 VSCode 确认对话框，支持"记住此决策"选项
        - 实现 checkCachedDecision 方法：检查缓存的权限决策
        - 实现 clearCachedDecisions 方法：清除缓存
        - 将权限决策结果（允许/拒绝）返回给 ACP 智能体
        - 集成 AcpLogger 记录权限请求和决策日志
        - _需求: 7.1, 7.2, 7.3, 7.4_

    - [ ]\* 9.2 编写权限决策记录和返回属性测试

        - **属性 9: 权限决策记录和返回** - 对于任何权限决策，该决策应被记录并返回给 ACP 智能体
        - **验证需求: 7.2, 7.4**

    - [ ]\* 9.3 编写权限决策缓存一致性属性测试
        - **属性 10: 权限决策缓存一致性** - 对于任何带有"记住"标志的决策，后续相同请求应返回缓存决策
        - **验证需求: 7.3**

- [ ]   10. 请求处理层实现 - 会话更新

    - [x] 10.1 实现 SessionUpdateHandler 会话更新处理器
        - 创建 `src/handlers/acp/SessionUpdateHandler.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 实现 handleSessionUpdate 方法：处理来自 ACP 智能体的会话更新通知
        - 将更新转发给 SessionManager 更新会话状态和消息
        - _需求: 8.3_

- [x]   11. 检查点 - 请求处理层验证

    - 确保所有 Handler 模块正常工作，所有测试通过。如有问题请询问用户。

- [ ]   12. ACP 客户端核心实现

    - [x] 12.1 实现 AcpClientImpl ACP 客户端

        - 创建 `src/services/acp/AcpClientImpl.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 实现 sendMessage 方法：发送用户消息到 ACP 智能体
        - 实现 createSession 方法：通过 ConnectionManager 创建新会话
        - 实现 endSession 方法：结束会话
        - 实现 registerHandlers 方法：在 ClientSideConnection 上注册 FileSystemHandler、TerminalHandler、PermissionHandler、SessionUpdateHandler
        - 实现 getCurrentSessionId 方法
        - 协调 AgentManager、ConnectionManager、SessionManager 和各 Handler 模块
        - _需求: 1.3, 4.3_

    - [ ]\* 12.2 编写 AcpClientImpl 单元测试

        - 测试消息发送、会话创建/结束、Handler 注册流程
        - Mock AgentManager、ConnectionManager、SessionManager
        - _需求: 1.3_

    - [ ]\* 12.3 编写 ACP 消息源标识属性测试

        - **属性 18: ACP 消息源标识正确性** - 对于任何来自 ACP 智能体的消息，source 字段应为 "acp-agent"
        - **验证需求: 10.3**

    - [ ]\* 12.4 编写错误日志记录属性测试
        - **属性 19: 错误日志记录完整性** - 对于任何 ACP 相关错误，日志记录器应被调用并记录错误详情
        - **验证需求: 3.3, 11.1**

- [ ]   13. 资源管理与生命周期

    - [x] 13.1 实现 AcpResourceManager 资源清理管理器
        - 创建 `src/services/acp/AcpResourceManager.ts`，添加 `// cmbt-agent_change - new file` 标记
        - 实现 register 方法：注册 vscode.Disposable 资源
        - 实现 dispose 方法：按顺序清理所有资源（结束会话 → 关闭连接 → 终止进程 → 清理其他资源）
        - 在扩展 deactivate 时调用 dispose
        - _需求: 3.5_

- [x]   14. 检查点 - 后端核心验证

    - 确保 AcpClientImpl 和 AcpResourceManager 正常工作，所有后端测试通过。如有问题请询问用户。

- [ ]   15. UI 集成 - 智能体选择器

    - [x] 15.1 实现 AgentSelector UI 组件

        - 创建 `webview-ui/src/components/acp/AgentSelector.tsx`，添加 `// cmbt-agent_change - new file` 标记
        - 接收 props：agents、activeAgentId、activeAgentStatus、onSelectAgent
        - 渲染所有已配置的 ACP 智能体列表
        - 显示当前选中智能体的状态指示器（starting/running/stopped/error）
        - 使用 Tailwind CSS 样式，与 ModelSelector 保持一致的视觉风格
        - 点击智能体时调用 onSelectAgent 回调
        - _需求: 9.1, 9.2, 9.3, 9.4, 9.5_

    - [ ]\* 15.2 编写智能体选择器渲染完整性属性测试

        - **属性 14: 智能体选择器渲染完整性** - 对于任何已配置的智能体列表，选择器应渲染所有智能体
        - **验证需求: 9.2**

    - [ ]\* 15.3 编写智能体选择交互正确性属性测试

        - **属性 15: 智能体选择交互正确性** - 对于任何列表中的智能体，点击应触发选择回调并传递正确 ID
        - **验证需求: 9.3**

    - [ ]\* 15.4 编写智能体状态显示一致性属性测试
        - **属性 16: 智能体状态显示一致性** - 对于任何状态值，选择器应显示对应的状态指示器
        - **验证需求: 9.4**

- [ ]   16. UI 集成 - 与现有系统对接

    - [x] 16.1 扩展 ExtensionState 添加 ACP 状态

        - 在现有 ExtensionState 类型中添加 AcpState 字段（acpAgents、activeAcpAgentId、activeAcpAgentStatus、isAcpMode）
        - 使用 `// cmbt-agent_change` 标记修改
        - _需求: 10.2_

    - [x] 16.2 在 BottomApiConfig 中集成 AgentSelector

        - 修改 `webview-ui/src/components/kilocode/BottomApiConfig.tsx`
        - 在 ModelSelector 旁添加 AgentSelector 组件，放置在 `<div className="w-auto acp-agent">` 位置
        - 从 ExtensionState 获取 ACP 相关状态传递给 AgentSelector
        - 使用 `// cmbt-agent_change` 标记修改
        - _需求: 9.1, 9.5_

    - [x] 16.3 实现 WebView 与 Extension Host 的 ACP 消息通信

        - 添加 postMessage 类型：selectAcpAgent、sendAcpMessage
        - 在 Extension Host 端处理 ACP 相关消息，调用 AcpClientImpl
        - 实现状态同步：将 ACP 智能体状态变更推送到 WebView
        - 使用 `// cmbt-agent_change` 标记修改
        - _需求: 10.1, 10.2_

    - [x] 16.4 实现 Chat 窗口 ACP 消息显示

        - 在现有 Chat 窗口中支持显示 ACP 智能体的消息
        - 消息中标识来源为 ACP 智能体（显示智能体名称）
        - 支持在 Kilo Code 模型和 ACP 智能体之间切换
        - 保持 chat 窗口的所有现有功能（历史记录、设置等）
        - 使用 `// cmbt-agent_change` 标记修改
        - _需求: 10.1, 10.2, 10.3, 10.4_

    - [ ]\* 16.5 编写模式切换状态一致性属性测试
        - **属性 17: 模式切换状态一致性** - 对于任何在 Kilo Code 模型和 ACP 智能体之间的切换序列，系统应正确切换模式状态
        - **验证需求: 10.2**

- [x]   17. 检查点 - UI 集成验证

    - 确保 AgentSelector 正常渲染，与现有系统集成无误，所有 UI 测试通过。如有问题请询问用户。

- [x]   18. Extension Host 主入口集成

    - [x] 18.1 在 Extension 激活时初始化 ACP 模块

        - 修改 Extension 主入口文件（通常是 `src/extension.ts`）
        - 在 activate 函数中初始化 AgentManager、ConnectionManager、SessionManager、AcpClientImpl
        - 注册 AcpResourceManager 到 context.subscriptions
        - 从 VSCode 配置读取 acp.agents 并传递给 AgentManager
        - 使用 `// cmbt-agent_change` 标记修改
        - _需求: 2.1, 3.1_

    - [x] 18.2 实现配置变更监听

        - 监听 VSCode 配置变更事件（workspace.onDidChangeConfiguration）
        - 当 acp.agents 配置变更时，更新 AgentManager 的智能体列表
        - 使用 `// cmbt-agent_change` 标记修改
        - _需求: 2.1_

    - [ ]\* 18.3 编写配置存储往返一致性属性测试
        - **属性 1: 配置存储往返一致性** - 对于任何有效的 ACP 智能体配置列表，存储到 VSCode 配置然后读取应返回相同配置
        - **验证需求: 2.1**

- [x]   19. 代码标记验证与最终集成

    - [x] 19.1 验证所有新文件的代码标记

        - 检查所有新增的 ACP 相关文件开头包含 `// cmbt-agent_change - new file` 标记
        - 检查所有修改的现有文件使用了正确的 `// cmbt-agent_change` 标记
        - 确认现有的 `kilocode_change` 标记未被修改
        - _需求: 12.1, 12.2, 12.3, 12.4_

    - [ ]\* 19.2 编写代码标记一致性属性测试
        - **属性 21: 代码标记一致性** - 对于任何新增的 ACP 相关代码文件，文件开头应包含 `// cmbt-agent_change - new file` 标记
        - **验证需求: 12.1**

- [x]   20. 最终检查点 - 全面验证
    - 确保所有测试通过，所有模块正确集成，所有代码标记正确。如有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点任务确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 后端测试从 `src/` 目录运行：`cd src && pnpm test <path>`
- 前端测试从 `webview-ui/` 目录运行：`cd webview-ui && pnpm test <path>`
- 属性测试使用 fast-check 库，每个属性至少 100 次迭代
- 所有新文件需要 `// cmbt-agent_change - new file` 标记
- 修改现有文件需要 `// cmbt-agent_change` 标记
