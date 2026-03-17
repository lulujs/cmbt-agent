// cmbt-agent_change - new file
import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import { AcpLogger } from "./AcpLogger"

export interface AcpMessage {
	role: "user" | "assistant"
	content: string
	reasoning?: string // cmbt-agent_change: thought/reasoning content from agent
	timestamp: number
	source: "acp-agent"
	agentId: string
	agentName: string
}

export interface AcpSessionUsage {
	used: number
	size: number
}

// cmbt-agent_change start: ACP session mode/model state from newSession response
export interface AcpSessionMode {
	id: string
	name: string
	description?: string
}

export interface AcpSessionModel {
	id: string
	name?: string
}

export interface AcpSessionModes {
	currentModeId: string
	availableModes: AcpSessionMode[]
}

export interface AcpSessionModels {
	currentModelId: string
	availableModels: AcpSessionModel[]
}
// cmbt-agent_change end

export interface AcpSession {
	id: string
	agentId: string
	agentName: string
	messages: AcpMessage[]
	createdAt: number
	updatedAt: number
	status: "active" | "ended"
	/** Streaming assistant message being assembled from chunks, not yet committed */
	pendingAssistantMessage?: string
	/** Streaming thought/reasoning being assembled from chunks, not yet committed */ // cmbt-agent_change
	pendingThoughtMessage?: string // cmbt-agent_change
	/** Latest token usage from the agent */
	usage?: AcpSessionUsage
	// cmbt-agent_change start: mode/model state from newSession response
	modes?: AcpSessionModes
	models?: AcpSessionModels
	// cmbt-agent_change end
}

export interface ISessionManager {
	createSession(
		agentId: string,
		agentName: string,
		sessionId?: string,
		modes?: AcpSessionModes,
		models?: AcpSessionModels,
	): AcpSession // cmbt-agent_change
	getActiveSession(): AcpSession | undefined
	addMessage(sessionId: string, message: AcpMessage): void
	updateSessionState(sessionId: string, update: Partial<AcpSession>): void
	endSession(sessionId: string): Promise<void>
	getSessionHistory(): AcpSession[]
	onSessionUpdated: vscode.Event<AcpSession>
}

export class SessionManager implements ISessionManager {
	private activeSession: AcpSession | undefined
	private readonly _sessionUpdatedEmitter = new vscode.EventEmitter<AcpSession>()
	readonly onSessionUpdated = this._sessionUpdatedEmitter.event

	constructor(
		private context: vscode.ExtensionContext,
		private logger: AcpLogger,
	) {}

	createSession(
		agentId: string,
		agentName: string,
		sessionId?: string,
		modes?: AcpSessionModes,
		models?: AcpSessionModels,
	): AcpSession {
		const session: AcpSession = {
			id: sessionId || uuidv4(),
			agentId,
			agentName,
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			status: "active",
			modes, // cmbt-agent_change
			models, // cmbt-agent_change
		}

		this.activeSession = session
		this.logger.info("Created new ACP session", { sessionId: session.id, agentId })
		this._sessionUpdatedEmitter.fire(session)

		return session
	}

	getActiveSession(): AcpSession | undefined {
		return this.activeSession
	}

	addMessage(sessionId: string, message: AcpMessage): void {
		if (!this.activeSession || this.activeSession.id !== sessionId) {
			this.logger.warn("Attempted to add message to non-active session", { sessionId })
			return
		}

		this.activeSession.messages.push(message)
		this.activeSession.updatedAt = Date.now()
		this.logger.debug("Added message to session", { sessionId, role: message.role })
		this._sessionUpdatedEmitter.fire(this.activeSession)
	}

	updateSessionState(sessionId: string, update: Partial<AcpSession>): void {
		if (!this.activeSession || this.activeSession.id !== sessionId) {
			this.logger.warn("Attempted to update non-active session", { sessionId })
			return
		}

		Object.assign(this.activeSession, update)
		this.activeSession.updatedAt = Date.now()
		this.logger.debug("Updated session state", { sessionId })
		this._sessionUpdatedEmitter.fire(this.activeSession)
	}

	async endSession(sessionId: string): Promise<void> {
		if (!this.activeSession || this.activeSession.id !== sessionId) {
			return
		}

		this.activeSession.status = "ended"
		this.activeSession.updatedAt = Date.now()

		const history = this.getSessionHistory()
		history.push(this.activeSession)

		const maxSessions = 50
		if (history.length > maxSessions) {
			history.splice(0, history.length - maxSessions)
		}

		await this.context.globalState.update("acp.sessionHistory", history)
		this.logger.info("Ended and saved session", { sessionId })

		this.activeSession = undefined
	}

	getSessionHistory(): AcpSession[] {
		return this.context.globalState.get<AcpSession[]>("acp.sessionHistory", [])
	}

	dispose(): void {
		this._sessionUpdatedEmitter.dispose()
	}
}
