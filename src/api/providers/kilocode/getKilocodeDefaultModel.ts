import { openRouterDefaultModelId } from "@roo-code/types"
import { getKiloUrlFromToken } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { z } from "zod"
import { DEFAULT_HEADERS } from "../constants"

type KilocodeToken = string

type OrganizationId = string

const defaultsSchema = z.object({
	defaultModel: z.string(),
	defaultFreeModel: z.string().optional(),
})

type Defaults = z.infer<typeof defaultsSchema>

const cache = new Map<string, Promise<Defaults>>()

// test-agent_change start: Disable network request, return Dify as default
async function fetchKilocodeDefaultModel(
	kilocodeToken?: KilocodeToken,
	organizationId?: OrganizationId,
): Promise<Defaults> {
	// Return Dify as fixed default model without making network request
	console.info("Using Dify as fixed default model (network request disabled)")
	return { defaultModel: "dify-workflow", defaultFreeModel: "dify-workflow" }
}
// test-agent_change end

export async function getKilocodeDefaultModel(
	kilocodeToken?: KilocodeToken,
	organizationId?: OrganizationId,
): Promise<Defaults> {
	const key = JSON.stringify({
		kilocodeToken: kilocodeToken ?? "anonymous",
		organizationId,
	})
	let defaultModelPromise = cache.get(key)
	if (!defaultModelPromise) {
		defaultModelPromise = fetchKilocodeDefaultModel(kilocodeToken, organizationId)
		cache.set(key, defaultModelPromise)
	}
	return await defaultModelPromise
}
