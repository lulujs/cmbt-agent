// cmbt-agent_change - new file
import * as vscode from "vscode"
import * as path from "path"
import {
	ACPAgentConfig,
	DetailedPermissionConfig,
	PermissionRequest,
	PermissionAuditEntry,
	ACPPermissionConfig,
} from "../types"
import { ACPError, ACPConfigurationError } from "../errors"

/**
 * Permission manager for controlling ACP agent access to resources
 * Implements per-agent permission configuration, file access controls,
 * network access controls, and permission audit logging
 */
export class PermissionManager {
	private context: vscode.ExtensionContext
	private permissionConfigs: Map<string, DetailedPermissionConfig> = new Map()
	private auditLog: PermissionAuditEntry[] = []
	private readonly maxAuditEntries = 1000

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.loadPermissionConfigs()
	}

	/**
	 * Initialize permission configuration for an agent
	 */
	async initializeAgentPermissions(agentConfig: ACPAgentConfig): Promise<void> {
		const detailedConfig: DetailedPermissionConfig = {
			agentId: agentConfig.id,
			permissions: {
				files: {
					read: this.getDefaultFilePatterns(agentConfig.permissions.fileAccess, "read"),
					write: this.getDefaultFilePatterns(agentConfig.permissions.fileAccess, "write"),
					execute: this.getDefaultFilePatterns(agentConfig.permissions.fileAccess, "execute"),
				},
				network: {
					allowedHosts: agentConfig.permissions.networkAccess ? ["*"] : [],
					blockedHosts: [],
				},
				system: {
					shellAccess: agentConfig.permissions.shellAccess,
					environmentAccess: agentConfig.permissions.shellAccess,
				},
			},
			auditLog: [],
		}

		this.permissionConfigs.set(agentConfig.id, detailedConfig)
		await this.savePermissionConfigs()
	}

	/**
	 * Check if an agent has permission to perform an action on a resource
	 */
	async checkPermission(agentId: string, resource: string, action: string): Promise<boolean> {
		const config = this.permissionConfigs.get(agentId)
		if (!config) {
			await this.logPermissionAction(agentId, action, resource, false, "Agent not configured")
			return false
		}

		let granted = false
		let reason = ""

		try {
			switch (action) {
				case "file:read":
					granted = this.checkFilePermission(config, resource, "read")
					reason = granted ? "File read permission granted" : "File read permission denied"
					break
				case "file:write":
					granted = this.checkFilePermission(config, resource, "write")
					reason = granted ? "File write permission granted" : "File write permission denied"
					break
				case "file:execute":
					granted = this.checkFilePermission(config, resource, "execute")
					reason = granted ? "File execute permission granted" : "File execute permission denied"
					break
				case "network:access":
					granted = this.checkNetworkPermission(config, resource)
					reason = granted ? "Network access granted" : "Network access denied"
					break
				case "system:shell":
					granted = config.permissions.system.shellAccess
					reason = granted ? "Shell access granted" : "Shell access denied"
					break
				case "system:environment":
					granted = config.permissions.system.environmentAccess
					reason = granted ? "Environment access granted" : "Environment access denied"
					break
				default:
					granted = false
					reason = `Unknown action: ${action}`
			}

			await this.logPermissionAction(agentId, action, resource, granted, reason)
			return granted
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			await this.logPermissionAction(
				agentId,
				action,
				resource,
				false,
				`Error checking permission: ${errorMessage}`,
			)
			return false
		}
	}

	/**
	 * Request permission from user for sensitive operations
	 */
	async requestPermission(request: PermissionRequest): Promise<boolean> {
		try {
			// Check if permission is already granted
			const hasPermission = await this.checkPermission(request.agentId, request.resource, request.action)
			if (hasPermission) {
				return true
			}

			// Show user confirmation dialog
			const agentConfig = await this.getAgentDisplayName(request.agentId)
			const message = this.formatPermissionRequestMessage(agentConfig, request)

			const result = await vscode.window.showWarningMessage(
				message,
				{ modal: true },
				"允许 (Allow)",
				"拒绝 (Deny)",
				"总是允许 (Always Allow)",
			)

			let granted = false
			let permanent = false

			switch (result) {
				case "允许 (Allow)":
					granted = true
					break
				case "总是允许 (Always Allow)":
					granted = true
					permanent = true
					break
				case "拒绝 (Deny)":
				default:
					granted = false
			}

			// If permanently granted, update the permission configuration
			if (granted && permanent) {
				await this.grantPermanentPermission(request.agentId, request.resource, request.action)
			}

			await this.logPermissionAction(
				request.agentId,
				request.action,
				request.resource,
				granted,
				permanent ? "Permanently granted by user" : granted ? "Granted by user" : "Denied by user",
			)

			return granted
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			await this.logPermissionAction(
				request.agentId,
				request.action,
				request.resource,
				false,
				`Error requesting permission: ${errorMessage}`,
			)
			return false
		}
	}

	/**
	 * Update permission configuration for an agent
	 */
	async updatePermissions(
		agentId: string,
		permissions: Partial<DetailedPermissionConfig["permissions"]>,
	): Promise<void> {
		const config = this.permissionConfigs.get(agentId)
		if (!config) {
			throw ACPConfigurationError.configNotFound(agentId)
		}

		// Merge permissions
		if (permissions.files) {
			config.permissions.files = { ...config.permissions.files, ...permissions.files }
		}
		if (permissions.network) {
			config.permissions.network = { ...config.permissions.network, ...permissions.network }
		}
		if (permissions.system) {
			config.permissions.system = { ...config.permissions.system, ...permissions.system }
		}

		this.permissionConfigs.set(agentId, config)
		await this.savePermissionConfigs()

		await this.logPermissionAction(
			agentId,
			"config:update",
			"permissions",
			true,
			"Permission configuration updated",
		)
	}

	/**
	 * Get permission configuration for an agent
	 */
	getPermissions(agentId: string): DetailedPermissionConfig | null {
		return this.permissionConfigs.get(agentId) || null
	}

	/**
	 * Get audit log for an agent
	 */
	getAuditLog(agentId?: string): PermissionAuditEntry[] {
		if (agentId) {
			return this.auditLog.filter((entry) => entry.agentId === agentId)
		}
		return [...this.auditLog]
	}

	/**
	 * Clear audit log
	 */
	async clearAuditLog(agentId?: string): Promise<void> {
		if (agentId) {
			this.auditLog = this.auditLog.filter((entry) => entry.agentId !== agentId)
		} else {
			this.auditLog = []
		}
		await this.saveAuditLog()
	}

	/**
	 * Remove permission configuration for an agent
	 */
	async removeAgentPermissions(agentId: string): Promise<void> {
		this.permissionConfigs.delete(agentId)
		await this.savePermissionConfigs()
		await this.logPermissionAction(
			agentId,
			"config:remove",
			"permissions",
			true,
			"Permission configuration removed",
		)
	}

	/**
	 * Check file permission against patterns
	 */
	private checkFilePermission(
		config: DetailedPermissionConfig,
		filePath: string,
		action: "read" | "write" | "execute",
	): boolean {
		const patterns = config.permissions.files[action]
		if (patterns.length === 0) {
			return false
		}

		// Normalize path for comparison
		const normalizedPath = path.normalize(filePath)

		// Check against patterns
		for (const pattern of patterns) {
			if (this.matchesPattern(normalizedPath, pattern)) {
				return true
			}
		}

		return false
	}

	/**
	 * Check network permission
	 */
	private checkNetworkPermission(config: DetailedPermissionConfig, host: string): boolean {
		const { allowedHosts, blockedHosts } = config.permissions.network

		// Check blocked hosts first
		for (const blockedHost of blockedHosts) {
			if (this.matchesHostPattern(host, blockedHost)) {
				return false
			}
		}

		// Check allowed hosts
		for (const allowedHost of allowedHosts) {
			if (allowedHost === "*" || this.matchesHostPattern(host, allowedHost)) {
				return true
			}
		}

		return false
	}

	/**
	 * Match file path against pattern
	 */
	private matchesPattern(filePath: string, pattern: string): boolean {
		// Convert glob pattern to regex
		const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".")

		const regex = new RegExp(`^${regexPattern}$`, "i")
		return regex.test(filePath)
	}

	/**
	 * Match host against pattern
	 */
	private matchesHostPattern(host: string, pattern: string): boolean {
		if (pattern === "*") {
			return true
		}

		// Support wildcard subdomains
		if (pattern.startsWith("*.")) {
			const domain = pattern.slice(2)
			return host === domain || host.endsWith("." + domain)
		}

		return host === pattern
	}

	/**
	 * Get default file patterns based on permission level
	 */
	private getDefaultFilePatterns(
		fileAccess: ACPPermissionConfig["fileAccess"],
		action: "read" | "write" | "execute",
	): string[] {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ""

		switch (fileAccess) {
			case "none":
				return []
			case "read":
				if (action === "read") {
					return [
						path.join(workspaceRoot, "**/*.ts"),
						path.join(workspaceRoot, "**/*.js"),
						path.join(workspaceRoot, "**/*.json"),
						path.join(workspaceRoot, "**/*.md"),
						path.join(workspaceRoot, "**/*.txt"),
					]
				}
				return []
			case "write":
				if (action === "read" || action === "write") {
					return [
						path.join(workspaceRoot, "**/*.ts"),
						path.join(workspaceRoot, "**/*.js"),
						path.join(workspaceRoot, "**/*.json"),
						path.join(workspaceRoot, "**/*.md"),
						path.join(workspaceRoot, "**/*.txt"),
					]
				}
				return []
			case "full":
				return [path.join(workspaceRoot, "**/*")]
			default:
				return []
		}
	}

	/**
	 * Grant permanent permission for a resource and action
	 */
	private async grantPermanentPermission(agentId: string, resource: string, action: string): Promise<void> {
		const config = this.permissionConfigs.get(agentId)
		if (!config) {
			return
		}

		// Add resource to appropriate permission list
		if (action.startsWith("file:")) {
			const fileAction = action.split(":")[1] as "read" | "write" | "execute"
			if (!config.permissions.files[fileAction].includes(resource)) {
				config.permissions.files[fileAction].push(resource)
			}
		} else if (action === "network:access") {
			if (!config.permissions.network.allowedHosts.includes(resource)) {
				config.permissions.network.allowedHosts.push(resource)
			}
		}

		this.permissionConfigs.set(agentId, config)
		await this.savePermissionConfigs()
	}

	/**
	 * Format permission request message for user
	 */
	private formatPermissionRequestMessage(agentName: string, request: PermissionRequest): string {
		const actionMap: Record<string, string> = {
			"file:read": "读取文件",
			"file:write": "写入文件",
			"file:execute": "执行文件",
			"network:access": "网络访问",
			"system:shell": "Shell访问",
			"system:environment": "环境变量访问",
		}

		const actionText = actionMap[request.action] || request.action
		return `智能体 "${agentName}" 请求 ${actionText} 权限访问资源: ${request.resource}\n\n是否允许此操作？`
	}

	/**
	 * Get agent display name
	 */
	private async getAgentDisplayName(agentId: string): Promise<string> {
		// This would typically fetch from agent configuration
		// For now, return the agent ID
		return agentId
	}

	/**
	 * Log permission action to audit trail
	 */
	private async logPermissionAction(
		agentId: string,
		action: string,
		resource: string,
		granted: boolean,
		reason?: string,
	): Promise<void> {
		const entry: PermissionAuditEntry = {
			timestamp: new Date(),
			agentId,
			action,
			resource,
			granted,
			reason,
		}

		this.auditLog.push(entry)

		// Keep audit log size manageable
		if (this.auditLog.length > this.maxAuditEntries) {
			this.auditLog = this.auditLog.slice(-this.maxAuditEntries)
		}

		// Also add to agent-specific audit log
		const config = this.permissionConfigs.get(agentId)
		if (config) {
			config.auditLog.push(entry)
			if (config.auditLog.length > 100) {
				// Keep per-agent log smaller
				config.auditLog = config.auditLog.slice(-100)
			}
		}

		await this.saveAuditLog()
	}

	/**
	 * Load permission configurations from storage
	 */
	private async loadPermissionConfigs(): Promise<void> {
		try {
			const stored = this.context.globalState.get<Record<string, DetailedPermissionConfig>>("acp-permissions", {})
			this.permissionConfigs = new Map(Object.entries(stored))

			// Load audit log
			const auditLog = this.context.globalState.get<PermissionAuditEntry[]>("acp-audit-log", [])
			this.auditLog = auditLog.map((entry) => ({
				...entry,
				timestamp: new Date(entry.timestamp),
			}))
		} catch (error) {
			console.error("Failed to load permission configurations:", error)
			this.permissionConfigs = new Map()
			this.auditLog = []
		}
	}

	/**
	 * Save permission configurations to storage
	 */
	private async savePermissionConfigs(): Promise<void> {
		try {
			const configObject = Object.fromEntries(this.permissionConfigs)
			await this.context.globalState.update("acp-permissions", configObject)
		} catch (error) {
			console.error("Failed to save permission configurations:", error)
			throw ACPConfigurationError.configNotFound("system")
		}
	}

	/**
	 * Save audit log to storage
	 */
	private async saveAuditLog(): Promise<void> {
		try {
			await this.context.globalState.update("acp-audit-log", this.auditLog)
		} catch (error) {
			console.error("Failed to save audit log:", error)
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.permissionConfigs.clear()
		this.auditLog = []
	}
}
