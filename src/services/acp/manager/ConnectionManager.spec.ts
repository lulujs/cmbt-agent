// cmbt-agent_change - new file
/**
 * Unit tests for ConnectionManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ConnectionManager } from "./ConnectionManager"
import { ACPClient } from "../client/ACPClient"
import { ACPAgentConfig } from "../types"

// Mock ACPClient
vi.mock("../client/ACPClient")

describe("ConnectionManager", () => {
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

	describe("Agent Configuration Management", () => {
		const validConfig: ACPAgentConfig = {
			id: "test-agent",
			name: "Test Agent",
			displayName: "Test Agent Display",
			description: "Test agent for unit tests",
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

		it("should add valid agent configuration", async () => {
			await connectionManager.addAgentConfig(validConfig)

			const retrieved = connectionManager.getAgentConfig("test-agent")
			expect(retrieved).toEqual(validConfig)
		})

		it("should reject invalid agent configuration", async () => {
			const invalidConfig = { ...validConfig, id: "" }

			await expect(connectionManager.addAgentConfig(invalidConfig)).rejects.toThrow("Invalid agent configuration")
		})

		it("should update existing agent configuration", async () => {
			await connectionManager.addAgentConfig(validConfig)

			const updates = { displayName: "Updated Display Name" }
			await connectionManager.updateAgentConfig("test-agent", updates)

			const updated = connectionManager.getAgentConfig("test-agent")
			expect(updated?.displayName).toBe("Updated Display Name")
		})

		it("should remove agent configuration", async () => {
			await connectionManager.addAgentConfig(validConfig)
			await connectionManager.removeAgentConfig("test-agent")

			const retrieved = connectionManager.getAgentConfig("test-agent")
			expect(retrieved).toBeUndefined()
		})

		it("should get all agent configurations", async () => {
			await connectionManager.addAgentConfig(validConfig)
			await connectionManager.addAgentConfig({
				...validConfig,
				id: "test-agent-2",
				name: "Test Agent 2",
			})

			const allConfigs = connectionManager.getAllAgentConfigs()
			expect(allConfigs).toHaveLength(2)
		})
	})

	describe("Connection Management", () => {
		const validConfig: ACPAgentConfig = {
			id: "test-agent",
			name: "Test Agent",
			displayName: "Test Agent Display",
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
				capabilities: [],
				created: new Date(),
			},
		}

		beforeEach(async () => {
			await connectionManager.addAgentConfig(validConfig)
		})

		it("should connect to agent", async () => {
			mockClient.connect.mockResolvedValue(undefined)

			await connectionManager.connectAgent("test-agent")

			expect(mockClient.connect).toHaveBeenCalledWith(validConfig)
		})

		it("should disconnect from agent", async () => {
			mockClient.disconnect.mockResolvedValue(undefined)

			await connectionManager.disconnectAgent("test-agent")

			expect(mockClient.disconnect).toHaveBeenCalledWith("test-agent")
		})

		it("should get connection status", () => {
			mockClient.getConnectionStatus.mockReturnValue("connected")

			const status = connectionManager.getConnectionStatus("test-agent")

			expect(status).toBe("connected")
			expect(mockClient.getConnectionStatus).toHaveBeenCalledWith("test-agent")
		})

		it("should handle connection errors", async () => {
			mockClient.connect.mockRejectedValue(new Error("Connection failed"))

			await expect(connectionManager.connectAgent("test-agent")).rejects.toThrow(
				"Failed to connect to agent test-agent",
			)
		})
	})

	describe("Configuration Validation", () => {
		it("should validate valid configuration", () => {
			const validConfig: ACPAgentConfig = {
				id: "valid-agent",
				name: "Valid Agent",
				displayName: "Valid Agent Display",
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
					capabilities: [],
					created: new Date(),
				},
			}

			const result = connectionManager.validateAgentConfig(validConfig)
			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it("should reject configuration with invalid ID", () => {
			const invalidConfig = {
				id: "Invalid_ID!",
				name: "Test",
				displayName: "Test",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: { fileAccess: "read", networkAccess: false, shellAccess: false },
				settings: { autoConnect: false, idleTimeout: 30000, retryAttempts: 3, retryDelay: 1000 },
				metadata: { version: "1.0.0", capabilities: [], created: new Date() },
			} as ACPAgentConfig

			const result = connectionManager.validateAgentConfig(invalidConfig)
			expect(result.valid).toBe(false)
			expect(result.errors).toContain("Agent ID must contain only lowercase letters, numbers, and hyphens")
		})

		it("should validate connection parameters", async () => {
			const result = await connectionManager.validateConnection("ws://localhost:8080", "websocket")
			expect(result.valid).toBe(true)
		})

		it("should reject invalid connection parameters", async () => {
			const result = await connectionManager.validateConnection("invalid-url", "websocket")
			expect(result.valid).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)
		})
	})

	describe("Connection Lifecycle Management", () => {
		const validConfig: ACPAgentConfig = {
			id: "test-agent",
			name: "Test Agent",
			displayName: "Test Agent Display",
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
				capabilities: [],
				created: new Date(),
			},
		}

		beforeEach(async () => {
			await connectionManager.addAgentConfig(validConfig)
		})

		it("should restart agent connection", async () => {
			mockClient.connect.mockResolvedValue(undefined)
			mockClient.disconnect.mockResolvedValue(undefined)
			mockClient.getConnectionStatus.mockReturnValue("connected")

			await connectionManager.restartAgent("test-agent")

			expect(mockClient.disconnect).toHaveBeenCalledWith("test-agent")
			expect(mockClient.connect).toHaveBeenCalledWith(validConfig)
		})

		it("should handle restart when agent is not connected", async () => {
			mockClient.connect.mockResolvedValue(undefined)
			mockClient.getConnectionStatus.mockReturnValue("disconnected")

			await connectionManager.restartAgent("test-agent")

			expect(mockClient.disconnect).not.toHaveBeenCalled()
			expect(mockClient.connect).toHaveBeenCalledWith(validConfig)
		})

		it("should get idle connections", () => {
			const idleConnections = connectionManager.getIdleConnections()
			expect(Array.isArray(idleConnections)).toBe(true)
		})

		it("should get lifecycle statistics", () => {
			const stats = connectionManager.getLifecycleStats()
			expect(stats).toHaveProperty("totalAgents")
			expect(stats).toHaveProperty("connectedAgents")
			expect(stats).toHaveProperty("idleAgents")
			expect(stats).toHaveProperty("errorAgents")
			expect(stats).toHaveProperty("averageIdleTime")
			expect(stats.totalAgents).toBe(1)
		})

		it("should check shutdown status", () => {
			expect(connectionManager.isShuttingDownStatus()).toBe(false)
		})

		it("should handle graceful shutdown", async () => {
			mockClient.getConnectionStatus.mockReturnValue("connected")
			mockClient.disconnect.mockResolvedValue(undefined)
			mockClient.shutdown.mockResolvedValue(undefined)

			await connectionManager.shutdown()

			expect(mockClient.shutdown).toHaveBeenCalled()
			expect(connectionManager.isShuttingDownStatus()).toBe(true)
		})

		it("should disconnect idle connections", async () => {
			mockClient.getConnectionStatus.mockReturnValue("connected")
			mockClient.disconnect.mockResolvedValue(undefined)

			await connectionManager.disconnectIdleConnections()

			// Should not disconnect since we haven't simulated idle time
			expect(mockClient.disconnect).not.toHaveBeenCalled()
		})
	})
})
