# ACP 集成修复 - 技术设计文档

## 概述

本设计文档针对 bugfix.md 中描述的 ACP 集成缺陷，提供具体的技术修复方案。核心目标是：修复 `isAcpMode` 状态管理、建立 ACP 代理与 LLM 提供商配置之间的桥接、实现 ACP 代理与自定义模式系统的映射。

## 架构变更

### 1. isAcpMode 状态修复

**问题**: `ClineProvider.getState()` 中 `isAcpMode` 硬编码为 `false`。

**修复方案**: 在 `getState()` 中动态计算 `isAcpMode`，基于 `AgentManager` 中活跃代理的状态。

**修改文件**: `src/core/webview/ClineProvider.ts`

```typescript
// 修改 getState() 中的 isAcpMode 计算
// 之前:
isAcpMode: false,

// 之后:
isAcpMode: this.acpInstances?.agentManager.getActiveAgent()?.status === "running" ?? false,
```

### 2. ACP 提供商桥接层

**目标**: 在 ACP 代理选择/启动时，捕获当前 LLM 提供商配置，并通过 ACP 会话元数据传递给代理。同时支持从代理能力响应中提取 LLM 偏好并应用。

**新增接口**: `src/services/acp/AcpProviderBridge.ts`

```typescript
export interface AcpProviderContext {
	apiProvider?: string
	apiModelId?: string
	mode?: string
	customModeConfig?: {
		slug: string
		name: string
		roleDefinition?: string
		groups?: readonly GroupEntry[]
	}
}

export interface AcpAgentCapabilities {
	supportedProviders?: string[]
	supportedModes?: string[]
	preferredProvider?: string
	preferredModel?: string
	preferredMode?: string
}

export class AcpProviderBridge {
	/**
	 * 从当前扩展状态提取提供商上下文
	 */
	extractProviderContext(state: ProviderSettings, mode?: string, customModes?: ModeConfig[]): AcpProviderContext

	/**
	 * 从 ACP 代理的 agentCapabilities 中解析能力信息
	 */
	parseAgentCapabilities(capabilities: Record<string, unknown>): AcpAgentCapabilities

	/**
	 * 将代理偏好应用到扩展的提供商设置
	 */
	applyAgentPreferences(preferences: AcpAgentCapabilities, provider: ClineProvider): Promise<void>
}
```

**集成点**:

- `ConnectionManager.initialize()` 返回的 `agentCapabilities` 将通过 `AcpProviderBridge.parseAgentCapabilities()` 解析
- `ClineProvider.handleSelectAcpAgent()` 在启动代理前调用 `extractProviderContext()` 获取当前配置
- ACP 会话创建时，通过 `newSession` 的元数据传递提供商上下文

### 3. ACP 会话上下文传递

**修改文件**: `src/services/acp/AcpClientImpl.ts`

在 `createSession()` 中传递提供商上下文:

```typescript
async createSession(agentId: string, providerContext?: AcpProviderContext): Promise<string> {
  // ... 现有逻辑 ...
  const response = await connection.newSession({
    metadata: {
      providerContext: providerContext ? {
        apiProvider: providerContext.apiProvider,
        apiModelId: providerContext.apiModelId,
        mode: providerContext.mode,
      } : undefined,
    },
  })
  // ...
}
```

### 4. ClineProvider ACP 处理器增强

**修改文件**: `src/core/webview/ClineProvider.ts`

增强 `handleSelectAcpAgent()`:

```typescript
public async handleSelectAcpAgent(agentId: string): Promise<void> {
  // ... 现有的代理启动逻辑 ...

  // 新增: 初始化后解析代理能力
  const initResult = await connectionManager.initialize(connection)
  const bridge = new AcpProviderBridge()
  const capabilities = bridge.parseAgentCapabilities(initResult.agentCapabilities)

  // 新增: 如果代理有偏好，应用到扩展设置
  if (capabilities.preferredProvider || capabilities.preferredMode) {
    await bridge.applyAgentPreferences(capabilities, this)
  }

  // 更新 webview 状态，包含代理能力信息
  await this.postMessageToWebview({
    type: "acpAgentStatus",
    agentId,
    status: "running",
    capabilities,
  })
}
```

