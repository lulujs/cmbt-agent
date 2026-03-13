// cmbt-agent_change - new file
import * as vscode from "vscode"
import { AcpLogger } from "../../services/acp/AcpLogger"

export interface PermissionDecision {
	allowed: boolean
	remember: boolean
}

export interface IPermissionHandler {
	handlePermissionRequest(params: {
		operation: string
		resource: string
		description: string
	}): Promise<PermissionDecision>
	checkCachedDecision(operation: string, resource: string): PermissionDecision | undefined
	clearCachedDecisions(): void
}

export class PermissionHandler implements IPermissionHandler {
	private cache = new Map<string, PermissionDecision>()

	constructor(private logger: AcpLogger) {}

	async handlePermissionRequest(params: {
		operation: string
		resource: string
		description: string
	}): Promise<PermissionDecision> {
		const cacheKey = `${params.operation}:${params.resource}`
		const cached = this.cache.get(cacheKey)

		if (cached) {
			this.logger.debug("Using cached permission decision", {
				operation: params.operation,
				allowed: cached.allowed,
			})
			return cached
		}

		this.logger.info("Requesting permission", params)

		const message = `${params.description}\n\nOperation: ${params.operation}\nResource: ${params.resource}`
		const result = await vscode.window.showInformationMessage(
			message,
			{ modal: true },
			"Allow",
			"Allow and Remember",
			"Deny",
		)

		const decision: PermissionDecision = {
			allowed: result === "Allow" || result === "Allow and Remember",
			remember: result === "Allow and Remember",
		}

		if (decision.remember) {
			this.cache.set(cacheKey, decision)
			this.logger.info("Cached permission decision", { operation: params.operation, allowed: decision.allowed })
		}

		this.logger.info("Permission decision", { operation: params.operation, allowed: decision.allowed })
		return decision
	}

	checkCachedDecision(operation: string, resource: string): PermissionDecision | undefined {
		return this.cache.get(`${operation}:${resource}`)
	}

	clearCachedDecisions(): void {
		this.cache.clear()
		this.logger.info("Cleared all cached permission decisions")
	}
}
