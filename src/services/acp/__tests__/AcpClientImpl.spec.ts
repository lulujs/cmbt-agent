import { AcpClientImpl } from "../AcpClientImpl"
import { AgentManager, AgentProcess } from "../AgentManager"
import { ConnectionManager } from "../ConnectionManager"
import { SessionManager, AcpSession } from "../SessionManager"
import { FileSystemHandler } from "../../../handlers/acp/FileSystemHandler"
import { TerminalHandler } from "../../../handlers/acp/TerminalHandler"
import { PermissionHandler } from "../../../handlers/acp/PermissionHandler"
import { SessionUpdateHandler } from "../../../handlers/acp/SessionUpdateHandler"
import { AcpLogger, AcpLogLevel } from "../AcpLogger"
import type { ClientSideConnection } from "@agentclientprotocol/sdk"

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
			getWorkspaceRoot: vi.fn().mockReturnValue("/test/workspace"), // cmbt-agent_change
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
		mockSessionUpdateHandler = {
			flushPendingMessage: vi.fn(), // cmbt-agent_change: 添加 flushPendingMessage mock
		} as unknown as SessionUpdateHandler

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
				prompt: [{ type: "text", text: "Hello" }], // cmbt-agent_change - Updated to match actual implementation
			})
		})

		// cmbt-agent_change start - Task 7.3: Test response logging
		it("should log prompt response with stopReason", async () => {
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
				prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
			} as unknown as ClientSideConnection

			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession)
			vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection)

			const loggerSpy = vi.spyOn(logger, "info")

			await client.sendMessage("session-1", "Hello")

			expect(loggerSpy).toHaveBeenCalledWith(
				"Prompt response received",
				expect.objectContaining({
					sessionId: "session-1",
					stopReason: "end_turn",
				}),
			)
		})

		// Task 7.4: Test response logging includes correct sessionId and stopReason
		it("should log response with correct sessionId and stopReason for different stop reasons", async () => {
			// Test with max_tokens stopReason
			const mockSession1: AcpSession = {
				id: "session-2",
				agentId: "agent-1",
				agentName: "Test Agent",
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "active",
			}

			const mockConnection1 = {
				prompt: vi.fn().mockResolvedValue({ stopReason: "max_tokens" }),
			} as unknown as ClientSideConnection

			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession1)
			vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection1)

			const loggerSpy = vi.spyOn(logger, "info")

			await client.sendMessage("session-2", "Test message")

			expect(loggerSpy).toHaveBeenCalledWith("Prompt response received", {
				sessionId: "session-2",
				stopReason: "max_tokens",
			})

			// Test with stop_sequence stopReason
			vi.clearAllMocks()
			const mockSession2: AcpSession = {
				id: "session-3",
				agentId: "agent-1",
				agentName: "Test Agent",
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "active",
			}

			const mockConnection2 = {
				prompt: vi.fn().mockResolvedValue({ stopReason: "stop_sequence" }),
			} as unknown as ClientSideConnection

			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession2)
			vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection2)

			const loggerSpy2 = vi.spyOn(logger, "info")

			await client.sendMessage("session-3", "Another message")

			expect(loggerSpy2).toHaveBeenCalledWith("Prompt response received", {
				sessionId: "session-3",
				stopReason: "stop_sequence",
			})

			// Test with tool_use stopReason
			vi.clearAllMocks()
			const mockSession3: AcpSession = {
				id: "session-4",
				agentId: "agent-1",
				agentName: "Test Agent",
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "active",
			}

			const mockConnection3 = {
				prompt: vi.fn().mockResolvedValue({ stopReason: "tool_use" }),
			} as unknown as ClientSideConnection

			vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession3)
			vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection3)

			const loggerSpy3 = vi.spyOn(logger, "info")

			await client.sendMessage("session-4", "Tool use message")

			expect(loggerSpy3).toHaveBeenCalledWith("Prompt response received", {
				sessionId: "session-4",
				stopReason: "tool_use",
			})
		})
		// cmbt-agent_change end

		// cmbt-agent_change start - Task 9.1: P6 Property-based test for response logging completeness
		/**
		 * **Validates: Requirements 2.8**
		 *
		 * P6: Response Logging Completeness - Every successful `connection.prompt()` call
		 * must result in a log entry containing the sessionId and stopReason from the response.
		 *
		 * This property-based test verifies that for ANY valid prompt call with ANY stopReason,
		 * the response is logged with both sessionId and stopReason.
		 */
		describe("P6: Response Logging Completeness Property", () => {
			// Test data: various stopReason values that can be returned by ACP agents
			const stopReasons = [
				"end_turn",
				"max_tokens",
				"stop_sequence",
				"tool_use",
				"content_filter",
				"timeout",
				"error",
				"user_cancelled",
				undefined, // Edge case: missing stopReason
			]

			// Test data: various session IDs
			const sessionIds = [
				"session-1",
				"session-abc-123",
				"test-session-with-long-id-12345678",
				"s", // Edge case: single character
				"session-with-special-chars-!@#",
			]

			// Test data: various message contents
			const messages = [
				"Hello",
				"Test message with multiple words",
				"", // Edge case: empty message
				"Message with special chars: !@#$%^&*()",
				"Very long message ".repeat(100), // Edge case: long message
			]

			it.each(
				// Generate all combinations of test cases
				stopReasons.flatMap((stopReason) =>
					sessionIds.flatMap((sessionId) =>
						messages.map((message) => ({
							stopReason,
							sessionId,
							message,
						})),
					),
				),
			)(
				"should log stopReason for sessionId=$sessionId, stopReason=$stopReason, messageLength=$message.length",
				async ({ stopReason, sessionId, message }) => {
					const mockSession: AcpSession = {
						id: sessionId,
						agentId: "agent-1",
						agentName: "Test Agent",
						messages: [],
						createdAt: Date.now(),
						updatedAt: Date.now(),
						status: "active",
					}

					const mockConnection = {
						prompt: vi.fn().mockResolvedValue({ stopReason }),
					} as unknown as ClientSideConnection

					vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession)
					vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection)

					const loggerSpy = vi.spyOn(logger, "info")

					await client.sendMessage(sessionId, message)

					// Verify that logger.info was called with the correct structure
					expect(loggerSpy).toHaveBeenCalledWith(
						"Prompt response received",
						expect.objectContaining({
							sessionId,
							stopReason,
						}),
					)

					// Verify the exact call structure
					const logCalls = loggerSpy.mock.calls.filter((call) => call[0] === "Prompt response received")
					expect(logCalls.length).toBeGreaterThan(0)

					const responseLogCall = logCalls[0]
					expect(responseLogCall[1]).toEqual({
						sessionId,
						stopReason,
					})
				},
			)

			it("should log response even when prompt returns additional fields", async () => {
				const mockSession: AcpSession = {
					id: "session-extra-fields",
					agentId: "agent-1",
					agentName: "Test Agent",
					messages: [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
					status: "active",
				}

				// Response with additional fields beyond stopReason
				const mockConnection = {
					prompt: vi.fn().mockResolvedValue({
						stopReason: "end_turn",
						usage: { inputTokens: 100, outputTokens: 50 },
						metadata: { model: "claude-3", version: "1.0" },
					}),
				} as unknown as ClientSideConnection

				vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession)
				vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection)

				const loggerSpy = vi.spyOn(logger, "info")

				await client.sendMessage("session-extra-fields", "Test")

				// Should still log sessionId and stopReason regardless of extra fields
				expect(loggerSpy).toHaveBeenCalledWith(
					"Prompt response received",
					expect.objectContaining({
						sessionId: "session-extra-fields",
						stopReason: "end_turn",
					}),
				)
			})

			it("should log response for concurrent prompt calls with different sessions", async () => {
				const sessions = [
					{ id: "concurrent-1", agentId: "agent-1", stopReason: "end_turn" },
					{ id: "concurrent-2", agentId: "agent-1", stopReason: "max_tokens" },
					{ id: "concurrent-3", agentId: "agent-1", stopReason: "tool_use" },
				]

				const loggerSpy = vi.spyOn(logger, "info")

				// Simulate concurrent calls
				await Promise.all(
					sessions.map(async ({ id, agentId, stopReason }) => {
						const mockSession: AcpSession = {
							id,
							agentId,
							agentName: "Test Agent",
							messages: [],
							createdAt: Date.now(),
							updatedAt: Date.now(),
							status: "active",
						}

						const mockConnection = {
							prompt: vi.fn().mockResolvedValue({ stopReason }),
						} as unknown as ClientSideConnection

						vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(mockSession)
						vi.mocked(mockConnectionManager.getConnection).mockReturnValue(mockConnection)

						await client.sendMessage(id, "Concurrent test")
					}),
				)

				// Verify all sessions were logged
				sessions.forEach(({ id, stopReason }) => {
					expect(loggerSpy).toHaveBeenCalledWith(
						"Prompt response received",
						expect.objectContaining({
							sessionId: id,
							stopReason,
						}),
					)
				})
			})
		})
		// cmbt-agent_change end

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
			expect(mockConnection.newSession).toHaveBeenCalledWith({
				// cmbt-agent_change - Updated to match actual implementation
				cwd: "/test/workspace",
				mcpServers: [],
			})
			expect(mockSessionManager.createSession).toHaveBeenCalledWith(
				"agent-1",
				"Test Agent",
				"new-session",
				undefined,
				undefined,
			) // cmbt-agent_change
		})

		it("should throw error if agent not active", async () => {
			vi.mocked(mockAgentManager.getActiveAgent).mockReturnValue(undefined)

			await expect(client.createSession("agent-1")).rejects.toThrow("Agent agent-1 is not active")
		})

		it("should pass providerContext as metadata when provided", async () => {
			const mockAgent: AgentProcess = {
				config: { id: "agent-1", name: "Test Agent", command: "test", args: [] },
				process: {} as any,
				status: "running",
			}

			const mockConnection = {
				newSession: vi.fn().mockResolvedValue({ sessionId: "new-session" }),
			} as unknown as ClientSideConnection

			const mockSession: AcpSession = {
				id: "session-2",
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

			const providerContext = {
				apiProvider: "anthropic",
				apiModelId: "claude-3-opus",
				mode: "code",
				systemPrompt: "You are a helpful assistant", // cmbt-agent_change: 添加 systemPrompt 测试
			}

			const sessionId = await client.createSession("agent-1", providerContext)

			expect(sessionId).toBe("session-2")
			expect(mockConnection.newSession).toHaveBeenCalledWith({
				cwd: "/test/workspace",
				mcpServers: [],
				_meta: {
					providerContext: {
						apiProvider: "anthropic",
						apiModelId: "claude-3-opus",
						mode: "code",
						systemPrompt: "You are a helpful assistant", // cmbt-agent_change: 验证 systemPrompt 传递
					},
				},
			})
		})

		it("should call newSession without metadata when providerContext is undefined", async () => {
			const mockAgent: AgentProcess = {
				config: { id: "agent-1", name: "Test Agent", command: "test", args: [] },
				process: {} as any,
				status: "running",
			}

			const mockConnection = {
				newSession: vi.fn().mockResolvedValue({ sessionId: "new-session" }),
			} as unknown as ClientSideConnection

			const mockSession: AcpSession = {
				id: "session-3",
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

			await client.createSession("agent-1")

			expect(mockConnection.newSession).toHaveBeenCalledWith({
				// cmbt-agent_change - Updated to match actual implementation
				cwd: "/test/workspace",
				mcpServers: [],
			})
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
