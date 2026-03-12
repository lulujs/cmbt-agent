// cmbt-agent_change - new file
/**
 * Main ACP Service class that orchestrates all ACP functionality
 *
 * This service provides a high-level interface for managing ACP agents,
 * including initialization of pre-configured agents, connection management,
 * and integration with the VSCode extension lifecycle.
 */

import * as vscode from "vscode"
import { EventEmitter } from "events"
import { ConnectionManager } from "./manager/ConnectionManager"
import { PreConfiguredAgentManager } from "./manager/PreConfiguredAgentManager"
import { PermissionManager } from "./PermissionManager"
import { ProtocolLogger } from "./logging/ProtocolLogger"
import { ConfigurationStorage } from "./storage/ConfigurationStorage"
import { ACPAgentConfig, ACPServiceConfig, ACPEvent, ACPEventType } from "./types"
import { ACPSystemError, ACPConfigurationError } from "./errors"
import { PRE_CONFIGURED_AGENTS, DEFAULT_ACP_SERVICE_CONFIG } from "./constants"

/**
 * Main ACP Service that coordinates all ACP functionality
 */
export class ACPService extends EventEmitter {
	private connectionManager: ConnectionManager
	private preConfiguredAgentManager: PreConfiguredAgentManager
	private permissionManager: PermissionManager
	private protocolLogger: ProtocolLogger
	private configStorage: ConfigurationStorage
	private context: vscode.ExtensionContext
	private config: ACPServiceConfig
	private isInitialized = false

	constructor(context: vscode.ExtensionContext, config?: Partial<ACPServiceConfig>) {
		super()
		this.context = context
		this.config = { ...DEFAULT_ACP_SERVICE_CONFIG, ...config }

		// Initialize core services
		this.connectionManager = new ConnectionManager()
		this.preConfiguredAgentManager = new PreConfiguredAgentManager(context)
		this.permissionManager = new PermissionManager(context)
		this.protocolLogger = new ProtocolLogger()
		this.configStorage = new ConfigurationStorage(context)

		this.setupEventHandlers()
	}

	/**
	 * Initialize the ACP service and pre-configured agents
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			// Initialize pre-configured agents using the dedicated manager
			await this.preConfiguredAgentManager.initializePreConfiguredAgents()

			// Auto-detect available agents if enabled
			if (this.config.autoDetectAgents) {
				await this.autoDetectAvailableAgents()
			}

			this.isInitialized = true
			this.emit("service-initialized")

			console.log("ACP Service initialized successfully")
		} catch (error) {
			console.error("Failed to initialize ACP Service:", error)
			throw new ACPSystemError(`ACP服务初始化失败: ${error instanceof Error ? error.message : "未知错误"}`)
		}
	}

	/**
	 * Auto-detect available pre-configured agents
	 */
	async autoDetectAvailableAgents(): Promise<string[]> {
		try {
			const availableAgents = await this.preConfiguredAgentManager.detectAvailableAgents()
			const agentIds = availableAgents.map((agent) => agent.id)

			this.emit("auto-detection-completed", {
				availableAgents: agentIds,
				count: agentIds.length,
			})

			// Show notification if agents are detected
			if (agentIds.length > 0) {
				const agentNames = availableAgents.map((agent) => agent.displayName).join(", ")
				vscode.window.showInformationMessage(`检测到 ${agentIds.length} 个可用的ACP智能体: ${agentNames}`)
			}

			return agentIds
		} catch (error) {
			console.error("Failed to auto-detect available agents:", error)
			// Don't throw here, auto-detection is optional
			return []
		}
	}

	/**
	 * Get status of all pre-configured agents
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
		const preConfiguredAgents = this.preConfiguredAgentManager.getPreConfiguredAgents()
		const availableAgents = await this.preConfiguredAgentManager.detectAvailableAgents()
		const availableIds = new Set(availableAgents.map((agent) => agent.id))

		const status = []

		for (const agent of preConfiguredAgents) {
			const existingConfig = await this.configStorage.loadAgentConfig(agent.id)
			const connectionStatus = this.connectionManager.getConnectionStatus(agent.id)

			status.push({
				id: agent.id,
				name: agent.name,
				displayName: agent.displayName,
				description: agent.description,
				available: availableIds.has(agent.id),
				configured: !!existingConfig,
				connected: connectionStatus === "connected",
			})
		}

		return status
	}

	/**
	 * Setup a pre-configured agent
	 */
	async setupPreConfiguredAgent(agentId: string): Promise<ACPAgentConfig> {
		return await this.preConfiguredAgentManager.setupPreConfiguredAgent(agentId)
	}

	/**
	 * Reset a pre-configured agent to defaults
	 */
	async resetPreConfiguredAgent(agentId: string): Promise<void> {
		await this.preConfiguredAgentManager.resetPreConfiguredAgent(agentId)
	}

