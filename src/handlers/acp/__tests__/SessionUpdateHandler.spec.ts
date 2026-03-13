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
		} as unknown as SessionManager
		handler = new SessionUpdateHandler(sessionManager, logger)
	})

	afterEach(() => {
		logger.dispose()
	})

	describe("handleSessionUpdate", () => {
		it("should forward messages update to SessionManager", () => {
			const messages: AcpMessage[] = [
				{
					role: "user",
					content: "Hello",
					timestamp: Date.now(),
					source: "acp-agent",
					agentId: "test-agent",
					agentName: "Test Agent",
				},
			]

			handler.handleSessionUpdate({
				sessionId: "session-1",
				messages,
			})

			expect(sessionManager.updateSessionState).toHaveBeenCalledWith("session-1", { messages })
		})

		it("should forward status update to SessionManager", () => {
			handler.handleSessionUpdate({
				sessionId: "session-1",
				status: "ended",
			})

			expect(sessionManager.updateSessionState).toHaveBeenCalledWith("session-1", { status: "ended" })
		})

		it("should forward both messages and status to SessionManager", () => {
			const messages: AcpMessage[] = [
				{
					role: "assistant",
					content: "Response",
					timestamp: Date.now(),
					source: "acp-agent",
					agentId: "test-agent",
					agentName: "Test Agent",
				},
			]

			handler.handleSessionUpdate({
				sessionId: "session-1",
				messages,
				status: "active",
			})

			expect(sessionManager.updateSessionState).toHaveBeenCalledWith("session-1", {
				messages,
				status: "active",
			})
		})
	})
})
