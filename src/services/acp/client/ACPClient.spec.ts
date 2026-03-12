// cmbt-agent_change - new file
/**
 * Tests for ACPClient class
 *
 * This file contains unit tests and property-based tests for the ACP client
 * implementation, covering connection management, message handling, and error scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ACPClient } from "./ACPClient"
import { ACPAgentConfig, ACPMessage, ACPResponse, ConnectionStatus, ConnectionPoolConfig } from "../types"
import { ACPConnectionError, ACPProtocolError, ACPAuthenticationError, ACPTimeoutError } from "../errors"

// Mock WebSocket
const mockWebSocket = {
	OPEN: 1,
	CLOSED: 3,
	readyState: 1,
	send: vi.fn(),
	close: vi.fn(),
	on: vi.fn(),
	addEventListener: vi.fn(),
}

vi.mock("ws", () => ({
	default: vi.fn(() => mockWebSocket),
}))

// Mock fetch for HTTP transport
global.fetch = vi.fn()

describe("ACPClient", () => {
	let client: ACPClient
	let mockConfig: ACPAgentConfig

	// Helper function to setup WebSocket mocking for successful connections
	const setupSuccessfulWebSocketMock = (agentId: string = "test-agent") => {
		mockWebSocket.on = vi.fn((event, callback) => {
			if (event === "open") {
				setTimeout(callback, 0)
			}
		})

		mockWebSocket.send = vi.fn((data, callback) => {
			// Mock successful send
			if (callback) callback()

			// Parse the message to get the ID and method
			const message = JSON.parse(data)

			// Simulate appropriate responses based on method
			setTimeout(() => {
				let response
				if (message.method === "initialize") {
					response = {
						jsonrpc: "2.0",
						id: message.id,
						result: {
							capabilities: ["initialize", "authenticate"],
						},
					}
				} else if (message.method === "authenticate") {
					response = {
						jsonrpc: "2.0",
						id: message.id,
						result: {
							authenticated: true,
						},
					}
				} else {
					// Default response for other messages
					response = {
						jsonrpc: "2.0",
						id: message.id,
						result: { success: true },
					}
				}
				client.emit(`response-${agentId}`, response)
			}, 0)
		})
	}

	beforeEach(() => {
		client = new ACPClient()
		mockConfig = {
			id: "test-agent",
			name: "test-agent",
			displayName: "Test Agent",
			description: "Test ACP agent",
			endpoint: "ws://localhost:8080",
			transport: "websocket",
			authentication: {
				type: "none",
			},
			permissions: {
				fileAccess: "read",
				networkAccess: false,
				shellAccess: false,
			},
			settings: {
				autoConnect: false,
				idleTimeout: 300000,
				retryAttempts: 3,
				retryDelay: 1000,
			},
			metadata: {
				version: "1.0.0",
				capabilities: ["test"],
				created: new Date(),
			},
		}

		// Reset mocks
		vi.clearAllMocks()
		mockWebSocket.readyState = 1
	})

	afterEach(async () => {
		await client.shutdown()
	})

	describe("Connection Management", () => {
		it("should establish WebSocket connection successfully", async () => {
			setupSuccessfulWebSocketMock()
			await client.connect(mockConfig)
			expect(client.getConnectionStatus("test-agent")).toBe("connected")
		})

		it("should handle connection timeout", async () => {
			// Mock WebSocket that never opens
			mockWebSocket.on = vi.fn((event, callback) => {
				// Don't call the open callback to simulate timeout
			})

			await expect(client.connect(mockConfig)).rejects.toThrow(ACPTimeoutError)
		})

		it("should handle WebSocket connection error", async () => {
			const error = new Error("Connection refused")
			mockWebSocket.on = vi.fn((event, callback) => {
				if (event === "error") {
					setTimeout(() => callback(error), 0)
				}
			})

			await expect(client.connect(mockConfig)).rejects.toThrow(ACPConnectionError)
		})

		it("should disconnect successfully", async () => {
			// First connect
			setupSuccessfulWebSocketMock()
			await client.connect(mockConfig)

			// Then disconnect
			await client.disconnect("test-agent")

			expect(client.getConnectionStatus("test-agent")).toBe("disconnected")
			expect(mockWebSocket.close).toHaveBeenCalled()
		})

		it("should throw error when disconnecting non-existent agent", async () => {
			await expect(client.disconnect("non-existent")).rejects.toThrow(ACPConnectionError)
		})
	})

	describe("Message Handling", () => {
		beforeEach(async () => {
			// Set up connected client
			setupSuccessfulWebSocketMock()
			await client.connect(mockConfig)
		})

		it("should send message successfully", async () => {
			const message: ACPMessage = {
				jsonrpc: "2.0",
				method: "test",
				params: { data: "test" },
			}

			const response = await client.sendMessage("test-agent", message)

			expect(mockWebSocket.send).toHaveBeenCalled()
			expect(response.result).toEqual({ success: true })
		})

		it("should handle message send error", async () => {
			const message: ACPMessage = {
				jsonrpc: "2.0",
				method: "test",
				params: { data: "test" },
			}

			const error = new Error("Send failed")
			mockWebSocket.send = vi.fn((data, callback) => {
				if (callback) callback(error)
			})

			await expect(client.sendMessage("test-agent", message)).rejects.toThrow(ACPConnectionError)
		})

		it("should handle message timeout", async () => {
			const message: ACPMessage = {
				jsonrpc: "2.0",
				method: "test",
				params: { data: "test" },
			}

			mockWebSocket.send = vi.fn((data, callback) => {
				if (callback) callback()
				// Don't emit response to simulate timeout
			})

			await expect(client.sendMessage("test-agent", message)).rejects.toThrow(ACPTimeoutError)
		}, 35000) // Increase timeout for this test

		it("should throw error when sending to disconnected agent", async () => {
			const message: ACPMessage = {
				jsonrpc: "2.0",
				method: "test",
				params: { data: "test" },
			}

			await client.disconnect("test-agent")

			await expect(client.sendMessage("test-agent", message)).rejects.toThrow(ACPConnectionError)
		})
	})

	describe("HTTP Transport", () => {
		beforeEach(() => {
			mockConfig.transport = "http"
			mockConfig.endpoint = "http://localhost:8080"
		})

		it("should establish HTTP connection successfully", async () => {
			// Mock successful HTTP responses
			;(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ success: true }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve({
							jsonrpc: "2.0",
							id: expect.any(String),
							result: { capabilities: ["initialize", "authenticate"] },
						}),
				})

			await client.connect(mockConfig)

			expect(client.getConnectionStatus("test-agent")).toBe("connected")
			expect(global.fetch).toHaveBeenCalledTimes(2) // Ping + handshake
		})

		it("should handle HTTP connection error", async () => {
			;(global.fetch as any).mockRejectedValue(new Error("Network error"))

			await expect(client.connect(mockConfig)).rejects.toThrow(ACPConnectionError)
		})

		it("should send HTTP message successfully", async () => {
			// Set up connection
			;(global.fetch as any)
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ success: true }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve({
							jsonrpc: "2.0",
							id: expect.any(String),
							result: { capabilities: ["initialize", "authenticate"] },
						}),
				})

			await client.connect(mockConfig)

			// Mock message response
			const expectedResponse = {
				jsonrpc: "2.0",
				id: expect.any(String),
				result: { success: true },
			}

			;(global.fetch as any).mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(expectedResponse),
			})

			const message: ACPMessage = {
				jsonrpc: "2.0",
				method: "test",
				params: { data: "test" },
			}

			const response = await client.sendMessage("test-agent", message)

			expect(response.result).toEqual({ success: true })
		})
	})

	describe("Authentication", () => {
		beforeEach(() => {
			mockConfig.authentication = {
				type: "token",
				credentials: {
					token: "test-token",
				},
			}
		})

		it("should authenticate with token successfully", async () => {
			setupSuccessfulWebSocketMock()
			await client.connect(mockConfig)
			expect(client.getConnectionStatus("test-agent")).toBe("connected")
		})

		it("should handle authentication failure", async () => {
			mockWebSocket.on = vi.fn((event, callback) => {
				if (event === "open") {
					setTimeout(callback, 0)
				}
			})

			mockWebSocket.send = vi.fn((data, callback) => {
				if (callback) callback()

				const message = JSON.parse(data)
				setTimeout(() => {
					let response
					if (message.method === "initialize") {
						response = {
							jsonrpc: "2.0",
							id: message.id,
							result: { capabilities: ["initialize", "authenticate"] },
						}
					} else if (message.method === "authenticate") {
						// Auth error response
						response = {
							jsonrpc: "2.0",
							id: message.id,
							error: {
								code: -32000,
								message: "Invalid token",
							},
						}
					}
					client.emit("response-test-agent", response)
				}, 0)
			})

			await expect(client.connect(mockConfig)).rejects.toThrow(ACPAuthenticationError)
		})
	})

	describe("Event Handling", () => {
		it("should emit connection events", async () => {
			const connectSpy = vi.fn()
			const disconnectSpy = vi.fn()

			client.on("acp-event", (event) => {
				if (event.type === "agent-connected") {
					connectSpy(event)
				} else if (event.type === "agent-disconnected") {
					disconnectSpy(event)
				}
			})

			// Mock connection
			setupSuccessfulWebSocketMock()
			await client.connect(mockConfig)
			await client.disconnect("test-agent")

			expect(connectSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "agent-connected",
					agentId: "test-agent",
				}),
			)

			expect(disconnectSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "agent-disconnected",
					agentId: "test-agent",
				}),
			)
		})

		it("should handle message subscriptions", async () => {
			const messageHandler = vi.fn()

			client.subscribe("test-agent", messageHandler)

			const testMessage: ACPMessage = {
				jsonrpc: "2.0",
				method: "notification",
				params: { data: "test" },
			}

			// Simulate incoming message
			client["handleIncomingMessage"]("test-agent", testMessage)

			expect(messageHandler).toHaveBeenCalledWith(testMessage)
		})

		it("should handle status change subscriptions", async () => {
			const statusHandler = vi.fn()

			client.onStatusChange("test-agent", statusHandler)

			// Simulate status change
			client["updateConnectionStatus"]("test-agent", "connecting")

			expect(statusHandler).toHaveBeenCalledWith("test-agent", "connecting")
		})
	})

	describe("Error Handling", () => {
		it("should handle protocol errors gracefully", async () => {
			const errorHandler = vi.fn()
			client.on("error", errorHandler)

			// Simulate invalid message
			const invalidData = "invalid json"

			expect(() => {
				client["deserializeMessage"](invalidData)
			}).toThrow(ACPProtocolError)
		})

		it("should validate JSON-RPC format", () => {
			const invalidMessage = {
				jsonrpc: "1.0", // Wrong version
				method: "test",
			}

			expect(() => {
				client["deserializeMessage"](JSON.stringify(invalidMessage))
			}).toThrow(ACPProtocolError)
		})

		it("should handle server capability validation", () => {
			const insufficientCapabilities = ["initialize"] // Missing "authenticate"

			expect(() => {
				client["validateServerCapabilities"]("test-agent", insufficientCapabilities)
			}).toThrow(ACPProtocolError)
		})
	})

	describe("Cleanup and Shutdown", () => {
		it("should cleanup connections on shutdown", async () => {
			// Connect multiple agents
			const configs = [
				{ ...mockConfig, id: "agent1", name: "agent1" },
				{ ...mockConfig, id: "agent2", name: "agent2" },
			]

			// Setup mocks for both agents
			setupSuccessfulWebSocketMock("agent1")
			setupSuccessfulWebSocketMock("agent2")

			await Promise.all(configs.map((config) => client.connect(config)))

			expect(client.getConnections().size).toBe(2)

			await client.shutdown()

			expect(client.getConnections().size).toBe(0)
		})

		it("should handle cleanup errors gracefully", async () => {
			// Connect agent
			setupSuccessfulWebSocketMock()
			await client.connect(mockConfig)

			// Mock disconnect error
			mockWebSocket.close = vi.fn(() => {
				throw new Error("Close failed")
			})

			// Should not throw
			await expect(client.shutdown()).resolves.toBeUndefined()
		})
	})

	// cmbt-agent_change start - Add concurrent connection tests
	describe("Concurrent Connection Management", () => {
		let poolConfig: ConnectionPoolConfig

		beforeEach(() => {
			poolConfig = {
				maxConnections: 3,
				idleTimeout: 60000,
				connectionReuse: true,
			}
			client = new ACPClient(poolConfig)
		})

		it("should support multiple concurrent connections", async () => {
			const configs = [
				{ ...mockConfig, id: "agent1", name: "agent1" },
				{ ...mockConfig, id: "agent2", name: "agent2" },
				{ ...mockConfig, id: "agent3", name: "agent3" },
			]

			// Setup mocks for all agents
			configs.forEach((config) => {
				setupSuccessfulWebSocketMock(config.id)
			})

			// Connect all agents concurrently
			await Promise.all(configs.map((config) => client.connect(config)))

			// Verify all connections are active
			expect(client.getConnections().size).toBe(3)
			configs.forEach((config) => {
				expect(client.getConnectionStatus(config.id)).toBe("connected")
			})

			// Check connection pool stats
			const stats = client.getConnectionPoolStats()
			expect(stats.activeConnections).toBe(3)
			expect(stats.maxConnections).toBe(3)
		})

		it("should enforce connection limits", async () => {
			const configs = [
				{ ...mockConfig, id: "agent1", name: "agent1" },
				{ ...mockConfig, id: "agent2", name: "agent2" },
				{ ...mockConfig, id: "agent3", name: "agent3" },
				{ ...mockConfig, id: "agent4", name: "agent4" }, // This should fail
			]

			// Setup mocks for first 3 agents
			configs.slice(0, 3).forEach((config) => {
				setupSuccessfulWebSocketMock(config.id)
			})

			// Connect first 3 agents
			await Promise.all(configs.slice(0, 3).map((config) => client.connect(config)))

			// Fourth connection should fail due to limit
			await expect(client.connect(configs[3])).rejects.toThrow("已达到最大连接数限制")
		})

		it("should handle concurrent connection attempts to same agent", async () => {
			setupSuccessfulWebSocketMock()

			// Attempt multiple concurrent connections to same agent
			const connectionPromises = [
				client.connect(mockConfig),
				client.connect(mockConfig),
				client.connect(mockConfig),
			]

			// All should resolve successfully (second and third should return early)
			await Promise.all(connectionPromises)

			// Should only have one connection
			expect(client.getConnections().size).toBe(1)
			expect(client.getConnectionStatus("test-agent")).toBe("connected")
		})

		it("should track connection metrics", async () => {
			setupSuccessfulWebSocketMock()
			await client.connect(mockConfig)

			// Send a message to generate metrics
			const message: ACPMessage = {
				jsonrpc: "2.0",
				method: "test",
				params: { data: "test" },
			}

			await client.sendMessage("test-agent", message)

			// Check metrics
			const stats = client.getConnectionPoolStats()
			const metrics = stats.connectionMetrics.get("test-agent")

			expect(metrics).toBeDefined()
			expect(metrics!.messageCount).toBeGreaterThan(0)
			expect(metrics!.lastActivity).toBeInstanceOf(Date)
		})

		it("should update pool configuration", () => {
			const newConfig: Partial<ConnectionPoolConfig> = {
				maxConnections: 5,
				idleTimeout: 120000,
			}

			client.updatePoolConfig(newConfig)

			const stats = client.getConnectionPoolStats()
			expect(stats.maxConnections).toBe(5)
		})

		it("should cleanup idle connections", async () => {
			// Use short idle timeout for testing
			const shortTimeoutConfig: ConnectionPoolConfig = {
				maxConnections: 3,
				idleTimeout: 100, // 100ms
				connectionReuse: true,
			}

			client = new ACPClient(shortTimeoutConfig)
			setupSuccessfulWebSocketMock()

			await client.connect(mockConfig)
			expect(client.getConnectionStatus("test-agent")).toBe("connected")

			// Wait for idle timeout
			await new Promise((resolve) => setTimeout(resolve, 150))

			// Trigger cleanup manually (normally done by interval)
			await client["cleanupIdleConnections"]()

			// Connection should be disconnected due to idle timeout
			expect(client.getConnectionStatus("test-agent")).toBe("disconnected")
		})
		// cmbt-agent_change end
	})
})
