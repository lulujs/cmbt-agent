// cmbt-agent_change - new file
import * as vscode from "vscode"
import { ACPAgentConfig, ACPTransportType } from "../types"
import { ACPSystemError, ACPConfigurationError } from "../errors"
import { SecurityManager } from "../security/SecurityManager"

/**
 * Configuration storage service for ACP agents
 * Handles VSCode settings integration, encryption, and validation
 */
export class ConfigurationStorage {
	private static readonly CONFIG_KEY = "acpAgents"
	private static readonly ENCRYPTED_FIELDS = ["apiKey", "token", "password", "secret"]

	private securityManager: SecurityManager
	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.securityManager = new SecurityManager(context)
	}

	/**
	 * Save agent configuration to VSCode settings
	 */
	async saveAgentConfig(config: ACPAgentConfig): Promise<void> {
		try {
			const validation = this.validateConfig(config)
			if (!validation.isValid) {
				throw new ACPConfigurationError(`Invalid configuration: ${validation.errors.join(", ")}`)
			}

			const encryptedConfig = await this.encryptSensitiveFields(config)
			const configs = await this.getAllConfigs()
			configs[config.id] = encryptedConfig

			await this.saveConfigs(configs)
		} catch (error) {
			throw new ACPSystemError(
				`Failed to save agent configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Load agent configuration from VSCode settings
	 */
	async loadAgentConfig(agentId: string): Promise<ACPAgentConfig | null> {
		try {
			const configs = await this.getAllConfigs()
			const encryptedConfig = configs[agentId]

			if (!encryptedConfig) {
				return null
			}

			return await this.decryptSensitiveFields(encryptedConfig)
		} catch (error) {
			throw new ACPSystemError(
				`Failed to load agent configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Load all agent configurations
	 */
	async loadAllConfigs(): Promise<ACPAgentConfig[]> {
		try {
			const configs = await this.getAllConfigs()
			const decryptedConfigs: ACPAgentConfig[] = []

			for (const encryptedConfig of Object.values(configs)) {
				try {
					const decryptedConfig = await this.decryptSensitiveFields(encryptedConfig)
					decryptedConfigs.push(decryptedConfig)
				} catch (error) {
					console.warn(`Failed to decrypt config for agent ${encryptedConfig.id}:`, error)
				}
			}

			return decryptedConfigs
		} catch (error) {
			throw new ACPSystemError(
				`Failed to load configurations: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Delete agent configuration
	 */
	async deleteAgentConfig(agentId: string): Promise<void> {
		try {
			const configs = await this.getAllConfigs()
			delete configs[agentId]
			await this.saveConfigs(configs)
		} catch (error) {
			throw new ACPSystemError(
				`Failed to delete agent configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Update agent configuration
	 */
	async updateAgentConfig(agentId: string, updates: Partial<ACPAgentConfig>): Promise<void> {
		try {
			const existingConfig = await this.loadAgentConfig(agentId)
			if (!existingConfig) {
				throw new ACPConfigurationError(`Agent configuration not found: ${agentId}`)
			}

			const updatedConfig = { ...existingConfig, ...updates, id: agentId }
			await this.saveAgentConfig(updatedConfig)
		} catch (error) {
			if (error instanceof ACPConfigurationError || error instanceof ACPSystemError) {
				throw error
			}
			throw new ACPSystemError(
				`Failed to update agent configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Export configurations for backup
	 */
	async exportConfigs(): Promise<string> {
		try {
			const configs = await this.loadAllConfigs()
			return JSON.stringify(configs, null, 2)
		} catch (error) {
			throw new ACPSystemError(
				`Failed to export configurations: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Import configurations from backup
	 */
	async importConfigs(configData: string): Promise<void> {
		try {
			const configs: ACPAgentConfig[] = JSON.parse(configData)

			if (!Array.isArray(configs)) {
				throw new ACPConfigurationError("Invalid configuration format")
			}

			for (const config of configs) {
				const validation = this.validateConfig(config)
				if (!validation.isValid) {
					throw new ACPConfigurationError(
						`Invalid configuration for ${config.id}: ${validation.errors.join(", ")}`,
					)
				}
				await this.saveAgentConfig(config)
			}
		} catch (error) {
			if (error instanceof ACPConfigurationError) {
				throw error
			}
			throw new ACPSystemError(
				`Failed to import configurations: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Get default configuration fallback
	 */
	getDefaultConfig(): Partial<ACPAgentConfig> {
		return {
			transport: "websocket" as ACPTransportType,
			timeout: 30000,
			retryAttempts: 3,
			retryDelay: 1000,
			permissions: {
				fileAccess: { read: false, write: false, execute: false },
				networkAccess: false,
			},
			enabled: true,
		}
	}

	/**
	 * Validate configuration
	 */
	private validateConfig(config: ACPAgentConfig): { isValid: boolean; errors: string[] } {
		const errors: string[] = []

		if (!config.id || typeof config.id !== "string") {
			errors.push("Agent ID is required and must be a string")
		}

		if (!config.name || typeof config.name !== "string") {
			errors.push("Agent name is required and must be a string")
		}

		if (!config.endpoint || typeof config.endpoint !== "string") {
			errors.push("Endpoint is required and must be a string")
		}

		if (!["websocket", "http"].includes(config.transport)) {
			errors.push('Transport must be either "websocket" or "http"')
		}

		if (config.timeout && (typeof config.timeout !== "number" || config.timeout <= 0)) {
			errors.push("Timeout must be a positive number")
		}

		if (config.retryAttempts && (typeof config.retryAttempts !== "number" || config.retryAttempts < 0)) {
			errors.push("Retry attempts must be a non-negative number")
		}

		return {
			isValid: errors.length === 0,
			errors,
		}
	}

	/**
	 * Get all configurations from VSCode settings
	 */
	private async getAllConfigs(): Promise<Record<string, ACPAgentConfig>> {
		const config = vscode.workspace.getConfiguration()
		return config.get(ConfigurationStorage.CONFIG_KEY, {})
	}

	/**
	 * Save all configurations to VSCode settings
	 */
	private async saveConfigs(configs: Record<string, ACPAgentConfig>): Promise<void> {
		const config = vscode.workspace.getConfiguration()
		await config.update(ConfigurationStorage.CONFIG_KEY, configs, vscode.ConfigurationTarget.Global)
	}

	/**
	 * Encrypt sensitive fields in configuration
	 */
	private async encryptSensitiveFields(config: ACPAgentConfig): Promise<ACPAgentConfig> {
		const encryptedConfig = { ...config }

		for (const field of ConfigurationStorage.ENCRYPTED_FIELDS) {
			const value = (config as any)[field]
			if (value && typeof value === "string") {
				;(encryptedConfig as any)[field] = await this.securityManager.encrypt(value)
			}
		}

		return encryptedConfig
	}

	/**
	 * Decrypt sensitive fields in configuration
	 */
	private async decryptSensitiveFields(config: ACPAgentConfig): Promise<ACPAgentConfig> {
		const decryptedConfig = { ...config }

		for (const field of ConfigurationStorage.ENCRYPTED_FIELDS) {
			const value = (config as any)[field]
			if (value && typeof value === "string") {
				try {
					;(decryptedConfig as any)[field] = await this.securityManager.decrypt(value)
				} catch (error) {
					console.warn(`Failed to decrypt field ${field} for agent ${config.id}:`, error)
				}
			}
		}

		return decryptedConfig
	}
}
