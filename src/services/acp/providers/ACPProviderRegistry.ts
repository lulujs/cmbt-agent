// cmbt-agent_change - new file
/**
 * ACP Provider Registry
 * Integrates ACP provider into existing provider system and implements message routing
 * Requirements: 5.1
 */

import * as vscode from "vscode"
import { ACPHandler, ACPHandlerOptions } from "./ACPHandler"
import { ConnectionManager } from "../manager/ConnectionManager"
import { ProtocolLogger } from "../logging/ProtocolLogger"
import { AgentConfig } from "../types"

export interface ACPProviderRegistryOptions {
	connectionManager: ConnectionManager
	protocolLogger: ProtocolLogger
}

/**
 * Registry for managing ACP providers and routing messages to selected agents
 */
export class ACPProviderRegistry {
	private providers: Map<string, ACPHandler> = new Map()
	private connectionManager: ConnectionManager
	private protocolLogger: ProtocolLogger
	private selectedAgentId: string | null = null

	constructor(options: ACPProviderRegistryOptions) {
		this.connectionManager = options.connectionManager
		this.protocolLogger = options.protocolLogger
	}

	/**
	 * Register an ACP agent as a provider
	 */
	async registerProvider(agentConfig: AgentConfig): Promise<void> {
		const options: ACPHandlerOptions = {
			agentId: agentConfig.id,
			agentConfig,
			connectionManager: this.connectionManager,
			protocolLogger: this.protocolLogger,
		}

		const handler = new ACPHandler(options)
		this.providers.set(agentConfig.id, handler)

		// If this is the first provider, select it as default
		if (this.providers.size === 1) {
			this.selectedAgentId = agentConfig.id
		}

		this.protocolLogger.logDebug(agentConfig.id, "Provider registered", {
			name: agentConfig.name,
			type: agentConfig.type,
		})
	}

	/**
	 * Unregister an ACP provider
	 */
	async unregisterProvider(agentId: string): Promise<void> {
		const provider = this.providers.get(agentId)
		if (provider) {
			await provider.disconnect()
			this.providers.delete(agentId)

			// If this was the selected provider, select another one
			if (this.selectedAgentId === agentId) {
				const remainingProviders = Array.from(this.providers.keys())
				this.selectedAgentId = remainingProviders.length > 0 ? remainingProviders[0] : null
			}

			this.protocolLogger.logDebug(agentId, "Provider unregistered")
		}
	}

	/**
	 * Get a specific ACP provider
	 */
	getProvider(agentId: string): ACPHandler | undefined {
		return this.providers.get(agentId)
	}

	/**
	 * Get the currently selected provider
	 */
	getSelectedProvider(): ACPHandler | undefined {
		return this.selectedAgentId ? this.providers.get(this.selectedAgentId) : undefined
	}

	/**
	 * Select an agent as the active provider
	 */
	selectProvider(agentId: string): boolean {
		if (this.providers.has(agentId)) {
			this.selectedAgentId = agentId
			this.protocolLogger.logDebug(agentId, "Provider selected as active")
			return true
		}
		return false
	}

	/**
	 * Get all registered providers
	 */
	getAllProviders(): Map<string, ACPHandler> {
		return new Map(this.providers)
	}

	/**
	 * Get provider information for UI display
	 */
	getProviderInfo(): Array<{
		id: string
		name: string
		type: string
		status: "connected" | "connecting" | "disconnected" | "error"
		isSelected: boolean
		capabilities: string[]
	}> {
		return Array.from(this.providers.entries()).map(([id, provider]) => {
			const config = provider.getAgentConfig()
			const capabilities = []

			if (provider.supportsCapability("images")) capabilities.push("images")
			if (provider.supportsCapability("tools")) capabilities.push("tools")
			if (provider.supportsCapability("streaming")) capabilities.push("streaming")
			if (provider.supportsCapability("computer_use")) capabilities.push("computer_use")

			return {
				id,
				name: config.name,
				type: config.type,
				status: provider.getConnectionStatus(),
				isSelected: id === this.selectedAgentId,
				capabilities,
			}
		})
	}

