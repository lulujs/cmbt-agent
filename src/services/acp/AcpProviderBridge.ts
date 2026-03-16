// cmbt-agent_change - new file
import type { ProviderSettings } from "@roo-code/types"
import type { ModeConfig, GroupEntry } from "@roo-code/types"
import { getModeBySlug } from "../../shared/modes"
import { AcpLogger } from "./AcpLogger"

/**
 * Provider context to pass to ACP agents when creating sessions.
 */
export interface AcpProviderContext {
	apiProvider?: string
	apiModelId?: string
	mode?: string
	customModeConfig?: {
		slug: string
		name: string
		roleDefinition?: string
		groups?: readonly GroupEntry[]
	}
}

/**
 * Capabilities reported by an ACP agent during initialization.
 */
export interface AcpAgentCapabilities {
	supportedProviders?: string[]
	supportedModes?: string[]
	preferredProvider?: string
	preferredModel?: string
	preferredMode?: string
}

/**
 * Bridges ACP agents with the extension's LLM provider settings and custom modes.
 */
export class AcpProviderBridge {
	constructor(private logger?: AcpLogger) {}

	/**
	 * Extract provider context from current extension state for passing to ACP agents.
	 */
	extractProviderContext(settings: ProviderSettings, mode?: string, customModes?: ModeConfig[]): AcpProviderContext {
		const context: AcpProviderContext = {
			apiProvider: settings.apiProvider,
			apiModelId: settings.apiModelId,
			mode,
		}

		if (mode) {
			const modeConfig = getModeBySlug(mode, customModes)
			if (modeConfig) {
				context.customModeConfig = {
					slug: modeConfig.slug,
					name: modeConfig.name,
					roleDefinition: modeConfig.roleDefinition,
					groups: modeConfig.groups,
				}
			}
		}

		return context
	}

	/**
	 * Safely parse agent capabilities from the ACP initialize response.
	 * Returns a valid AcpAgentCapabilities object for any input, never throws.
	 */
	parseAgentCapabilities(capabilities: Record<string, unknown> | undefined | null): AcpAgentCapabilities {
		if (!capabilities || typeof capabilities !== "object") {
			return {}
		}

		const result: AcpAgentCapabilities = {}

		try {
			if (Array.isArray(capabilities.supportedProviders)) {
				result.supportedProviders = capabilities.supportedProviders.filter(
					(p): p is string => typeof p === "string",
				)
			}

			if (Array.isArray(capabilities.supportedModes)) {
				result.supportedModes = capabilities.supportedModes.filter((m): m is string => typeof m === "string")
			}

			if (typeof capabilities.preferredProvider === "string") {
				result.preferredProvider = capabilities.preferredProvider
			}

			if (typeof capabilities.preferredModel === "string") {
				result.preferredModel = capabilities.preferredModel
			}

			if (typeof capabilities.preferredMode === "string") {
				result.preferredMode = capabilities.preferredMode
			}
		} catch (error) {
			this.logger?.warn("Failed to parse agent capabilities", {
				error: error instanceof Error ? error.message : String(error),
			})
		}

		return result
	}

	/**
	 * Apply agent preferences to the extension's provider settings.
	 * Uses the provider's profile activation mechanism when a preferred provider is specified.
	 */
	async applyAgentPreferences(
		preferences: AcpAgentCapabilities,
		provider: {
			setProviderProfile?: (name: string) => Promise<void>
		},
	): Promise<void> {
		if (preferences.preferredProvider && provider.setProviderProfile) {
			try {
				await provider.setProviderProfile(preferences.preferredProvider)
				this.logger?.info("Applied agent preferred provider profile", {
					provider: preferences.preferredProvider,
				})
			} catch (error) {
				this.logger?.warn("Failed to apply agent preferred provider", {
					provider: preferences.preferredProvider,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}
	}
}
