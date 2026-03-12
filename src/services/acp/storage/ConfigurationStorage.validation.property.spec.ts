// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import * as vscode from "vscode"
import { ConfigurationStorage } from "./ConfigurationStorage"
import { SecurityManager } from "../security/SecurityManager"
import { ACPAgentConfig, ACPTransportType } from "../types"
import { ACPError } from "../errors"

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
 * Property 4: 连接参数验证 (Connection Parameter Validation)
 *
 * This property test validates that:
 * 1. All valid configurations are accepted
 * 2. All invalid configurations are rejected with appropriate errors
 * 3. Validation rules are consistently applied
 * 4. Edge cases in validation are handled correctly
 *
 * Validates Requirements: 2.2
 */
describe("Property Test: Connection Parameter Validation", () => {
	let storage: ConfigurationStorage
	let mockContext: vscode.ExtensionContext
	let mockConfig: any
	let mockSecurityManager: SecurityManager

	// Arbitraries for generating test data
	const validTransportArb = fc.constantFrom("websocket", "http") as fc.Arbitrary<ACPTransportType>
	const invalidTransportArb = fc.constantFrom("invalid", "tcp", "udp", "") as fc.Arbitrary<string>

	const validStringArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)
	const invalidStringArb = fc.constantFrom("", "   ", "\t", "\n")

	const validUrlArb = fc.webUrl()
	const invalidUrlArb = fc.constantFrom("", "not-a-url", "ftp://invalid", "just-text")

	const validTimeoutArb = fc.integer({ min: 1000, max: 300000 })
	const invalidTimeoutArb = fc.constantFrom(0, -1, -1000, 999)

	const validRetryArb = fc.integer({ min: 0, max: 10 })
	const invalidRetryArb = fc.constantFrom(-1, -5, 100)

	const validPermissionsArb = fc.record({
		fileAccess: fc.record({
			read: fc.boolean(),
			write: fc.boolean(),
			execute: fc.boolean(),
		}),
		networkAccess: fc.boolean(),
	})

	const validConfigArb = fc.record({
		id: validStringArb,
		name: validStringArb,
		endpoint: validUrlArb,
		transport: validTransportArb,
		timeout: fc.option(validTimeoutArb),
		retryAttempts: fc.option(validRetryArb),
		retryDelay: fc.option(validTimeoutArb),
		permissions: fc.option(validPermissionsArb),
		enabled: fc.option(fc.boolean()),
		apiKey: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
	}) as fc.Arbitrary<ACPAgentConfig>

	beforeEach(() => {
		mockConfig = {
			get: vi.fn().mockReturnValue({}),
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
			encrypt: vi.fn().mockResolvedValue("encrypted-data"),
			decrypt: vi.fn().mockResolvedValue("decrypted-data"),
		} as any

		vi.mocked(SecurityManager).mockImplementation(() => mockSecurityManager)

		storage = new ConfigurationStorage(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("Property: All Valid Configurations Are Accepted", async () => {
		await fc.assert(
			fc.asyncProperty(validConfigArb, async (config) => {
				// Valid configurations should not throw errors
				await expect(storage.saveAgentConfig(config)).resolves.not.toThrow()
			}),
			{ numRuns: 20 }, // Reduced for faster execution
		)
	})

	it("Property: Invalid IDs Are Rejected", async () => {
		await fc.assert(
			fc.asyncProperty(fc.tuple(validConfigArb, invalidStringArb), async ([baseConfig, invalidId]) => {
				const invalidConfig = { ...baseConfig, id: invalidId }

				await expect(storage.saveAgentConfig(invalidConfig)).rejects.toThrow(ACPError)
			}),
			{ numRuns: 15 }, // Reduced for faster execution
		)
	})

	it("Property: Invalid Names Are Rejected", async () => {
		await fc.assert(
			fc.asyncProperty(fc.tuple(validConfigArb, invalidStringArb), async ([baseConfig, invalidName]) => {
				const invalidConfig = { ...baseConfig, name: invalidName }

				await expect(storage.saveAgentConfig(invalidConfig)).rejects.toThrow(ACPError)
			}),
			{ numRuns: 15 }, // Reduced for faster execution
		)
	})

	it("Property: Invalid Endpoints Are Rejected", async () => {
		await fc.assert(
			fc.asyncProperty(fc.tuple(validConfigArb, invalidUrlArb), async ([baseConfig, invalidEndpoint]) => {
				const invalidConfig = { ...baseConfig, endpoint: invalidEndpoint }

				await expect(storage.saveAgentConfig(invalidConfig)).rejects.toThrow(ACPError)
			}),
			{ numRuns: 15 }, // Reduced for faster execution
		)
	})

	it("Property: Invalid Transport Types Are Rejected", async () => {
		await fc.assert(
			fc.asyncProperty(fc.tuple(validConfigArb, invalidTransportArb), async ([baseConfig, invalidTransport]) => {
				const invalidConfig = { ...baseConfig, transport: invalidTransport as any }

				await expect(storage.saveAgentConfig(invalidConfig)).rejects.toThrow(ACPError)
			}),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Invalid Timeouts Are Rejected", async () => {
		await fc.assert(
			fc.asyncProperty(fc.tuple(validConfigArb, invalidTimeoutArb), async ([baseConfig, invalidTimeout]) => {
				const invalidConfig = { ...baseConfig, timeout: invalidTimeout }

				await expect(storage.saveAgentConfig(invalidConfig)).rejects.toThrow(ACPError)
			}),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Invalid Retry Attempts Are Rejected", async () => {
		await fc.assert(
			fc.asyncProperty(fc.tuple(validConfigArb, invalidRetryArb), async ([baseConfig, invalidRetry]) => {
				const invalidConfig = { ...baseConfig, retryAttempts: invalidRetry }

				await expect(storage.saveAgentConfig(invalidConfig)).rejects.toThrow(ACPError)
			}),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Validation Error Messages Are Descriptive", async () => {
		const testCases = [
			{
				config: {
					id: "",
					name: "Test",
					endpoint: "http://test.com",
					transport: "websocket" as ACPTransportType,
				},
				expectedError: "Agent ID",
			},
			{
				config: {
					id: "test",
					name: "",
					endpoint: "http://test.com",
					transport: "websocket" as ACPTransportType,
				},
				expectedError: "Agent name",
			},
			{
				config: { id: "test", name: "Test", endpoint: "", transport: "websocket" as ACPTransportType },
				expectedError: "Endpoint",
			},
			{
				config: { id: "test", name: "Test", endpoint: "http://test.com", transport: "invalid" as any },
				expectedError: "Transport",
			},
			{
				config: {
					id: "test",
					name: "Test",
					endpoint: "http://test.com",
					transport: "websocket" as ACPTransportType,
					timeout: -1,
				},
				expectedError: "Timeout",
			},
			{
				config: {
					id: "test",
					name: "Test",
					endpoint: "http://test.com",
					transport: "websocket" as ACPTransportType,
					retryAttempts: -1,
				},
				expectedError: "Retry attempts",
			},
		]

		for (const { config, expectedError } of testCases) {
			try {
				await storage.saveAgentConfig(config as ACPAgentConfig)
				expect.fail(`Expected validation error for ${expectedError}`)
			} catch (error) {
				expect(error).toBeInstanceOf(ACPError)
				expect((error as ACPError).message).toContain(expectedError)
			}
		}
	})

	it("Property: Validation Is Consistent Across Operations", async () => {
		await fc.assert(
			fc.asyncProperty(validConfigArb, async (validConfig) => {
				// Save valid config first
				await storage.saveAgentConfig(validConfig)

				// Test that invalid updates are rejected
				const invalidUpdates = [
					{ name: "" },
					{ endpoint: "" },
					{ transport: "invalid" as any },
					{ timeout: -1 },
					{ retryAttempts: -1 },
				]

				for (const invalidUpdate of invalidUpdates) {
					await expect(storage.updateAgentConfig(validConfig.id, invalidUpdate)).rejects.toThrow(ACPError)
				}
			}),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Partial Validation Works for Updates", async () => {
		await fc.assert(
			fc.asyncProperty(validConfigArb, async (baseConfig) => {
				// Save base config
				await storage.saveAgentConfig(baseConfig)

				// Valid partial updates should work
				const validUpdates = [
					{ name: "Updated Name" },
					{ timeout: 60000 },
					{ retryAttempts: 5 },
					{ enabled: !baseConfig.enabled },
				]

				for (const validUpdate of validUpdates) {
					await expect(storage.updateAgentConfig(baseConfig.id, validUpdate)).resolves.not.toThrow()
				}
			}),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Required Fields Cannot Be Removed", async () => {
		await fc.assert(
			fc.asyncProperty(validConfigArb, async (baseConfig) => {
				// Save base config
				await storage.saveAgentConfig(baseConfig)

				// Trying to set required fields to invalid values should fail
				const invalidUpdates = [
					{ id: "" }, // ID cannot be empty
					{ name: "" }, // Name cannot be empty
					{ endpoint: "" }, // Endpoint cannot be empty
				]

				for (const invalidUpdate of invalidUpdates) {
					await expect(storage.updateAgentConfig(baseConfig.id, invalidUpdate)).rejects.toThrow(ACPError)
				}
			}),
			{ numRuns: 10 }, // Reduced for faster execution
		)
	})

	it("Property: Type Safety Is Enforced", async () => {
		const baseConfig: ACPAgentConfig = {
			id: "test",
			name: "Test Agent",
			endpoint: "http://test.com",
			transport: "websocket",
			timeout: 30000,
			retryAttempts: 3,
			retryDelay: 1000,
			permissions: {
				fileAccess: { read: true, write: false, execute: false },
				networkAccess: true,
			},
			enabled: true,
		}

		// Test type validation for different fields
		const typeInvalidUpdates = [
			{ timeout: "not-a-number" as any },
			{ retryAttempts: "not-a-number" as any },
			{ enabled: "not-a-boolean" as any },
			{ transport: 123 as any },
		]

		await storage.saveAgentConfig(baseConfig)

		for (const invalidUpdate of typeInvalidUpdates) {
			await expect(storage.updateAgentConfig(baseConfig.id, invalidUpdate)).rejects.toThrow(ACPError)
		}
	})

	it("Property: Default Values Are Applied Correctly", async () => {
		const defaultConfig = storage.getDefaultConfig()

		// Test that default values are reasonable and valid
		expect(defaultConfig.transport).toBe("websocket")
		expect(defaultConfig.timeout).toBeGreaterThan(0)
		expect(defaultConfig.retryAttempts).toBeGreaterThanOrEqual(0)
		expect(defaultConfig.retryDelay).toBeGreaterThan(0)
		expect(defaultConfig.permissions).toBeDefined()
		expect(defaultConfig.enabled).toBe(true)

		// Test that a minimal config with defaults is valid
		const minimalConfig = {
			...defaultConfig,
			id: "minimal-test",
			name: "Minimal Test",
			endpoint: "http://test.com",
		}

		await expect(storage.saveAgentConfig(minimalConfig as ACPAgentConfig)).resolves.not.toThrow()
	})

	it("Property: Boundary Values Are Handled Correctly", async () => {
		const baseConfig: ACPAgentConfig = {
			id: "boundary-test",
			name: "Boundary Test",
			endpoint: "http://test.com",
			transport: "websocket",
			timeout: 30000,
			retryAttempts: 3,
			retryDelay: 1000,
			permissions: {
				fileAccess: { read: true, write: false, execute: false },
				networkAccess: true,
			},
			enabled: true,
		}

		// Test boundary values
		const boundaryTests = [
			{ timeout: 1000 }, // Minimum valid timeout
			{ timeout: 300000 }, // Maximum reasonable timeout
			{ retryAttempts: 0 }, // Minimum retry attempts
			{ retryAttempts: 10 }, // Maximum reasonable retry attempts
			{ retryDelay: 100 }, // Minimum delay
		]

		for (const boundaryTest of boundaryTests) {
			const testConfig = { ...baseConfig, ...boundaryTest }
			await expect(storage.saveAgentConfig(testConfig)).resolves.not.toThrow()
		}

		// Test invalid boundary values
		const invalidBoundaryTests = [
			{ timeout: 999 }, // Below minimum
			{ retryAttempts: -1 }, // Below minimum
			{ retryDelay: 0 }, // Invalid delay
		]

		await storage.saveAgentConfig(baseConfig)

		for (const invalidTest of invalidBoundaryTests) {
			await expect(storage.updateAgentConfig(baseConfig.id, invalidTest)).rejects.toThrow(ACPError)
		}
	})
})
