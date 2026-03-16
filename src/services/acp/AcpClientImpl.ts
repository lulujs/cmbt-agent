// cmbt-agent_change - new file
import { ClientSideConnection, Client, Agent } from "@agentclientprotocol/sdk"
import { AgentManager } from "./AgentManager"
import { ConnectionManager } from "./ConnectionManager"
import { SessionManager, AcpMessage } from "./SessionManager"
import { FileSystemHandler } from "../../handlers/acp/FileSystemHandler"
import { TerminalHandler } from "../../handlers/acp/TerminalHandler"
import { PermissionHandler } from "../../handlers/acp/PermissionHandler"
import { SessionUpdateHandler } from "../../handlers/acp/SessionUpdateHandler"
import { AcpLogger } from "./AcpLogger"

// cmbt-agent_change start
import type { AcpProviderContext } from "./AcpProviderBridge"
// cmbt-agent_change end

export interface IAcpClient {
	sendMessage(sessionId: string, message: string): Promise<void>
	createSession(agentId: string, providerContext?: AcpProviderContext): Promise<string> // cmbt-agent_change
	endSession(sessionId: string): Promise<void>
	createClientHandlers(): (agent: Agent) => Client
	getCurrentSessionId(): string | undefined
}

export class AcpClientImpl implements IAcpClient {
	constructor(
		private agentManager: AgentManager,
		private connectionManager: ConnectionManager,
		private sessionManager: SessionManager,
		private fileSystemHandler: FileSystemHandler,
		private terminalHandler: TerminalHandler,
		private permissionHandler: PermissionHandler,
		private sessionUpdateHandler: SessionUpdateHandler,
		private logger: AcpLogger,
	) {}

	async sendMessage(sessionId: string, message: string): Promise<void> {
		this.logger.info("Sending message", { sessionId, messageLength: message.length })

		const session = this.sessionManager.getActiveSession()
		if (!session || session.id !== sessionId) {
			this.logger.error("Session not found or not active", undefined, { sessionId, activeSessionId: session?.id })
			throw new Error(`Session ${sessionId} not found or not active`)
		}

		this.logger.debug("Session found", { agentId: session.agentId, agentName: session.agentName })

		const connection = this.connectionManager.getConnection(session.agentId)
		if (!connection) {
			this.logger.error("Connection not found", undefined, { agentId: session.agentId })
			throw new Error(`No connection found for agent ${session.agentId}`)
		}

		this.logger.debug("Sending message to ACP agent", { sessionId, agentId: session.agentId })

		const userMessage: AcpMessage = {
			role: "user",
			content: message,
			timestamp: Date.now(),
			source: "acp-agent",
			agentId: session.agentId,
			agentName: session.agentName,
		}

		this.sessionManager.addMessage(sessionId, userMessage)
		this.logger.debug("Message added to session, calling connection.prompt")

		// cmbt-agent_change start - Capture and log prompt response
		const response = await connection.prompt({
			sessionId,
			prompt: [{ type: "text", text: message }],
		})

		this.logger.info("Prompt response received", {
			sessionId,
			stopReason: response.stopReason,
		})
		// cmbt-agent_change end

		this.logger.debug("Message sent successfully", { sessionId })
	}

	async createSession(agentId: string, providerContext?: AcpProviderContext): Promise<string> {
		// cmbt-agent_change
		const agent = this.agentManager.getActiveAgent()
		if (!agent || agent.config.id !== agentId) {
			this.logger.error("Agent not active", undefined, { agentId, activeAgentId: agent?.config.id })
			throw new Error(`Agent ${agentId} is not active`)
		}

		const connection = this.connectionManager.getConnection(agentId)
		if (!connection) {
			this.logger.error("Connection not found", undefined, { agentId })
			throw new Error(`No connection found for agent ${agentId}`)
		}

		this.logger.info("Creating new session", { agentId, hasProviderContext: !!providerContext })

		// cmbt-agent_change start
		const cwd = this.agentManager.getWorkspaceRoot() || process.cwd()
		const sessionOptions: Record<string, unknown> = {
			cwd,
			mcpServers: [],
		}
		if (providerContext) {
			sessionOptions.metadata = {
				providerContext: {
					apiProvider: providerContext.apiProvider,
					apiModelId: providerContext.apiModelId,
					mode: providerContext.mode,
				},
			}
			this.logger.debug("Session options with provider context", { sessionOptions })
		}
		this.logger.debug("Calling connection.newSession")
		const response = await connection.newSession(sessionOptions)
		this.logger.debug("newSession response received", { sessionId: response.sessionId })
		// cmbt-agent_change end
		const session = this.sessionManager.createSession(agentId, agent.config.name, response.sessionId)

		this.logger.info("Session created", { sessionId: session.id, agentId })
		return session.id
	}

	async endSession(sessionId: string): Promise<void> {
		this.logger.info("Ending session", { sessionId })
		await this.sessionManager.endSession(sessionId)
		this.logger.info("Session ended", { sessionId })
	}

	createClientHandlers(): (agent: Agent) => Client {
		return () => ({
			requestPermission: async (params) => {
				const decision = await this.permissionHandler.handlePermissionRequest({
					operation: params.operation,
					resource: params.resource || "",
					description: params.description || "",
				})
				return { outcome: decision.allowed ? "approved" : "denied" }
			},
			sessionUpdate: async (params) => {
				this.logger.info("Received sessionUpdate notification", {
					sessionId: params.sessionId,
					updateType: (params.update as any)?.sessionUpdate || "unknown",
				})
				this.sessionUpdateHandler.handleSessionUpdate({
					sessionId: params.sessionId,
					messages: params.messages as AcpMessage[] | undefined,
					status: params.stopReason,
				})
			},
			readTextFile: async (params) => {
				const result = await this.fileSystemHandler.handleReadFile({ path: params.path })
				return { content: result.content }
			},
			writeTextFile: async (params) => {
				await this.fileSystemHandler.handleWriteFile({ path: params.path, content: params.content })
				return {}
			},
			createTerminal: async (params) => {
				const result = await this.terminalHandler.handleCreateTerminal({
					name: params.name,
					cwd: params.cwd,
				})
				return { terminalId: result.terminalId }
			},
			terminalOutput: async (params) => {
				const result = await this.terminalHandler.handleGetOutput({ terminalId: params.terminalId })
				return { output: result.output }
			},
			waitForTerminalExit: async (params) => {
				const result = await this.terminalHandler.handleWaitForExit({ terminalId: params.terminalId })
				return { exitCode: result.exitCode }
			},
			killTerminal: async (params) => {
				await this.terminalHandler.handleKillTerminal({ terminalId: params.terminalId })
			},
			releaseTerminal: async (params) => {
				await this.terminalHandler.handleDisposeTerminal({ terminalId: params.terminalId })
			},
		})
	}

	getCurrentSessionId(): string | undefined {
		const session = this.sessionManager.getActiveSession()
		return session?.id
	}
}
