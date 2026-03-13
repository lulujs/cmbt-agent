import { AcpClientImpl } from "../AcpClientImpl"
import { AgentManager, AgentProcess } from "../AgentManager"
import { ConnectionManager } from "../ConnectionManager"
import { SessionManager, AcpSession } from "../SessionManager"
import { FileSystemHandler } from "../../../handlers/acp/FileSystemHandler"
import { TerminalHandler } from "../../../handlers/acp/TerminalHandler"
import { PermissionHandler } from "../../../handlers/acp/PermissionHandler"
import { SessionUpdateHandler } from "../../../handlers/acp/SessionUpdateHandler"
import { AcpLogger, AcpLogLevel } from "../AcpLogger"
import { ClientSideConnection } from "@agentclientprotocol/sdk"

describe("AcpClientImpl", () => {
	let client: AcpClientImpl
	let mockAgentManager: AgentManager
	let mockConnectionManager: ConnectionManager
	let mockSessionManager: SessionManager
	let mockFileSystemHandler: FileSystemHandler
	let mockTerminalHandler: TerminalHandler
	let mockPermissionHandler: PermissionHandler
	let mockSessionUpdateHandler: SessionUpdateHandler
	let logger: AcpLogger

	beforeEach(() => {
		vi.clearAllMocks()
		logger = new AcpLogger(AcpLogLevel.ERROR)

		mockAgentManager = {
			getActiveAgent: vi.fn(),
		} as unknown as AgentManager

		mockConnectionManager = {
			getConnection: vi.fn(),
		} as unknown as ConnectionManager

		mockSessionManager = {
			getActiveSession: vi.fn(),
			createSession: vi.fn(),
			addMessage: vi.fn(),
			endSession: vi.fn(),
		} as unknown as SessionManager

		mockFileSystemHandler = {} as FileSystemHandler
		mockTerminalHandler = {} as TerminalHandler
		mockPermissionHandler = {} as PermissionHandler
		mockSessionUpdateHandler = {} as SessionUpdateHandler

		client = new AcpClientImpl(
			mockAgentManager,
			mockConnectionManager,
			mockSessionManager,
			mockFileSystemHandler,
			mockTerminalHandler,
			mockPermissionHandler,
			mockSessionUpdateHandler,
			logger,
		)
	})

	describe("sendMessage", () => {
		it("should send message to ACP agent", async () => {
			const mockSession: AcpSession = {
				id: "session-1",
				agentId: "agent-1",
				agentName: "Test Agent",
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "active",
			}

			const mockConnection = {
				prompt: vi.fn().mockResolvedValue({}),
			} as unknown as ClientSideConnection

			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession)
			vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection)

			await client.sendMessage("session-1", "Hello")

			expect(mockSessionManager.addMessage).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({
					role: "user",
					content: "Hello",
					source: "acp-agent",
				}),
			)
			expect(mockConnection.prompt).toHaveBeenCalledWith({
				sessionId: "session-1",
				messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
			})
		})

		it("should throw error if session not found", async () => {
			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(undefined)

			await expect(client.sendMessage("session-1", "Hello")).rejects.toThrow(
				"Session session-1 not found or not active",
			)
		})

		it("should throw error if connection not found", async () => {
			const mockSession: AcpSession = {
				id: "session-1",
				agentId: "agent-1",
				agentName: "Test Agent",
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "active",
			}

			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession)
			vi.mocked(mockConnectionManager.getConnection).mockReturnValue(undefined)

			await expect(client.sendMessage("session-1", "Hello")).rejects.toThrow(
				"No connection found for agent agent-1",
			)
		})
	})

	describe("createSession", () => {
		it("should create a new session", async () => {
			const mockAgent: AgentProcess = {
				config: { id: "agent-1", name: "Test Agent", command: "test", args: [] },
				process: {} as any,
				status: "running",
			}

			const mockConnection = {
				newSession: vi.fn().mockResolvedValue({ sessionId: "new-session" }),
			} as unknown as ClientSideConnection

			const mockSession: AcpSession = {
				id: "session-1",
				agentId: "agent-1",
				agentName: "Test Agent",
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "active",
			}

			vi.mocked(mockAgentManager.getActiveAgent).mockReturnValue(mockAgent)
			vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection)
			vi.mocked(mockSessionManager.createSession).mockReturnValue(mockSession)

			const sessionId = await client.createSession("agent-1")

			expect(sessionId).toBe("session-1")
			expect(mockConnection.newSession).toHaveBeenCalledWith({})
			expect(mockSessionManager.createSession).toHaveBeenCalledWith("agent-1", "Test Agent")
		})

		it("should throw error if agent not active", async () => {
			vi.mocked(mockAgentManager.getActiveAgent).mockReturnValue(undefined)

			await expect(client.createSession("agent-1")).rejects.toThrow("Agent agent-1 is not active")
		})
	})

	describe("endSession", () => {
		it("should end session", async () => {
			await client.endSession("session-1")

			expect(mockSessionManager.endSession).toHaveBeenCalledWith("session-1")
		})
	})

	describe("getCurrentSessionId", () => {
		it("should return current session ID", () => {
			const mockSession: AcpSession = {
				id: "session-1",
				agentId: "agent-1",
				agentName: "Test Agent",
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "active",
			}

			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession)

			expect(client.getCurrentSessionId()).toBe("session-1")
		})

		it("should return undefined if no active session", () => {
			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(undefined)

			expect(client.getCurrentSessionId()).toBeUndefined()
		})
	})

	describe("createClientHandlers", () => {
		it("should return a client handler factory", () => {
			const factory = client.createClientHandlers()

			expect(factory).toBeInstanceOf(Function)
		})
	})
})
