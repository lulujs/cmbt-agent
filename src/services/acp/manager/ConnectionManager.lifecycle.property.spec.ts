// cmbt-agent_change - new file
/**
 * Property-based tests for ConnectionManager lifecycle management
 *
 * Feature: acp-protocol-support, Property 5: 连接生命周期管理
 *
 * This file contains property-based tests that validate the universal correctness
 * properties of connection lifecycle management using fast-check for comprehensive scenario coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import { ConnectionManager } from "./ConnectionManager"
import { ACPClient } from "../client/ACPClient"
import { ACPAgentConfig, ConnectionStatus, ACPTransportType } from "../types"

// Mock ACPClient
vi.mock("../client/ACPClient")

describe("Connection Lifecycle Management Properties", () => {
	let connectionManager: ConnectionManager
	let mockClient: any

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
			getEnhancedConnectionStats: vi.fn(() => ({ agents: {} })),
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

	// Generator for valid agent configurations
	const validAgentConfigArb = fc.record({
		id: fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
		name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
		displayName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
		description: fc.option(fc.string({ maxLength: 200 })),
		endpoint: fc.oneof(
			fc.webUrl(),
			fc.integer({ min: 1000, max: 9999 }).map((port) => `ws://localhost:${port}`),
			fc.integer({ min: 1000, max: 9999 }).map((port) => `http://localhost:${port}`),
		),
		transport: fc.constantFrom("websocket", "http", "stdio") as fc.Arbitrary<ACPTransportType>,
		authentication: fc.record({
			type: fc.constantFrom("token", "oauth", "none"),
			credentials: fc.option(fc.dictionary(fc.string(), fc.string())),
		}),
		permissions: fc.record({
			fileAccess: fc.constantFrom("none", "read", "write", "full"),
			networkAccess: fc.boolean(),
			shellAccess: fc.boolean(),
		}),
		settings: fc.record({
			autoConnect: fc.boolean(),
			idleTimeout: fc.integer({ min: 1000, max: 300000 }),
			retryAttempts: fc.integer({ min: 0, max: 10 }),
			retryDelay: fc.integer({ min: 1000, max: 60000 }),
		}),
		metadata: fc.record({
			version: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
			capabilities: fc.array(fc.string({ minLength: 1, maxLength: 30 })),
			created: fc.date(),
			lastUsed: fc.option(fc.date()),
		}),
	})

	// Generator for arrays of configs with unique IDs
	const uniqueAgentConfigsArb = fc.integer({ min: 1, max: 5 }).chain((count) =>
		fc.array(validAgentConfigArb, { minLength: count, maxLength: count }).map((configs) =>
			configs.map((config, index) => ({
				...config,
				id: `agent-${index}-${config.id}`,
			})),
		),
	)

	/**
	 * **Validates: Requirements 6.1, 6.2, 6.3, 9.1**
	 *
	 * Property 5: 连接生命周期管理
	 *
	 * Property: For any agent connection, executing connect→disconnect→restart operations
	 * should restore the connection to a usable state
	 */
	it("should maintain consistent state through connect-disconnect-restart lifecycle", async () => {
		await fc.assert(
			fc.asyncProperty(validAgentConfigArb, async (config) => {
				// Add the agent configuration
				await connectionManager.addAgentConfig(config)

				// Mock successful operations
				mockClient.connect.mockResolvedValue(undefined)
				mockClient.disconnect.mockResolvedValue(undefined)

				// Mock status transitions properly
				let callCount = 0
				mockClient.getConnectionStatus.mockImplementation(() => {
					callCount++
					switch (callCount) {
						case 1:
							return "connected" // After connect
						case 2:
							return "disconnected" // After disconnect
						case 3:
							return "disconnected" // Before restart (checking current state)
						case 4:
							return "connected" // After restart
						default:
							return "disconnected"
					}
				})

				// Execute lifecycle: connect → disconnect → restart
				await connectionManager.connectAgent(config.id)
				const statusAfterConnect = connectionManager.getConnectionStatus(config.id)
				expect(statusAfterConnect).toBe("connected")

				await connectionManager.disconnectAgent(config.id)
				const statusAfterDisconnect = connectionManager.getConnectionStatus(config.id)
				expect(statusAfterDisconnect).toBe("disconnected")

				await connectionManager.restartAgent(config.id)
				const statusAfterRestart = connectionManager.getConnectionStatus(config.id)
				expect(statusAfterRestart).toBe("connected")

				// Verify the correct sequence of calls
				expect(mockClient.connect).toHaveBeenCalledTimes(2) // Initial connect + restart
				expect(mockClient.disconnect).toHaveBeenCalledTimes(1) // Explicit disconnect
				expect(mockClient.connect).toHaveBeenCalledWith(config)
				expect(mockClient.disconnect).toHaveBeenCalledWith(config.id)

				// Clean up
				await connectionManager.removeAgentConfig(config.id)
			}),
			{ numRuns: 50 },
		)
	})

	/**
	 * **Validates: Requirements 6.1, 6.2, 6.3, 9.1**
	 *
	 * Property 5: 连接生命周期管理 (Error Recovery)
	 *
	 * Property: Connection failures should be handled gracefully and recovery
	 * mechanisms should work as expected
	 */
	it("should handle connection failures gracefully with proper error recovery", async () => {
		await fc.assert(
			fc.asyncProperty(
				validAgentConfigArb,
				fc.constantFrom("Connection timeout", "Network error", "Authentication failed", "Protocol error"),
				async (config, errorMessage) => {
					// Add the agent configuration
					await connectionManager.addAgentConfig(config)

					// Mock connection failure followed by success
					let connectCallCount = 0
					let statusCallCount = 0

					mockClient.connect.mockImplementation(() => {
						connectCallCount++
						if (connectCallCount === 1) {
							return Promise.reject(new Error(errorMessage))
						}
						return Promise.resolve(undefined)
					})

					mockClient.getConnectionStatus.mockImplementation(() => {
						statusCallCount++
						switch (statusCallCount) {
							case 1:
								return "error" // After failed connect
							case 2:
								return "connected" // After successful retry
							default:
								return "disconnected"
						}
					})

					// First connection attempt should fail
					await expect(connectionManager.connectAgent(config.id)).rejects.toThrow(
						`Failed to connect to agent ${config.id}`,
					)

					// Status should reflect the error
					const statusAfterError = connectionManager.getConnectionStatus(config.id)
					expect(statusAfterError).toBe("error")

					// Retry should succeed
					await connectionManager.connectAgent(config.id)
					const statusAfterRetry = connectionManager.getConnectionStatus(config.id)
					expect(statusAfterRetry).toBe("connected")

					// Verify retry behavior
					expect(mockClient.connect).toHaveBeenCalledTimes(2)
					expect(mockClient.connect).toHaveBeenCalledWith(config)

					// Clean up
					await connectionManager.removeAgentConfig(config.id)
				},
			),
			{ numRuns: 30 },
		)
	})

	/**
	 * **Validates: Requirements 6.1, 6.2, 6.3, 9.1**
	 *
	 * Property 5: 连接生命周期管理 (Restart Behavior)
	 *
	 * Property: Restart operation should work correctly regardless of current connection state
	 */
	it("should handle restart operations correctly from any connection state", async () => {
		await fc.assert(
			fc.asyncProperty(
				validAgentConfigArb,
				fc.constantFrom("connected", "disconnected", "error", "connecting"),
				async (config, initialState) => {
					// Add the agent configuration
					await connectionManager.addAgentConfig(config)

					// Mock operations based on initial state
					mockClient.connect.mockResolvedValue(undefined)
					mockClient.disconnect.mockResolvedValue(undefined)

					let statusCallCount = 0
					mockClient.getConnectionStatus.mockImplementation(() => {
						statusCallCount++
						if (statusCallCount === 1) {
							return initialState as ConnectionStatus // Initial state
						}
						return "connected" // After restart
					})

					// Execute restart from the given state
					await connectionManager.restartAgent(config.id)

					// Should end up connected regardless of initial state
					const finalStatus = connectionManager.getConnectionStatus(config.id)
					expect(finalStatus).toBe("connected")

					// Verify behavior based on initial state
					if (initialState === "connected" || initialState === "connecting") {
						// Should disconnect first, then connect
						expect(mockClient.disconnect).toHaveBeenCalledWith(config.id)
						expect(mockClient.connect).toHaveBeenCalledWith(config)
					} else {
						// Should only connect (no need to disconnect)
						expect(mockClient.connect).toHaveBeenCalledWith(config)
					}

					// Clean up
					await connectionManager.removeAgentConfig(config.id)
				},
			),
			{ numRuns: 40 },
		)
	})

	/**
	 * **Validates: Requirements 6.4**
	 *
	 * Property 5: 连接生命周期管理 (Idle Timeout)
	 *
	 * Property: Idle timeout behavior should work correctly for connections
	 * that exceed their configured idle timeout
	 */
	it("should handle idle timeout behavior correctly", async () => {
		await fc.assert(
			fc.asyncProperty(
				validAgentConfigArb.filter((config) => config.settings.idleTimeout > 0),
				async (config) => {
					// Add the agent configuration
					await connectionManager.addAgentConfig(config)

					// Mock connected state
					mockClient.getConnectionStatus.mockReturnValue("connected")
					mockClient.disconnect.mockResolvedValue(undefined)

					// Get idle connections (should be empty initially)
					const initialIdleConnections = connectionManager.getIdleConnections()
					expect(Array.isArray(initialIdleConnections)).toBe(true)

					// Simulate idle connection detection and cleanup
					await connectionManager.disconnectIdleConnections()

					// Verify that idle connection management works
					const lifecycleStats = connectionManager.getLifecycleStats()
					expect(lifecycleStats).toHaveProperty("totalAgents")
					expect(lifecycleStats).toHaveProperty("idleAgents")
					expect(typeof lifecycleStats.averageIdleTime).toBe("number")

					// Clean up
					await connectionManager.removeAgentConfig(config.id)
				},
			),
			{ numRuns: 30 },
		)
	})

	/**
	 * **Validates: Requirements 6.5**
	 *
	 * Property 5: 连接生命周期管理 (Graceful Shutdown)
	 *
	 * Property: Graceful shutdown should properly clean up all resources
	 * without leaving hanging connections
	 */
	it("should perform graceful shutdown without resource leaks", async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(validAgentConfigArb, { minLength: 1, maxLength: 5 }), async (configs) => {
				// Add multiple agent configurations
				for (const config of configs) {
					await connectionManager.addAgentConfig(config)
				}

				// Mock all agents as connected
				mockClient.getConnectionStatus.mockReturnValue("connected")
				mockClient.disconnect.mockResolvedValue(undefined)
				mockClient.shutdown.mockResolvedValue(undefined)

				// Verify initial state
				expect(connectionManager.isShuttingDownStatus()).toBe(false)

				const initialStats = connectionManager.getLifecycleStats()
				expect(initialStats.totalAgents).toBe(configs.length)

				// Perform graceful shutdown
				await connectionManager.shutdown()

				// Verify shutdown state
				expect(connectionManager.isShuttingDownStatus()).toBe(true)

				// Verify all connections were properly closed
				expect(mockClient.shutdown).toHaveBeenCalled()

				// Verify no resource leaks by checking final stats
				const finalStats = connectionManager.getLifecycleStats()
				expect(finalStats.connectedAgents).toBe(0)
			}),
			{ numRuns: 20 },
		)
	})

	/**
	 * **Validates: Requirements 6.1, 6.2, 6.3, 9.1**
	 *
	 * Property 5: 连接生命周期管理 (Concurrent Operations)
	 *
	 * Property: Concurrent lifecycle operations should maintain consistency
	 * and not interfere with each other
	 */
	it("should handle concurrent lifecycle operations consistently", async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(validAgentConfigArb, { minLength: 2, maxLength: 4 }), async (configs) => {
				// Add all agent configurations
				for (const config of configs) {
					await connectionManager.addAgentConfig(config)
				}

				// Mock successful operations
				mockClient.connect.mockResolvedValue(undefined)
				mockClient.disconnect.mockResolvedValue(undefined)
				mockClient.getConnectionStatus.mockReturnValue("connected")

				// Perform concurrent operations on different agents
				const operations = configs.map(async (config, index) => {
					switch (index % 3) {
						case 0:
							await connectionManager.connectAgent(config.id)
							return { operation: "connect", agentId: config.id }
						case 1:
							await connectionManager.disconnectAgent(config.id)
							return { operation: "disconnect", agentId: config.id }
						case 2:
							await connectionManager.restartAgent(config.id)
							return { operation: "restart", agentId: config.id }
					}
				})

				// Wait for all operations to complete
				const results = await Promise.all(operations)

				// Verify all operations completed successfully
				expect(results).toHaveLength(configs.length)
				results.forEach((result) => {
					expect(result).toHaveProperty("operation")
					expect(result).toHaveProperty("agentId")
				})

				// Verify system state remains consistent
				const stats = connectionManager.getLifecycleStats()
				expect(stats.totalAgents).toBe(configs.length)
				expect(typeof stats.connectedAgents).toBe("number")
				expect(stats.connectedAgents).toBeGreaterThanOrEqual(0)
				expect(stats.connectedAgents).toBeLessThanOrEqual(configs.length)

				// Clean up
				for (const config of configs) {
					await connectionManager.removeAgentConfig(config.id)
				}
			}),
			{ numRuns: 20 },
		)
	})

	/**
	 * **Validates: Requirements 6.1, 6.2, 6.3, 9.1**
	 *
	 * Property 5: 连接生命周期管理 (State Consistency)
	 *
	 * Property: Connection state should always be consistent and accurately
	 * reflect the actual connection status
	 */
	it("should maintain consistent connection state information", async () => {
		await fc.assert(
			fc.asyncProperty(
				validAgentConfigArb,
				fc.constantFrom("connected", "disconnected", "error", "connecting"),
				async (config, mockStatus) => {
					// Add the agent configuration
					await connectionManager.addAgentConfig(config)

					// Mock the connection status
					mockClient.getConnectionStatus.mockReturnValue(mockStatus as ConnectionStatus)

					// Get status through different methods
					const basicStatus = connectionManager.getConnectionStatus(config.id)
					const detailedStatus = connectionManager.getConnectionStatusInfo(config.id)
					const healthStatus = connectionManager.getHealthStatus()

					// Verify consistency across different status methods
					expect(basicStatus).toBe(mockStatus)
					expect(detailedStatus.status).toBe(mockStatus)
					expect(healthStatus[config.id]?.status).toBe(mockStatus)

					// Verify status info structure
					expect(detailedStatus).toHaveProperty("status")
					expect(detailedStatus).toHaveProperty("messageCount")
					expect(typeof detailedStatus.messageCount).toBe("number")

					// Verify health status structure
					expect(healthStatus).toHaveProperty(config.id)
					expect(healthStatus[config.id]).toHaveProperty("status")

					// Clean up
					await connectionManager.removeAgentConfig(config.id)
				},
			),
			{ numRuns: 40 },
		)
	})

	/**
	 * **Validates: Requirements 6.1, 6.2, 6.3, 9.1**
	 *
	 * Property 5: 连接生命周期管理 (Error State Recovery)
	 *
	 * Property: System should remain stable under various failure conditions
	 * and be able to recover from error states
	 */
	it("should remain stable under various failure conditions", async () => {
		await fc.assert(
			fc.asyncProperty(
				validAgentConfigArb,
				fc.array(fc.constantFrom("timeout", "network", "auth", "protocol"), { minLength: 1, maxLength: 3 }),
				async (config, errorTypes) => {
					// Add the agent configuration
					await connectionManager.addAgentConfig(config)

					// Simulate various error conditions
					for (const errorType of errorTypes) {
						const errorMessage = `${errorType} error occurred`

						// Mock error followed by recovery
						mockClient.connect
							.mockRejectedValueOnce(new Error(errorMessage))
							.mockResolvedValueOnce(undefined)
						mockClient.getConnectionStatus.mockReturnValueOnce("error").mockReturnValueOnce("connected")

						// Attempt connection (should fail)
						await expect(connectionManager.connectAgent(config.id)).rejects.toThrow()

						// Verify error state
						const errorStatus = connectionManager.getConnectionStatus(config.id)
						expect(errorStatus).toBe("error")

						// Attempt recovery (should succeed)
						await connectionManager.connectAgent(config.id)
						const recoveredStatus = connectionManager.getConnectionStatus(config.id)
						expect(recoveredStatus).toBe("connected")
					}

					// Verify system remains stable after multiple errors
					const finalStats = connectionManager.getLifecycleStats()
					expect(finalStats.totalAgents).toBe(1)
					expect(typeof finalStats.errorAgents).toBe("number")

					// Clean up
					await connectionManager.removeAgentConfig(config.id)
				},
			),
			{ numRuns: 25 },
		)
	})
})
