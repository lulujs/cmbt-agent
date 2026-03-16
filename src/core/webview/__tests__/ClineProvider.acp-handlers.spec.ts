// cmbt-agent_change - new file
import { describe, it, expect, vi } from "vitest"
import { AcpProviderBridge } from "../../../services/acp/AcpProviderBridge"
import type { ProviderSettings } from "@roo-code/types"

/**
 * Tests for the ACP handler integration logic used in ClineProvider.
 * These test the bridge interactions that handleSelectAcpAgent and handleSendAcpMessage rely on.
 */
describe("ClineProvider ACP handler integration", () => {
	describe("handleSelectAcpAgent - capability parsing and preference application", () => {
		it("should parse capabilities from initialize result and apply preferences", async () => {
			const bridge = new AcpProviderBridge()
			const initResult = {
				agentInfo: { name: "test-agent", version: "1.0.0" },
				agentCapabilities: {
					supportedProviders: ["anthropic", "openai"],
					preferredProvider: "my-profile",
					preferredMode: "code",
				},
			}

			const capabilities = bridge.parseAgentCapabilities(initResult.agentCapabilities)

			expect(capabilities.supportedProviders).toEqual(["anthropic", "openai"])
			expect(capabilities.preferredProvider).toBe("my-profile")
			expect(capabilities.preferredMode).toBe("code")

			const mockProvider = { setProviderProfile: vi.fn().mockResolvedValue(undefined) }
			await bridge.applyAgentPreferences(capabilities, mockProvider)

			expect(mockProvider.setProviderProfile).toHaveBeenCalledWith("my-profile")
		})

		it("should not apply preferences when agent has no preferred settings", async () => {
			const bridge = new AcpProviderBridge()
			const initResult = {
				agentInfo: { name: "test-agent", version: "1.0.0" },
				agentCapabilities: {
					supportedProviders: ["anthropic"],
				},
			}

			const capabilities = bridge.parseAgentCapabilities(initResult.agentCapabilities)
			const mockProvider = { setProviderProfile: vi.fn() }

			if (capabilities.preferredProvider || capabilities.preferredMode) {
				await bridge.applyAgentPreferences(capabilities, mockProvider)
			}

			expect(mockProvider.setProviderProfile).not.toHaveBeenCalled()
		})

		it("should handle empty agentCapabilities gracefully", async () => {
			const bridge = new AcpProviderBridge()
			const capabilities = bridge.parseAgentCapabilities({})

			expect(capabilities).toEqual({})

			const mockProvider = { setProviderProfile: vi.fn() }
			if (capabilities.preferredProvider || capabilities.preferredMode) {
				await bridge.applyAgentPreferences(capabilities, mockProvider)
			}

			expect(mockProvider.setProviderProfile).not.toHaveBeenCalled()
		})
	})

	describe("handleSendAcpMessage - provider context extraction for session creation", () => {
		it("should extract provider context from state for session creation", () => {
			const bridge = new AcpProviderBridge()
			const state = {
				apiConfiguration: {
					apiProvider: "anthropic",
					apiModelId: "claude-3-opus",
				} as ProviderSettings,
				mode: "code",
				customModes: [],
			}

			const providerContext = bridge.extractProviderContext(state.apiConfiguration, state.mode, state.customModes)

			expect(providerContext.apiProvider).toBe("anthropic")
			expect(providerContext.apiModelId).toBe("claude-3-opus")
			expect(providerContext.mode).toBe("code")
		})

		it("should handle missing apiConfiguration fields", () => {
			const bridge = new AcpProviderBridge()
			const state = {
				apiConfiguration: {} as ProviderSettings,
				mode: undefined,
				customModes: [],
			}

			const providerContext = bridge.extractProviderContext(state.apiConfiguration, state.mode, state.customModes)

			expect(providerContext.apiProvider).toBeUndefined()
			expect(providerContext.apiModelId).toBeUndefined()
			expect(providerContext.mode).toBeUndefined()
		})
	})
})
