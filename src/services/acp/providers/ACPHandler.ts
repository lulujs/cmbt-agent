// cmbt-agent_change - new file
/**
 * ACP Handler Provider Class
 * Extends BaseProvider with ACP protocol support
 * Requirements: 5.1, 5.2, 5.3
 */

import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"
import type { ModelInfo } from "@roo-code/types"
import type { ApiHandlerCreateMessageMetadata, SingleCompletionHandler } from "../../../api"
import { BaseProvider } from "../../../api/providers/base-provider"
import { ApiStream } from "../../../api/transform/stream"
import { ACPClient } from "../client/ACPClient"
import { ConnectionManager } from "../manager/ConnectionManager"
import { ProtocolLogger } from "../logging/ProtocolLogger"
import { ACPMessage, ACPResponse, AgentConfig } from "../types"

export interface ACPHandlerOptions {
	agentId: string
	agentConfig: AgentConfig
	connectionManager: ConnectionManager
	protocolLogger: ProtocolLogger
}

/**
 * ACP Handler that integrates ACP protocol with the existing provider system
 */
export class ACPHandler extends BaseProvider implements SingleCompletionHandler {
	private agentId: string
	private agentConfig: AgentConfig
	private acpClient: ACPClient
	private connectionManager: ConnectionManager
	private protocolLogger: ProtocolLogger

	constructor(options: ACPHandlerOptions) {
		super()
		this.agentId = options.agentId
		this.agentConfig = options.agentConfig
		this.connectionManager = options.connectionManager
		this.protocolLogger = options.protocolLogger
		this.acpClient = new ACPClient()
	}

