// cmbt-agent_change - new file
import type { SessionNotification } from "@agentclientprotocol/sdk"
import { AcpLogger } from "../../services/acp/AcpLogger"
import { SessionManager, AcpMessage } from "../../services/acp/SessionManager"

export interface ISessionUpdateHandler {
	handleSessionUpdate(params: SessionNotification): void
}

export class SessionUpdateHandler implements ISessionUpdateHandler {
	// Accumulate streaming chunks per session before committing as a message
	private pendingChunks = new Map<string, string>()

	constructor(
		private sessionManager: SessionManager,
		private logger: AcpLogger,
	) {}

	handleSessionUpdate(params: SessionNotification): void {
		const { sessionId, update } = params
		this.logger.debug("Handling session update", { sessionId, updateType: update.sessionUpdate })

		switch (update.sessionUpdate) {
			// cmbt-agent_change start: handle user_message_chunk replayed during loadSession
			case "user_message_chunk": {
				const text = update.content?.type === "text" ? update.content.text : ""
				if (text) {
					const session = this.sessionManager.getActiveSession()
					if (session && session.id === sessionId) {
						const userMessage: AcpMessage = {
							role: "user",
							content: text,
							timestamp: Date.now(),
							source: "acp-agent",
							agentId: session.agentId,
							agentName: session.agentName,
						}
						this.sessionManager.addMessage(sessionId, userMessage)
					}
				}
				break
			}
			// cmbt-agent_change end

			case "agent_message_chunk": {
				const text = update.content.type === "text" ? update.content.text : ""
				if (text) {
					const existing = this.pendingChunks.get(sessionId) ?? ""
					this.pendingChunks.set(sessionId, existing + text)
					// Fire a partial update so the UI can stream the text
					this.sessionManager.updateSessionState(sessionId, {
						pendingAssistantMessage: this.pendingChunks.get(sessionId),
					})
				}
				break
			}

			case "agent_thought_chunk": {
				// cmbt-agent_change start: accumulate thought chunks for UI display
				const text = update.content.type === "text" ? update.content.text : ""
				if (text) {
					const existing = this.pendingChunks.get(`thought:${sessionId}`) ?? ""
					this.pendingChunks.set(`thought:${sessionId}`, existing + text)
					this.sessionManager.updateSessionState(sessionId, {
						pendingThoughtMessage: this.pendingChunks.get(`thought:${sessionId}`),
					})
				}
				this.logger.debug("Agent thought chunk", { sessionId, length: text.length })
				// cmbt-agent_change end
				break
			}

			case "usage_update": {
				this.logger.debug("Usage update", {
					sessionId,
					used: update.used,
					size: update.size,
					cost: update.cost,
				})
				this.sessionManager.updateSessionState(sessionId, {
					usage: { used: update.used, size: update.size },
				})
				break
			}

			case "tool_call": {
				this.logger.debug("Tool call", { sessionId, toolName: (update as any).name })
				break
			}

			case "tool_call_update": {
				this.logger.debug("Tool call update", { sessionId })
				break
			}

			default: {
				this.logger.debug("Unhandled session update type", {
					sessionId,
					updateType: (update as any).sessionUpdate,
				})
			}
		}
	}

	/**
	 * Called when a prompt turn completes (stopReason received).
	 * Flushes any accumulated chunks as a committed assistant message.
	 */
	flushPendingMessage(sessionId: string, agentId: string, agentName: string): void {
		const content = this.pendingChunks.get(sessionId)
		if (!content) {
			return
		}

		// cmbt-agent_change start: capture thought content before clearing buffers
		const reasoning = this.pendingChunks.get(`thought:${sessionId}`) || undefined
		// cmbt-agent_change end

		this.pendingChunks.delete(sessionId)
		this.pendingChunks.delete(`thought:${sessionId}`) // cmbt-agent_change: clear thought buffer too

		const message: AcpMessage = {
			role: "assistant",
			content,
			reasoning, // cmbt-agent_change: persist thought content in committed message
			timestamp: Date.now(),
			source: "acp-agent",
			agentId,
			agentName,
		}

		this.sessionManager.addMessage(sessionId, message)
		// Clear the pending streaming state
		this.sessionManager.updateSessionState(sessionId, {
			pendingAssistantMessage: undefined,
			pendingThoughtMessage: undefined, // cmbt-agent_change
		})
		this.logger.info("Flushed assistant message", { sessionId, length: content.length })
	}
}
