// cmbt-agent_change - new file
/**
 * Constants and enums for ACP (Agent Client Protocol) implementation
 */

/**
 * ACP Error Codes
 */
export enum ACPErrorCode {
	// Connection errors
	CONNECTION_FAILED = "CONNECTION_FAILED",
	NETWORK_ERROR = "NETWORK_ERROR",
	CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
	HANDSHAKE_FAILED = "HANDSHAKE_FAILED",

	// Protocol errors
	PROTOCOL_ERROR = "PROTOCOL_ERROR",
	VERSION_MISMATCH = "VERSION_MISMATCH",
	INVALID_MESSAGE = "INVALID_MESSAGE",
	UNSUPPORTED_METHOD = "UNSUPPORTED_METHOD",

	// Authentication errors
	AUTH_FAILED = "AUTH_FAILED",
	INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
	TOKEN_EXPIRED = "TOKEN_EXPIRED",
	MISSING_CREDENTIALS = "MISSING_CREDENTIALS",

	// Permission errors
	PERMISSION_DENIED = "PERMISSION_DENIED",
	ACCESS_DENIED = "ACCESS_DENIED",
	INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",

	// System errors
	SYSTEM_ERROR = "SYSTEM_ERROR",
	RESOURCE_EXHAUSTED = "RESOURCE_EXHAUSTED",
	SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
	CONFIGURATION_ERROR = "CONFIGURATION_ERROR",

	// Storage errors
	STORAGE_ERROR = "STORAGE_ERROR",
	NOT_FOUND = "NOT_FOUND",
	VALIDATION_ERROR = "VALIDATION_ERROR",

	// Encryption errors
	ENCRYPTION_ERROR = "ENCRYPTION_ERROR",
	DECRYPTION_ERROR = "DECRYPTION_ERROR",

	// Timeout errors
	OPERATION_TIMEOUT = "OPERATION_TIMEOUT",
	REQUEST_TIMEOUT = "REQUEST_TIMEOUT",
}

/**
 * ACP Protocol Constants
 */
export const ACP_PROTOCOL_VERSION = "1.0.0"
export const ACP_JSONRPC_VERSION = "2.0"

/**
 * Default Configuration Values
 */
export const DEFAULT_CONFIG = {
	CONNECTION_TIMEOUT: 30000,
	REQUEST_TIMEOUT: 10000,
	RETRY_ATTEMPTS: 3,
	RETRY_DELAY: 1000,
	IDLE_TIMEOUT: 300000, // 5 minutes
	MAX_CONNECTIONS: 10,
	HEARTBEAT_INTERVAL: 30000,
	RECONNECT_DELAY: 5000,
} as const

/**
 * Validation Constants
 */
export const VALIDATION = {
	AGENT_ID: {
		MIN_LENGTH: 3,
		MAX_LENGTH: 50,
		PATTERN: /^[a-z0-9-]+$/,
	},
	ENDPOINT: {
		MAX_LENGTH: 500,
	},
	TIMEOUT: {
		MIN: 1000,
		MAX: 300000,
	},
} as const

/**
 * Transport Defaults
 */
export const TRANSPORT_DEFAULTS = {
	websocket: {
		protocol: "ws",
		port: 8080,
	},
	http: {
		protocol: "http",
		port: 8080,
	},
	stdio: {
		protocol: null,
		port: null,
	},
} as const

/**
 * Pre-configured Agents
 * Based on design specifications for GitHub Copilot, Claude Code, Gemini CLI, and OpenCode
 */