	/**
	 * Route message to selected ACP agent
	 */
	async routeMessage(systemPrompt: string, messages: any[], metadata?: any): Promise<any> {
		const selectedProvider = this.getSelectedProvider()
		if (!selectedProvider) {
			throw new Error("No ACP agent selected")
		}

		this.protocolLogger.logDebug(this.selectedAgentId!, "Routing message to selected agent", {
			messageCount: messages.length,
		})

		return selectedProvider.createMessage(systemPrompt, messages, metadata)
	}

	/**
	 * Route simple prompt completion to selected ACP agent
	 */
	async routePromptCompletion(prompt: string): Promise<string> {
		const selectedProvider = this.getSelectedProvider()
		if (!selectedProvider) {
			throw new Error("No ACP agent selected")
		}

		this.protocolLogger.logDebug(this.selectedAgentId!, "Routing prompt completion to selected agent", {
			promptLength: prompt.length,
		})

		return selectedProvider.completePrompt(prompt)
	}

	/**
	 * Get statistics for all providers
	 */
	getRegistryStats(): {
		totalProviders: number
		connectedProviders: number
		selectedProvider: string | null
		totalMessages: number
		totalErrors: number
	} {
		let connectedCount = 0
		let totalMessages = 0
		let totalErrors = 0

		for (const [id, provider] of this.providers) {
			if (provider.getConnectionStatus() === "connected") {
				connectedCount++
			}

			const stats = provider.getAgentStats()
			totalMessages += stats.messagesSent + stats.messagesReceived
			totalErrors += stats.errors
		}

		return {
			totalProviders: this.providers.size,
			connectedProviders: connectedCount,
			selectedProvider: this.selectedAgentId,
			totalMessages,
			totalErrors,
		}
	}

	/**
	 * Connect all registered providers
	 */
	async connectAllProviders(): Promise<void> {
		const connectionPromises = Array.from(this.providers.keys()).map((agentId) =>
			this.connectionManager.connect(agentId).catch((error) => {
				this.protocolLogger.logError(agentId, error, { operation: "connectAll" })
			}),
		)

		await Promise.allSettled(connectionPromises)
	}

	/**
	 * Disconnect all registered providers
	 */
	async disconnectAllProviders(): Promise<void> {
		const disconnectionPromises = Array.from(this.providers.values()).map((provider) =>
			provider.disconnect().catch((error) => {
				this.protocolLogger.logError(provider.getAgentConfig().id, error, { operation: "disconnectAll" })
			}),
		)

		await Promise.allSettled(disconnectionPromises)
	}

	/**
	 * Refresh provider status
	 */
	async refreshProviderStatus(): Promise<void> {
		for (const [agentId, provider] of this.providers) {
			try {
				const status = provider.getConnectionStatus()
				if (status === "error" || status === "disconnected") {
					// Attempt to reconnect
					await provider.reconnect()
				}
			} catch (error) {
				this.protocolLogger.logError(agentId, error as Error, { operation: "refresh" })
			}
		}
	}

	/**
	 * Update provider configuration
	 */
	async updateProviderConfig(agentId: string, config: Partial<AgentConfig>): Promise<void> {
		const provider = this.providers.get(agentId)
		if (provider) {
			await provider.updateAgentConfig(config)
			this.protocolLogger.logDebug(agentId, "Provider configuration updated", config)
		}
	}

	/**
	 * Check if any providers are available
	 */
	hasAvailableProviders(): boolean {
		return this.providers.size > 0
	}

	/**
	 * Get the next available provider (for load balancing)
	 */
	getNextAvailableProvider(): ACPHandler | undefined {
		const connectedProviders = Array.from(this.providers.entries()).filter(
			([_, provider]) => provider.getConnectionStatus() === "connected",
		)

		if (connectedProviders.length === 0) {
			return undefined
		}

		// Simple round-robin selection
		const currentIndex = connectedProviders.findIndex(([id]) => id === this.selectedAgentId)
		const nextIndex = (currentIndex + 1) % connectedProviders.length
		return connectedProviders[nextIndex][1]
	}

	/**
	 * Dispose all providers and clean up resources
	 */
	async dispose(): Promise<void> {
		await this.disconnectAllProviders()
		this.providers.clear()
		this.selectedAgentId = null
	}
}
