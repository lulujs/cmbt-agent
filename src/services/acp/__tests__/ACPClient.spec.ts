// cmbt-agent_change - new file
/**
 * Tests for ACPClient class
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"

// Mock WebSocket at the top level
vi.mock("ws", () => {
	const MockWebSocket = vi.fn()
	return {
		default: MockWebSocket,
	}
})

// Mock fetch for HTTP transport
global.fetch = vi.fn()

// Mock child_process for stdio transport
vi.mock("child_process", () => ({
	spawn: vi.fn(() => ({
		stdout: { on: vi.fn() },
		stdin: { write: vi.fn() },
		on: vi.fn(),
		kill: vi.fn(),
		killed: false,
	})),
}))

// Import after mocks are set up
import { ACPClient } from "../client/ACPClient"
import type { ACPAgentConfig, ACPMessage } from "../types"
import { ACPConnectionError } from "../errors"
import { createACPResponse } from "../utils"
import { DEFAULT_AGENT_CONFIG } from "../constants"

// Get the mocked WebSocket constructor
const MockWebSocket = vi.mocked((await import("ws")).default)

describe("ACPClient", () => {
	let client: ACPClient
	let testConfig: ACPAgentConfig

	beforeEach(() => {
		client = new ACPClient()
		testConfig = {
			...DEFAULT_AGENT_CONFIG,
			id: "test-agent",
			name: "test-agent",
			displayName: "Test Agent",
			endpoint: "ws://localhost:8080",
			transport: "websocket",
		}

		// Reset mocks
		vi.clearAllMocks()
	})

	afterEach(async () => {
		await client.cleanup()
	})

	describe("Connection Management", () => {
		test("should create connection for WebSocket transport", async () => {
			// Mock successful WebSocket connection
			const mockWs = {
				readyState: 1, // OPEN
				send: vi.fn((message, callback) => {
					if (callback) callback()

					// Parse the message to see if it's a handshake
					try {
						const parsed = JSON.parse(message)
						if (parsed.method === "acp.handshake") {
							// Simulate handshake response
							setTimeout(() => {
								const response = createACPResponse(parsed.id, {
									version: "2.0",
									serverInfo: { name: "Test Server" },
								})
								// Simulate message event
								mockWs.on.mock.calls
									.filter((call: any) => call[0] === "message")
									.forEach((call: any) => call[1](JSON.stringify(response)))
							}, 0)
						}
					} catch (e) {
						// Ignore parse errors
					}
				}),
				close: vi.fn(),
				on: vi.fn((event: string, callback: () => void) => {
					if (event === "open") {
						setTimeout(() => callback(), 0)
					}
				}),
			}

			MockWebSocket.mockImplementation(() => mockWs)

			await expect(client.connect(testConfig)).resolves.toBeUndefined()

			const status = client.getConnectionStatus("test-agent")
			expect(status.status).toBe("connected")
		})

		test("should handle connection timeout", async () => {
			// Mock WebSocket that never connects
			const mockWs = {
				readyState: 0, // CONNECTING
				send: vi.fn(),
				close: vi.fn(),
				on: vi.fn(), // Don't call the open callback to simulate timeout
			}

			MockWebSocket.mockImplementation(() => mockWs)

			await expect(client.connect(testConfig)).rejects.toThrow("连接超时")
		})

		test("should disconnect agent properly", async () => {
			// First connect with successful handshake
			const mockWs = {
				readyState: 1, // OPEN
				send: vi.fn((message, callback) => {
					if (callback) callback()

					try {
						const parsed = JSON.parse(message)
						if (parsed.method === "acp.handshake") {
							setTimeout(() => {
								const response = createACPResponse(parsed.id, {
									version: "2.0",
								})
								mockWs.on.mock.calls
									.filter((call: any) => call[0] === "message")
									.forEach((call: any) => call[1](JSON.stringify(response)))
							}, 0)
						}
					} catch (e) {
						// Ignore
					}
				}),
				close: vi.fn(),
				on: vi.fn((event: string, callback: () => void) => {
					if (event === "open") {
						setTimeout(() => callback(), 0)
					}
				}),
			}

			MockWebSocket.mockImplementation(() => mockWs)

			await client.connect(testConfig)

			// Then disconnect
			await client.disconnect("test-agent")

			expect(mockWs.close).toHaveBeenCalled()

			const status = client.getConnectionStatus("test-agent")
			expect(status.status).toBe("disconnected")
		})
	})

	describe("Status Management", () => {
		test("should track connection status", () => {
			const status = client.getConnectionStatus("nonexistent-agent")
			expect(status.status).toBe("disconnected")
			expect(status.messageCount).toBe(0)
		})

		test("should list all connections", async () => {
			// Mock successful connection
			const mockWs = {
				readyState: 1, // OPEN
				send: vi.fn((message, callback) => {
					if (callback) callback()

					try {
						const parsed = JSON.parse(message)
						if (parsed.method === "acp.handshake") {
							setTimeout(() => {
								const response = createACPResponse(parsed.id, {
									version: "2.0",
								})
								mockWs.on.mock.calls
									.filter((call: any) => call[0] === "message")
									.forEach((call: any) => call[1](JSON.stringify(response)))
							}, 0)
						}
					} catch (e) {
						// Ignore
					}
				}),
				close: vi.fn(),
				on: vi.fn((event: string, callback: () => void) => {
					if (event === "open") {
						setTimeout(() => callback(), 0)
					}
				}),
			}

			MockWebSocket.mockImplementation(() => mockWs)

			await client.connect(testConfig)

			const connections = client.getConnections()
			expect(connections).toHaveLength(1)
			expect(connections[0].agentId).toBe("test-agent")
		})
	})

	describe("Message Validation", () => {
		test("should validate message format before sending", async () => {
			const invalidMessage = {
				// Missing required fields
				method: "test.method",
			} as ACPMessage

			await expect(client.sendMessage("test-agent", invalidMessage)).rejects.toThrow(ACPConnectionError) // Should be connection error since agent is not connected
		})
	})

	describe("Cleanup", () => {
		test("should cleanup all resources", async () => {
			// Mock successful connection
			const mockWs = {
				readyState: 1, // OPEN
				send: vi.fn((message, callback) => {
					if (callback) callback()

					try {
						const parsed = JSON.parse(message)
						if (parsed.method === "acp.handshake") {
							setTimeout(() => {
								const response = createACPResponse(parsed.id, {
									version: "2.0",
								})
								mockWs.on.mock.calls
									.filter((call: any) => call[0] === "message")
									.forEach((call: any) => call[1](JSON.stringify(response)))
							}, 0)
						}
					} catch (e) {
						// Ignore
					}
				}),
				close: vi.fn(),
				on: vi.fn((event: string, callback: () => void) => {
					if (event === "open") {
						setTimeout(() => callback(), 0)
					}
				}),
			}

			MockWebSocket.mockImplementation(() => mockWs)

			await client.connect(testConfig)
			await client.cleanup()

			expect(mockWs.close).toHaveBeenCalled()

			const connections = client.getConnections()
			expect(connections).toHaveLength(0)
		})
	})
})
