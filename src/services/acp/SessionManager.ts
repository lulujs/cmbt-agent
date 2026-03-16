// cmbt-agent_change - new file
import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import { AcpLogger } from "./AcpLogger"

export interface AcpMessage {
	role: "user" | "assistant"
	content: string
	timestamp: number
	source: "acp-agent"
	agentId: string
	agentName: string
}

export interface AcpSession {
	id: string
	agentId: string
	agentName: string
	messages: AcpMessage[]
	createdAt: number
	updatedAt: number
	status: "active" | "ended"
}

export interface ISessionManager {
	createSession(agentId: string, agentName: string, sessionId?: string): AcpSession
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

	createSession(agentId: string, agentName: string, sessionId?: string): AcpSession {
		const session: AcpSession = {
			id: sessionId || uuidv4(),
			agentId,
			agentName,
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			status: "active",
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
