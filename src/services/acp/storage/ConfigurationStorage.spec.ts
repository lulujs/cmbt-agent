// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { ConfigurationStorage } from "./ConfigurationStorage"
import { SecurityManager } from "../security/SecurityManager"
import { ACPAgentConfig, ACPTransportType } from "../types"
import { ACPError, ACPErrorCode } from "../errors"

// Mock VSCode API
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
	},
	ConfigurationTarget: {
		Global: 1,
	},
}))

// Mock SecurityManager
vi.mock("../security/SecurityManager")

describe("ConfigurationStorage", () => {
	let storage: ConfigurationStorage
	let mockContext: vscode.ExtensionContext
	let mockConfig: any
	let mockSecurityManager: SecurityManager

	const sampleConfig: ACPAgentConfig = {
		id: "test-agent",
		name: "Test Agent",
		endpoint: "ws://localhost:8080",
		transport: "websocket" as ACPTransportType,
		timeout: 30000,
		retryAttempts: 3,
		retryDelay: 1000,
		permissions: {
			fileAccess: { read: true, write: false, execute: false },
			networkAccess: true,
		},
		enabled: true,
		apiKey: "secret-key-123",
	}

	beforeEach(() => {
		mockConfig = {
			get: vi.fn(),
			update: vi.fn(),
		}

		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig)

		mockContext = {
			secrets: {
				store: vi.fn(),
				get: vi.fn(),
				delete: vi.fn(),
			},
		} as any

		mockSecurityManager = {
			encrypt: vi.fn(),
			decrypt: vi.fn(),
		} as any

		vi.mocked(SecurityManager).mockImplementation(() => mockSecurityManager)

		storage = new ConfigurationStorage(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("saveAgentConfig", () => {
		it("should save valid configuration with encryption", async () => {
			mockConfig.get.mockReturnValue({})
			mockSecurityManager.encrypt.mockResolvedValue("encrypted-key")

			await storage.saveAgentConfig(sampleConfig)

			expect(mockSecurityManager.encrypt).toHaveBeenCalledWith("secret-key-123")
			expect(mockConfig.update).toHaveBeenCalledWith(
				"acpAgents",
				expect.objectContaining({
					"test-agent": expect.objectContaining({
						id: "test-agent",
						apiKey: "encrypted-key",
					}),
				}),
				vscode.ConfigurationTarget.Global,
			)
		})

		it("should throw validation error for invalid config", async () => {
			const invalidConfig = { ...sampleConfig, id: "" }

			await expect(storage.saveAgentConfig(invalidConfig)).rejects.toThrow(ACPError)
		})

		it("should handle encryption errors", async () => {
			mockConfig.get.mockReturnValue({})
			mockSecurityManager.encrypt.mockRejectedValue(new Error("Encryption failed"))

			await expect(storage.saveAgentConfig(sampleConfig)).rejects.toThrow(ACPError)
		})
	})

	describe("loadAgentConfig", () => {
		it("should load and decrypt configuration", async () => {
			const encryptedConfig = { ...sampleConfig, apiKey: "encrypted-key" }
			mockConfig.get.mockReturnValue({ "test-agent": encryptedConfig })
			mockSecurityManager.decrypt.mockResolvedValue("secret-key-123")

			const result = await storage.loadAgentConfig("test-agent")

			expect(mockSecurityManager.decrypt).toHaveBeenCalledWith("encrypted-key")
			expect(result).toEqual(sampleConfig)
		})

		it("should return null for non-existent config", async () => {
			mockConfig.get.mockReturnValue({})

			const result = await storage.loadAgentConfig("non-existent")

			expect(result).toBeNull()
		})

		it("should handle decryption errors gracefully", async () => {
			const encryptedConfig = { ...sampleConfig, apiKey: "encrypted-key" }
			mockConfig.get.mockReturnValue({ "test-agent": encryptedConfig })
			mockSecurityManager.decrypt.mockRejectedValue(new Error("Decryption failed"))

			await expect(storage.loadAgentConfig("test-agent")).rejects.toThrow(ACPError)
		})
	})

	describe("loadAllConfigs", () => {
		it("should load all configurations with decryption", async () => {
			const configs = {
				agent1: { ...sampleConfig, id: "agent1", apiKey: "encrypted1" },
				agent2: { ...sampleConfig, id: "agent2", apiKey: "encrypted2" },
			}
			mockConfig.get.mockReturnValue(configs)
			mockSecurityManager.decrypt.mockResolvedValueOnce("key1").mockResolvedValueOnce("key2")

			const result = await storage.loadAllConfigs()

			expect(result).toHaveLength(2)
			expect(result[0].apiKey).toBe("key1")
			expect(result[1].apiKey).toBe("key2")
		})

		it("should skip configs with decryption errors", async () => {
			const configs = {
				agent1: { ...sampleConfig, id: "agent1", apiKey: "encrypted1" },
				agent2: { ...sampleConfig, id: "agent2", apiKey: "encrypted2" },
			}
			mockConfig.get.mockReturnValue(configs)
			mockSecurityManager.decrypt
				.mockResolvedValueOnce("key1")
				.mockRejectedValueOnce(new Error("Decryption failed"))

			const result = await storage.loadAllConfigs()

			expect(result).toHaveLength(1)
			expect(result[0].id).toBe("agent1")
		})
	})

	describe("deleteAgentConfig", () => {
		it("should delete configuration", async () => {
			const configs = { "test-agent": sampleConfig, "other-agent": sampleConfig }
			mockConfig.get.mockReturnValue(configs)

			await storage.deleteAgentConfig("test-agent")

			expect(mockConfig.update).toHaveBeenCalledWith(
				"acpAgents",
				{ "other-agent": sampleConfig },
				vscode.ConfigurationTarget.Global,
			)
		})
	})

	describe("updateAgentConfig", () => {
		it("should update existing configuration", async () => {
			mockConfig.get.mockReturnValue({ "test-agent": sampleConfig })
			mockSecurityManager.decrypt.mockResolvedValue("secret-key-123")
			mockSecurityManager.encrypt.mockResolvedValue("encrypted-updated-key")

			const updates = { name: "Updated Agent", apiKey: "updated-key" }
			await storage.updateAgentConfig("test-agent", updates)

			expect(mockSecurityManager.encrypt).toHaveBeenCalledWith("updated-key")
			expect(mockConfig.update).toHaveBeenCalled()
		})

		it("should throw error for non-existent config", async () => {
			mockConfig.get.mockReturnValue({})

			await expect(storage.updateAgentConfig("non-existent", {})).rejects.toThrow(ACPError)
		})
	})

	describe("exportConfigs", () => {
		it("should export configurations as JSON", async () => {
			const configs = [sampleConfig]
			mockConfig.get.mockReturnValue({ "test-agent": sampleConfig })
			mockSecurityManager.decrypt.mockResolvedValue("secret-key-123")

			const result = await storage.exportConfigs()

			expect(JSON.parse(result)).toEqual(configs)
		})
	})

	describe("importConfigs", () => {
		it("should import valid configurations", async () => {
			const configData = JSON.stringify([sampleConfig])
			mockConfig.get.mockReturnValue({})
			mockSecurityManager.encrypt.mockResolvedValue("encrypted-key")

			await storage.importConfigs(configData)

			expect(mockConfig.update).toHaveBeenCalled()
		})

		it("should throw error for invalid JSON", async () => {
			await expect(storage.importConfigs("invalid json")).rejects.toThrow(ACPError)
		})

		it("should throw error for invalid configuration format", async () => {
			const invalidData = JSON.stringify({ not: "array" })

			await expect(storage.importConfigs(invalidData)).rejects.toThrow(ACPError)
		})
	})

	describe("getDefaultConfig", () => {
		it("should return default configuration", () => {
			const defaultConfig = storage.getDefaultConfig()

			expect(defaultConfig).toEqual({
				transport: "websocket",
				timeout: 30000,
				retryAttempts: 3,
				retryDelay: 1000,
				permissions: {
					fileAccess: { read: false, write: false, execute: false },
					networkAccess: false,
				},
				enabled: true,
			})
		})
	})

	describe("validation", () => {
		it("should validate required fields", async () => {
			const invalidConfigs = [
				{ ...sampleConfig, id: "" },
				{ ...sampleConfig, name: "" },
				{ ...sampleConfig, endpoint: "" },
				{ ...sampleConfig, transport: "invalid" as any },
				{ ...sampleConfig, timeout: -1 },
				{ ...sampleConfig, retryAttempts: -1 },
			]

			for (const config of invalidConfigs) {
				await expect(storage.saveAgentConfig(config)).rejects.toThrow(ACPError)
			}
		})
	})
})
