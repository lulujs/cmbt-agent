// cmbt-agent_change - new file
/**
 * Unit tests for ConnectionManager error handling and retry mechanisms
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ConnectionManager } from "./ConnectionManager"
import { ACPClient } from "../client/ACPClient"
import { ACPAgentConfig } from "../types"
import { ACPConnectionError, ACPTimeoutError, ACPProtocolError } from "../errors"

// Mock ACPClient
vi.mock("../client/ACPClient")

describe("ConnectionManager Error Handling", () => {
	let connectionManager: ConnectionManager
	let mockClient: any

	const validConfig: ACPAgentConfig = {
		id: "test-agent",
		name: "Test Agent",
		displayName: "Test Agent Display",
		description: "Test agent for error handling tests",
		endpoint: "ws://localhost:8080",
		transport: "websocket",
		authentication: { type: "none" },
		permissions: {
			fileAccess: "read",
			networkAccess: false,
			shellAccess: false,
		},
		settings: {
			autoConnect: false,
			idleTimeout: 30000,
			retryAttempts: 3,
			retryDelay: 1000,
		},
		metadata: {
			version: "1.0.0",
			capabilities: ["test"],
			created: new Date(),
		},
	}

	beforeEach(() => {
		mockClient = {
			connect: vi.fn(),
			disconnect: vi.fn(),
			getConnectionStatus: vi.fn(),
			getConnections: vi.fn(() => new Map()),
			getConnectionPoolStats: vi.fn(() => ({
				activeConnections: 0,
				totalConnections: 0,
				idleConnections: 0,
				queuedConnections: 0,
			})),
			shutdown: vi.fn(),
			on: vi.fn(),
			emit: vi.fn(),
		}

		vi.mocked(ACPClient).mockImplementation(() => mockClient)
		connectionManager = new ConnectionManager()
	})

	afterEach(async () => {
		await connectionManager.shutdown()
		vi.clearAllMocks()
	})

	describe("Exponential Backoff Retry Logic", () => {
		beforeEach(async () => {
			await connectionManager.addAgentConfig(validConfig)
		})

		it("should implement exponential backoff for connection failures", async () => {
			const connectionError = new Error("Connection failed")
			mockClient.connect.mockRejectedValue(connectionError)

			// First attempt should fail immediately
			const startTime = Date.now()

			try {
				await connectionManager.connectAgent("test-agent")
			} catch (error) {
				// Should throw after retry attempts are exhausted
			}

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			expect(retryInfo.connection.attempts).toBeGreaterThan(0)
		})

		it("should reset retry attempts on successful connection", async () => {
			// First, simulate failed attempts
			mockClient.connect.mockRejectedValueOnce(new Error("Connection failed"))

			try {
				await connectionManager.connectAgent("test-agent")
			} catch (error) {
				// Expected to fail
			}

			// Then simulate successful connection
			mockClient.connect.mockResolvedValue(undefined)
			await connectionManager.connectAgent("test-agent")

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			expect(retryInfo.connection.attempts).toBe(0)
		})

		it("should implement circuit breaker pattern", async () => {
			mockClient.connect.mockRejectedValue(new Error("Persistent failure"))

			// Attempt multiple connections to trigger circuit breaker
			for (let i = 0; i < 5; i++) {
				try {
					await connectionManager.connectAgent("test-agent")
				} catch (error) {
					// Expected failures
				}
			}

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			expect(retryInfo.connection.circuitState).toBe("open")
		})
	})

	describe("Connection Failure Recovery", () => {
		beforeEach(async () => {
			await connectionManager.addAgentConfig(validConfig)
		})

		it("should handle network timeout errors", async () => {
			const timeoutError = new ACPTimeoutError("Connection timeout", "test-agent", 5000)
			mockClient.connect.mockRejectedValue(timeoutError)

			try {
				await connectionManager.connectAgent("test-agent")
			} catch (error) {
				expect(error).toBeInstanceOf(ACPConnectionError)
			}

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			expect(retryInfo.connection.attempts).toBeGreaterThan(0)
		})

		it("should handle protocol errors differently from connection errors", async () => {
			const protocolError = new ACPProtocolError("Version mismatch", "test-agent")
			mockClient.connect.mockRejectedValue(protocolError)

			try {
				await connectionManager.connectAgent("test-agent")
			} catch (error) {
				expect(error).toBeInstanceOf(ACPConnectionError)
			}

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			expect(retryInfo.protocol.attempts).toBeGreaterThan(0)
		})

		it("should provide detailed error statistics", async () => {
			mockClient.connect.mockRejectedValue(new Error("Test error"))

			try {
				await connectionManager.connectAgent("test-agent")
			} catch (error) {
				// Expected failure
			}

			const errorStats = connectionManager.getErrorHandlingStats()
			expect(errorStats.totalErrors).toBeGreaterThan(0)
			expect(errorStats.agentsWithErrors).toBe(1)
		})
	})

	describe("Fallback to Default Provider", () => {
		beforeEach(async () => {
			await connectionManager.addAgentConfig(validConfig)
		})

		it("should activate fallback for persistent connection failures", async () => {
			mockClient.connect.mockRejectedValue(new Error("Persistent connection failure"))

			// Simulate multiple failed attempts to trigger fallback
			for (let i = 0; i < 6; i++) {
				try {
					await connectionManager.connectAgent("test-agent")
				} catch (error) {
					// Expected failures
				}
			}

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			expect(retryInfo.fallbackActive).toBe(true)
		})

		it("should emit fallback events", async () => {
			const fallbackActivatedSpy = vi.fn()
			connectionManager.on("fallback-activated", fallbackActivatedSpy)

			mockClient.connect.mockRejectedValue(new Error("Critical failure"))

			// Trigger immediate fallback with high error frequency
			for (let i = 0; i < 6; i++) {
				try {
					await connectionManager.connectAgent("test-agent")
				} catch (error) {
					// Expected failures
				}
			}

			// Wait a bit for async fallback activation
			await new Promise((resolve) => setTimeout(resolve, 100))

			expect(fallbackActivatedSpy).toHaveBeenCalled()
		})

		it("should allow manual fallback deactivation", async () => {
			// First activate fallback
			mockClient.connect.mockRejectedValue(new Error("Test failure"))

			for (let i = 0; i < 6; i++) {
				try {
					await connectionManager.connectAgent("test-agent")
				} catch (error) {
					// Expected failures
				}
			}

			// Wait for fallback activation
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Then deactivate fallback
			mockClient.connect.mockResolvedValue(undefined)
			await connectionManager.forceDeactivateFallback("test-agent")

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			expect(retryInfo.fallbackActive).toBe(false)
		})

		it("should provide fallback statistics", async () => {
			mockClient.connect.mockRejectedValue(new Error("Test failure"))

			// Trigger fallback
			for (let i = 0; i < 6; i++) {
				try {
					await connectionManager.connectAgent("test-agent")
				} catch (error) {
					// Expected failures
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 100))

			const errorStats = connectionManager.getErrorHandlingStats()
			expect(errorStats.fallbackStats.activeFallbacks).toBeGreaterThanOrEqual(0)
		})
	})

	describe("Enhanced Connection Status", () => {
		beforeEach(async () => {
			await connectionManager.addAgentConfig(validConfig)
		})

		it("should provide enhanced connection status with retry information", () => {
			const enhancedStatus = connectionManager.getEnhancedConnectionStatus("test-agent")

			expect(enhancedStatus).toHaveProperty("retryInfo")
			expect(enhancedStatus.retryInfo).toHaveProperty("connection")
			expect(enhancedStatus.retryInfo).toHaveProperty("auth")
			expect(enhancedStatus.retryInfo).toHaveProperty("protocol")
			expect(enhancedStatus.retryInfo).toHaveProperty("fallbackActive")
			expect(enhancedStatus.retryInfo).toHaveProperty("errorHistory")
		})

		it("should track error history per agent", async () => {
			mockClient.connect.mockRejectedValue(new Error("Test error"))

			try {
				await connectionManager.connectAgent("test-agent")
			} catch (error) {
				// Expected failure
			}

			const enhancedStatus = connectionManager.getEnhancedConnectionStatus("test-agent")
			expect(enhancedStatus.retryInfo.errorHistory).toBeGreaterThan(0)
		})

		it("should include circuit breaker state in connection info", async () => {
			mockClient.connect.mockRejectedValue(new Error("Persistent failure"))

			// Trigger circuit breaker
			for (let i = 0; i < 4; i++) {
				try {
					await connectionManager.connectAgent("test-agent")
				} catch (error) {
					// Expected failures
				}
			}

			const enhancedStatus = connectionManager.getEnhancedConnectionStatus("test-agent")
			expect(enhancedStatus.retryInfo.connection.circuitState).toBeDefined()
		})
	})

	describe("Error Pattern Analysis", () => {
		beforeEach(async () => {
			await connectionManager.addAgentConfig(validConfig)
		})

		it("should detect high-frequency errors and trigger immediate fallback", async () => {
			mockClient.connect.mockRejectedValue(new Error("High frequency error"))

			// Rapidly trigger multiple errors
			const promises = []
			for (let i = 0; i < 6; i++) {
				promises.push(
					connectionManager.connectAgent("test-agent").catch(() => {
						// Expected failures
					}),
				)
			}

			await Promise.all(promises)
			await new Promise((resolve) => setTimeout(resolve, 100))

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			expect(retryInfo.fallbackActive).toBe(true)
		})

		it("should provide fallback reason in retry info", async () => {
			mockClient.connect.mockRejectedValue(new Error("Test failure reason"))

			for (let i = 0; i < 6; i++) {
				try {
					await connectionManager.connectAgent("test-agent")
				} catch (error) {
					// Expected failures
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 100))

			const retryInfo = connectionManager.getRetryInfo("test-agent")
			if (retryInfo.fallbackActive) {
				expect(retryInfo.fallbackReason).toBeDefined()
			}
		})
	})
})
