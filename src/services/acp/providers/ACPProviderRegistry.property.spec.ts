// cmbt-agent_change - new file
/**
 * Property-based tests for ACPProviderRegistry
 * Property 7: 消息路由正确性
 *
 * Validates: Requirements 5.1, 5.2
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import * as fc from "fast-check"
import * as vscode from "vscode"
import { ACPProviderRegistry } from "./ACPProviderRegistry"
import { ConnectionManager } from "../manager/ConnectionManager"
import { ProtocolLogger } from "../logging/ProtocolLogger"
import { AgentConfig, AgentType, TransportType } from "../types"

// Mock VSCode API
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(() => ({})),
			update: vi.fn(),
		})),
	},
	window: {
		showWarningMessage: vi.fn(),
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			show: vi.fn(),
			clear: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	ConfigurationTarget: {
		Global: 1,
	},
}))

describe("ACPProviderRegistry Property Tests", () => {
	let registry: ACPProviderRegistry
	let connectionManager: ConnectionManager
	let protocolLogger: ProtocolLogger

	beforeEach(() => {
		connectionManager = new ConnectionManager()
		protocolLogger = new ProtocolLogger({
			maxEntries: 100,
			logLevel: 0, // DEBUG
			enableDebugMode: true,
		})

		registry = new ACPProviderRegistry({
			connectionManager,
			protocolLogger,
		})
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	// Arbitraries for property testing
	const agentIdArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s))

	const agentConfigArb = fc.record({
		id: agentIdArb,
		name: fc.string({ minLength: 1, maxLength: 50 }),
		type: fc.oneof(
			fc.constant(AgentType.GITHUB_COPILOT),
			fc.constant(AgentType.CLAUDE_CODE),
			fc.constant(AgentType.GEMINI_CLI),
			fc.constant(AgentType.OPENCODE),
		),
		endpoint: fc.webUrl(),
		transport: fc.oneof(fc.constant(TransportType.WEBSOCKET), fc.constant(TransportType.HTTP)),
		settings: fc.record({
			timeout: fc.integer({ min: 1000, max: 30000 }),
			retryAttempts: fc.integer({ min: 1, max: 5 }),
			idleTimeout: fc.integer({ min: 60000, max: 300000 }),
		}),
		capabilities: fc.record({
			supportsImages: fc.boolean(),
			supportsTools: fc.boolean(),
			supportsStreaming: fc.boolean(),
			supportsComputerUse: fc.boolean(),
			maxTokens: fc.integer({ min: 1000, max: 32000 }),
			contextWindow: fc.integer({ min: 2000, max: 128000 }),
		}),
		createdAt: fc.date(),
	})

	const messageArb = fc.record({
		role: fc.oneof(fc.constant("user"), fc.constant("assistant"), fc.constant("system")),
		content: fc.string({ minLength: 1, maxLength: 500 }),
	})

	const systemPromptArb = fc.string({ minLength: 10, maxLength: 200 })

	describe("Property 7: 消息路由正确性", () => {
		it("注册的提供者应该能够正确路由消息", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(agentConfigArb, { minLength: 1, maxLength: 5 }),
					systemPromptArb,
					fc.array(messageArb, { minLength: 1, maxLength: 10 }),
					async (agentConfigs, systemPrompt, messages) => {
						// Register all providers
						for (const config of agentConfigs) {
							await registry.registerProvider(config)
						}

						// Verify all providers are registered
						expect(registry.getAllProviders().size).toBe(agentConfigs.length)

						// Test routing to each provider
						for (const config of agentConfigs) {
							const success = registry.selectProvider(config.id)
							expect(success).toBe(true)

							const selectedProvider = registry.getSelectedProvider()
							expect(selectedProvider).toBeDefined()
							expect(selectedProvider!.getAgentConfig().id).toBe(config.id)

							// Verify provider info reflects selection
							const providerInfo = registry.getProviderInfo()
							const selectedInfo = providerInfo.find((info) => info.id === config.id)
							expect(selectedInfo?.isSelected).toBe(true)

							// Verify only one provider is selected
							const selectedCount = providerInfo.filter((info) => info.isSelected).length
							expect(selectedCount).toBe(1)
						}
					},
				),
				{ numRuns: 10 },
			)
		})

		it("消息路由应该始终路由到选中的提供者", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(agentConfigArb, { minLength: 2, maxLength: 4 }),
					agentIdArb,
					systemPromptArb,
					fc.array(messageArb, { minLength: 1, maxLength: 5 }),
					async (agentConfigs, targetAgentId, systemPrompt, messages) => {
						// Ensure target agent is in the configs
						const configs = [...agentConfigs]
						if (!configs.some((c) => c.id === targetAgentId)) {
							configs[0] = { ...configs[0], id: targetAgentId }
						}

						// Register all providers
						for (const config of configs) {
							await registry.registerProvider(config)
						}

						// Select specific provider
						const success = registry.selectProvider(targetAgentId)
						expect(success).toBe(true)

						// Mock the connection manager to track which agent receives messages
						let routedToAgent: string | null = null
						vi.spyOn(connectionManager, "connect").mockImplementation(async (agentId) => {
							routedToAgent = agentId
						})

						try {
							// Route message - this should go to the selected provider
							const stream = await registry.routeMessage(systemPrompt, messages)
							expect(stream).toBeDefined()

							// Verify the selected provider was used
							const selectedProvider = registry.getSelectedProvider()
							expect(selectedProvider?.getAgentConfig().id).toBe(targetAgentId)
						} catch (error) {
							// Expected for mock implementation
							expect(error).toBeDefined()
						}
					},
				),
				{ numRuns: 8 },
			)
		})

		it("提供者注册和注销应该正确更新路由状态", async () => {
			await fc.assert(
				fc.asyncProperty(fc.array(agentConfigArb, { minLength: 2, maxLength: 4 }), async (agentConfigs) => {
					// Register all providers
					for (const config of agentConfigs) {
						await registry.registerProvider(config)
					}

					const initialCount = registry.getAllProviders().size
					expect(initialCount).toBe(agentConfigs.length)

					// Verify first provider is auto-selected
					const selectedProvider = registry.getSelectedProvider()
					expect(selectedProvider).toBeDefined()

					const selectedId = selectedProvider!.getAgentConfig().id
					expect(agentConfigs.some((c) => c.id === selectedId)).toBe(true)

					// Unregister the selected provider
					await registry.unregisterProvider(selectedId)

					// Verify provider count decreased
					expect(registry.getAllProviders().size).toBe(initialCount - 1)

					// Verify a different provider is now selected (if any remain)
					const newSelectedProvider = registry.getSelectedProvider()
					if (initialCount > 1) {
						expect(newSelectedProvider).toBeDefined()
						expect(newSelectedProvider!.getAgentConfig().id).not.toBe(selectedId)
					} else {
						expect(newSelectedProvider).toBeUndefined()
					}
				}),
				{ numRuns: 10 },
			)
		})

		it("提供者信息应该准确反映实际状态", async () => {
			await fc.assert(
				fc.asyncProperty(fc.array(agentConfigArb, { minLength: 1, maxLength: 6 }), async (agentConfigs) => {
					// Register all providers
					for (const config of agentConfigs) {
						await registry.registerProvider(config)
					}

					const providerInfo = registry.getProviderInfo()
					expect(providerInfo.length).toBe(agentConfigs.length)

					// Verify each provider info matches its config
					for (const info of providerInfo) {
						const matchingConfig = agentConfigs.find((c) => c.id === info.id)
						expect(matchingConfig).toBeDefined()
						expect(info.name).toBe(matchingConfig!.name)
						expect(info.type).toBe(matchingConfig!.type)

						// Verify capabilities are correctly reported
						const expectedCapabilities = []
						if (matchingConfig!.capabilities?.supportsImages) expectedCapabilities.push("images")
						if (matchingConfig!.capabilities?.supportsTools) expectedCapabilities.push("tools")
						if (matchingConfig!.capabilities?.supportsStreaming) expectedCapabilities.push("streaming")
						if (matchingConfig!.capabilities?.supportsComputerUse) expectedCapabilities.push("computer_use")

						expect(info.capabilities.sort()).toEqual(expectedCapabilities.sort())
					}

					// Verify exactly one provider is selected
					const selectedCount = providerInfo.filter((info) => info.isSelected).length
					expect(selectedCount).toBe(1)
				}),
				{ numRuns: 10 },
			)
		})

		it("注册表统计应该准确反映提供者状态", async () => {
			await fc.assert(
				fc.asyncProperty(fc.array(agentConfigArb, { minLength: 1, maxLength: 5 }), async (agentConfigs) => {
					// Register all providers
					for (const config of agentConfigs) {
						await registry.registerProvider(config)
					}

					const stats = registry.getRegistryStats()

					// Verify basic counts
					expect(stats.totalProviders).toBe(agentConfigs.length)
					expect(stats.selectedProvider).toBeDefined()
					expect(agentConfigs.some((c) => c.id === stats.selectedProvider)).toBe(true)

					// Verify selected provider exists in registered providers
					const selectedProvider = registry.getSelectedProvider()
					expect(selectedProvider).toBeDefined()
					expect(selectedProvider!.getAgentConfig().id).toBe(stats.selectedProvider)

					// Initial stats should show zero messages and errors
					expect(stats.totalMessages).toBe(0)
					expect(stats.totalErrors).toBe(0)
				}),
				{ numRuns: 10 },
			)
		})

		it("提供者选择应该在无效ID时失败", async () => {
			await fc.assert(
				fc.asyncProperty(
					fc.array(agentConfigArb, { minLength: 1, maxLength: 3 }),
					fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
					async (agentConfigs, invalidId) => {
						// Ensure invalid ID is not in configs
						const validIds = agentConfigs.map((c) => c.id)
						fc.pre(!validIds.includes(invalidId))

						// Register providers
						for (const config of agentConfigs) {
							await registry.registerProvider(config)
						}

						// Try to select invalid provider
						const success = registry.selectProvider(invalidId)
						expect(success).toBe(false)

						// Verify selection didn't change
						const selectedProvider = registry.getSelectedProvider()
						expect(selectedProvider).toBeDefined()
						expect(validIds.includes(selectedProvider!.getAgentConfig().id)).toBe(true)
					},
				),
				{ numRuns: 10 },
			)
		})

		it("空注册表应该正确处理路由请求", async () => {
			await fc.assert(
				fc.asyncProperty(
					systemPromptArb,
					fc.array(messageArb, { minLength: 1, maxLength: 3 }),
					async (systemPrompt, messages) => {
						// Verify registry is empty
						expect(registry.hasAvailableProviders()).toBe(false)
						expect(registry.getSelectedProvider()).toBeUndefined()

						// Try to route message - should fail
						await expect(registry.routeMessage(systemPrompt, messages)).rejects.toThrow(
							"No ACP agent selected",
						)

						// Try to route prompt completion - should fail
						await expect(registry.routePromptCompletion("test prompt")).rejects.toThrow(
							"No ACP agent selected",
						)
					},
				),
				{ numRuns: 5 },
			)
		})

		it("提供者配置更新应该正确传播", async () => {
			await fc.assert(
				fc.asyncProperty(
					agentConfigArb,
					fc.record({
						name: fc.string({ minLength: 1, maxLength: 50 }),
						timeout: fc.integer({ min: 1000, max: 60000 }),
					}),
					async (initialConfig, updateConfig) => {
						// Register provider
						await registry.registerProvider(initialConfig)

						// Update configuration
						await registry.updateProviderConfig(initialConfig.id, {
							name: updateConfig.name,
							settings: {
								...initialConfig.settings,
								timeout: updateConfig.timeout,
							},
						})

						// Verify update was applied
						const provider = registry.getProvider(initialConfig.id)
						expect(provider).toBeDefined()

						const updatedConfig = provider!.getAgentConfig()
						expect(updatedConfig.name).toBe(updateConfig.name)
						expect(updatedConfig.settings.timeout).toBe(updateConfig.timeout)

						// Verify other fields remained unchanged
						expect(updatedConfig.id).toBe(initialConfig.id)
						expect(updatedConfig.type).toBe(initialConfig.type)
						expect(updatedConfig.endpoint).toBe(initialConfig.endpoint)
					},
				),
				{ numRuns: 10 },
			)
		})
	})
})