	/**
	 * Show setup instructions for a pre-configured agent
	 */
	async showSetupInstructions(agentId: string): Promise<void> {
		await this.preConfiguredAgentManager.showSetupInstructions(agentId)
	}

	/**
	 * Get all pre-configured agent definitions
	 */
	getPreConfiguredAgents() {
		return this.preConfiguredAgentManager.getPreConfiguredAgents()
	}

	/**
	 * Connect to an agent
	 */
	async connectAgent(agentId: string): Promise<void> {
		await this.connectionManager.connectAgent(agentId)
	}

	/**
	 * Disconnect from an agent
	 */
	async disconnectAgent(agentId: string): Promise<void> {
		await this.connectionManager.disconnectAgent(agentId)
	}

	/**
	 * Get all configured agents
	 */
	getAllAgents(): ACPAgentConfig[] {
		return this.connectionManager.getAllAgentConfigs()
	}

	/**
	 * Get agent configuration by ID
	 */
	getAgent(agentId: string): ACPAgentConfig | undefined {
		return this.connectionManager.getAgentConfig(agentId)
	}

	/**
	 * Add a new agent configuration
	 */
	async addAgent(config: ACPAgentConfig): Promise<void> {
		await this.connectionManager.addAgentConfig(config)
		await this.configStorage.saveAgentConfig(config)
		await this.permissionManager.initializeAgentPermissions(config)
	}

	/**
	 * Update an existing agent configuration
	 */
	async updateAgent(agentId: string, updates: Partial<ACPAgentConfig>): Promise<void> {
		await this.connectionManager.updateAgentConfig(agentId, updates)

		const updatedConfig = this.connectionManager.getAgentConfig(agentId)
		if (updatedConfig) {
			await this.configStorage.saveAgentConfig(updatedConfig)
		}
	}

	/**
	 * Remove an agent configuration
	 */
	async removeAgent(agentId: string): Promise<void> {
		await this.connectionManager.removeAgentConfig(agentId)
		await this.configStorage.deleteAgentConfig(agentId)
	}

	/**
	 * Get connection status for an agent
	 */
	getConnectionStatus(agentId: string) {
		return this.connectionManager.getConnectionStatus(agentId)
	}

	/**
	 * Get detailed connection status information
	 */
	getConnectionStatusInfo(agentId: string) {
		return this.connectionManager.getConnectionStatusInfo(agentId)
	}

	/**
	 * Check if an agent is a pre-configured agent
	 */
	isPreConfiguredAgent(agentId: string): boolean {
		return this.preConfiguredAgentManager.isPreConfiguredAgent(agentId)
	}

	/**
	 * Get service statistics
	 */
	getServiceStats() {
		return {
			connectionStats: this.connectionManager.getConnectionStats(),
			lifecycleStats: this.connectionManager.getLifecycleStats(),
			errorStats: this.connectionManager.getErrorHandlingStats(),
			isInitialized: this.isInitialized,
			preConfiguredAgentsCount: PRE_CONFIGURED_AGENTS.length,
		}
	}

	/**
	 * Get the pre-configured agent manager
	 */
	getPreConfiguredAgentManager(): PreConfiguredAgentManager {
		return this.preConfiguredAgentManager
	}

	/**
	 * Setup event handlers for internal services
	 */
	private setupEventHandlers(): void {
		// Forward connection manager events
		this.connectionManager.on("agent-connected", (agentId: string) => {
			this.emit("agent-connected", { agentId })
		})

		this.connectionManager.on("agent-disconnected", (agentId: string) => {
			this.emit("agent-disconnected", { agentId })
		})

		this.connectionManager.on("agent-error", (agentId: string, data: any) => {
			this.emit("agent-error", { agentId, ...data })
		})

		// Log protocol events
		this.connectionManager.on("message-sent", (agentId: string, data: any) => {
			this.protocolLogger.logMessage("sent", agentId, data.message)
		})

		this.connectionManager.on("message-received", (agentId: string, data: any) => {
			this.protocolLogger.logMessage("received", agentId, data.message)
		})
	}

	/**
	 * Shutdown the ACP service
	 */
	async shutdown(): Promise<void> {
		if (!this.isInitialized) {
			return
		}

		try {
			await this.connectionManager.shutdown()
			this.isInitialized = false
			this.emit("service-shutdown")

			console.log("ACP Service shutdown completed")
		} catch (error) {
			console.error("Error during ACP Service shutdown:", error)
			throw error
		}
	}

	/**
	 * Get the underlying connection manager (for advanced usage)
	 */
	getConnectionManager(): ConnectionManager {
		return this.connectionManager
	}

	/**
	 * Get the permission manager
	 */
	getPermissionManager(): PermissionManager {
		return this.permissionManager
	}

	/**
	 * Get the protocol logger
	 */
	getProtocolLogger(): ProtocolLogger {
		return this.protocolLogger
	}

	/**
	 * Get the configuration storage
	 */
	getConfigStorage(): ConfigurationStorage {
		return this.configStorage
	}
}
