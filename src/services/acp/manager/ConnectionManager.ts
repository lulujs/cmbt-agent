// cmbt-agent_change - new file
/**
 * Connection Manager for ACP (Agent Client Protocol) connections
 *
 * This class provides high-level management of ACP agent connections,
 * including CRUD operations, validation, and status monitoring.
 */

import { EventEmitter } from "events"
import { ACPClient } from "../client/ACPClient"
import {
	ACPAgentConfig,
	ConnectionStatus,
	ACPConnection,
	ConnectionStatusInfo,
	ACPEventType,
	ACPEvent,
	ValidationResult,
	ConfigValidator,
	ACPTransportType,
} from "../types"
import { ACPConnectionError, ACPConfigurationError, ACPSystemError, ACPErrorHandler, ACPError } from "../errors"
import { VALIDATION } from "../constants"

/**
 * High-level connection manager for ACP agents
 */
export class ConnectionManager extends EventEmitter implements ConfigValidator {
	// cmbt-agent_change start - Connection management
	private client: ACPClient
	private agentConfigs = new Map<string, ACPAgentConfig>()
	private errorHandler: ACPErrorHandler
	private monitoringInterval?: NodeJS.Timeout
	private idleCheckInterval?: NodeJS.Timeout
	private isShuttingDown = false
	private lastActivityMap = new Map<string, Date>()
	private shutdownPromise?: Promise<void>
	// cmbt-agent_change end

	constructor(client?: ACPClient) {
		super()
		this.client = client || new ACPClient()
		this.errorHandler = new ACPErrorHandler()
		this.setupEventHandlers()
		this.setupErrorHandlerCallbacks()
		this.startMonitoring()
		this.startIdleConnectionMonitoring()
		this.setupGracefulShutdown()
	}

