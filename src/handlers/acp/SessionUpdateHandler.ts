// cmbt-agent_change - new file
import { AcpLogger } from "../../services/acp/AcpLogger"
import { SessionManager, AcpMessage } from "../../services/acp/SessionManager"

export interface ISessionUpdateHandler {
	handleSessionUpdate(params: { sessionId: string; messages?: AcpMessage[]; status?: string }): void
}

export class SessionUpdateHandler implements ISessionUpdateHandler {
	constructor(
		private sessionManager: SessionManager,
		private logger: AcpLogger,
	) {}

	handleSessionUpdate(params: { sessionId: string; messages?: AcpMessage[]; status?: string }): void {
		this.logger.debug("Handling session update", { sessionId: params.sessionId })

		const update: any = {}

		if (params.messages) {
			update.messages = params.messages
		}

		if (params.status) {
			update.status = params.status
		}

		this.sessionManager.updateSessionState(params.sessionId, update)
		this.logger.debug("Session update forwarded to SessionManager", { sessionId: params.sessionId })
	}
}
