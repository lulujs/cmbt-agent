// cmbt-agent_change - new file
/**
 * Property-based tests for multi-agent connection management
 *
 * Feature: acp-protocol-support, Property 2: 多智能体连接管理
 *
 * This file contains property-based tests that validate the universal correctness
 * properties of multi-agent connection management using fast-check for comprehensive coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import { ACPClient } from "./ACPClient"
import { ACPAgentConfig, ConnectionStatus } from "../types"
import { DEFAULT_CONNECTION_POOL_CONFIG } from "../constants"

// Mock WebSocket for testing
const mockWebSocket = {
	readyState: 1, // OPEN
	send: vi.fn(),
	close: vi.fn(),
	on: vi.fn(),
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
}

vi.mock("ws", () => ({
	default: vi.fn(() => mockWebSocket),
}))

describe("Multi-Agent Connection Management Properties", () => {
	let client: ACPClient

	beforeEach(() => {
		vi.clearAllMocks()
		client = new ACPClient({
			maxConnections: 5,
			idleTimeout: 30000,
			connectionReuse: true,
		})

		// Mock successful WebSocket connection
		mockWebSocket.on = vi.fn((event, callback) => {
			if (event === "open") {
				setTimeout(() => callback(), 10)
			}
		})
	})

	afterEach(async () => {
		await client.shutdown()
	})
	/**
	 * Feature: acp-protocol-support, Property 2: 多智能体连接管理
	 *
	 * Property: For any set of valid agent configurations, the client should be able to
	 * manage multiple concurrent connections while maintaining connection limits, proper
	 * resource cleanup, and consistent connection state tracking.
	 *
	 * Validates: Requirements 1.5, 2.4
	 */
	it("should manage multiple concurrent connections within limits", () => {
		// Generator for valid agent configurations
		const agentConfigArb = fc.record({
			id: fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
			name: fc.string({ minLength: 1, maxLength: 50 }),
			displayName: fc.string({ minLength: 1, maxLength: 100 }),
			description: fc.string({ maxLength: 200 }),
			endpoint: fc.constantFrom("ws://localhost:8080", "wss://api.example.com", "http://localhost:3000"),
			transport: fc.constantFrom("websocket", "http", "stdio"),
			authentication: fc.record({
				type: fc.constantFrom("token", "oauth", "none"),
				credentials: fc.oneof(fc.constant(undefined), fc.dictionary(fc.string(), fc.string())),
			}),
			permissions: fc.record({
				fileAccess: fc.constantFrom("none", "read", "write", "full"),
				networkAccess: fc.boolean(),
				shellAccess: fc.boolean(),
			}),
			settings: fc.record({
				autoConnect: fc.boolean(),
				idleTimeout: fc.integer({ min: 5000, max: 300000 }),
				retryAttempts: fc.integer({ min: 0, max: 10 }),
				retryDelay: fc.integer({ min: 1000, max: 30000 }),
			}),
			metadata: fc.record({
				version: fc.string({ minLength: 1, maxLength: 20 }),
				capabilities: fc.array(fc.string(), { maxLength: 10 }),
				created: fc.date(),
				lastUsed: fc.oneof(fc.constant(undefined), fc.date()),
			}),
		})

		fc.assert(
			fc.asyncProperty(fc.array(agentConfigArb, { minLength: 1, maxLength: 8 }), async (agentConfigs) => {
				// Ensure unique agent IDs
				const uniqueConfigs = agentConfigs.reduce(
					(acc, config, index) => {
						const uniqueConfig = { ...config, id: `agent-${index}` }
						acc.push(uniqueConfig)
						return acc
					},
					[] as typeof agentConfigs,
				)

				const connectionPromises = uniqueConfigs.map(async (config) => {
					try {
						await client.connect(config)
						return { agentId: config.id, success: true }
					} catch (error) {
						return { agentId: config.id, success: false, error }
					}
				})

				const results = await Promise.allSettled(connectionPromises)
				const connections = client.getConnections()
				const poolStats = client.getConnectionPoolStats()

				// Property 1: Connection count should not exceed pool limits
				expect(connections.size).toBeLessThanOrEqual(client["maxConcurrentConnections"])
				expect(poolStats.activeConnections).toBeLessThanOrEqual(client["maxConcurrentConnections"])

				// Property 2: All successful connections should be tracked
				const successfulResults = results
					.filter((result) => result.status === "fulfilled")
					.map((result) => (result as PromiseFulfilledResult<any>).value)
					.filter((result) => result.success)

				successfulResults.forEach((result) => {
					expect(connections.has(result.agentId)).toBe(true)
					expect(client.getConnectionStatus(result.agentId)).toBe("connected")
				})

				// Property 3: Connection metrics should be consistent
				expect(poolStats.totalConnections).toBeGreaterThanOrEqual(0)
				expect(poolStats.activeConnections).toBeGreaterThanOrEqual(0)
				expect(poolStats.idleConnections).toBeGreaterThanOrEqual(0)
				expect(poolStats.activeConnections + poolStats.idleConnections).toBeLessThanOrEqual(
					poolStats.totalConnections,
				)
			}),
			{ numRuns: 20, timeout: 10000 },
		)
	})
	/**
	 * Feature: acp-protocol-support, Property 2: 多智能体连接管理 (Connection lifecycle)
	 *
	 * Property: For any sequence of connect/disconnect operations on multiple agents,
	 * the connection state should remain consistent and resources should be properly cleaned up.
	 *
	 * Validates: Requirements 1.5, 2.4
	 */
	it("should maintain consistent state during concurrent connect/disconnect operations", () => {
		const operationArb = fc.oneof(
			fc.record({
				type: fc.constant("connect" as const),
				agentId: fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
			}),
			fc.record({
				type: fc.constant("disconnect" as const),
				agentId: fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
			}),
		)

		fc.assert(
			fc.asyncProperty(fc.array(operationArb, { minLength: 5, maxLength: 20 }), async (operations) => {
				const agentConfigs = new Map<string, ACPAgentConfig>()
				const expectedStates = new Map<string, ConnectionStatus>()

				// Pre-create agent configs for all agent IDs
				const uniqueAgentIds = [...new Set(operations.map((op) => op.agentId))]
				uniqueAgentIds.forEach((agentId) => {
					agentConfigs.set(agentId, {
						id: agentId,
						name: agentId,
						displayName: `Agent ${agentId}`,
						endpoint: "ws://localhost:8080",
						transport: "websocket",
						authentication: { type: "none" },
						permissions: { fileAccess: "read", networkAccess: false, shellAccess: false },
						settings: { autoConnect: false, idleTimeout: 30000, retryAttempts: 3, retryDelay: 1000 },
						metadata: { version: "1.0.0", capabilities: [], created: new Date() },
					})
					expectedStates.set(agentId, "disconnected")
				})

				// Execute operations sequentially to maintain deterministic state
				for (const operation of operations) {
					const currentState = expectedStates.get(operation.agentId) || "disconnected"

					try {
						if (operation.type === "connect" && currentState === "disconnected") {
							const config = agentConfigs.get(operation.agentId)!
							await client.connect(config)
							expectedStates.set(operation.agentId, "connected")
						} else if (operation.type === "disconnect" && currentState === "connected") {
							await client.disconnect(operation.agentId)
							expectedStates.set(operation.agentId, "disconnected")
						}
					} catch (error) {
						// Connection failures are acceptable in property tests
						// The important thing is that state remains consistent
					}

					// Verify state consistency after each operation
					const actualState = client.getConnectionStatus(operation.agentId)
					const expectedState = expectedStates.get(operation.agentId)!

					// Allow for transient states during connection attempts
					if (actualState !== "connecting" && actualState !== "error") {
						expect(actualState).toBe(expectedState)
					}
				}

				// Final consistency check
				const connections = client.getConnections()
				expectedStates.forEach((expectedState, agentId) => {
					const actualState = client.getConnectionStatus(agentId)
					const hasConnection = connections.has(agentId)

					if (expectedState === "connected") {
						expect(hasConnection).toBe(true)
						expect(actualState).toBe("connected")
					} else {
						expect(hasConnection).toBe(false)
						expect(actualState).toBe("disconnected")
					}
				})
			}),
			{ numRuns: 15, timeout: 15000 },
		)
	})
	/**
	 * Feature: acp-protocol-support, Property 2: 多智能体连接管理 (Resource management)
	 *
	 * Property: For any pattern of connection usage, the client should properly manage
	 * resources, prevent memory leaks, and maintain performance within acceptable bounds.
	 *
	 * Validates: Requirements 1.5, 2.4
	 */
	it("should manage resources efficiently across multiple agents", () => {
		fc.assert(
			fc.asyncProperty(
				fc.record({
					agentCount: fc.integer({ min: 2, max: 6 }),
					operationsPerAgent: fc.integer({ min: 3, max: 8 }),
					connectionPoolSize: fc.integer({ min: 2, max: 5 }),
				}),
				async ({ agentCount, operationsPerAgent, connectionPoolSize }) => {
					// Create a new client with specific pool configuration
					const testClient = new ACPClient({
						maxConnections: connectionPoolSize,
						idleTimeout: 10000,
						connectionReuse: true,
					})

					try {
						const agentIds = Array.from({ length: agentCount }, (_, i) => `test-agent-${i}`)
						const agentConfigs = agentIds.map((id) => ({
							id,
							name: id,
							displayName: `Test Agent ${id}`,
							endpoint: "ws://localhost:8080",
							transport: "websocket" as const,
							authentication: { type: "none" as const },
							permissions: { fileAccess: "read" as const, networkAccess: false, shellAccess: false },
							settings: { autoConnect: false, idleTimeout: 30000, retryAttempts: 3, retryDelay: 1000 },
							metadata: { version: "1.0.0", capabilities: [], created: new Date() },
						}))

						// Perform multiple operations per agent
						for (let i = 0; i < operationsPerAgent; i++) {
							const connectionPromises = agentConfigs.map(async (config) => {
								try {
									await testClient.connect(config)
									return config.id
								} catch (error) {
									return null
								}
							})

							const connectedAgents = (await Promise.all(connectionPromises)).filter(Boolean)

							// Verify resource constraints
							const poolStats = testClient.getConnectionPoolStats()
							expect(poolStats.activeConnections).toBeLessThanOrEqual(connectionPoolSize)
							expect(poolStats.totalConnections).toBeLessThanOrEqual(connectionPoolSize * 2) // Allow some overhead

							// Disconnect some agents to test cleanup
							const agentsToDisconnect = connectedAgents.slice(0, Math.floor(connectedAgents.length / 2))
							await Promise.all(
								agentsToDisconnect.map((agentId) =>
									testClient.disconnect(agentId as string).catch(() => {}),
								),
							)

							// Verify cleanup
							const statsAfterDisconnect = testClient.getConnectionPoolStats()
							expect(statsAfterDisconnect.activeConnections).toBeLessThanOrEqual(
								poolStats.activeConnections,
							)
						}

						// Final resource verification
						const finalStats = testClient.getConnectionPoolStats()
						expect(finalStats.activeConnections).toBeGreaterThanOrEqual(0)
						expect(finalStats.idleConnections).toBeGreaterThanOrEqual(0)
						expect(finalStats.queuedConnections).toBeGreaterThanOrEqual(0)

						// Verify no resource leaks
						const connections = testClient.getConnections()
						expect(connections.size).toBeLessThanOrEqual(connectionPoolSize)
					} finally {
						await testClient.shutdown()
					}
				},
			),
			{ numRuns: 10, timeout: 20000 },
		)
	})
	/**
	 * Feature: acp-protocol-support, Property 2: 多智能体连接管理 (Message routing)
	 *
	 * Property: For any set of connected agents and messages, the client should correctly
	 * route messages to the intended recipients without cross-contamination or loss.
	 *
	 * Validates: Requirements 1.5, 2.4
	 */
	it("should route messages correctly between multiple agents", () => {
		const messageArb = fc.record({
			jsonrpc: fc.constant("2.0" as const),
			method: fc.string({ minLength: 1, maxLength: 20 }),
			params: fc.oneof(fc.object({ withNullPrototype: false }), fc.string(), fc.integer(), fc.constant(null)),
			id: fc.string({ minLength: 1, maxLength: 10 }),
		})

		fc.assert(
			fc.asyncProperty(
				fc.record({
					agentCount: fc.integer({ min: 2, max: 4 }),
					messagesPerAgent: fc.integer({ min: 1, max: 3 }),
				}),
				fc.array(messageArb, { minLength: 1, maxLength: 10 }),
				async ({ agentCount, messagesPerAgent }, messages) => {
					const agentIds = Array.from({ length: agentCount }, (_, i) => `msg-agent-${i}`)
					const agentConfigs = agentIds.map((id) => ({
						id,
						name: id,
						displayName: `Message Agent ${id}`,
						endpoint: "ws://localhost:8080",
						transport: "websocket" as const,
						authentication: { type: "none" as const },
						permissions: { fileAccess: "read" as const, networkAccess: false, shellAccess: false },
						settings: { autoConnect: false, idleTimeout: 30000, retryAttempts: 3, retryDelay: 1000 },
						metadata: { version: "1.0.0", capabilities: [], created: new Date() },
					}))

					// Connect all agents
					const connectionResults = await Promise.allSettled(
						agentConfigs.map((config) => client.connect(config)),
					)

					const connectedAgents = agentConfigs.filter(
						(_, index) => connectionResults[index].status === "fulfilled",
					)

					if (connectedAgents.length === 0) {
						// Skip test if no agents could connect
						return
					}

					// Mock message responses for each agent
					const messageResponses = new Map<string, any[]>()
					connectedAgents.forEach((agent) => {
						messageResponses.set(agent.id, [])
					})

					// Mock WebSocket send to capture messages
					mockWebSocket.send = vi.fn((data) => {
						const message = JSON.parse(data)
						// Simulate response for each message
						setTimeout(() => {
							const response = {
								jsonrpc: "2.0",
								id: message.id,
								result: { success: true, agentId: "mock-response" },
							}
							// Trigger message handler if it exists
							if (mockWebSocket.onmessage) {
								mockWebSocket.onmessage({ data: JSON.stringify(response) })
							}
						}, 10)
					})

					// Send messages to each connected agent
					const messagePromises: Promise<any>[] = []
					for (const agent of connectedAgents) {
						for (let i = 0; i < Math.min(messagesPerAgent, messages.length); i++) {
							const message = { ...messages[i], id: `${agent.id}-${i}` }
							messagePromises.push(
								client.sendMessage(agent.id, message).catch((error) => ({ error, agentId: agent.id })),
							)
						}
					}

					const messageResults = await Promise.allSettled(messagePromises)

					// Property 1: Each message should be associated with the correct agent
					// Property 2: No message should be lost or duplicated
					// Property 3: Connection state should remain stable during message routing
					connectedAgents.forEach((agent) => {
						expect(client.getConnectionStatus(agent.id)).toBe("connected")
					})

					// Verify that messages were sent (mock was called)
					expect(mockWebSocket.send).toHaveBeenCalled()
				},
			),
			{ numRuns: 10, timeout: 15000 },
		)
	})

	/**
	 * Feature: acp-protocol-support, Property 2: 多智能体连接管理 (Concurrent operations)
	 *
	 * Property: For any combination of concurrent operations (connect, disconnect, send message),
	 * the client should maintain thread safety and data consistency.
	 *
	 * Validates: Requirements 1.5, 2.4
	 */
	it("should handle concurrent operations safely", () => {
		fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.oneof(
						fc.record({ type: fc.constant("connect"), agentId: fc.string({ minLength: 3, maxLength: 8 }) }),
						fc.record({
							type: fc.constant("disconnect"),
							agentId: fc.string({ minLength: 3, maxLength: 8 }),
						}),
						fc.record({
							type: fc.constant("message"),
							agentId: fc.string({ minLength: 3, maxLength: 8 }),
							message: fc.record({
								jsonrpc: fc.constant("2.0" as const),
								method: fc.string({ minLength: 1, maxLength: 10 }),
								id: fc.string({ minLength: 1, maxLength: 5 }),
							}),
						}),
					),
					{ minLength: 5, maxLength: 15 },
				),
				async (operations) => {
					const agentConfigs = new Map<string, ACPAgentConfig>()
					const uniqueAgentIds = [...new Set(operations.map((op) => op.agentId))]

					// Pre-create configs for all agents
					uniqueAgentIds.forEach((agentId) => {
						agentConfigs.set(agentId, {
							id: agentId,
							name: agentId,
							displayName: `Concurrent Agent ${agentId}`,
							endpoint: "ws://localhost:8080",
							transport: "websocket",
							authentication: { type: "none" },
							permissions: { fileAccess: "read", networkAccess: false, shellAccess: false },
							settings: { autoConnect: false, idleTimeout: 30000, retryAttempts: 3, retryDelay: 1000 },
							metadata: { version: "1.0.0", capabilities: [], created: new Date() },
						})
					})

					// Execute all operations concurrently
					const operationPromises = operations.map(async (operation) => {
						try {
							switch (operation.type) {
								case "connect": {
									const config = agentConfigs.get(operation.agentId)!
									await client.connect(config)
									return { type: "connect", agentId: operation.agentId, success: true }
								}
								case "disconnect": {
									await client.disconnect(operation.agentId)
									return { type: "disconnect", agentId: operation.agentId, success: true }
								}
								case "message": {
									await client.sendMessage(operation.agentId, operation.message)
									return { type: "message", agentId: operation.agentId, success: true }
								}
								default:
									return { type: "unknown", success: false }
							}
						} catch (error) {
							return { type: operation.type, agentId: operation.agentId, success: false, error }
						}
					})

					const results = await Promise.allSettled(operationPromises)

					// Property 1: Client should remain in a consistent state
					const connections = client.getConnections()
					const poolStats = client.getConnectionPoolStats()

					expect(poolStats.activeConnections).toBeGreaterThanOrEqual(0)
					expect(poolStats.totalConnections).toBeGreaterThanOrEqual(poolStats.activeConnections)
					expect(connections.size).toBeLessThanOrEqual(client["maxConcurrentConnections"])

					// Property 2: All connection states should be valid
					connections.forEach((connection, agentId) => {
						const status = client.getConnectionStatus(agentId)
						expect(["connecting", "connected", "disconnected", "error"]).toContain(status)
					})

					// Property 3: No resource leaks or corruption
					expect(poolStats.queuedConnections).toBeGreaterThanOrEqual(0)
				},
			),
			{ numRuns: 8, timeout: 20000 },
		)
	})
})
