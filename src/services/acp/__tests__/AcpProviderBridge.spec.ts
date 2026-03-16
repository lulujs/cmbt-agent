// cmbt-agent_change - new file
import { describe, it, expect, vi } from "vitest"
import { AcpProviderBridge } from "../AcpProviderBridge"
import type { ProviderSettings, ModeConfig } from "@roo-code/types"

describe("AcpProviderBridge", () => {
	const bridge = new AcpProviderBridge()

	describe("extractProviderContext", () => {
		it("should extract apiProvider and apiModelId from settings", () => {
			const settings = { apiProvider: "anthropic", apiModelId: "claude-3-opus" } as ProviderSettings
			const result = bridge.extractProviderContext(settings)

			expect(result.apiProvider).toBe("anthropic")
			expect(result.apiModelId).toBe("claude-3-opus")
			expect(result.mode).toBeUndefined()
			expect(result.customModeConfig).toBeUndefined()
		})

		it("should include mode when provided", () => {
			const settings = { apiProvider: "openai" } as ProviderSettings
			const result = bridge.extractProviderContext(settings, "code")

			expect(result.mode).toBe("code")
		})

		it("should include customModeConfig when mode matches a known mode", () => {
			const customModes: ModeConfig[] = [
				{
					slug: "my-mode",
					name: "My Mode",
					roleDefinition: "A custom role",
					groups: ["read"],
				},
			]
			const settings = { apiProvider: "anthropic" } as ProviderSettings
			const result = bridge.extractProviderContext(settings, "my-mode", customModes)

			expect(result.customModeConfig).toBeDefined()
			expect(result.customModeConfig?.slug).toBe("my-mode")
			expect(result.customModeConfig?.name).toBe("My Mode")
			expect(result.customModeConfig?.roleDefinition).toBe("A custom role")
		})

		it("should handle empty settings gracefully", () => {
			const settings = {} as ProviderSettings
			const result = bridge.extractProviderContext(settings)

			expect(result.apiProvider).toBeUndefined()
			expect(result.apiModelId).toBeUndefined()
		})

		it("should handle unknown mode slug without crashing", () => {
			const settings = { apiProvider: "anthropic" } as ProviderSettings
			const result = bridge.extractProviderContext(settings, "nonexistent-mode", [])

			expect(result.mode).toBe("nonexistent-mode")
			expect(result.customModeConfig).toBeUndefined()
		})
	})

	describe("parseAgentCapabilities", () => {
		it("should parse valid capabilities", () => {
			const caps = {
				supportedProviders: ["anthropic", "openai"],
				supportedModes: ["code", "architect"],
				preferredProvider: "anthropic",
				preferredModel: "claude-3-opus",
				preferredMode: "code",
			}
			const result = bridge.parseAgentCapabilities(caps)

			expect(result.supportedProviders).toEqual(["anthropic", "openai"])
			expect(result.supportedModes).toEqual(["code", "architect"])
			expect(result.preferredProvider).toBe("anthropic")
			expect(result.preferredModel).toBe("claude-3-opus")
			expect(result.preferredMode).toBe("code")
		})

		it("should return empty object for undefined input", () => {
			const result = bridge.parseAgentCapabilities(undefined)
			expect(result).toEqual({})
		})

		it("should return empty object for null input", () => {
			const result = bridge.parseAgentCapabilities(null)
			expect(result).toEqual({})
		})

		it("should return empty object for empty object", () => {
			const result = bridge.parseAgentCapabilities({})
			expect(result).toEqual({})
		})

		it("should filter non-string values from arrays", () => {
			const caps = {
				supportedProviders: ["anthropic", 42, null, "openai", undefined],
				supportedModes: [true, "code", {}, "architect"],
			}
			const result = bridge.parseAgentCapabilities(caps)

			expect(result.supportedProviders).toEqual(["anthropic", "openai"])
			expect(result.supportedModes).toEqual(["code", "architect"])
		})

		it("should ignore non-string preferred values", () => {
			const caps = {
				preferredProvider: 42,
				preferredModel: { name: "test" },
				preferredMode: true,
			}
			const result = bridge.parseAgentCapabilities(caps)

			expect(result.preferredProvider).toBeUndefined()
			expect(result.preferredModel).toBeUndefined()
			expect(result.preferredMode).toBeUndefined()
		})

		it("should ignore non-array supported values", () => {
			const caps = {
				supportedProviders: "not-an-array",
				supportedModes: 42,
			}
			const result = bridge.parseAgentCapabilities(caps)

			expect(result.supportedProviders).toBeUndefined()
			expect(result.supportedModes).toBeUndefined()
		})

		it("should handle non-object input gracefully", () => {
			expect(bridge.parseAgentCapabilities("string" as any)).toEqual({})
			expect(bridge.parseAgentCapabilities(42 as any)).toEqual({})
			expect(bridge.parseAgentCapabilities(true as any)).toEqual({})
		})
	})

	describe("applyAgentPreferences", () => {
		it("should call setProviderProfile when preferredProvider is set", async () => {
			const mockProvider = { setProviderProfile: vi.fn().mockResolvedValue(undefined) }
			const preferences = { preferredProvider: "my-profile" }

			await bridge.applyAgentPreferences(preferences, mockProvider)

			expect(mockProvider.setProviderProfile).toHaveBeenCalledWith("my-profile")
		})

		it("should not call setProviderProfile when preferredProvider is not set", async () => {
			const mockProvider = { setProviderProfile: vi.fn() }
			const preferences = { preferredMode: "code" }

			await bridge.applyAgentPreferences(preferences, mockProvider)

			expect(mockProvider.setProviderProfile).not.toHaveBeenCalled()
		})

		it("should handle missing setProviderProfile method gracefully", async () => {
			const mockProvider = {}
			const preferences = { preferredProvider: "my-profile" }

			// Should not throw
			await bridge.applyAgentPreferences(preferences, mockProvider)
		})

		it("should handle setProviderProfile errors gracefully", async () => {
			const mockProvider = {
				setProviderProfile: vi.fn().mockRejectedValue(new Error("Profile not found")),
			}
			const preferences = { preferredProvider: "nonexistent" }

			// Should not throw
			await bridge.applyAgentPreferences(preferences, mockProvider)
			expect(mockProvider.setProviderProfile).toHaveBeenCalledWith("nonexistent")
		})
	})
})
