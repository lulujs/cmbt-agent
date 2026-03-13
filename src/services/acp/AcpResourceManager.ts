// cmbt-agent_change - new file
import * as vscode from "vscode"
import { IAgentManager } from "./AgentManager"
import { IConnectionManager } from "./ConnectionManager"
import { ISessionManager } from "./SessionManager"

export interface IAcpResourceManager extends vscode.Disposable {
	register(disposable: vscode.Disposable): void
}

export class AcpResourceManager implements IAcpResourceManager {
	private disposables: vscode.Disposable[] = []

	constructor(
		private sessionManager?: ISessionManager,
		private connectionManager?: IConnectionManager,
		private agentManager?: IAgentManager,
	) {}

	register(disposable: vscode.Disposable): void {
		this.disposables.push(disposable)
	}

	async dispose(): Promise<void> {
		// Clean up in order: sessions → connections → processes → other resources
		if (this.sessionManager) {
			const activeSession = this.sessionManager.getActiveSession()
			if (activeSession) {
				await this.sessionManager.endSession(activeSession.id)
			}
		}

		if (this.connectionManager) {
			this.connectionManager.dispose()
		}

		if (this.agentManager) {
			await this.agentManager.disposeAll()
		}

		for (const disposable of this.disposables) {
			disposable.dispose()
		}
		this.disposables = []
	}
}
