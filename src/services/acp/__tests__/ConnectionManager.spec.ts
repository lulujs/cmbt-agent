import { ConnectionManager, ReconnectHandler } from "../ConnectionManager"
import { AcpLogger, AcpLogLevel } from "../AcpLogger"
import { ChildProcess } from "child_process"
import { ClientSideConnection } from "@agentclientprotocol/sdk"
import { Readable, Writable } from "stream"

vi.mock("@agentclientprotocol/sdk")

describe("ConnectionManager", () => {
	let manager: ConnectionManager
	let logger: AcpLogger
	let mockProcess: Partial<ChildProcess>
	let mockConnection: Partial<ClientSideConnection>

	beforeEach(() => {
		vi.useFakeTimers()
		logger = new AcpLogger(AcpLogLevel.ERROR)
		manager = new ConnectionManager(logger)

		mockProcess = {
			stdin: new Writable() as any,
			stdout: new Readable() as any,
		}

		const mockSignal = new AbortController().signal
		mockConnection = {
			initialize: vi.fn().mockResolvedValue({
				protocolVersion: "0.1.0",
				agentInfo: { name: "test-agent", version: "1.0.0" },
				agentCapabilities: { test: true },
			}),
			signal: mockSignal,
		}

		vi.mocked(ClientSideConnection).mockImplementation(() => mockConnection as ClientSideConnection)
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	describe("createConnection", () => {
		it("should create connection with valid process", async () => {
			const connection = await manager.createConnection(mockProcess as ChildProcess, "test-agent")

			expect(connection).toBeDefined()
			expect(ClientSideConnection).toHaveBeenCalled()
		})

		it("should throw error when stdin is missing", async () => {
			mockProcess.stdin = undefined

			await expect(manager.createConnection(mockProcess as ChildProcess, "test-agent")).rejects.toThrow(
				"Process stdin/stdout not available",
			)
		})

		it("should throw error when stdout is missing", async () => {
			mockProcess.stdout = undefined

			await expect(manager.createConnection(mockProcess as ChildProcess, "test-agent")).rejects.toThrow(
				"Process stdin/stdout not available",
			)
		})

		it("should store connection by agentId", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent")

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
			await manager.createConnection(mockProcess as ChildProcess, "test-agent")

			await manager.closeConnection("test-agent")

			expect(manager.getConnection("test-agent")).toBeUndefined()
		})

		it("should do nothing if connection does not exist", async () => {
			await expect(manager.closeConnection("non-existent")).resolves.toBeUndefined()
		})
	})

	describe("getConnection", () => {
		it("should return connection if exists", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent")

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
	})

	describe("dispose", () => {
		it("should clear all connections", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent-1")
			await manager.createConnection(mockProcess as ChildProcess, "test-agent-2")

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
			mockConnection.signal = abortController.signal

			reconnectHandler = vi.fn().mockResolvedValue({
				process: mockProcess,
				connection: mockConnection,
			})

			manager.setReconnectHandler(reconnectHandler)
		})

		it("should attempt reconnection on connection lost", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent")

			abortController.abort()
			await vi.runAllTimersAsync()

			expect(reconnectHandler).toHaveBeenCalledWith("test-agent")
		})

		it("should use exponential backoff for reconnection attempts", async () => {
			const delays: number[] = []
			reconnectHandler = vi.fn().mockImplementation(async () => {
				throw new Error("Connection failed")
			})
			manager.setReconnectHandler(reconnectHandler)

			await manager.createConnection(mockProcess as ChildProcess, "test-agent")

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

			// Advance timers for all 3 attempts
			for (let i = 0; i < 3; i++) {
				await vi.advanceTimersByTimeAsync(10000)
			}

			await reconnectPromise

			expect(fireSpy).toHaveBeenCalledTimes(1)
			expect(fireSpy).toHaveBeenCalledWith({ agentId: "test-agent", attempts: 3 })
			expect(reconnectHandler).toHaveBeenCalledTimes(3)
		})

		it("should restore connection on successful reconnection", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent")
			abortController.abort()

			await vi.runAllTimersAsync()

			expect(manager.getConnection("test-agent")).toBeDefined()
		})

		it("should not reconnect if no handler is registered", async () => {
			manager.setReconnectHandler(undefined as any)

			await manager.createConnection(mockProcess as ChildProcess, "test-agent")
			abortController.abort()

			await vi.runAllTimersAsync()

			expect(manager.getConnection("test-agent")).toBeUndefined()
		})

		it("should not start duplicate reconnection for same agent", async () => {
			await manager.createConnection(mockProcess as ChildProcess, "test-agent")

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
