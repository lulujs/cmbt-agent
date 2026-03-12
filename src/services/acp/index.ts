// cmbt-agent_change - new file
/**
 * ACP (Agent Client Protocol) Service Module
 *
 * This module provides comprehensive support for the Agent Client Protocol,
 * enabling CMBT Agent to connect to and manage external ACP-compatible agents
 * such as GitHub Copilot, Claude Code, Gemini CLI, and OpenCode.
 *
 * Main Features:
 * - ACP protocol client implementation
 * - Multi-agent connection management
 * - Permission and security management
 * - Protocol logging and debugging
 * - UI integration with agent selector
 * - Configuration persistence
 * - Error handling and recovery
 *
 * @example
 * ```typescript
 * import { ACPService } from './services/acp'
 *
 * const acpService = new ACPService(context)
 * await acpService.initialize()
 *
 * // Add and connect to an agent
 * const agentConfig = { ... }
 * await acpService.addAgent(agentConfig)
 * await acpService.connect(agentConfig.id)
 *
 * // Send messages
 * const response = await acpService.sendMessage(agentId, message)
 * ```
 */

// Core types and interfaces
export type {
	// Protocol types
	ACPMessage,
	ACPResponse,
	ACPError as ACPErrorInterface,

	// Configuration types
	ACPAgentConfig,
	ACPTransportType,
	ACPAuthenticationConfig,
	ACPPermissionConfig,
	ACPAgentSettings,
	ACPAgentMetadata,

	// Connection types
	ACPConnection,
	ConnectionStatus,
	ConnectionStatusInfo,

	// Permission types
	PermissionRequest,
	PermissionAuditEntry,
	DetailedPermissionConfig,

	// Logging types
	ProtocolLogEntry,
	LogLevel,

	// Error types
	ACPErrorType,
	ACPErrorDetails,

	// Configuration types
	RetryConfig,
	ResourceUsage,
	ConnectionPoolConfig,
	QueuedMessage,
	PreConfiguredAgent,

	// UI types
	ACPAgent,
	ACPExtensionMessage,
	ACPWebviewMessage,

	// Service types
	ACPServiceConfig,
	ACPEventType,
	ACPEvent,

	// Callback types
	MessageCallback,
	StatusCallback,
	ErrorCallback,
	PermissionCallback,

	// Security types
	SecurityConfig,
	ValidationResult,
	ConfigValidator,
} from "./types"

// Error classes
export {
	ACPError,
	ACPConnectionError,
	ACPProtocolError,
	ACPPermissionError,
	ACPAuthenticationError,
	ACPTimeoutError,
	ACPSystemError,
	ConnectionRecoveryStrategy,
	ACPErrorHandler,
	ACPErrorUtils,
} from "./errors"

// Constants and defaults
export {
	ACPErrorCode,
	ACP_PROTOCOL_VERSION,
	ACP_JSONRPC_VERSION,
	DEFAULT_CONFIG,
	DEFAULT_CONNECTION_POOL_CONFIG,
	VALIDATION,
	TRANSPORT_DEFAULTS,
	PRE_CONFIGURED_AGENTS,
	DEFAULT_AGENT_CONFIG,
	DEFAULT_ACP_SERVICE_CONFIG,
	MESSAGE_TYPES,
	EVENT_TYPES,
} from "./constants"

// Utility functions
export { validateAgentId, validateEndpoint, sanitizeAgentConfig } from "./utils"

// Main service class
export { ACPService } from "./ACPService"

/**
 * Version information for the ACP module
 */
export const ACP_MODULE_VERSION = "1.0.0"

/**
 * Feature flags for ACP functionality
 */
export const ACP_FEATURES = {
	MULTI_AGENT_SUPPORT: true,
	PERMISSION_MANAGEMENT: true,
	PROTOCOL_LOGGING: true,
	AUTO_RECONNECT: true,
	CREDENTIAL_ENCRYPTION: true,
	UI_INTEGRATION: true,
} as const

/**
 * Module metadata
 */
export const ACP_MODULE_INFO = {
	name: "ACP Service",
	version: ACP_MODULE_VERSION,
	description: "Agent Client Protocol support for CMBT Agent",
	author: "CMBT Agent Team",
	features: ACP_FEATURES,
	supportedTransports: ["websocket", "http", "stdio"] as const,
	supportedAuthTypes: ["token", "oauth", "none"] as const,
} as const