增强 `handleSendAcpMessage()`:

```typescript
public async handleSendAcpMessage(text: string): Promise<void> {
  // ... 现有逻辑 ...

  if (!sessionId) {
    // 新增: 创建会话时传递当前提供商上下文
    const state = await this.getState()
    const bridge = new AcpProviderBridge()
    const providerContext = bridge.extractProviderContext(
      state.apiConfiguration,
      state.mode,
      state.customModes,
    )
    sessionId = await acpClient.createSession(activeAgent.config.id, providerContext)
  }

  await acpClient.sendMessage(sessionId, text)
}
```

### 5. Webview 状态增强

**修改文件**: `webview-ui/src/context/ExtensionStateContext.tsx`

扩展 ACP 相关状态类型:

```typescript
export interface AcpAgentCapabilitiesInfo {
  supportedProviders?: string[]
  supportedModes?: string[]
  preferredProvider?: string
  preferredModel?: string
  preferredMode?: string
}

// ExtensionStateContextType 中新增:
acpAgentCapabilities?: AcpAgentCapabilitiesInfo
```

处理增强的 `acpAgentStatus` 消息:

```typescript
case "acpAgentStatus": {
  setState((prevState) => ({
    ...prevState,
    activeAcpAgentId: message.agentId,
    activeAcpAgentStatus: message.status,
    isAcpMode: message.status === "running",
    acpAgentCapabilities: message.capabilities,
  }))
  break
}
```

### 6. 消息路由可靠性

**修改文件**: `webview-ui/src/components/chat/ChatView.tsx`

由于 `isAcpMode` 现在在 `getState()` 中动态计算，`postStateToWebview()` 不再会错误地重置它。消息路由逻辑无需修改，现有的 `isAcpMode && activeAcpAgentId` 条件将可靠工作。

### 7. 响应日志记录增强

**问题**: `AcpClientImpl.sendMessage()` 调用 `connection.prompt()` 后不捕获或记录响应对象，导致无法调试代理响应行为。

**修复方案**: 捕获 `prompt()` 响应并记录 `stopReason` 字段，参考 `vscode-acp-main/src/core/SessionManager.ts` 中的实现模式。

**修改文件**: `src/services/acp/AcpClientImpl.ts`

```typescript
async sendMessage(sessionId: string, message: string): Promise<void> {
  // ... 现有代码 ...

  this.logger.debug("Calling connection.prompt")
  const response = await connection.prompt({
    sessionId,
    prompt: [{ type: "text", text: message }],
  })

  // 新增: 记录响应
  this.logger.info("Prompt response received", {
    sessionId,
    stopReason: response.stopReason
  })

  this.logger.debug("Message sent successfully", { sessionId })
}
```

### 8. 流量日志记录增强

**问题**: 缺少 ACP 协议流量日志记录机制，无法查看实际的协议消息流和诊断通信问题。

**修复方案**: 增强 `ConnectionManager.setupTrafficLogging()` 以记录关键协议事件。由于 ACP SDK 不直接暴露消息拦截接口，我们在应用层记录关键事件。

**修改文件**: `src/services/acp/ConnectionManager.ts`

```typescript
private setupTrafficLogging(connection: ClientSideConnection): void {
  // 记录连接关闭事件
  connection.signal.addEventListener("abort", () => {
    this.logger.trace("receive", "Connection closed")
  })

  // 注意: SDK 不直接暴露消息拦截，但我们在应用层记录：
  // - AcpClientImpl.sendMessage() - 记录 prompt() 调用和响应
  // - 客户端处理器 (sessionUpdate 等) - 已有日志记录
}
```

**应用层日志记录点**:

- `AcpClientImpl.sendMessage()`: 记录 `prompt()` 请求和响应（包括 `stopReason`）
- `AcpClientImpl.createClientHandlers()`: 各处理器已记录 `sessionUpdate`、`requestPermission` 等事件
- `ConnectionManager.initialize()`: 记录初始化握手和代理能力

## 数据流

```
用户选择 ACP 代理
  → ClineProvider.handleSelectAcpAgent()
    → AgentManager.switchAgent() (启动进程)
    → ConnectionManager.createConnection() (建立连接)
    → ConnectionManager.initialize() (协议握手)
    → AcpProviderBridge.parseAgentCapabilities() (解析能力)
    → AcpProviderBridge.applyAgentPreferences() (应用偏好)
    → postMessageToWebview({ type: "acpAgentStatus", status: "running", capabilities })
    → webview 更新 isAcpMode=true

用户发送消息 (ACP 模式)
  → ChatView 检测 isAcpMode && activeAcpAgentId
    → vscode.postMessage({ type: "sendAcpMessage", text })
    → ClineProvider.handleSendAcpMessage()
      → AcpProviderBridge.extractProviderContext() (首次创建会话时)
      → AcpClientImpl.createSession() (带提供商上下文)
      → AcpClientImpl.sendMessage()

getState() 调用
  → isAcpMode 动态计算: agentManager.getActiveAgent()?.status === "running"
  → 不再硬编码为 false
```

## 文件变更清单

| 文件                                               | 变更类型 | 说明                                                     |
| -------------------------------------------------- | -------- | -------------------------------------------------------- |
| `src/services/acp/AcpProviderBridge.ts`            | 新增     | 提供商桥接层                                             |
| `src/core/webview/ClineProvider.ts`                | 修改     | 修复 isAcpMode、增强 ACP 处理器                          |
| `src/services/acp/AcpClientImpl.ts`                | 修改     | createSession 支持提供商上下文、捕获并记录 prompt() 响应 |
| `src/services/acp/ConnectionManager.ts`            | 修改     | 增强流量日志记录（应用层）                               |
| `webview-ui/src/context/ExtensionStateContext.tsx` | 修改     | 扩展 ACP 状态类型                                        |

## 正确性属性

### P1: isAcpMode 状态一致性

对于任意时刻 t，`isAcpMode` 的值 SHALL 等于 `agentManager.getActiveAgent()?.status === "running"`。即：当且仅当存在状态为 `running` 的活跃 ACP 代理时，`isAcpMode` 为 `true`。

### P2: 提供商上下文完整性

当 ACP 会话创建时，传递给代理的 `providerContext` SHALL 包含调用时刻的 `apiProvider` 和 `apiModelId`（如果存在）。

### P3: 消息路由正确性

当 `isAcpMode === true` 且 `activeAcpAgentId` 存在时，用户消息 SHALL 被路由到 ACP 代理。当 `isAcpMode === false` 时，用户消息 SHALL 走普通消息流程。

### P4: 非 ACP 功能不变性

当没有 ACP 代理处于活跃状态时，所有 LLM 提供商切换、自定义模式管理、消息发送等功能 SHALL 与 ACP 集成前行为完全一致。

### P5: 代理能力解析安全性

`parseAgentCapabilities()` 对于任意输入（包括 `undefined`、空对象、格式错误的数据）SHALL 返回有��的 `AcpAgentCapabilities` 对象，不抛出异常。

### P6: 响应日志记录完整性

对于每次 `connection.prompt()` 调用，响应对象 SHALL 被捕获，且 `stopReason` 字段 SHALL 被记录在 INFO 级别，以便调试代理响应行为。

**验证**: 需求 2.8

### P7: 流量日志记录可见性

当流量日志记录启用时，关键 ACP 协议事件（`prompt` 请求、响应接收、`sessionUpdate` 通知）SHALL 被记录，以便诊断通信问题。

**验证**: 需求 2.9