	/**
	 * Create message stream for ACP agent communication
	 */
	createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		return new ApiStream(
			this.createACPMessageStream(systemPrompt, messages, metadata),
			this.abortController.signal,
			() => this.abortController.abort(),
		)
	}

	/**
	 * Complete a simple prompt using ACP agent
	 */
	async completePrompt(prompt: string): Promise<string> {
		try {
			// Ensure agent is connected
			await this.ensureConnection()

			// Create ACP message
			const acpMessage: ACPMessage = {
				id: this.generateMessageId(),
				method: "completePrompt",
				params: {
					prompt,
					agentId: this.agentId,
				},
			}

			// Log outgoing message
			this.protocolLogger.logSentMessage(this.agentId, acpMessage)

			// Send message and get response
			const response = await this.sendACPMessage(acpMessage)

			// Log incoming response
			this.protocolLogger.logReceivedMessage(this.agentId, response)

			if (response.error) {
				throw new Error(`ACP Error: ${response.error.message}`)
			}

			return response.result?.completion || ""
		} catch (error) {
			this.protocolLogger.logError(this.agentId, error as Error, { method: "completePrompt", prompt })
			throw error
		}
	}

	/**
	 * Get model information for this ACP agent
	 */
	getModel(): { id: string; info: ModelInfo } {
		return {
			id: `acp-${this.agentId}`,
			info: {
				maxTokens: this.agentConfig.capabilities?.maxTokens || 4096,
				contextWindow: this.agentConfig.capabilities?.contextWindow || 8192,
				supportsImages: this.agentConfig.capabilities?.supportsImages || false,
				supportsPromptCaching: this.agentConfig.capabilities?.supportsPromptCaching || false,
				inputPrice: 0, // ACP agents don't have pricing
				outputPrice: 0,
				description: `ACP Agent: ${this.agentConfig.name}`,
				supportsComputerUse: this.agentConfig.capabilities?.supportsComputerUse || false,
			},
		}
	}

	private abortController = new AbortController()

	private async *createACPMessageStream(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): AsyncGenerator<string> {
		try {
			// Ensure agent is connected
			await this.ensureConnection()

			// Transform messages to ACP format
			const acpMessages = this.transformMessagesToACP(systemPrompt, messages)

			// Create ACP message
			const acpMessage: ACPMessage = {
				id: this.generateMessageId(),
				method: "createMessage",
				params: {
					messages: acpMessages,
					agentId: this.agentId,
					tools: metadata?.tools ? this.transformToolsToACP(metadata.tools) : undefined,
					maxTokens: metadata?.maxTokens,
					temperature: metadata?.temperature,
				},
			}

			// Log outgoing message
			this.protocolLogger.logSentMessage(this.agentId, acpMessage)

			// Send message and handle streaming response
			const response = await this.sendACPMessage(acpMessage)

			// Log incoming response
			this.protocolLogger.logReceivedMessage(this.agentId, response)

			if (response.error) {
				throw new Error(`ACP Error: ${response.error.message}`)
			}

			// Handle streaming response
			if (response.result?.stream) {
				for (const chunk of response.result.stream) {
					if (this.abortController.signal.aborted) {
						break
					}
					yield chunk
				}
			} else if (response.result?.content) {
				// Non-streaming response
				yield response.result.content
			}
		} catch (error) {
			this.protocolLogger.logError(this.agentId, error as Error, {
				method: "createMessage",
				systemPrompt: systemPrompt.substring(0, 100),
			})
			throw error
		}
	}

	private async ensureConnection(): Promise<void> {
		const status = this.connectionManager.getConnectionStatus(this.agentId)
		if (status !== "connected") {
			await this.connectionManager.connect(this.agentId)
		}
	}

	private async sendACPMessage(message: ACPMessage): Promise<ACPResponse> {
		// In a real implementation, this would send the message through the connection
		// For now, we'll simulate the response
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve({
					id: message.id,
					result: {
						success: true,
						completion: `Mock response for ${message.method}`,
						content: `Mock content for ${message.method}`,
					},
				})
			}, 100)
		})
	}

	private transformMessagesToACP(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): any[] {
		const acpMessages = []

		// Add system message if provided
		if (systemPrompt) {
			acpMessages.push({
				role: "system",
				content: systemPrompt,
			})
		}

		// Transform Anthropic messages to ACP format
		for (const message of messages) {
			acpMessages.push({
				role: message.role,
				content: this.transformContentToACP(message.content),
			})
		}

		return acpMessages
	}

	private transformContentToACP(content: any): any {
		if (typeof content === "string") {
			return content
		}

		if (Array.isArray(content)) {
			return content.map((block) => {
				if (block.type === "text") {
					return { type: "text", text: block.text }
				} else if (block.type === "image") {
					return {
						type: "image",
						source: {
							type: block.source.type,
							media_type: block.source.media_type,
							data: block.source.data,
						},
					}
				} else if (block.type === "tool_use") {
					return {
						type: "tool_use",
						id: block.id,
						name: block.name,
						input: block.input,
					}
				} else if (block.type === "tool_result") {
					return {
						type: "tool_result",
						tool_use_id: block.tool_use_id,
						content: block.content,
						is_error: block.is_error,
					}
				}
				return block
			})
		}

		return content
	}

	private transformToolsToACP(tools: any[]): any[] {
		return tools.map((tool) => {
			if (tool.type === "function") {
				return {
					type: "function",
					function: {
						name: tool.function.name,
						description: tool.function.description,
						parameters: tool.function.parameters,
					},
				}
			}
			return tool
		})
	}

	private generateMessageId(): string {
		return `acp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
	}

	/**
	 * Get connection status for this agent
	 */
	getConnectionStatus(): "connected" | "connecting" | "disconnected" | "error" {
		return this.connectionManager.getConnectionStatus(this.agentId)
	}

	/**
	 * Disconnect from the ACP agent
	 */
	async disconnect(): Promise<void> {
		await this.connectionManager.disconnect(this.agentId)
	}

	/**
	 * Reconnect to the ACP agent
	 */
	async reconnect(): Promise<void> {
		await this.connectionManager.restart(this.agentId)
	}

	/**
	 * Get agent configuration
	 */
	getAgentConfig(): AgentConfig {
		return { ...this.agentConfig }
	}

	/**
	 * Update agent configuration
	 */
	async updateAgentConfig(config: Partial<AgentConfig>): Promise<void> {
		this.agentConfig = { ...this.agentConfig, ...config }
		await this.connectionManager.updateAgentConfig(this.agentId, this.agentConfig)
	}

	/**
	 * Check if agent supports a specific capability
	 */
	supportsCapability(capability: string): boolean {
		const capabilities = this.agentConfig.capabilities
		if (!capabilities) return false

		switch (capability) {
			case "images":
				return capabilities.supportsImages || false
			case "tools":
				return capabilities.supportsTools || false
			case "streaming":
				return capabilities.supportsStreaming || false
			case "computer_use":
				return capabilities.supportsComputerUse || false
			case "prompt_caching":
				return capabilities.supportsPromptCaching || false
			default:
				return false
		}
	}

	/**
	 * Get agent statistics
	 */
	getAgentStats(): {
		messagesSent: number
		messagesReceived: number
		errors: number
		uptime: number
	} {
		const logs = this.protocolLogger.getAgentLogs(this.agentId)
		const sentMessages = logs.filter((log) => log.direction === "send").length
		const receivedMessages = logs.filter((log) => log.direction === "receive").length
		const errors = logs.filter((log) => log.level === 3).length // LogLevel.ERROR = 3

		return {
			messagesSent: sentMessages,
			messagesReceived: receivedMessages,
			errors,
			uptime: Date.now() - (this.agentConfig.createdAt?.getTime() || Date.now()),
		}
	}
}
