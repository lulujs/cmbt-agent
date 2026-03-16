// cmbt-agent_change - new file
import { SessionUpdateHandler } from "../SessionUpdateHandler"
import { SessionManager, AcpMessage } from "../../../services/acp/SessionManager"
import { AcpLogger, AcpLogLevel } from "../../../services/acp/AcpLogger"

vi.mock("vscode", () => ({
	window: {
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	EventEmitter: vi.fn(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}))

describe("SessionUpdateHandler", () => {
	let handler: SessionUpdateHandler
	let logger: AcpLogger
	let sessionManager: SessionManager

	beforeEach(() => {
		vi.clearAllMocks()
		logger = new AcpLogger(AcpLogLevel.DEBUG)
		sessionManager = {
			updateSessionState: vi.fn(),
			addMessage: vi.fn(),
		} as unknown as SessionManager
		handler = new SessionUpdateHandler(sessionManager, logger)
	})

	afterEach(() => {
		logger.dispose()
	})

	describe("handleSessionUpdate", () => {
		it("should accumulate agent_message_chunk and update pendingAssistantMessage", () => {
			handler.handleSessionUpdate({
				sessionId: "session-1",
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Hello " },
				},
			})

			handler.handleSessionUpdate({
				sessionId: "session-1",
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "world" },
				},
			})

			expect(sessionManager.updateSessionState).toHaveBeenLastCalledWith("session-1", {
				pendingAssistantMessage: "Hello world",
			})
		})

		it("should ignore non-text agent_message_chunk content", () => {
			handler.handleSessionUpdate({
				sessionId: "session-1",
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "image", data: "base64data", mimeType: "image/png" },
				},
			})

			expect(sessionManager.updateSessionState).not.toHaveBeenCalled()
		})

		it("should update usage on usage_update", () => {
			handler.handleSessionUpdate({
				sessionId: "session-1",
				update: {
					sessionUpdate: "usage_update",
					used: 1500,
					size: 8000,
				},
			})

			expect(sessionManager.updateSessionState).toHaveBeenCalledWith("session-1", {
				usage: { used: 1500, size: 8000 },
			})
		})

		it("should not call sessionManager for agent_thought_chunk", () => {
			handler.handleSessionUpdate({
				sessionId: "session-1",
				update: {
					sessionUpdate: "agent_thought_chunk",
					content: { type: "text", text: "thinking..." },
				},
			})

			expect(sessionManager.updateSessionState).not.toHaveBeenCalled()
		})
	})

	describe("flushPendingMessage", () => {
		it("should commit accumulated chunks as an assistant message", () => {
			handler.handleSessionUpdate({
				sessionId: "session-1",
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Final answer" },
				},
			})

			handler.flushPendingMessage("session-1", "agent-id", "Agent Name")

			expect(sessionManager.addMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining<Partial<AcpMessage>>({
					role: "assistant",
					content: "Final answer",
					agentId: "agent-id",
					agentName: "Agent Name",
				}),
			)
			// pendingAssistantMessage should be cleared
			expect(sessionManager.updateSessionState).toHaveBeenLastCalledWith("session-1", {
				pendingAssistantMessage: undefined,
			})
		})

		it("should do nothing if there are no pending chunks", () => {
			handler.flushPendingMessage("session-1", "agent-id", "Agent Name")

			expect(sessionManager.addMessage).not.toHaveBeenCalled()
		})

		it("should not mix chunks from different sessions", () => {
			handler.handleSessionUpdate({
				sessionId: "session-1",
				update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "A" } },
			})
			handler.handleSessionUpdate({
				sessionId: "session-2",
				update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "B" } },
			})

			handler.flushPendingMessage("session-1", "agent-id", "Agent")

			expect(sessionManager.addMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({ content: "A" }),
			)

			handler.flushPendingMessage("session-2", "agent-id", "Agent")

			expect(sessionManager.addMessage).toHaveBeenCalledWith(
				"session-2",
				expect.objectContaining({ content: "B" }),
			)
		})
	})
})
