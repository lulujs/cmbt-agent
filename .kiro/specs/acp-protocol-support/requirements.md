# ACP协议支持需求文档

## 介绍

为CMBT Agent VSCode插件实现ACP（Agent Client Protocol）协议支持，使其能够作为ACP客户端连接和管理支持ACP协议的智能体（如OpenCode、Claude Code、GitHub Copilot等）。该功能将与现有的Kilo Code聊天窗口集成，为用户提供统一的智能体交互体验。

## 术语表

- **ACP_Client**: 实现ACP协议的客户端组件
- **ACP_Agent**: 支持ACP协议的外部智能体服务
- **Agent_Selector**: 智能体选择器UI组件
- **Connection_Manager**: 管理ACP智能体连接的服务
- **Protocol_Logger**: ACP协议流量日志记录器
- **Permission_Manager**: ACP智能体权限管理器
- **Chat_Interface**: 现有的Kilo Code聊天界面

## 需求

### 需求 1: ACP协议客户端实现

**用户故事:** 作为开发者，我希望CMBT Agent能够连接ACP智能体，以便使用不同的AI编程助手服务。

#### 验收标准

1. THE ACP_Client SHALL 实现ACP协议规范中定义的所有核心消息类型
2. WHEN 连接ACP智能体时，THE ACP_Client SHALL 建立WebSocket或HTTP连接
3. THE ACP_Client SHALL 支持协议握手和身份验证流程
4. WHEN 接收到ACP消息时，THE ACP_Client SHALL 解析并转换为内部消息格式
5. THE ACP_Client SHALL 维护与多个ACP智能体的并发连接

### 需求 2: 智能体配置和管理

**用户故事:** 作为用户，我希望能够配置和管理多个ACP智能体，以便根据需要选择不同的服务。

#### 验收标准

1. THE Connection_Manager SHALL 支持添加、编辑和删除ACP智能体配置
2. WHEN 配置ACP智能体时，THE Connection_Manager SHALL 验证连接参数
3. THE Connection_Manager SHALL 存储智能体配置信息（名称、端点、认证信息）
4. THE Connection_Manager SHALL 提供智能体连接状态监控
5. WHEN 智能体连接失败时，THE Connection_Manager SHALL 记录错误并提供重试机制

### 需求 3: UI集成 - 智能体选择器

**用户故事:** 作为用户，我希望在BottomApiConfig组件中看到ACP智能体选择器，以便快速切换不同的智能体。

#### 验收标准

1. THE Agent_Selector SHALL 渲染在BottomApiConfig组件的指定div容器中（className="w-auto acp-agent"）
2. THE Agent_Selector SHALL 显示所有已配置的ACP智能体列表
3. WHEN 用户选择ACP智能体时，THE Agent_Selector SHALL 更新当前活动智能体
4. THE Agent_Selector SHALL 显示智能体连接状态（已连接、连接中、断开）
5. THE Agent_Selector SHALL 支持中文界面显示

### 需求 4: 预配置智能体支持

**用户故事:** 作为用户，我希望系统预配置常用的ACP智能体，以便快速开始使用。

#### 验收标准

1. THE Connection_Manager SHALL 预配置GitHub Copilot智能体连接
2. THE Connection_Manager SHALL 预配置Claude Code智能体连接
3. THE Connection_Manager SHALL 预配置Gemini CLI智能体连接
4. THE Connection_Manager SHALL 预配置OpenCode智能体连接
5. WHEN 首次启动时，THE Connection_Manager SHALL 自动检测可用的预配置智能体

### 需求 5: 聊天界面集成

**用户故事:** 作为用户，我希望ACP智能体与现有聊天窗口无缝集成，以便使用统一的交互界面。

#### 验收标准

1. WHEN 选择ACP智能体时，THE Chat_Interface SHALL 将消息路由到选定的ACP智能体
2. THE Chat_Interface SHALL 显示来自ACP智能体的响应消息
3. THE Chat_Interface SHALL 支持ACP智能体的工具调用和文件操作
4. THE Chat_Interface SHALL 在消息界面中标识当前使用的智能体
5. WHEN ACP智能体断开连接时，THE Chat_Interface SHALL 显示连接状态提示

