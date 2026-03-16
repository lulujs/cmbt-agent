# Bugfix 需求文档

## 简介

CMBT Agent 项目（基于 Kilo Code 的 VS Code 扩展分支）集成了 ACP（Agent Communication Protocol）协议，用于管理外部 AI 代理进程。当前 ACP 集成存在多个缺陷，导致其无法与项目的 LLM 提供商设置和自定义模式（custom modes）系统正确协作。核心问题包括：`isAcpMode` 状态在每次 `getState()` 调用时被硬编码重置为 `false`、ACP 代理与 LLM 提供商配置之间完全没有桥接、ACP 代理与自定义模式系统之间没有映射机制、由此导致的消息路由不可靠，以及关键的调试可见性问题——`connection.prompt()` 的响应未被捕获和记录，且缺少 ACP 协议流量日志，导致无法有效诊断代理通信问题。

## Bug 分析

### 当前行为（缺陷）

1.1 WHEN `ClineProvider.getState()` 被调用（包括 `postStateToWebview()` 触发的调用）THEN 系统将 `isAcpMode` 硬编码为 `false`，覆盖了 webview 中通过 `acpAgentStatus` 消息设置的 `isAcpMode: true` 状态

1.2 WHEN 用户选择并成功连接一个 ACP 代理后，任何导致 `postStateToWebview()` 的操作发生时 THEN 系统将 webview 中的 `isAcpMode` 重置为 `false`，导致 ACP 模式被意外退出

1.3 WHEN 用户在 ACP 模式下发送消息，但 `isAcpMode` 已被 `postStateToWebview()` 重置为 `false` 时 THEN 消息不会被路由到 ACP 代理（`ChatView.tsx` 中的 `isAcpMode && activeAcpAgentId` 条件不满足），而是走普通消息流程

1.4 WHEN 用户选择一个 ACP 代理时 THEN 系统不会捕获当前的 LLM 提供商配置（`apiProvider`、`apiKey`、`apiModelId` 等），也不会将其传递给 ACP 代理

1.5 WHEN ACP 代理运行并可能返回 LLM 提供商偏好或模式偏好时 THEN 系统没有机制接收这些偏好并应用到项目的 LLM 设置或自定义模式中

1.6 WHEN ACP `AgentManager` 管理外部代理进程时 THEN 系统没有将 ACP 代理映射到项目的 `customModes` 系统的机制，无法传递当前���式配置给代理，也无法从代理接收模式偏好

1.7 WHEN 用户希望动态发现 ACP 代理的能力（如支持的 LLM 提供商或模式）时 THEN 系统仅从 VS Code 静态配置（`cmbt-agent.acp.agents`）读取代理信息，没有能力协商机制

1.8 WHEN `AcpClientImpl.sendMessage()` 调用 `connection.prompt()` 时 THEN 系统不会捕获或记录响应对象（包括 `stopReason` 字段），导致无法调试代理是否正确响应

1.9 WHEN ACP 协议消息在客户端和代理之间发送/接收时 THEN 系统没有流量日志记录机制，无法查看实际的协议消息流和诊断通信问题

### 期望行为（正确）

2.1 WHEN `ClineProvider.getState()` 被调用时 THEN 系统 SHALL 根据 ACP `AgentManager` 中是否存在状态为 `running` 的活跃代理来动态计算 `isAcpMode` 的值，而非硬编码为 `false`

2.2 WHEN `postStateToWebview()` 被调用且存在活跃的 ACP 代理时 THEN 系统 SHALL 保持 `isAcpMode` 为 `true`，确保 ACP 模式状态不会被意外重置

2.3 WHEN 用户在 ACP 模式下发送消息且存在活跃的 ACP 代理时 THEN 系统 SHALL 可靠地将消息路由到 ACP 代理��因为 `isAcpMode` 状态始终与实际代理运行状态一致

2.4 WHEN 用户选择一个 ACP 代理时 THEN 系统 SHALL 捕获当前的 LLM 提供商配置（包括 `apiProvider`、`apiModelId`、相关认证信息等），并通过 ACP 会话上下文或初始化参数将其传递给代理

2.5 WHEN ACP 代理返回 LLM 提供商偏好或配置信息时 THEN 系统 SHALL 提供机制接收这些信息，并能够将其应用到项目的 LLM 提供商设置中

2.6 WHEN ACP 代理被选择或启动时 THEN 系统 SHALL 将当前的自定义模式配置传递给代理，并能够接收代理返回的模式偏好，实现 ACP 代理与 `customModes` 系统之间的双向同步

2.7 WHEN ACP 连接初始化完成后 THEN 系统 SHALL 从代理的能力响应（`agentCapabilities`）中提取支持的 LLM 提供商和模式信息，实现动态能力发现

2.8 WHEN `AcpClientImpl.sendMessage()` 调用 `connection.prompt()` 时 THEN 系统 SHALL 捕获响应对象并记录 `stopReason` 字段（参考 `vscode-acp-main/src/core/SessionManager.ts` 中的实现模式：`log(\`Prompt response: stopReason=${response.stopReason}\`)`），以便调试代理响应行为

2.9 WHEN ACP 协议消息在客户端和代理之间发送/接收时 THEN 系统 SHALL 提供流量日志记录功能，记录关键协议事件（如 `prompt` 请求、`sessionUpdate` 通知、响应状态等），以便诊断通信问题和消息流

### 不变行为（回归预防）

3.1 WHEN 没有 ACP 代理处于活跃状态时 THEN 系统 SHALL 继续保持 `isAcpMode` 为 `false`，普通消息流程不受影响

3.2 WHEN 用户在非 ACP 模式下发送消息时 THEN 系统 SHALL 继续通过正常的消息队列和流式处理机制发送消息，行为与 ACP 集成前完全一致

3.3 WHEN 用户切换 LLM 提供商配置（API profile）时 THEN 系统 SHALL 继续正常更新提供商设置，不受 ACP 桥接逻辑的干扰

3.4 WHEN 用户创建或修改自定义模式时 THEN 系统 SHALL 继续正常保存和应用自定义模式配置，不受 ACP 模式映射逻辑的干扰

3.5 WHEN VS Code 配置中的 `cmbt-agent.acp.agents` 发生变化时 THEN 系统 SHALL 继续正确检测配置变更并更新代理列表

3.6 WHEN ACP 代理进程异常退出或连接断开时 THEN 系统 SHALL 继续通过现有的重连机制（`ConnectionManager.attemptReconnect`）尝试恢复连接，并正确更新代理状态

3.7 WHEN `sessionUpdate` 通知通过客户端处理器异步接收时 THEN 系统 SHALL 继续正确处理这些通知并更新会话状态，不受响应日志记录的影响

3.8 WHEN 现有的 `AcpLogger` 记录调试信息时 THEN 系统 SHALL 继续正常工作，新增的流量日志记录应与现有日志系统集成而非替代
