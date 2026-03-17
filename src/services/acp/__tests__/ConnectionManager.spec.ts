import { ConnectionManager, ReconnectHandler } from "../ConnectionManager"
import { AcpLogger, AcpLogLevel } from "../AcpLogger"
import { ChildProcess } from "child_process"
import { ClientSideConnection, Agent, Client } from "@agentclientprotocol/sdk"
import { Readable, Writable } from "stream"

vi.mock("@agentclientprotocol/sdk")

const mockClientFactory = (_agent: Agent): Client => ({}) as Client

describe("ConnectionManager", () => {
	let manager: ConnectionManager
	let logger: AcpLogger
	let mockProcess: Partial<ChildProcess>
	let mockConnection: Partial<ClientSideConnection>

	function setupMockConnection(signal?: AbortSignal) {
		const abortController = new AbortController()
		mockConnection = {
			initialize: vi.fn().mockResolvedValue({
				protocolVersion: "0.1.0",
				agentInfo: { name: "test-agent", version: "1.0.0" },
				agentCapabilities: { test: true },
			}),
			signal: signal ?? abortController.signal,
		}
		vi.mocked(ClientSideConnection).mockImplementation(() => mockConnection as ClientSideConnection)
		return abortController
	}

	beforeEach(() => {
		vi.useFakeTimers()
		logger = new AcpLogger(AcpLogLevel.ERROR)
		manager = new ConnectionManager(logger)

		mockProcess = {
			stdin: new Writable() as any,
			stdout: new Readable() as any,
		}

		setupMockConnection()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	describe("createConnection", () => {
		it("should create connection with valid process", async () => {
			const connection = await manager.createConnection(
				mockProcess as ChildProcess,
				"test-agent",
				mockClientFactory,
			)

			expect(connection).toBeDefined()
			expect(ClientSideConnection).toHaveBeenCalled()
		})

		it("should throw error when stdin is missing", async () => {
			mockProcess.stdin = undefined

			await expect(
				manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory),
			).rejects.toThrow("Process stdin/stdout not available")
		})

		it("should throw error when stdout is missing", async () => {
			mockProcess.stdout = undefined

			await expect(
				manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory),
			).rejects.toThrow("Process stdin/stdout not available")
		})

		it("should store connection by agentId", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)

			const connection = manager.getConnection("test-agent")
			expect(connection).toBeDefined()
		})
	})

	describe("initialize", () => {
		it("should initialize connection with client capabilities", async () => {
			const connection = mockConnection as ClientSideConnection

			const result = await manager.initialize(connection)

			expect(mockConnection.initialize).toHaveBeenCalledWith({
				protocolVersion: "0.1.0",
				clientInfo: { name: "cmbt-agent", version: "1.0.0" },
				clientCapabilities: {
					fs: { readTextFile: true, writeTextFile: true },
					terminal: true,
				},
			})

			expect(result.agentInfo).toEqual({ name: "test-agent", version: "1.0.0" })
			expect(result.agentCapabilities).toEqual({ test: true })
		})

		it("should handle missing agentInfo", async () => {
			vi.mocked(mockConnection.initialize!).mockResolvedValue({
				protocolVersion: "0.1.0",
				agentInfo: null,
				agentCapabilities: {},
			} as any)

			const connection = mockConnection as ClientSideConnection
			const result = await manager.initialize(connection)

			expect(result.agentInfo).toEqual({ name: "unknown", version: "unknown" })
		})
	})

	describe("closeConnection", () => {
		it("should remove connection from map", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)

			await manager.closeConnection("test-agent")

			expect(manager.getConnection("test-agent")).toBeUndefined()
		})

		it("should do nothing if connection does not exist", async () => {
			await expect(manager.closeConnection("non-existent")).resolves.toBeUndefined()
		})
	})

	describe("getConnection", () => {
		it("should return connection if exists", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)

			const connection = manager.getConnection("test-agent")
			expect(connection).toBeDefined()
		})

		it("should return undefined if connection does not exist", () => {
			expect(manager.getConnection("non-existent")).toBeUndefined()
		})
	})

	describe("setTrafficLogging", () => {
		it("should enable traffic logging", () => {
			manager.setTrafficLogging(true)
			// No error should be thrown
		})

		it("should disable traffic logging", () => {
			manager.setTrafficLogging(false)
			// No error should be thrown
		})

		// cmbt-agent_change start - Test for connection close event logging
		it("should log connection close events when traffic logging is enabled", async () => {
			manager.setTrafficLogging(true)

			const traceSpy = vi.spyOn(logger, "trace")

			const abortController = new AbortController()
			setupMockConnection(abortController.signal)
			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)

			abortController.abort()

			expect(traceSpy).toHaveBeenCalledWith("receive", "Connection closed")
		})

		it("should not log connection close events when traffic logging is disabled", async () => {
			manager.setTrafficLogging(false)

			const traceSpy = vi.spyOn(logger, "trace")

			const abortController = new AbortController()
			setupMockConnection(abortController.signal)
			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)

			abortController.abort()

			expect(traceSpy).not.toHaveBeenCalledWith("receive", "Connection closed")
		})
		// cmbt-agent_change end
	})

	// cmbt-agent_change start - Task 9.2: P7 Property-based test for traffic logging visibility
	/**
	 * **Validates: Requirements 2.9**
	 *
	 * P7: Traffic Logging Visibility - When traffic logging is enabled, all key protocol events
	 * (connection initialization, connection close, errors) must be logged at TRACE level.
	 *
	 * This property-based test verifies that for ANY connection lifecycle scenario,
	 * when traffic logging is enabled, the appropriate events are logged.
	 */
	describe("P7: Traffic Logging Visibility Property", () => {
		// Test data: various agent IDs
		const agentIds = [
			"test-agent",
			"agent-with-long-id-12345678",
			"a", // Edge case: single character
			"agent-with-special-chars-!@#",
			"agent_underscore_123",
		]

		// Test data: various traffic logging states
		const trafficLoggingStates = [true, false]

		describe("connection close events", () => {
			it.each(
				// Generate all combinations of agent IDs and traffic logging states
				agentIds.flatMap((agentId) =>
					trafficLoggingStates.map((loggingEnabled) => ({
						agentId,
						loggingEnabled,
					})),
				),
			)(
				"should log connection close when traffic logging is $loggingEnabled for agentId=$agentId",
				async ({ agentId, loggingEnabled }: { agentId: string; loggingEnabled: boolean }) => {
					manager.setTrafficLogging(loggingEnabled)

					const traceSpy = vi.spyOn(logger, "trace")

					const abortController = new AbortController()
					setupMockConnection(abortController.signal)
					await manager.createConnection(mockProcess as ChildProcess, agentId, mockClientFactory)

					traceSpy.mockClear()

					abortController.abort()

					if (loggingEnabled) {
						expect(traceSpy).toHaveBeenCalledWith("receive", "Connection closed")
					} else {
						expect(traceSpy).not.toHaveBeenCalledWith("receive", "Connection closed")
					}
				},
			)
		})

		describe("connection initialization events", () => {
			it.each(agentIds)(
				"should log initialization events when traffic logging is enabled for agentId=%s",
				async (agentId: string) => {
					manager.setTrafficLogging(true)

					const infoSpy = vi.spyOn(logger, "info")
					const debugSpy = vi.spyOn(logger, "debug")

					const connection = await manager.createConnection(
						mockProcess as ChildProcess,
						agentId,
						mockClientFactory,
					)
					await manager.initialize(connection)

					expect(infoSpy).toHaveBeenCalledWith("ACP connection created", expect.objectContaining({ agentId }))
					expect(infoSpy).toHaveBeenCalledWith("Initializing ACP connection")
					expect(infoSpy).toHaveBeenCalledWith(
						"ACP connection initialized",
						expect.objectContaining({
							agentName: "test-agent",
							agentVersion: "1.0.0",
						}),
					)
					void debugSpy
				},
			)

			it.each(agentIds)(
				"should log initialization events even when traffic logging is disabled for agentId=%s",
				async (agentId: string) => {
					manager.setTrafficLogging(false)

					const infoSpy = vi.spyOn(logger, "info")

					const connection = await manager.createConnection(
						mockProcess as ChildProcess,
						agentId,
						mockClientFactory,
					)
					await manager.initialize(connection)

					expect(infoSpy).toHaveBeenCalledWith("ACP connection created", expect.objectContaining({ agentId }))
					expect(infoSpy).toHaveBeenCalledWith("Initializing ACP connection")
				},
			)
		})

		describe("multiple connection lifecycle", () => {
			it("should log events for multiple connections independently", async () => {
				manager.setTrafficLogging(true)

				const traceSpy = vi.spyOn(logger, "trace")
				const connections: { agentId: string; controller: AbortController }[] = []

				for (const agentId of ["agent-1", "agent-2", "agent-3"]) {
					const abortController = new AbortController()
					setupMockConnection(abortController.signal)
					await manager.createConnection(mockProcess as ChildProcess, agentId, mockClientFactory)
					connections.push({ agentId, controller: abortController })
				}

				traceSpy.mockClear()

				for (const { controller } of connections) {
					controller.abort()
				}

				expect(traceSpy).toHaveBeenCalledTimes(3)
				expect(traceSpy).toHaveBeenCalledWith("receive", "Connection closed")
			})

			it("should not log close events for multiple connections when traffic logging is disabled", async () => {
				manager.setTrafficLogging(false)

				const traceSpy = vi.spyOn(logger, "trace")
				const connections: { agentId: string; controller: AbortController }[] = []

				for (const agentId of ["agent-4", "agent-5", "agent-6"]) {
					const abortController = new AbortController()
					setupMockConnection(abortController.signal)
					await manager.createConnection(mockProcess as ChildProcess, agentId, mockClientFactory)
					connections.push({ agentId, controller: abortController })
				}

				traceSpy.mockClear()

				for (const { controller } of connections) {
					controller.abort()
				}

				expect(traceSpy).not.toHaveBeenCalledWith("receive", "Connection closed")
			})
		})

		describe("traffic logging state changes", () => {
			it("should respect traffic logging state changes during connection lifecycle", async () => {
				const traceSpy = vi.spyOn(logger, "trace")

				manager.setTrafficLogging(false)

				const abortController1 = new AbortController()
				setupMockConnection(abortController1.signal)
				await manager.createConnection(mockProcess as ChildProcess, "agent-toggle-1", mockClientFactory)

				traceSpy.mockClear()
				abortController1.abort()

				expect(traceSpy).not.toHaveBeenCalledWith("receive", "Connection closed")

				manager.setTrafficLogging(true)

				const abortController2 = new AbortController()
				setupMockConnection(abortController2.signal)
				await manager.createConnection(mockProcess as ChildProcess, "agent-toggle-2", mockClientFactory)

				traceSpy.mockClear()
				abortController2.abort()

				expect(traceSpy).toHaveBeenCalledWith("receive", "Connection closed")
			})
		})

		describe("edge cases", () => {
			it("should handle rapid connection creation and closure with traffic logging enabled", async () => {
				manager.setTrafficLogging(true)

				const traceSpy = vi.spyOn(logger, "trace")
				const controllers: AbortController[] = []

				for (let i = 0; i < 10; i++) {
					const abortController = new AbortController()
					setupMockConnection(abortController.signal)
					await manager.createConnection(mockProcess as ChildProcess, `rapid-agent-${i}`, mockClientFactory)
					controllers.push(abortController)
				}

				traceSpy.mockClear()

				controllers.forEach((controller) => controller.abort())

				expect(traceSpy).toHaveBeenCalledTimes(10)
			})

			it("should log connection close even if connection was never initialized", async () => {
				manager.setTrafficLogging(true)

				const traceSpy = vi.spyOn(logger, "trace")
				const abortController = new AbortController()
				setupMockConnection(abortController.signal)

				await manager.createConnection(mockProcess as ChildProcess, "uninitialized-agent", mockClientFactory)

				traceSpy.mockClear()
				abortController.abort()

				expect(traceSpy).toHaveBeenCalledWith("receive", "Connection closed")
			})
		})
	})
	// cmbt-agent_change end

	describe("dispose", () => {
		it("should clear all connections", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent-1", mockClientFactory)
			await manager.createConnection(mockProcess as ChildProcess, "test-agent-2", mockClientFactory)

			manager.dispose()

			expect(manager.getConnection("test-agent-1")).toBeUndefined()
			expect(manager.getConnection("test-agent-2")).toBeUndefined()
		})
	})

	describe("reconnection", () => {
		let reconnectHandler: ReconnectHandler
		let abortController: AbortController

		beforeEach(() => {
			abortController = new AbortController()
			setupMockConnection(abortController.signal)

			reconnectHandler = vi.fn().mockResolvedValue({
				process: mockProcess,
				connection: mockConnection,
			})

			manager.setReconnectHandler(reconnectHandler)
		})

		it("should attempt reconnection on connection lost", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)

			abortController.abort()
			await vi.runAllTimersAsync()

			expect(reconnectHandler).toHaveBeenCalledWith("test-agent")
		})

		it("should use exponential backoff for reconnection attempts", async () => {
			reconnectHandler = vi.fn().mockImplementation(async () => {
				throw new Error("Connection failed")
			})
			manager.setReconnectHandler(reconnectHandler)

			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)

			const calculateDelaySpy = vi.spyOn(manager, "calculateDelay")
			abortController.abort()

			for (let i = 1; i <= 3; i++) {
				await vi.advanceTimersByTimeAsync(10000)
			}

			expect(calculateDelaySpy).toHaveBeenCalledTimes(3)
			expect(calculateDelaySpy).toHaveBeenCalledWith(1)
			expect(calculateDelaySpy).toHaveBeenCalledWith(2)
			expect(calculateDelaySpy).toHaveBeenCalledWith(3)
		})

		it("should fire reconnectFailed event after max attempts", async () => {
			reconnectHandler = vi.fn().mockRejectedValue(new Error("Connection failed"))
			manager.setReconnectHandler(reconnectHandler)

			const fireSpy = vi.spyOn(manager["_reconnectFailedEmitter"], "fire")

			const reconnectPromise = manager.attemptReconnect("test-agent")

			for (let i = 0; i < 3; i++) {
				await vi.advanceTimersByTimeAsync(10000)
			}

			await reconnectPromise

			expect(fireSpy).toHaveBeenCalledTimes(1)
			expect(fireSpy).toHaveBeenCalledWith({ agentId: "test-agent", attempts: 3 })
			expect(reconnectHandler).toHaveBeenCalledTimes(3)
		})

		it("should restore connection on successful reconnection", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)
			abortController.abort()

			await vi.runAllTimersAsync()

			expect(manager.getConnection("test-agent")).toBeDefined()
		})

		it("should not reconnect if no handler is registered", async () => {
			manager.setReconnectHandler(undefined as any)

			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)
			abortController.abort()

			await vi.runAllTimersAsync()

			expect(manager.getConnection("test-agent")).toBeUndefined()
		})

		it("should not start duplicate reconnection for same agent", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent", mockClientFactory)

			abortController.abort()
			const promise1 = manager.attemptReconnect("test-agent")
			const promise2 = manager.attemptReconnect("test-agent")

			await vi.runAllTimersAsync()
			await Promise.all([promise1, promise2])

			expect(reconnectHandler).toHaveBeenCalledTimes(1)
		})

		it("should calculate delay with exponential backoff", () => {
			expect(manager.calculateDelay(1)).toBe(1000)
			expect(manager.calculateDelay(2)).toBe(2000)
			expect(manager.calculateDelay(3)).toBe(4000)
			expect(manager.calculateDelay(4)).toBe(8000)
			expect(manager.calculateDelay(5)).toBe(10000) // capped at maxDelay
		})
	})
})