	// cmbt-agent_change start - Pre-configured agent support
	/**
	 * Initialize pre-configured agents on startup
	 * Automatically detects and configures common ACP agents
	 */
	async initializePreConfiguredAgents(): Promise<void> {
		try {
			const { PRE_CONFIGURED_AGENTS } = await import("../constants")

			for (const preConfiguredAgent of PRE_CONFIGURED_AGENTS) {
				// Check if agent is already configured
				if (!this.agentConfigs.has(preConfiguredAgent.id)) {
					// Convert pre-configured agent to full ACPAgentConfig
					const agentConfig: ACPAgentConfig = {
						...preConfiguredAgent,
						enabled: false, // Don't auto-enable, let user choose
						displayName: preConfiguredAgent.displayName || preConfiguredAgent.name,
						description: preConfiguredAgent.description || `${preConfiguredAgent.name}智能体`,
					}

					// Add the pre-configured agent
					await this.addAgentConfig(agentConfig)

					this.emitEvent("pre-configured-agent-added", preConfiguredAgent.id, {
						name: preConfiguredAgent.name,
						available: await this.detectAgentAvailability(agentConfig),
					})
				}
			}

			this.emitEvent("pre-configured-agents-initialized", "", {
				count: PRE_CONFIGURED_AGENTS.length,
			})
		} catch (error) {
			console.error("Failed to initialize pre-configured agents:", error)
			throw new ACPConfigurationError(
				`初始化预配置智能体失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Detect if a pre-configured agent is available and accessible
	 */
	async detectAgentAvailability(config: ACPAgentConfig): Promise<boolean> {
		try {
			// For pre-configured agents, we'll do a simple connectivity test
			const result = await this.validateConnection(config.endpoint, config.transport)
			return result.isValid
		} catch (error) {
			// Agent not available, but that's okay for pre-configured agents
			return false
		}
	}

	/**
	 * Get all pre-configured agents with their availability status
	 */
	async getPreConfiguredAgentsStatus(): Promise<
		Array<{
			id: string
			name: string
			displayName: string
			description: string
			available: boolean
			configured: boolean
			connected: boolean
		}>
	> {
		try {
			const { PRE_CONFIGURED_AGENTS } = await import("../constants")
			const statusList = []

			for (const preConfiguredAgent of PRE_CONFIGURED_AGENTS) {
				const isConfigured = this.agentConfigs.has(preConfiguredAgent.id)
				const config = this.agentConfigs.get(preConfiguredAgent.id)
				const connectionStatus = config ? this.getConnectionStatus(preConfiguredAgent.id) : "disconnected"

				statusList.push({
					id: preConfiguredAgent.id,
					name: preConfiguredAgent.name,
					displayName: preConfiguredAgent.displayName || preConfiguredAgent.name,
					description: preConfiguredAgent.description || `${preConfiguredAgent.name}智能体`,
					available: isConfigured ? await this.detectAgentAvailability(config!) : false,
					configured: isConfigured,
					connected: connectionStatus === "connected",
				})
			}

			return statusList
		} catch (error) {
			console.error("Failed to get pre-configured agents status:", error)
			return []
		}
	}

	/**
	 * Auto-detect and configure available pre-configured agents
	 * This method checks which pre-configured agents are actually available
	 */
	async autoDetectAvailableAgents(): Promise<string[]> {
		try {
			const { PRE_CONFIGURED_AGENTS } = await import("../constants")
			const availableAgents: string[] = []

			for (const preConfiguredAgent of PRE_CONFIGURED_AGENTS) {
				const agentConfig: ACPAgentConfig = {
					...preConfiguredAgent,
					enabled: false,
					displayName: preConfiguredAgent.displayName || preConfiguredAgent.name,
					description: preConfiguredAgent.description || `${preConfiguredAgent.name}智能体`,
				}

				const isAvailable = await this.detectAgentAvailability(agentConfig)

				if (isAvailable) {
					availableAgents.push(preConfiguredAgent.id)

					// If not already configured, add it
					if (!this.agentConfigs.has(preConfiguredAgent.id)) {
						await this.addAgentConfig(agentConfig)
					}

					this.emitEvent("available-agent-detected", preConfiguredAgent.id, {
						name: preConfiguredAgent.name,
						endpoint: preConfiguredAgent.endpoint,
					})
				}
			}

			this.emitEvent("auto-detection-completed", "", {
				availableCount: availableAgents.length,
				totalCount: PRE_CONFIGURED_AGENTS.length,
				availableAgents,
			})

			return availableAgents
		} catch (error) {
			console.error("Failed to auto-detect available agents:", error)
			throw new ACPSystemError(`自动检测智能体失败: ${error instanceof Error ? error.message : "未知错误"}`)
		}
	}

	/**
	 * Get a pre-configured agent by ID
	 */
	getPreConfiguredAgent(agentId: string): any | undefined {
		try {
			const { PRE_CONFIGURED_AGENTS } = require("../constants")
			return PRE_CONFIGURED_AGENTS.find((agent: any) => agent.id === agentId)
		} catch (error) {
			console.error("Failed to get pre-configured agent:", error)
			return undefined
		}
	}

	/**
	 * Check if an agent is a pre-configured agent
	 */
	isPreConfiguredAgent(agentId: string): boolean {
		try {
			const { PRE_CONFIGURED_AGENTS } = require("../constants")
			return PRE_CONFIGURED_AGENTS.some((agent: any) => agent.id === agentId)
		} catch (error) {
			return false
		}
	}
	// cmbt-agent_change end
	// cmbt-agent_change start - Event handling setup
	/**
	 * Set up event handlers for the underlying ACP client
	 */
	private setupEventHandlers(): void {
		this.client.on("agent-connected", (agentId: string) => {
			this.updateLastActivity(agentId)
			this.emitEvent("agent-connected", agentId)
		})

		this.client.on("agent-disconnected", (agentId: string) => {
			this.emitEvent("agent-disconnected", agentId)
		})

		this.client.on("agent-error", (agentId: string, error: any) => {
			this.emitEvent("agent-error", agentId, { error })
		})

		this.client.on("message-received", (agentId: string, message: any) => {
			this.updateLastActivity(agentId)
			this.emitEvent("message-received", agentId, { message })
		})

		this.client.on("message-sent", (agentId: string, message: any) => {
			this.updateLastActivity(agentId)
			this.emitEvent("message-sent", agentId, { message })
		})
	}

	/**
	 * Set up graceful shutdown handling for VSCode close events
	 */
	private setupGracefulShutdown(): void {
		// Handle process termination signals
		const shutdownHandler = () => {
			if (!this.isShuttingDown) {
				this.shutdown().catch((error) => {
					console.error("Error during graceful shutdown:", error)
				})
			}
		}

		process.on("SIGTERM", shutdownHandler)
		process.on("SIGINT", shutdownHandler)
		process.on("beforeExit", shutdownHandler)

		// Handle VSCode extension deactivation if available
		if (typeof process !== "undefined" && process.env.VSCODE_PID) {
			process.on("disconnect", shutdownHandler)
		}
	}

	/**
	 * Set up error handler callbacks for fallback provider integration
	 */
	private setupErrorHandlerCallbacks(): void {
		// Register fallback provider callback
		this.errorHandler.onFallbackProviderChange(async (agentId: string, activate: boolean) => {
			if (activate) {
				console.log(`Fallback activated for agent ${agentId} - switching to default provider`)
				this.emitEvent("fallback-activated", agentId, {
					reason: this.errorHandler.getRetryInfo(agentId).fallbackReason,
				})
			} else {
				console.log(`Fallback deactivated for agent ${agentId} - attempting to restore ACP connection`)
				this.emitEvent("fallback-deactivated", agentId)

				// Attempt to reconnect to ACP agent
				const config = this.agentConfigs.get(agentId)
				if (config && config.settings.autoConnect) {
					try {
						await this.connectAgent(agentId)
					} catch (error) {
						console.error(`Failed to reconnect agent ${agentId} after fallback deactivation:`, error)
					}
				}
			}
		})

		// Register general error callback for logging and monitoring
		this.errorHandler.onError((error: ACPError) => {
			console.error(`ACP Error for agent ${error.agentId}:`, {
				type: error.type,
				code: error.code,
				message: error.message,
				timestamp: error.timestamp,
			})

			this.emitEvent("agent-error", error.agentId || "unknown", { error })
		})

		// Register fallback activation callback
		this.errorHandler.onFallbackActivated((agentId: string, reason: string) => {
			console.log(`Fallback provider activated for agent ${agentId}: ${reason}`)
			this.emitEvent("fallback-activated", agentId, { reason })
		})
	}

	/**
	 * Update last activity timestamp for an agent
	 */
	private updateLastActivity(agentId: string): void {
		this.lastActivityMap.set(agentId, new Date())
	}

	/**
	 * Start connection monitoring
	 */
	private startMonitoring(): void {
		this.monitoringInterval = setInterval(() => {
			this.performHealthCheck()
		}, 30000) // Check every 30 seconds
	}

	/**
	 * Start idle connection monitoring
	 */
	private startIdleConnectionMonitoring(): void {
		this.idleCheckInterval = setInterval(() => {
			this.checkIdleConnections()
		}, 60000) // Check every minute
	}

	/**
	 * Check for idle connections and disconnect them if necessary
	 */
	private checkIdleConnections(): void {
		if (this.isShuttingDown) return

		const now = new Date()
		this.agentConfigs.forEach((config, agentId) => {
			const status = this.client.getConnectionStatus(agentId)
			if (status === "connected") {
				const lastActivity = this.lastActivityMap.get(agentId)
				if (lastActivity) {
					const idleTime = now.getTime() - lastActivity.getTime()
					if (idleTime > config.settings.idleTimeout) {
						console.log(`Disconnecting idle agent ${agentId} after ${idleTime}ms of inactivity`)
						this.disconnectAgent(agentId).catch((error) => {
							console.error(`Error disconnecting idle agent ${agentId}:`, error)
						})
					}
				}
			}
		})
	}

	/**
	 * Perform health check on all connections
	 */
	private performHealthCheck(): void {
		if (this.isShuttingDown) return

		const connections = this.client.getConnections()
		connections.forEach((connection, agentId) => {
			const status = this.client.getConnectionStatus(agentId)
			if (status === "error" || status === "disconnected") {
				const config = this.agentConfigs.get(agentId)
				if (config && config.settings.autoConnect && !this.errorHandler.isFallbackActive(agentId)) {
					// Only attempt reconnect if fallback is not active
					this.connectAgent(agentId).catch(async (error) => {
						await this.errorHandler.handleError(error as ACPError).catch((handlerError) => {
							console.error(`Error in error handler for ${agentId}:`, handlerError)
						})
					})
				}
			}
		})
	}

	/**
	 * Emit an ACP event
	 */
	private emitEvent(type: ACPEventType, agentId: string, data?: any): void {
		const event: ACPEvent = {
			type,
			agentId,
			timestamp: new Date(),
			data,
		}
		this.emit(type, event)
	}
	// cmbt-agent_change end
	// cmbt-agent_change start - Agent configuration CRUD operations
	/**
	 * Add or update an agent configuration
	 */
	async addAgentConfig(config: ACPAgentConfig): Promise<void> {
		// Validate the configuration
		const validation = this.validateAgentConfig(config)
		if (!validation.valid) {
			throw new ACPConfigurationError(`Invalid agent configuration: ${validation.errors.join(", ")}`, config.id)
		}

		// Store the configuration
		this.agentConfigs.set(config.id, { ...config })

		// If auto-connect is enabled, attempt to connect
		if (config.settings.autoConnect) {
			try {
				await this.connectAgent(config.id)
			} catch (error) {
				// Log error but don't throw - configuration was saved successfully
				this.errorHandler.handleError(error as ACPError)
			}
		}

		this.emitEvent("agent-connected", config.id, { config })
	}

	/**
	 * Get an agent configuration by ID
	 */
	getAgentConfig(agentId: string): ACPAgentConfig | undefined {
		return this.agentConfigs.get(agentId)
	}

	/**
	 * Get all agent configurations
	 */
	getAllAgentConfigs(): ACPAgentConfig[] {
		return Array.from(this.agentConfigs.values())
	}

	/**
	 * Update an existing agent configuration
	 */
	async updateAgentConfig(agentId: string, updates: Partial<ACPAgentConfig>): Promise<void> {
		const existingConfig = this.agentConfigs.get(agentId)
		if (!existingConfig) {
			throw new ACPConfigurationError(`Agent configuration not found: ${agentId}`, agentId)
		}

		// Merge updates with existing configuration
		const updatedConfig: ACPAgentConfig = {
			...existingConfig,
			...updates,
			id: agentId, // Ensure ID cannot be changed
			metadata: {
				...existingConfig.metadata,
				...updates.metadata,
			},
		}

		// Validate the updated configuration
		const validation = this.validateAgentConfig(updatedConfig)
		if (!validation.valid) {
			throw new ACPConfigurationError(
				`Invalid agent configuration update: ${validation.errors.join(", ")}`,
				agentId,
			)
		}

		// If the agent is currently connected and critical settings changed, reconnect
		const isConnected = this.client.getConnectionStatus(agentId) === "connected"
		const criticalFieldsChanged =
			updates.endpoint !== undefined || updates.transport !== undefined || updates.authentication !== undefined

		if (isConnected && criticalFieldsChanged) {
			await this.disconnectAgent(agentId)
		}

		// Update the configuration
		this.agentConfigs.set(agentId, updatedConfig)

		// Reconnect if needed
		if (isConnected && criticalFieldsChanged) {
			await this.connectAgent(agentId)
		}
	}

	/**
	 * Remove an agent configuration
	 */
	async removeAgentConfig(agentId: string): Promise<void> {
		const config = this.agentConfigs.get(agentId)
		if (!config) {
			throw new ACPConfigurationError(`Agent configuration not found: ${agentId}`, agentId)
		}

		// Disconnect if currently connected
		const status = this.client.getConnectionStatus(agentId)
		if (status === "connected" || status === "connecting") {
			await this.disconnectAgent(agentId)
		}

		// Remove the configuration
		this.agentConfigs.delete(agentId)
		this.emitEvent("agent-disconnected", agentId)
	}
	// cmbt-agent_change end
	// cmbt-agent_change start - Connection management operations
	/**
	 * Connect to an agent
	 */
	async connectAgent(agentId: string): Promise<void> {
		const config = this.agentConfigs.get(agentId)
		if (!config) {
			throw new ACPConfigurationError(`Agent configuration not found: ${agentId}`, agentId)
		}

		// Check if fallback is active - if so, deactivate it for retry
		if (this.errorHandler.isFallbackActive(agentId)) {
			console.log(`Deactivating fallback for agent ${agentId} - attempting reconnection`)
			await this.errorHandler.deactivateFallback(agentId)
		}

		try {
			await this.client.connect(config)
			this.updateLastActivity(agentId)

			// Reset retry attempts on successful connection
			this.errorHandler.resetRetries(agentId)

			console.log(`Successfully connected to agent ${agentId}`)
		} catch (error) {
			const acpError = new ACPConnectionError(
				`Failed to connect to agent ${agentId}: ${error.message}`,
				agentId,
				error as Error,
			)

			// Let error handler manage retries and fallback
			const recovered = await this.errorHandler.handleError(acpError)
			if (!recovered) {
				throw acpError
			}
		}
	}

	/**
	 * Disconnect from an agent
	 */
	async disconnectAgent(agentId: string): Promise<void> {
		try {
			await this.client.disconnect(agentId)
			// Clear last activity when disconnecting
			this.lastActivityMap.delete(agentId)

			// Reset retry attempts when manually disconnecting
			this.errorHandler.resetRetries(agentId)
		} catch (error) {
			const acpError = new ACPConnectionError(
				`Failed to disconnect from agent ${agentId}: ${error.message}`,
				agentId,
				error as Error,
			)
			await this.errorHandler.handleError(acpError)
			throw acpError
		}
	}
	/**
	 * Restart connection to an agent (disconnect then reconnect)
	 */
	async restartAgent(agentId: string): Promise<void> {
		const config = this.agentConfigs.get(agentId)
		if (!config) {
			throw new ACPConfigurationError(`Agent configuration not found: ${agentId}`, agentId)
		}

		const currentStatus = this.client.getConnectionStatus(agentId)

		try {
			// Disconnect if currently connected
			if (currentStatus === "connected" || currentStatus === "connecting") {
				await this.disconnectAgent(agentId)

				// Wait a brief moment for clean disconnection
				await new Promise((resolve) => setTimeout(resolve, 1000))
			}

			// Reconnect
			await this.connectAgent(agentId)

			this.emitEvent("agent-connected", agentId, { restarted: true })
		} catch (error) {
			const acpError = new ACPConnectionError(
				`Failed to restart agent ${agentId}: ${error.message}`,
				agentId,
				error as Error,
			)
			this.errorHandler.handleError(acpError)
			throw acpError
		}
	}

	/**
	 * Get connection status for an agent
	 */
	getConnectionStatus(agentId: string): ConnectionStatus {
		return this.client.getConnectionStatus(agentId)
	}

	/**
	 * Get detailed connection status information
	 */
	getConnectionStatusInfo(agentId: string): ConnectionStatusInfo {
		const status = this.client.getConnectionStatus(agentId)
		const connections = this.client.getConnections()
		const connection = connections.get(agentId)
		const lastActivity = this.lastActivityMap.get(agentId)

		return {
			status,
			lastConnected: connection?.lastActivity || lastActivity,
			lastError: undefined, // Will be populated by error handler if needed
			latency: undefined, // Will be populated by connection stats if available
			messageCount: 0, // Will be populated by connection stats if available
		}
	}

	/**
	 * Get all active connections
	 */
	getActiveConnections(): Map<string, ACPConnection> {
		return this.client.getConnections()
	}

	/**
	 * Get connection statistics
	 */
	getConnectionStats() {
		return this.client.getConnectionPoolStats()
	}
	// cmbt-agent_change end
	// cmbt-agent_change start - Configuration validation
	/**
	 * Validate an agent configuration
	 */
	validateAgentConfig(config: ACPAgentConfig): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		// Validate required fields
		if (!config.id) {
			errors.push("Agent ID is required")
		} else if (
			config.id.length < VALIDATION.AGENT_ID.MIN_LENGTH ||
			config.id.length > VALIDATION.AGENT_ID.MAX_LENGTH
		) {
			errors.push(
				`Agent ID must be between ${VALIDATION.AGENT_ID.MIN_LENGTH} and ${VALIDATION.AGENT_ID.MAX_LENGTH} characters`,
			)
		} else if (!VALIDATION.AGENT_ID.PATTERN.test(config.id)) {
			errors.push("Agent ID must contain only lowercase letters, numbers, and hyphens")
		}

		if (
			!config.name ||
			config.name.length < VALIDATION.AGENT_NAME.MIN_LENGTH ||
			config.name.length > VALIDATION.AGENT_NAME.MAX_LENGTH
		) {
			errors.push(
				`Agent name must be between ${VALIDATION.AGENT_NAME.MIN_LENGTH} and ${VALIDATION.AGENT_NAME.MAX_LENGTH} characters`,
			)
		}

		if (!config.endpoint) {
			errors.push("Endpoint is required")
		} else if (config.endpoint.length > VALIDATION.ENDPOINT.MAX_LENGTH) {
			errors.push(`Endpoint must be less than ${VALIDATION.ENDPOINT.MAX_LENGTH} characters`)
		}

		// Validate transport type
		if (!["websocket", "http", "stdio"].includes(config.transport)) {
			errors.push("Transport must be one of: websocket, http, stdio")
		}

		// Validate authentication
		if (!config.authentication || !config.authentication.type) {
			errors.push("Authentication type is required")
		} else if (!["token", "oauth", "none"].includes(config.authentication.type)) {
			errors.push("Authentication type must be one of: token, oauth, none")
		}

		// Validate permissions
		if (!config.permissions) {
			errors.push("Permissions configuration is required")
		} else {
			if (!["none", "read", "write", "full"].includes(config.permissions.fileAccess)) {
				errors.push("File access permission must be one of: none, read, write, full")
			}
			if (typeof config.permissions.networkAccess !== "boolean") {
				errors.push("Network access permission must be a boolean")
			}
			if (typeof config.permissions.shellAccess !== "boolean") {
				errors.push("Shell access permission must be a boolean")
			}
		}

		// Validate settings
		if (!config.settings) {
			errors.push("Settings configuration is required")
		} else {
			if (typeof config.settings.autoConnect !== "boolean") {
				errors.push("Auto-connect setting must be a boolean")
			}
			if (
				config.settings.idleTimeout < VALIDATION.TIMEOUT.MIN ||
				config.settings.idleTimeout > VALIDATION.TIMEOUT.MAX
			) {
				errors.push(
					`Idle timeout must be between ${VALIDATION.TIMEOUT.MIN} and ${VALIDATION.TIMEOUT.MAX} milliseconds`,
				)
			}
			if (config.settings.retryAttempts < 0 || config.settings.retryAttempts > 10) {
				errors.push("Retry attempts must be between 0 and 10")
			}
			if (config.settings.retryDelay < 1000 || config.settings.retryDelay > 60000) {
				errors.push("Retry delay must be between 1000 and 60000 milliseconds")
			}
		}

		// Validate metadata
		if (!config.metadata) {
			errors.push("Metadata is required")
		} else {
			if (!config.metadata.version) {
				errors.push("Version is required in metadata")
			}
			if (!Array.isArray(config.metadata.capabilities)) {
				errors.push("Capabilities must be an array")
			}
			if (!(config.metadata.created instanceof Date)) {
				errors.push("Created date must be a Date object")
			}
		}

		// Warnings for security considerations
		if (config.permissions?.shellAccess) {
			warnings.push("Shell access is enabled - ensure this agent is trusted")
		}
		if (config.permissions?.networkAccess) {
			warnings.push("Network access is enabled - monitor for security implications")
		}
		if (config.authentication?.type === "none") {
			warnings.push("No authentication configured - consider adding authentication for security")
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		}
	}

	/**
	 * Validate connection parameters
	 */
	async validateConnection(endpoint: string, transport: ACPTransportType): Promise<ValidationResult> {
		const errors: string[] = []
		const warnings: string[] = []

		// Basic endpoint validation
		if (!endpoint) {
			errors.push("Endpoint is required")
			return { valid: false, errors, warnings }
		}

		try {
			// Parse endpoint based on transport type
			if (transport === "websocket") {
				const url = new URL(endpoint)
				if (!["ws:", "wss:"].includes(url.protocol)) {
					errors.push("WebSocket endpoint must use ws:// or wss:// protocol")
				}
				if (url.protocol === "ws:") {
					warnings.push("Using unencrypted WebSocket connection - consider using wss://")
				}
			} else if (transport === "http") {
				const url = new URL(endpoint)
				if (!["http:", "https:"].includes(url.protocol)) {
					errors.push("HTTP endpoint must use http:// or https:// protocol")
				}
				if (url.protocol === "http:") {
					warnings.push("Using unencrypted HTTP connection - consider using https://")
				}
			} else if (transport === "stdio") {
				// For stdio, endpoint might be a command or path
				if (endpoint.includes("..") || endpoint.includes("~")) {
					warnings.push("Stdio endpoint contains relative paths - ensure security")
				}
			}
		} catch (error) {
			errors.push(`Invalid endpoint format: ${error.message}`)
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		}
	}

	/**
	 * Validate permissions configuration
	 */
	validatePermissions(permissions: any): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		if (!permissions || typeof permissions !== "object") {
			errors.push("Permissions must be an object")
			return { valid: false, errors, warnings }
		}

		// Validate file access
		if (!["none", "read", "write", "full"].includes(permissions.fileAccess)) {
			errors.push("File access must be one of: none, read, write, full")
		} else if (permissions.fileAccess === "full") {
			warnings.push("Full file access granted - ensure agent is trusted")
		}

		// Validate network access
		if (typeof permissions.networkAccess !== "boolean") {
			errors.push("Network access must be a boolean")
		} else if (permissions.networkAccess) {
			warnings.push("Network access enabled - monitor for security implications")
		}

		// Validate shell access
		if (typeof permissions.shellAccess !== "boolean") {
			errors.push("Shell access must be a boolean")
		} else if (permissions.shellAccess) {
			warnings.push("Shell access enabled - high security risk, ensure agent is trusted")
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		}
	}
	// cmbt-agent_change end
	// cmbt-agent_change start - Utility and cleanup methods
	/**
	 * Test connection to an agent without saving configuration
	 */
	async testConnection(config: ACPAgentConfig): Promise<ValidationResult> {
		const errors: string[] = []
		const warnings: string[] = []

		// First validate the configuration
		const configValidation = this.validateAgentConfig(config)
		if (!configValidation.valid) {
			return configValidation
		}

		try {
			// Create a temporary client for testing
			const testClient = new ACPClient()

			// Attempt connection with short timeout
			const testConfig = {
				...config,
				settings: {
					...config.settings,
					idleTimeout: 5000, // 5 second timeout for testing
					retryAttempts: 1,
				},
			}

			await testClient.connect(testConfig)
			await testClient.disconnect(config.id)
			await testClient.shutdown()

			warnings.push("Connection test successful")
		} catch (error) {
			errors.push(`Connection test failed: ${error.message}`)
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		}
	}

	/**
	 * Get health status of all managed agents
	 */
	getHealthStatus(): { [agentId: string]: ConnectionStatusInfo } {
		const status: { [agentId: string]: ConnectionStatusInfo } = {}

		this.agentConfigs.forEach((config, agentId) => {
			status[agentId] = this.getConnectionStatusInfo(agentId)
		})

		return status
	}

	/**
	 * Reconnect all agents that have auto-connect enabled
	 */
	async reconnectAllAgents(): Promise<void> {
		const reconnectPromises: Promise<void>[] = []

		this.agentConfigs.forEach((config, agentId) => {
			if (config.settings.autoConnect) {
				const currentStatus = this.getConnectionStatus(agentId)
				if (currentStatus === "disconnected" || currentStatus === "error") {
					reconnectPromises.push(
						this.connectAgent(agentId).catch((error) => {
							this.errorHandler.handleError(error as ACPError)
						}),
					)
				}
			}
		})

		await Promise.allSettled(reconnectPromises)
	}

	/**
	 * Shutdown the connection manager
	 */
	async shutdown(): Promise<void> {
		// Prevent multiple shutdown calls
		if (this.shutdownPromise) {
			return this.shutdownPromise
		}

		this.shutdownPromise = this.performShutdown()
		return this.shutdownPromise
	}

	/**
	 * Perform the actual shutdown process
	 */
	private async performShutdown(): Promise<void> {
		this.isShuttingDown = true

		// Clear monitoring intervals
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval)
			this.monitoringInterval = undefined
		}

		if (this.idleCheckInterval) {
			clearInterval(this.idleCheckInterval)
			this.idleCheckInterval = undefined
		}

		// Disconnect all agents gracefully
		const disconnectPromises: Promise<void>[] = []
		this.agentConfigs.forEach((config, agentId) => {
			const status = this.getConnectionStatus(agentId)
			if (status === "connected" || status === "connecting") {
				disconnectPromises.push(
					this.disconnectAgent(agentId).catch((error) => {
						// Log but don't throw during shutdown
						console.error(`Error disconnecting agent ${agentId}:`, error)
					}),
				)
			}
		})

		// Wait for all disconnections to complete with timeout
		const disconnectTimeout = new Promise<void>((resolve) => {
			setTimeout(() => {
				console.warn("Shutdown timeout reached, forcing shutdown")
				resolve()
			}, 10000) // 10 second timeout
		})

		await Promise.race([Promise.allSettled(disconnectPromises), disconnectTimeout])

		// Shutdown the underlying client
		try {
			await this.client.shutdown()
		} catch (error) {
			console.error("Error shutting down ACP client:", error)
		}

		// Clear activity tracking
		this.lastActivityMap.clear()

		// Remove all event listeners
		this.removeAllListeners()

		// Remove process event listeners
		process.removeAllListeners("SIGTERM")
		process.removeAllListeners("SIGINT")
		process.removeAllListeners("beforeExit")
		process.removeAllListeners("disconnect")
	}
	/**
	 * Get idle connection information
	 */
	getIdleConnections(): { agentId: string; idleTime: number; config: ACPAgentConfig }[] {
		const now = new Date()
		const idleConnections: { agentId: string; idleTime: number; config: ACPAgentConfig }[] = []

		this.agentConfigs.forEach((config, agentId) => {
			const status = this.client.getConnectionStatus(agentId)
			if (status === "connected") {
				const lastActivity = this.lastActivityMap.get(agentId)
				if (lastActivity) {
					const idleTime = now.getTime() - lastActivity.getTime()
					if (idleTime > 0) {
						idleConnections.push({ agentId, idleTime, config })
					}
				}
			}
		})

		return idleConnections.sort((a, b) => b.idleTime - a.idleTime)
	}

	/**
	 * Force disconnect idle connections immediately
	 */
	async disconnectIdleConnections(): Promise<void> {
		const idleConnections = this.getIdleConnections()
		const disconnectPromises: Promise<void>[] = []

		idleConnections.forEach(({ agentId, idleTime, config }) => {
			if (idleTime > config.settings.idleTimeout) {
				console.log(`Force disconnecting idle agent ${agentId} after ${idleTime}ms of inactivity`)
				disconnectPromises.push(
					this.disconnectAgent(agentId).catch((error) => {
						console.error(`Error force disconnecting idle agent ${agentId}:`, error)
					}),
				)
			}
		})

		await Promise.allSettled(disconnectPromises)
	}

	/**
	 * Check if the connection manager is shutting down
	 */
	isShuttingDownStatus(): boolean {
		return this.isShuttingDown
	}

	/**
	 * Get connection lifecycle statistics
	 */
	getLifecycleStats(): {
		totalAgents: number
		connectedAgents: number
		idleAgents: number
		errorAgents: number
		averageIdleTime: number
	} {
		const now = new Date()
		let connectedCount = 0
		let idleCount = 0
		let errorCount = 0
		let totalIdleTime = 0

		this.agentConfigs.forEach((config, agentId) => {
			const status = this.client.getConnectionStatus(agentId)

			switch (status) {
				case "connected": {
					connectedCount++
					const lastActivity = this.lastActivityMap.get(agentId)
					if (lastActivity) {
						const idleTime = now.getTime() - lastActivity.getTime()
						if (idleTime > config.settings.idleTimeout * 0.5) {
							// Consider idle if > 50% of timeout
							idleCount++
						}
						totalIdleTime += idleTime
					}
					break
				}
				case "error":
					errorCount++
					break
			}
		})

		return {
			totalAgents: this.agentConfigs.size,
			connectedAgents: connectedCount,
			idleAgents: idleCount,
			errorAgents: errorCount,
			averageIdleTime: connectedCount > 0 ? totalIdleTime / connectedCount : 0,
		}
	}
	/**
	 * Get retry and fallback information for an agent
	 */
	getRetryInfo(agentId: string): {
		connection: { attempts: number; lastRetry: number | undefined; circuitState: string }
		auth: { attempts: number }
		protocol: { attempts: number }
		fallbackActive: boolean
		fallbackReason?: string
		errorHistory: number
	} {
		return this.errorHandler.getRetryInfo(agentId)
	}

	/**
	 * Check if fallback is active for an agent
	 */
	isFallbackActive(agentId: string): boolean {
		return this.errorHandler.isFallbackActive(agentId)
	}

	/**
	 * Force retry connection for an agent (deactivates fallback if active)
	 */
	async forceRetryConnection(agentId: string): Promise<void> {
		const config = this.agentConfigs.get(agentId)
		if (!config) {
			throw new ACPConfigurationError(`Agent configuration not found: ${agentId}`, agentId)
		}

		// Reset retry attempts and deactivate fallback
		this.errorHandler.resetRetries(agentId)
		this.errorHandler.deactivateFallback(agentId)

		// Attempt connection
		await this.connectAgent(agentId)
	}

	/**
	 * Get enhanced connection status with retry information
	 */
	getEnhancedConnectionStatus(agentId: string): ConnectionStatusInfo & {
		retryInfo: {
			connection: { attempts: number; lastRetry: number | undefined; circuitState: string }
			auth: { attempts: number }
			protocol: { attempts: number }
			fallbackActive: boolean
			fallbackReason?: string
			errorHistory: number
		}
	} {
		const baseStatus = this.getConnectionStatusInfo(agentId)
		const retryInfo = this.getRetryInfo(agentId)

		return {
			...baseStatus,
			retryInfo,
		}
	}

	/**
	 * Get comprehensive error handling statistics
	 */
	getErrorHandlingStats(): {
		totalErrors: number
		errorsByType: Record<string, number>
		fallbackStats: any
		agentsWithErrors: number
	} {
		return this.errorHandler.getErrorStats()
	}

	/**
	 * Force deactivate fallback for an agent and attempt reconnection
	 */
	async forceDeactivateFallback(agentId: string): Promise<void> {
		if (this.errorHandler.isFallbackActive(agentId)) {
			await this.errorHandler.deactivateFallback(agentId)

			// Attempt reconnection after deactivating fallback
			const config = this.agentConfigs.get(agentId)
			if (config) {
				try {
					await this.connectAgent(agentId)
				} catch (error) {
					console.error(`Failed to reconnect agent ${agentId} after fallback deactivation:`, error)
					throw error
				}
			}
		}
	}
	// cmbt-agent_change end
}
