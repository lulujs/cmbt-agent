# 实现任务列表

## 任务 1: 修复 isAcpMode 状态管理

- [x] 1.1 修改 `ClineProvider.getState()` 中 `isAcpMode` 的计算逻辑，从硬编码 `false` 改为基于 `agentManager.getActiveAgent()?.status === "running"` 动态计算
- [x] 1.2 编写测试验证 `isAcpMode` 在有活跃代理时返回 `true`，无活跃代理时返回 `false`
- [x] 1.3 验证 `postStateToWebview()` 调用后 `isAcpMode` 不再被错误重置

## 任务 2: 创建 AcpProviderBridge 桥接层

- [x] 2.1 创建 `src/services/acp/AcpProviderBridge.ts`，实现 `AcpProviderContext` 和 `AcpAgentCapabilities` 接口
- [x] 2.2 实现 `extractProviderContext()` 方法，从当前扩展状态提取 LLM 提供商配置和模式信息
- [x] 2.3 实现 `parseAgentCapabilities()` 方法，从 ACP 代理的 `agentCapabilities` 响应中安全解析能力信息
- [x] 2.4 实现 `applyAgentPreferences()` 方法，将代理偏好应用到扩展的提供商设置
- [x] 2.5 编写 `AcpProviderBridge` 的单元测试，覆盖正常输入、空输入、格式错误输入等场景

## 任务 3: 增强 ACP 会话上下文传递

- [x] 3.1 修改 `AcpClientImpl.createSession()` 方法签名，增加可选的 `providerContext` 参数
- [x] 3.2 在 `createSession()` 中将 `providerContext` 通过 `newSession` 的 metadata 传递给代理
- [x] 3.3 编写测试验证会话创建时提供商上下文被正确传递

## 任务 4: 增强 ClineProvider ACP 处理器

- [x] 4.1 修改 `handleSelectAcpAgent()` 方法，在代理初始化后通过 `AcpProviderBridge` 解析代理能力
- [x] 4.2 在 `handleSelectAcpAgent()` 中，如果代理有偏好设置，调用 `applyAgentPreferences()` 应用
- [x] 4.3 增强 `acpAgentStatus` 消息，包含 `capabilities` 字段
- [x] 4.4 修改 `handleSendAcpMessage()` 方法，在首次创建会话时传递当前提供商上下文
- [x] 4.5 编写测试验证增强后的 ACP 处理器行为

## 任务 5: 扩展 Webview ACP 状态

- [x] 5.1 在 `ExtensionStateContext.tsx` 中新增 `AcpAgentCapabilitiesInfo` 接口和相关状态字段
- [x] 5.2 更新 `acpAgentStatus` 消息处理逻辑，解析并存储 `capabilities` 信息
- [x] 5.3 确保状态默认值正确初始化

## 任务 6: 正确性属性验证测试

- [x] 6.1 编写 P1 属性测试：验证 `isAcpMode` 始终与活跃代理运行状态一致
- [x] 6.2 编写 P3 属性测试：验证消息路由在 ACP 模式和普通模式下的正确性
- [x] 6.3 编写 P5 属性测试：验证 `parseAgentCapabilities()` 对任意输入的安全性

## 任务 7: 添加响应日志记录到 sendMessage

- [x] 7.1 修改 `AcpClientImpl.sendMessage()` 以捕获 `connection.prompt()` 的响应
- [x] 7.2 使用模式 `this.logger.info("Prompt response received", { sessionId, stopReason: response.stopReason })` 在 INFO 级别记录 `stopReason` 字段
- [x] 7.3 编写测试验证成功的 prompt 调用会发生响应日志记录
- [x] 7.4 编写测试验证响应日志记录包含正确的 sessionId 和 stopReason

## 任务 8: 增强流量日志记录

- [x] 8.1 在 `ConnectionManager.setupTrafficLogging()` 中记录应用层流量日志记录方法
- [x] 8.2 验证现有日志记录点覆盖关键事件：prompt 请求 (AcpClientImpl)、sessionUpdate 通知（客户端处理器）、连接生命周期 (ConnectionManager)
- [x] 8.3 编写测试验证流量日志记录捕获连接关闭事件
- [x] 8.4 手动测试启用流量日志记录的端到端消息流以验证可见性

## 任务 9: 响应和流量日志记录属性测试

- [x] 9.1 编写 P6 属性测试：验证每次 `connection.prompt()` 调用都会记录 `stopReason`
- [x] 9.2 编写 P7 属性测试：验证启用流量日志记录时会记录关键协议事件