export const PRE_CONFIGURED_AGENTS = [
	{
		id: "github-copilot",
		name: "GitHub Copilot",
		displayName: "GitHub Copilot",
		description: "代码补全、解释、重构",
		endpoint: "copilot://agent",
		transport: "stdio" as const,
		authentication: {
			type: "token" as const,
			credentials: {
				tokenType: "github",
				tokenKey: "GITHUB_TOKEN",
			},
		},
		permissions: {
			fileAccess: "write" as const,
			networkAccess: true,
			shellAccess: false,
		},
		settings: {
			autoConnect: false,
			idleTimeout: 300000,
			retryAttempts: 3,
			retryDelay: 1000,
		},
		metadata: {
			version: "1.0.0",
			capabilities: ["code-completion", "code-explanation", "code-refactoring"],
			created: new Date(),
		},
		icon: "github",
	},
	{
		id: "claude-code",
		name: "Claude Code",
		displayName: "Claude Code",
		description: "代码分析、生成、调试",
		endpoint: "claude-code://agent",
		transport: "stdio" as const,
		authentication: {
			type: "token" as const,
			credentials: {
				tokenType: "anthropic",
				tokenKey: "ANTHROPIC_API_KEY",
			},
		},
		permissions: {
			fileAccess: "write" as const,
			networkAccess: true,
			shellAccess: false,
		},
		settings: {
			autoConnect: false,
			idleTimeout: 300000,
			retryAttempts: 3,
			retryDelay: 1000,
		},
		metadata: {
			version: "1.0.0",
			capabilities: ["code-analysis", "code-generation", "code-debugging", "code-review"],
			created: new Date(),
		},
		icon: "anthropic",
	},
	{
		id: "gemini-cli",
		name: "Gemini CLI",
		displayName: "Gemini CLI",
		description: "代码生成、文档编写",
		endpoint: "gemini-cli://agent",
		transport: "stdio" as const,
		authentication: {
			type: "token" as const,
			credentials: {
				tokenType: "google",
				tokenKey: "GOOGLE_API_KEY",
			},
		},
		permissions: {
			fileAccess: "write" as const,
			networkAccess: true,
			shellAccess: false,
		},
		settings: {
			autoConnect: false,
			idleTimeout: 300000,
			retryAttempts: 3,
			retryDelay: 1000,
		},
		metadata: {
			version: "1.0.0",
			capabilities: ["code-generation", "documentation-writing", "cli-assistance"],
			created: new Date(),
		},
		icon: "google",
	},
	{
		id: "opencode",
		name: "OpenCode",
		displayName: "OpenCode",
		description: "通用编程助手",
		endpoint: "opencode://agent",
		transport: "stdio" as const,
		authentication: {
			type: "token" as const,
			credentials: {
				tokenType: "openai",
				tokenKey: "OPENAI_API_KEY",
			},
		},
		permissions: {
			fileAccess: "write" as const,
			networkAccess: true,
			shellAccess: false,
		},
		settings: {
			autoConnect: false,
			idleTimeout: 300000,
			retryAttempts: 3,
			retryDelay: 1000,
		},
		metadata: {
			version: "1.0.0",
			capabilities: ["code-completion", "general-programming", "open-source-assistance"],
			created: new Date(),
		},
		icon: "openai",
	},
] as const

/**
 * Default Agent Configuration
 */
export const DEFAULT_AGENT_CONFIG = {
	transport: "websocket" as const,
	authentication: { type: "none" as const },
	permissions: {
		fileAccess: "none" as const,
		networkAccess: false,
		shellAccess: false,
	},
	settings: {
		autoConnect: false,
		idleTimeout: 300000,
		retryAttempts: 3,
		retryDelay: 1000,
	},
	metadata: {
		version: "1.0.0",
		capabilities: [],
		created: new Date(),
	},
} as const

/**
 * Default ACP Service Configuration
 */
export const DEFAULT_ACP_SERVICE_CONFIG = {
	enableLogging: true,
	logLevel: "info" as const,
	autoDetectAgents: true,
	maxConnections: 10,
	connectionTimeout: 30000,
	retryAttempts: 3,
} as const

/**
 * Default Connection Pool Configuration
 */
export const DEFAULT_CONNECTION_POOL_CONFIG = {
	maxConnections: 10,
	connectionReuse: true,
	idleTimeout: 300000, // 5 minutes
	maxRetries: 3,
	retryDelay: 1000,
	heartbeatInterval: 30000,
} as const

/**
 * Message Types
 */
export const MESSAGE_TYPES = {
	HANDSHAKE: "handshake",
	HEARTBEAT: "heartbeat",
	REQUEST: "request",
	RESPONSE: "response",
	NOTIFICATION: "notification",
	ERROR: "error",
} as const

/**
 * Event Types
 */
export const EVENT_TYPES = {
	CONNECTED: "connected",
	DISCONNECTED: "disconnected",
	ERROR: "error",
	MESSAGE_SENT: "message_sent",
	MESSAGE_RECEIVED: "message_received",
	RETRY_ATTEMPT: "retry_attempt",
	FALLBACK_ACTIVATED: "fallback_activated",
} as const
