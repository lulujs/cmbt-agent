// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import * as vscode from "vscode"
import { ConfigurationStorage } from "./ConfigurationStorage"
import { SecurityManager } from "../security/SecurityManager"
import { ACPAgentConfig, ACPTransportType } from "../types"

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

/**
 * Property 3: 配置持久化往返 (Configuration Persistence Round-trip)
 *
 * This property test validates that:
 * 1. Any valid configuration can be saved and loaded back identically
 * 2. Encryption/decryption is transparent to the user
 * 3. Configuration validation is consistent
 * 4. Import/export operations preserve data integrity
 *
 * Validates Requirements: 2.1, 2.3, 10.1, 10.2, 10.3
 */
describe("Property Test: Configuration Persistence Round-trip", () => {
	let storage: ConfigurationStorage
	let mockContext: vscode.ExtensionContext
	let mockConfig: any
	let mockSecurityManager: SecurityManager
	let savedConfigs: Record<string, any> = {}

	// Arbitraries for generating test data
	const transportArb = fc.constantFrom("websocket", "http") as fc.Arbitrary<ACPTransportType>

	const permissionsArb = fc.record({
		fileAccess: fc.record({
			read: fc.boolean(),
			write: fc.boolean(),
			execute: fc.boolean(),
		}),
		networkAccess: fc.boolean(),
	})

	const agentConfigArb = fc.record({
		id: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
		name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
		endpoint: fc.webUrl(),
		transport: transportArb,
		timeout: fc.integer({ min: 1000, max: 300000 }),
		retryAttempts: fc.integer({ min: 0, max: 10 }),
		retryDelay: fc.integer({ min: 100, max: 60000 }),
		permissions: permissionsArb,
		enabled: fc.boolean(),
		apiKey: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
	}) as fc.Arbitrary<ACPAgentConfig>

	beforeEach(() => {
		savedConfigs = {}

		mockConfig = {
			get: vi.fn().mockImplementation(() => savedConfigs),
			update: vi.fn().mockImplementation((key: string, value: any) => {
				savedConfigs = value
				return Promise.resolve()
			}),
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
			encrypt: vi.fn().mockImplementation((data: string) => Promise.resolve(`encrypted_${data}`)),
			decrypt: vi.fn().mockImplementation((data: string) => {
				if (data.startsWith("encrypted_")) {
					return Promise.resolve(data.substring(10))
				}
				return Promise.resolve(data)
			}),
		} as any

		vi.mocked(SecurityManager).mockImplementation(() => mockSecurityManager)

		storage = new ConfigurationStorage(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("Property: Save-Load Round-trip Preserves Data", async () => {
		await fc.assert(
			fc.asyncProperty(agentConfigArb, async (originalConfig) => {
				// Save the configuration
				await storage.saveAgentConfig(originalConfig)

				// Load it back
				const loadedConfig = await storage.loadAgentConfig(originalConfig.id)

				// Should be identical
				expect(loadedConfig).toEqual(originalConfig)
			}),
			{ numRuns: 20 }, // Reduced for faster execution
		)
	})

	it("Property: Multiple Configs Can Be Saved and Loaded", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(agentConfigArb, { minLength: 1, maxLength: 5 }).map((configs) => {
					// Ensure unique IDs
					return configs.map((config, index) => ({
						...config,
						id: `${config.id}_${index}`,
					}))
				}),
				async (originalConfigs) => {
					// Save all configurations
					for (const config of originalConfigs) {
						await storage.saveAgentConfig(config)
					}

					// Load all configurations
					const loadedConfigs = await storage.loadAllConfigs()

					// Should have same number of configs
					expect(loadedConfigs).toHaveLength(originalConfigs.length)

					// Each original config should be found in loaded configs
					for (const originalConfig of originalConfigs) {
						const loadedConfig = loadedConfigs.find((c) => c.id === originalConfig.id)
						expect(loadedConfig).toEqual(originalConfig)
					}
				},
			),
			{ numRuns: 15 }, // Reduced for faster execution
		)
	})

	it("Property: Export-Import Round-trip Preserves Data", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(agentConfigArb, { minLength: 1, maxLength: 3 }).map((configs) => {
					// Ensure unique IDs
					return configs.map((config, index) => ({
						...config,
						id: `export_test_${index}`,
					}))
				}),
				async (originalConfigs) => {
					// Save all configurations
					for (const config of originalConfigs) {
						await storage.saveAgentConfig(config)
					}

					// Export configurations
					const exportedData = await storage.exportConfigs()

					// Clear storage
					savedConfigs = {}

					// Import configurations
					await storage.importConfigs(exportedData)

					// Load all configurations
					const importedConfigs = await storage.loadAllConfigs()

					// Should match original configurations
					expect(importedConfigs).toHaveLength(originalConfigs.length)

					for (const originalConfig of originalConfigs) {
						const importedConfig = importedConfigs.find((c) => c.id === originalConfig.id)
						expect(importedConfig).toEqual(originalConfig)
					}
				},
			),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Update Operations Preserve Other Configs", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.tuple(
					fc.array(agentConfigArb, { minLength: 2, maxLength: 4 }).map((configs) => {
						return configs.map((config, index) => ({
							...config,
							id: `update_test_${index}`,
						}))
					}),
					fc.integer({ min: 0, max: 3 }),
					fc.record({
						name: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
						timeout: fc.option(fc.integer({ min: 1000, max: 300000 })),
						enabled: fc.option(fc.boolean()),
					}),
				),
				async ([originalConfigs, updateIndex, updates]) => {
					if (updateIndex >= originalConfigs.length) return

					// Save all configurations
					for (const config of originalConfigs) {
						await storage.saveAgentConfig(config)
					}

					// Update one configuration
					const configToUpdate = originalConfigs[updateIndex]
					await storage.updateAgentConfig(configToUpdate.id, updates)

					// Load all configurations
					const loadedConfigs = await storage.loadAllConfigs()

					// Should still have same number of configs
					expect(loadedConfigs).toHaveLength(originalConfigs.length)

					// Check that other configs are unchanged
					for (let i = 0; i < originalConfigs.length; i++) {
						const loadedConfig = loadedConfigs.find((c) => c.id === originalConfigs[i].id)
						expect(loadedConfig).toBeDefined()

						if (i === updateIndex) {
							// Updated config should have changes applied
							const expectedConfig = { ...originalConfigs[i], ...updates }
							expect(loadedConfig).toEqual(expectedConfig)
						} else {
							// Other configs should be unchanged
							expect(loadedConfig).toEqual(originalConfigs[i])
						}
					}
				},
			),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Delete Operations Remove Only Target Config", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.tuple(
					fc.array(agentConfigArb, { minLength: 2, maxLength: 4 }).map((configs) => {
						return configs.map((config, index) => ({
							...config,
							id: `delete_test_${index}`,
						}))
					}),
					fc.integer({ min: 0, max: 3 }),
				),
				async ([originalConfigs, deleteIndex]) => {
					if (deleteIndex >= originalConfigs.length) return

					// Save all configurations
					for (const config of originalConfigs) {
						await storage.saveAgentConfig(config)
					}

					// Delete one configuration
					const configToDelete = originalConfigs[deleteIndex]
					await storage.deleteAgentConfig(configToDelete.id)

					// Load all configurations
					const loadedConfigs = await storage.loadAllConfigs()

					// Should have one less config
					expect(loadedConfigs).toHaveLength(originalConfigs.length - 1)

					// Deleted config should not be found
					const deletedConfig = loadedConfigs.find((c) => c.id === configToDelete.id)
					expect(deletedConfig).toBeUndefined()

					// Other configs should still exist and be unchanged
					for (let i = 0; i < originalConfigs.length; i++) {
						if (i === deleteIndex) continue

						const loadedConfig = loadedConfigs.find((c) => c.id === originalConfigs[i].id)
						expect(loadedConfig).toEqual(originalConfigs[i])
					}
				},
			),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Encryption is Transparent to Users", async () => {
		await fc.assert(
			fc.asyncProperty(
				agentConfigArb.filter((config) => config.apiKey !== undefined),
				async (originalConfig) => {
					// Save configuration with sensitive data
					await storage.saveAgentConfig(originalConfig)

					// Verify that sensitive data was encrypted in storage
					const rawStoredConfig = savedConfigs[originalConfig.id]
					expect(rawStoredConfig.apiKey).toBe(`encrypted_${originalConfig.apiKey}`)

					// But when loaded, it should be decrypted transparently
					const loadedConfig = await storage.loadAgentConfig(originalConfig.id)
					expect(loadedConfig?.apiKey).toBe(originalConfig.apiKey)
				},
			),
			{ numRuns: 15 }, // Reduced for faster execution
		)
	})

	it("Property: Default Config Merging Works Correctly", async () => {
		const defaultConfig = storage.getDefaultConfig()

		await fc.assert(
			fc.asyncProperty(
				fc.record({
					id: fc.string({ minLength: 1, maxLength: 50 }),
					name: fc.string({ minLength: 1, maxLength: 100 }),
					endpoint: fc.webUrl(),
				}),
				async (minimalConfig) => {
					// Create config with only required fields
					const configWithDefaults = { ...defaultConfig, ...minimalConfig }

					// Should be valid and saveable
					await expect(storage.saveAgentConfig(configWithDefaults as ACPAgentConfig)).resolves.not.toThrow()

					// Should load back with all default values
					const loadedConfig = await storage.loadAgentConfig(minimalConfig.id)
					expect(loadedConfig).toEqual(configWithDefaults)
				},
			),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Validation is Consistent", async () => {
		// Test that validation rules are consistently applied
		const invalidConfigs = [
			{ id: "", name: "Test", endpoint: "http://test.com", transport: "websocket" as ACPTransportType },
			{ id: "test", name: "", endpoint: "http://test.com", transport: "websocket" as ACPTransportType },
			{ id: "test", name: "Test", endpoint: "", transport: "websocket" as ACPTransportType },
			{ id: "test", name: "Test", endpoint: "http://test.com", transport: "invalid" as any },
			{
				id: "test",
				name: "Test",
				endpoint: "http://test.com",
				transport: "websocket" as ACPTransportType,
				timeout: -1,
			},
			{
				id: "test",
				name: "Test",
				endpoint: "http://test.com",
				transport: "websocket" as ACPTransportType,
				retryAttempts: -1,
			},
		]

		for (const invalidConfig of invalidConfigs) {
			await expect(storage.saveAgentConfig(invalidConfig as ACPAgentConfig)).rejects.toThrow()
		}
	})
})
