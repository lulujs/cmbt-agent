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

export interface IAcpClient {
	sendMessage(sessionId: string, message: string): Promise<void>
	createSession(agentId: string): Promise<string>
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
		const session = this.sessionManager.getActiveSession()
		if (!session || session.id !== sessionId) {
			throw new Error(`Session ${sessionId} not found or not active`)
		}

		const connection = this.connectionManager.getConnection(session.agentId)
		if (!connection) {
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

		await connection.prompt({
			sessionId,
			messages: [{ role: "user", content: [{ type: "text", text: message }] }],
		})

		this.logger.debug("Message sent successfully", { sessionId })
	}

	async createSession(agentId: string): Promise<string> {
		const agent = this.agentManager.getActiveAgent()
		if (!agent || agent.config.id !== agentId) {
			throw new Error(`Agent ${agentId} is not active`)
		}

		const connection = this.connectionManager.getConnection(agentId)
		if (!connection) {
			throw new Error(`No connection found for agent ${agentId}`)
		}

		this.logger.info("Creating new session", { agentId })

		const response = await connection.newSession({})
		const session = this.sessionManager.createSession(agentId, agent.config.name)

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
