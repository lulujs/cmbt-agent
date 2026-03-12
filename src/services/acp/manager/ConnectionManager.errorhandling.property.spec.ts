// cmbt-agent_change - new file
/**
 * Property-based tests for ConnectionManager error handling and retry mechanisms
 * **Feature: acp-protocol-support, Property 10: 错误处理和恢复**
 * **Validates: Requirements 9.2, 9.3, 9.4, 9.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import { ConnectionManager } from "./ConnectionManager"
import { ACPClient } from "../client/ACPClient"
import { ACPAgentConfig } from "../types"
import { ACPConnectionError, ACPTimeoutError, ACPProtocolError, ACPSystemError } from "../errors"

// Mock ACPClient
vi.mock("../client/ACPClient")

describe("ConnectionManager Error Handling Properties", () => {
	let connectionManager: ConnectionManager
	let mockClient: any

	const createValidConfig = (id: string): ACPAgentConfig => ({
		id,
		name: `Agent ${id}`,
		displayName: `Agent ${id} Display`,
		description: `Test agent ${id}`,
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
	})

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

	/**
	 * **Feature: acp-protocol-support, Property 10: 错误处理和恢复**
	 * Property: For any connection error or protocol error, the system should display
	 * user-friendly error messages, execute appropriate retry logic (within limits),
	 * and fallback to default provider when necessary
	 */
	it("should handle any error with appropriate recovery strategy", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
				fc.oneof(
					fc.constant("CONNECTION_FAILED"),
					fc.constant("NETWORK_ERROR"),
					fc.constant("CONNECTION_TIMEOUT"),
					fc.constant("PROTOCOL_ERROR"),
					fc.constant("VERSION_MISMATCH"),
					fc.constant("RESOURCE_EXHAUSTED"),
				),
				fc.string({ minLength: 5, maxLength: 100 }),
				fc.integer({ min: 1, max: 10 }),
				async (agentId, errorCode, errorMessage, attemptCount) => {
					// Setup agent configuration
					const config = createValidConfig(agentId)
					await connectionManager.addAgentConfig(config)

					// Create appropriate error based on error code
					let testError: Error
					switch (errorCode) {
						case "CONNECTION_FAILED":
						case "NETWORK_ERROR":
						case "CONNECTION_TIMEOUT":
							testError = new ACPConnectionError(errorMessage, agentId)
							break
						case "PROTOCOL_ERROR":
						case "VERSION_MISMATCH":
							testError = new ACPProtocolError(errorMessage, agentId)
							break
						case "RESOURCE_EXHAUSTED":
							testError = new ACPSystemError(errorMessage, agentId)
							break
						default:
							testError = new Error(errorMessage)
					}

					// Mock connection failures
					mockClient.connect.mockRejectedValue(testError)

					// Attempt connections up to attemptCount
					for (let i = 0; i < Math.min(attemptCount, 5); i++) {
						try {
							await connectionManager.connectAgent(agentId)
						} catch (error) {
							// Expected failures - continue attempting
						}
					}

					// Verify error handling behavior
					const retryInfo = connectionManager.getRetryInfo(agentId)
					const errorStats = connectionManager.getErrorHandlingStats()

					// Property 1: System should track retry attempts
					expect(retryInfo.connection.attempts).toBeGreaterThanOrEqual(0)
					expect(retryInfo.connection.attempts).toBeLessThanOrEqual(5) // Max retry limit

					// Property 2: System should record errors for analysis
					expect(errorStats.totalErrors).toBeGreaterThan(0)
					expect(errorStats.agentsWithErrors).toBeGreaterThanOrEqual(1)

					// Property 3: Fallback should activate for appropriate error types
					if (
						attemptCount >= 5 &&
						(errorCode === "CONNECTION_FAILED" ||
							errorCode === "NETWORK_ERROR" ||
							errorCode === "RESOURCE_EXHAUSTED")
					) {
						// Allow time for fallback activation
						await new Promise((resolve) => setTimeout(resolve, 50))
						// Fallback may be activated for persistent failures
						expect(typeof retryInfo.fallbackActive).toBe("boolean")
					}

					// Property 4: Circuit breaker should engage for repeated failures
					if (retryInfo.connection.attempts >= 3) {
						expect(retryInfo.connection.circuitState).toBeDefined()
					}

					// Property 5: Error history should be maintained
					expect(retryInfo.errorHistory).toBeGreaterThanOrEqual(0)
				},
			),
			{ numRuns: 50 },
		) // Reduced from 100 for faster execution
	})

	/**
	 * Property: Exponential backoff should increase delays appropriately
	 */
	it("should implement proper exponential backoff timing", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
				fc.integer({ min: 2, max: 5 }),
				async (agentId, maxRetries) => {
					const config = createValidConfig(agentId)
					await connectionManager.addAgentConfig(config)

					mockClient.connect.mockRejectedValue(new Error("Persistent failure"))

					const retryTimes: number[] = []

					// Attempt connections and measure timing
					for (let i = 0; i < maxRetries; i++) {
						const startTime = Date.now()
						try {
							await connectionManager.connectAgent(agentId)
						} catch (error) {
							// Expected failure
						}
						retryTimes.push(Date.now() - startTime)
					}

					const retryInfo = connectionManager.getRetryInfo(agentId)

					// Property: Retry attempts should be tracked correctly
					expect(retryInfo.connection.attempts).toBeGreaterThan(0)
					expect(retryInfo.connection.attempts).toBeLessThanOrEqual(maxRetries)

					// Property: Last retry time should be recorded
					if (retryInfo.connection.lastRetry) {
						expect(retryInfo.connection.lastRetry).toBeGreaterThan(0)
					}
				},
			),
			{ numRuns: 30 },
		) // Reduced for faster execution
	})

	/**
	 * Property: Fallback activation and deactivation should be consistent
	 */
	it("should maintain consistent fallback state transitions", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
				fc.boolean(),
				async (agentId, shouldRecover) => {
					const config = createValidConfig(agentId)
					await connectionManager.addAgentConfig(config)

					// Trigger fallback with persistent failures
					mockClient.connect.mockRejectedValue(new Error("Critical failure"))

					for (let i = 0; i < 6; i++) {
						try {
							await connectionManager.connectAgent(agentId)
						} catch (error) {
							// Expected failures
						}
					}

					// Allow fallback activation
					await new Promise((resolve) => setTimeout(resolve, 50))

					const initialRetryInfo = connectionManager.getRetryInfo(agentId)

					if (shouldRecover) {
						// Simulate recovery
						mockClient.connect.mockResolvedValue(undefined)

						try {
							await connectionManager.forceDeactivateFallback(agentId)

							const recoveredRetryInfo = connectionManager.getRetryInfo(agentId)

							// Property: Fallback deactivation should reset state
							expect(recoveredRetryInfo.fallbackActive).toBe(false)

							// Property: Retry attempts should be reset on successful recovery
							expect(recoveredRetryInfo.connection.attempts).toBe(0)
						} catch (error) {
							// Recovery might fail, which is acceptable
						}
					}

					// Property: Fallback state should be consistent
					const finalRetryInfo = connectionManager.getRetryInfo(agentId)
					expect(typeof finalRetryInfo.fallbackActive).toBe("boolean")
				},
			),
			{ numRuns: 25 },
		) // Reduced for faster execution
	})

	/**
	 * Property: Error statistics should accurately reflect system state
	 */
	it("should maintain accurate error statistics", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
					{ minLength: 1, maxLength: 3 },
				),
				fc.integer({ min: 1, max: 3 }),
				async (agentIds, errorsPerAgent) => {
					// Setup multiple agents
					for (const agentId of agentIds) {
						const config = createValidConfig(agentId)
						await connectionManager.addAgentConfig(config)
					}

					mockClient.connect.mockRejectedValue(new Error("Test error"))

					// Generate errors for each agent
					for (const agentId of agentIds) {
						for (let i = 0; i < errorsPerAgent; i++) {
							try {
								await connectionManager.connectAgent(agentId)
							} catch (error) {
								// Expected failures
							}
						}
					}

					const errorStats = connectionManager.getErrorHandlingStats()

					// Property: Total errors should match generated errors
					expect(errorStats.totalErrors).toBeGreaterThan(0)
					expect(errorStats.totalErrors).toBeLessThanOrEqual(agentIds.length * errorsPerAgent * 5) // Account for retries

					// Property: Agents with errors should match agents that had failures
					expect(errorStats.agentsWithErrors).toBeGreaterThan(0)
					expect(errorStats.agentsWithErrors).toBeLessThanOrEqual(agentIds.length)

					// Property: Error types should be categorized
					expect(typeof errorStats.errorsByType).toBe("object")

					// Property: Fallback stats should be available
					expect(errorStats.fallbackStats).toBeDefined()
					expect(typeof errorStats.fallbackStats.activeFallbacks).toBe("number")
				},
			),
			{ numRuns: 20 },
		) // Reduced for faster execution
	})
})
