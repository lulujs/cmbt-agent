// cmbt-agent_change - new file
import type {
	Client,
	Agent,
	RequestPermissionRequest,
	RequestPermissionResponse,
	SessionNotification,
	CreateTerminalRequest,
	CreateTerminalResponse,
	TerminalOutputRequest,
	TerminalOutputResponse,
	WaitForTerminalExitRequest,
	WaitForTerminalExitResponse,
	KillTerminalCommandRequest,
	KillTerminalCommandResponse,
	ReleaseTerminalRequest,
	ReleaseTerminalResponse,
	WriteTextFileRequest,
	WriteTextFileResponse,
	ReadTextFileRequest,
	ReadTextFileResponse,
	NewSessionRequest,
} from "@agentclientprotocol/sdk"
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
import type { AcpSessionModes, AcpSessionModels } from "./SessionManager"
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
		this.logger.debug("Connection found for agent", { agentId: session.agentId })
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

		// Flush accumulated streaming chunks as a committed assistant message
		this.sessionUpdateHandler.flushPendingMessage(sessionId, session.agentId, session.agentName)
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
		const sessionOptions: NewSessionRequest = {
			cwd,
			mcpServers: [],
		}
		if (providerContext) {
			sessionOptions._meta = {
				providerContext: {
					apiProvider: providerContext.apiProvider,
					apiModelId: providerContext.apiModelId,
					mode: providerContext.mode,
				},
			}
			this.logger.debug("Session options with provider context", {
				sessionOptions: JSON.stringify(sessionOptions),
			})
		}
		this.logger.debug("Calling connection.newSession")
		const response = await connection.newSession(sessionOptions)
		this.logger.debug("newSession response received", { sessionId: response.sessionId })
		// cmbt-agent_change start: log full raw response to inspect actual field names
		this.logger.info("newSession raw response", { response: JSON.stringify(response) })
		// cmbt-agent_change end

		// cmbt-agent_change start: parse modes and models from newSession response
		const modes = this.parseModes((response as any).modes)
		const models = this.parseModels((response as any).models)
		this.logger.info("newSession modes/models parsed", { modes, models })
		// cmbt-agent_change end

		// cmbt-agent_change end
		const session = this.sessionManager.createSession(agentId, agent.config.name, response.sessionId, modes, models) // cmbt-agent_change

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
			requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
				const decision = await this.permissionHandler.handlePermissionRequest({
					operation: (params as any).operation,
					resource: (params as any).resource || "",
					description: (params as any).description || "",
				})
				if (!decision.allowed) {
					// Find a reject option, or fall back to cancelled
					const rejectOption = params.options.find(
						(o) => o.kind === "reject_once" || o.kind === "reject_always",
					)
					if (rejectOption) {
						return { outcome: { outcome: "selected", optionId: rejectOption.optionId } }
					}
					return { outcome: { outcome: "cancelled" } }
				}
				// Find an allow option
				const allowOption = decision.remember
					? (params.options.find((o) => o.kind === "allow_always") ??
						params.options.find((o) => o.kind === "allow_once"))
					: (params.options.find((o) => o.kind === "allow_once") ??
						params.options.find((o) => o.kind === "allow_always"))
				if (allowOption) {
					return { outcome: { outcome: "selected", optionId: allowOption.optionId } }
				}
				return { outcome: { outcome: "cancelled" } }
			},
			sessionUpdate: async (params: SessionNotification): Promise<void> => {
				this.logger.info("Received sessionUpdate notification", {
					sessionId: params.sessionId,
					updateType: params.update.sessionUpdate,
				})
				this.logger.info("你是谁===1231", params)
				this.sessionUpdateHandler.handleSessionUpdate(params)
			},
			readTextFile: async (params: ReadTextFileRequest): Promise<ReadTextFileResponse> => {
				const result = await this.fileSystemHandler.handleReadFile({ path: params.path })
				return { content: result.content }
			},
			writeTextFile: async (params: WriteTextFileRequest): Promise<WriteTextFileResponse> => {
				await this.fileSystemHandler.handleWriteFile({ path: params.path, content: params.content })
				return {}
			},
			createTerminal: async (params: CreateTerminalRequest): Promise<CreateTerminalResponse> => {
				const result = await this.terminalHandler.handleCreateTerminal({
					name: (params as any).name,
					cwd: (params as any).cwd ?? undefined,
				})
				return { terminalId: result.terminalId }
			},
			terminalOutput: async (params: TerminalOutputRequest): Promise<TerminalOutputResponse> => {
				const result = await this.terminalHandler.handleGetOutput({ terminalId: params.terminalId })
				return { output: result.output, truncated: false }
			},
			waitForTerminalExit: async (params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> => {
				const result = await this.terminalHandler.handleWaitForExit({ terminalId: params.terminalId })
				return { exitCode: result.exitCode }
			},
			killTerminal: async (params: KillTerminalCommandRequest): Promise<KillTerminalCommandResponse> => {
				await this.terminalHandler.handleKillTerminal({ terminalId: params.terminalId })
				return {}
			},
			releaseTerminal: async (params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> => {
				await this.terminalHandler.handleDisposeTerminal({ terminalId: params.terminalId })
				return {}
			},
		})
	}

	getCurrentSessionId(): string | undefined {
		const session = this.sessionManager.getActiveSession()
		return session?.id
	}

	// cmbt-agent_change start: parse modes/models from newSession response
	private parseModes(raw: any): AcpSessionModes | undefined {
		if (!raw || typeof raw !== "object") return undefined
		const currentModeId = typeof raw.currentModeId === "string" ? raw.currentModeId : undefined
		if (!currentModeId) return undefined
		const availableModes = Array.isArray(raw.availableModes)
			? raw.availableModes
					.filter((m: any) => m && typeof m.id === "string")
					.map((m: any) => ({
						id: m.id,
						name: typeof m.name === "string" ? m.name : m.id,
						description: m.description,
					}))
			: []
		return { currentModeId, availableModes }
	}

	private parseModels(raw: any): AcpSessionModels | undefined {
		if (!raw || typeof raw !== "object") return undefined
		const currentModelId = typeof raw.currentModelId === "string" ? raw.currentModelId : undefined
		if (!currentModelId) return undefined
		const availableModels = Array.isArray(raw.availableModels)
			? raw.availableModels
					.filter((m: any) => m && (typeof m.id === "string" || typeof m.modelId === "string"))
					.map((m: any) => ({ id: m.id ?? m.modelId, name: typeof m.name === "string" ? m.name : undefined }))
			: []
		return { currentModelId, availableModels }
	}
	// cmbt-agent_change end
}
