import { SessionManager, AcpMessage, AcpSession } from "../SessionManager"
import { AcpLogger, AcpLogLevel } from "../AcpLogger"
import * as vscode from "vscode"

vi.mock("uuid", () => ({
	v4: vi.fn().mockReturnValue("test-uuid-1234"),
}))

describe("SessionManager", () => {
	let manager: SessionManager
	let logger: AcpLogger
	let mockContext: vscode.ExtensionContext
	let globalStateStore: Record<string, unknown>

	beforeEach(() => {
		vi.clearAllMocks()
		logger = new AcpLogger(AcpLogLevel.ERROR)
		globalStateStore = {}

		mockContext = {
			globalState: {
				get: vi.fn((key: string, defaultValue?: unknown) => globalStateStore[key] ?? defaultValue),
				update: vi.fn(async (key: string, value: unknown) => {
					globalStateStore[key] = value
				}),
			},
		} as unknown as vscode.ExtensionContext

		manager = new SessionManager(mockContext, logger)
	})

	afterEach(() => {
		manager.dispose()
	})

	describe("createSession", () => {
		it("should create a new session with unique ID", () => {
			const session = manager.createSession("agent-1", "Test Agent")

			expect(session.id).toBe("test-uuid-1234")
			expect(session.agentId).toBe("agent-1")
			expect(session.agentName).toBe("Test Agent")
			expect(session.messages).toEqual([])
			expect(session.status).toBe("active")
			expect(session.createdAt).toBeGreaterThan(0)
		})

		it("should set the session as active", () => {
			const session = manager.createSession("agent-1", "Test Agent")
			expect(manager.getActiveSession()).toBe(session)
		})
	})

	describe("getActiveSession", () => {
		it("should return undefined when no active session", () => {
			expect(manager.getActiveSession()).toBeUndefined()
		})

		it("should return the active session", () => {
			const session = manager.createSession("agent-1", "Test Agent")
			expect(manager.getActiveSession()).toBe(session)
		})
	})

	describe("addMessage", () => {
		it("should add message to active session", () => {
			const session = manager.createSession("agent-1", "Test Agent")
			const message: AcpMessage = {
				role: "user",
				content: "Hello",
				timestamp: Date.now(),
				source: "acp-agent",
				agentId: "agent-1",
				agentName: "Test Agent",
			}

			manager.addMessage(session.id, message)

			expect(manager.getActiveSession()?.messages).toHaveLength(1)
			expect(manager.getActiveSession()?.messages[0]).toEqual(message)
		})

		it("should not add message to non-active session", () => {
			manager.createSession("agent-1", "Test Agent")
			const message: AcpMessage = {
				role: "user",
				content: "Hello",
				timestamp: Date.now(),
				source: "acp-agent",
				agentId: "agent-1",
				agentName: "Test Agent",
			}

			manager.addMessage("wrong-session-id", message)

			expect(manager.getActiveSession()?.messages).toHaveLength(0)
		})

		it("should update session updatedAt timestamp", () => {
			const session = manager.createSession("agent-1", "Test Agent")
			const originalUpdatedAt = session.updatedAt

			const message: AcpMessage = {
				role: "assistant",
				content: "Hi there",
				timestamp: Date.now(),
				source: "acp-agent",
				agentId: "agent-1",
				agentName: "Test Agent",
			}

			manager.addMessage(session.id, message)

			expect(manager.getActiveSession()?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt)
		})
	})

	describe("updateSessionState", () => {
		it("should update session state", () => {
			const session = manager.createSession("agent-1", "Test Agent")

			manager.updateSessionState(session.id, { agentName: "Updated Agent" })

			expect(manager.getActiveSession()?.agentName).toBe("Updated Agent")
		})

		it("should not update non-active session", () => {
			manager.createSession("agent-1", "Test Agent")

			manager.updateSessionState("wrong-id", { agentName: "Updated" })

			expect(manager.getActiveSession()?.agentName).toBe("Test Agent")
		})
	})

	describe("endSession", () => {
		it("should end session and save to globalState", async () => {
			const session = manager.createSession("agent-1", "Test Agent")

			await manager.endSession(session.id)

			expect(manager.getActiveSession()).toBeUndefined()
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"acp.sessionHistory",
				expect.arrayContaining([expect.objectContaining({ id: session.id, status: "ended" })]),
			)
		})

		it("should do nothing for non-active session", async () => {
			manager.createSession("agent-1", "Test Agent")

			await manager.endSession("wrong-id")

			expect(manager.getActiveSession()).toBeDefined()
			expect(mockContext.globalState.update).not.toHaveBeenCalled()
		})

		it("should limit history to 50 sessions", async () => {
			const existingHistory = Array.from({ length: 50 }, (_, i) => ({
				id: `old-session-${i}`,
				agentId: "agent-1",
				agentName: "Test",
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "ended" as const,
			}))
			globalStateStore["acp.sessionHistory"] = existingHistory

			const session = manager.createSession("agent-1", "Test Agent")
			await manager.endSession(session.id)

			const savedHistory = globalStateStore["acp.sessionHistory"] as AcpSession[]
			expect(savedHistory).toHaveLength(50)
			expect(savedHistory[savedHistory.length - 1].id).toBe(session.id)
		})
	})

	describe("getSessionHistory", () => {
		it("should return empty array when no history", () => {
			expect(manager.getSessionHistory()).toEqual([])
		})

		it("should return saved session history", () => {
			const history = [{ id: "old-session", status: "ended" }]
			globalStateStore["acp.sessionHistory"] = history

			expect(manager.getSessionHistory()).toEqual(history)
		})
	})
})
