// cmbt-agent_change - new file
/**
 * Core TypeScript interfaces and types for ACP (Agent Client Protocol) support
 *
 * This file defines the fundamental types used throughout the ACP implementation,
 * including protocol messages, agent configurations, connection states, and error types.
 */

/**
 * ACP Protocol Message Types
 * Based on JSON-RPC 2.0 specification
 */
export interface ACPMessage {
	jsonrpc: "2.0"
	id?: string | number
	method: string
	params?: any
}

export interface ACPResponse {
	jsonrpc: "2.0"
	id: string | number
	result?: any
	error?: ACPError
}

export interface ACPError {
	code: number
	message: string
	data?: any
}

/**
 * ACP Agent Configuration
 * Defines how to connect to and authenticate with an ACP agent
 */
export interface ACPAgentConfig {
	id: string
	name: string
	displayName: string
	description?: string
	endpoint: string
	transport: ACPTransportType
	authentication: ACPAuthenticationConfig
	permissions: ACPPermissionConfig
	settings: ACPAgentSettings
	metadata: ACPAgentMetadata
}

export type ACPTransportType = "websocket" | "http" | "stdio"

export interface ACPAuthenticationConfig {
	type: "token" | "oauth" | "none"
	credentials?: Record<string, string>
}

export interface ACPPermissionConfig {
	fileAccess: "none" | "read" | "write" | "full"
	networkAccess: boolean
	shellAccess: boolean
}

export interface ACPAgentSettings {
	autoConnect: boolean
	idleTimeout: number
	retryAttempts: number
	retryDelay: number
}

export interface ACPAgentMetadata {
	version: string
	capabilities: string[]
	created: Date
	lastUsed?: Date
}

/**
 * Connection Management Types
 */
export interface ACPConnection {
	id: string
	agentId: string
	status: ConnectionStatus
	transport: ACPTransportType
	endpoint: string
	lastActivity: Date
	retryCount: number
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error"

export interface ConnectionStatusInfo {
	status: ConnectionStatus
	lastConnected?: Date
	lastError?: string
	latency?: number
	messageCount: number
}

/**
 * Permission Management Types
 */
export interface PermissionRequest {
	agentId: string
	resource: string
	action: string
	timestamp: Date
}

export interface PermissionAuditEntry {
	timestamp: Date
	agentId: string
	action: string
	resource: string
	granted: boolean
	reason?: string
}

export interface DetailedPermissionConfig {
	agentId: string
	permissions: {
		files: {
			read: string[] // 允许读取的路径模式
			write: string[] // 允许写入的路径模式
			execute: string[] // 允许执行的路径模式
		}
		network: {
			allowedHosts: string[]
			blockedHosts: string[]
		}
		system: {
			shellAccess: boolean
			environmentAccess: boolean
		}
	}
	auditLog: PermissionAuditEntry[]
}

/**
 * Protocol Logging Types
 */
export interface ProtocolLogEntry {
	timestamp: Date
	agentId: string
	direction: "sent" | "received"
	message: ACPMessage | ACPResponse
	messageId?: string | number
}

export type LogLevel = "debug" | "info" | "warn" | "error"

/**
 * Error Types for ACP Implementation
 */
export enum ACPErrorType {
	CONNECTION = "connection",
	PROTOCOL = "protocol",
	PERMISSION = "permission",
	SYSTEM = "system",
	AUTHENTICATION = "authentication",
	TIMEOUT = "timeout",
}

export interface ACPErrorDetails {
	type: ACPErrorType
	code: string
	message: string
	agentId?: string
	resource?: string
	originalError?: Error
	timestamp: Date
}

/**
 * Retry Configuration
 */
export interface RetryConfig {
	maxAttempts: number
	baseDelay: number
	maxDelay: number
	backoffMultiplier: number
	jitter: boolean
}

/**
 * Resource Management Types
 */
export interface ResourceUsage {
	memoryUsage: number
	connectionCount: number
	messageRate: number
	timestamp: Date
}

export interface ConnectionPoolConfig {
	maxConnections: number
	idleTimeout: number
	connectionReuse: boolean
}

/**
 * Message Queue Types
 */
export interface QueuedMessage {
	id: string
	agentId: string
	message: ACPMessage
	timestamp: Date
	retryCount: number
}

/**
 * Pre-configured Agent Types
 */
export interface PreConfiguredAgent {
	id: string
	name: string
	displayName: string
	description: string
	endpoint: string
	transport: ACPTransportType
	defaultAuth: ACPAuthenticationConfig
	capabilities: string[]
	icon?: string
}

/**
 * UI Component Types
 */
export interface ACPAgent {
	id: string
	name: string
	displayName: string
	status: ConnectionStatus
	icon?: string
	description?: string
	lastUsed?: Date
}

/**
 * Extension Message Types for ACP
 */
export interface ACPExtensionMessage {
	type: "acp-agent-select" | "acp-agent-config" | "acp-connection-status" | "acp-permission-request"
	agentId?: string
	data?: any
}

export interface ACPWebviewMessage {
	type: "acp-agents-list" | "acp-agent-status-update" | "acp-permission-request" | "acp-config-update"
	agents?: ACPAgent[]
	status?: ConnectionStatusInfo
	permission?: PermissionRequest
	config?: ACPAgentConfig
}

/**
 * Service Interface Types
 */
export interface ACPServiceConfig {
	enableLogging: boolean
	logLevel: LogLevel
	maxConnections: number
	defaultTimeout: number
	retryConfig: RetryConfig
}

/**
 * Event Types for ACP Service
 */
export type ACPEventType =
	| "agent-connected"
	| "agent-disconnected"
	| "agent-error"
	| "message-sent"
	| "message-received"
	| "permission-requested"
	| "permission-granted"
	| "permission-denied"
	| "fallback-activated"
	| "fallback-deactivated"

export interface ACPEvent {
	type: ACPEventType
	agentId: string
	timestamp: Date
	data?: any
}

/**
 * Callback Types
 */
export type MessageCallback = (message: ACPMessage) => void
export type StatusCallback = (agentId: string, status: ConnectionStatus) => void
export type ErrorCallback = (error: ACPErrorDetails) => void
export type PermissionCallback = (request: PermissionRequest) => Promise<boolean>

/**
 * Security Types
 */
export interface SecurityConfig {
	encryptCredentials: boolean
	auditPermissions: boolean
	sandboxAgents: boolean
	allowedHosts?: string[]
	blockedHosts?: string[]
}

/**
 * Configuration Validation Types
 */
export interface ValidationResult {
	valid: boolean
	errors: string[]
	warnings: string[]
}

export interface ConfigValidator {
	validateAgentConfig(config: ACPAgentConfig): ValidationResult
	validateConnection(endpoint: string, transport: ACPTransportType): Promise<ValidationResult>
	validatePermissions(permissions: ACPPermissionConfig): ValidationResult
}