### 需求 6: 智能体生命周期管理

**用户故事:** 作为用户，我希望能够控制ACP智能体的连接状态，以便管理资源使用。

#### 验收标准

1. THE Connection_Manager SHALL 提供连接智能体的功能
2. THE Connection_Manager SHALL 提供断开智能体连接的功能
3. THE Connection_Manager SHALL 提供重启智能体连接的功能
4. WHEN 智能体空闲超过配置时间时，THE Connection_Manager SHALL 自动断开连接
5. THE Connection_Manager SHALL 在VSCode关闭时优雅地关闭所有ACP连接

### 需求 7: 权限管理系统

**用户故事:** 作为用户，我希望控制ACP智能体的权限，以便保护我的代码和数据安全。

#### 验收标准

1. THE Permission_Manager SHALL 为每个ACP智能体维护权限配置
2. THE Permission_Manager SHALL 支持文件访问权限控制（读取、写入、执行）
3. THE Permission_Manager SHALL 支持网络访问权限控制
4. WHEN ACP智能体请求权限时，THE Permission_Manager SHALL 提示用户确认
5. THE Permission_Manager SHALL 记录所有权限授予和拒绝操作

### 需求 8: 协议流量日志记录

**用户故事:** 作为开发者，我希望查看ACP协议通信日志，以便调试和监控智能体交互。

#### 验收标准

1. THE Protocol_Logger SHALL 记录所有ACP协议消息（发送和接收）
2. THE Protocol_Logger SHALL 包含时间戳、智能体标识和消息内容
3. THE Protocol_Logger SHALL 支持日志级别配置（调试、信息、警告、错误）
4. THE Protocol_Logger SHALL 提供日志查看和导出功能
5. WHEN 启用调试模式时，THE Protocol_Logger SHALL 记录详细的协议交互信息

### 需求 9: 错误处理和恢复

**用户故事:** 作为用户，我希望系统能够优雅地处理ACP连接错误，以便保持稳定的使用体验。

#### 验收标准

1. WHEN ACP连接中断时，THE Connection_Manager SHALL 自动尝试重连
2. WHEN ACP智能体返回错误时，THE ACP_Client SHALL 显示用户友好的错误消息
3. THE Connection_Manager SHALL 限制重连尝试次数以避免无限循环
4. WHEN 协议版本不兼容时，THE ACP_Client SHALL 提示用户更新或降级
5. THE Connection_Manager SHALL 在连接失败时回退到默认的Kilo Code提供商

### 需求 10: 配置持久化

**用户故事:** 作为用户，我希望ACP智能体配置能够保存，以便下次启动时自动恢复。

#### 验收标准

1. THE Connection_Manager SHALL 将智能体配置保存到VSCode设置中
2. THE Connection_Manager SHALL 在启动时加载保存的智能体配置
3. THE Connection_Manager SHALL 支持配置的导入和导出功能
4. THE Connection_Manager SHALL 加密存储敏感信息（API密钥、令牌）
5. WHEN 配置文件损坏时，THE Connection_Manager SHALL 使用默认配置并提示用户

### 需求 11: 性能和资源管理

**用户故事:** 作为用户，我希望ACP功能不会显著影响VSCode性能，以便保持流畅的开发体验。

#### 验收标准

1. THE ACP_Client SHALL 使用连接池管理多个智能体连接
2. THE ACP_Client SHALL 实现消息队列以处理高频率请求
3. THE Connection_Manager SHALL 监控内存使用并在必要时释放资源
4. THE ACP_Client SHALL 支持请求超时和取消机制
5. WHEN 系统资源不足时，THE Connection_Manager SHALL 优先保持最重要的连接

### 需求 12: 国际化支持

**用户故事:** 作为中文用户，我希望ACP功能界面支持中文显示，以便更好地理解和使用。

#### 验收标准

1. THE Agent_Selector SHALL 支持中文智能体名称和状态显示
2. THE Connection_Manager SHALL 提供中文错误消息和提示
3. THE Permission_Manager SHALL 使用中文权限描述和确认对话框
4. THE Protocol_Logger SHALL 支持中文日志标签和描述
5. THE ACP_Client SHALL 遵循现有的i18n框架进行多语言支持
