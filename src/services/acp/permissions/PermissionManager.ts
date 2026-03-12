// cmbt-agent_change - new file
/**
 * Permission Manager for ACP (Agent Client Protocol) support
 *
 * This class manages permissions for ACP agents, including file access controls,
 * network access controls, user confirmation dialogs, and permission audit logging.
 */

import * as vscode from "vscode"
import { PermissionRequest, PermissionAuditEntry, DetailedPermissionConfig, ACPErrorType } from "../types"
import { ACPErrorCode } from "../constants"
import { ACPError } from "../errors"

/**
 * Permission Manager class for controlling ACP agent access
 */
export class PermissionManager {
	private permissions: Map<string, DetailedPermissionConfig> = new Map()
	private auditLog: PermissionAuditEntry[] = []
	private readonly maxAuditEntries = 1000

	constructor() {
		this.loadPermissions()
	}

	/**
	 * Request permission for an agent to perform an action on a resource
	 */
	async requestPermission(agentId: string, permission: PermissionRequest): Promise<boolean> {
		try {
			// Check if permission is already granted
			if (this.hasPermission(agentId, permission.resource, permission.action)) {
				this.logPermission(agentId, permission.action, permission.resource, true, "已授权")
				return true
			}

			// Show user confirmation dialog
			const granted = await this.showPermissionDialog(agentId, permission)

			// Log the permission request
			this.logPermission(
				agentId,
				permission.action,
				permission.resource,
				granted,
				granted ? "用户授权" : "用户拒绝",
			)

			// If granted, update permissions
			if (granted) {
				await this.grantPermission(agentId, permission.resource, permission.action)
			}

			return granted
		} catch (error) {
			this.logPermission(
				agentId,
				permission.action,
				permission.resource,
				false,
				`错误: ${error instanceof Error ? error.message : "未知错误"}`,
			)
			throw new ACPError({
				type: ACPErrorType.PERMISSION,
				code: ACPErrorCode.PERMISSION_DENIED,
				message: `权限请求失败: ${error instanceof Error ? error.message : "未知错误"}`,
				agentId,
				resource: permission.resource,
				originalError: error instanceof Error ? error : undefined,
				timestamp: new Date(),
			})
		}
	}

	/**
	 * Get permissions for a specific agent
	 */
	getPermissions(agentId: string): DetailedPermissionConfig {
		const existing = this.permissions.get(agentId)
		if (existing) {
			return existing
		}

		// Return default permissions for new agents
		const defaultConfig: DetailedPermissionConfig = {
			agentId,
			permissions: {
				files: {
					read: [],
					write: [],
					execute: [],
				},
				network: {
					allowedHosts: [],
					blockedHosts: [],
				},
				system: {
					shellAccess: false,
					environmentAccess: false,
				},
			},
			auditLog: [],
		}

		this.permissions.set(agentId, defaultConfig)
		return defaultConfig
	}

	/**
	 * Update permissions for a specific agent
	 */
	async updatePermissions(agentId: string, permissions: Partial<DetailedPermissionConfig>): Promise<void> {
		try {
			const existing = this.getPermissions(agentId)
			const updated: DetailedPermissionConfig = {
				...existing,
				...permissions,
				permissions: {
					...existing.permissions,
					...permissions.permissions,
				},
			}

			this.permissions.set(agentId, updated)
			await this.savePermissions()

			this.logPermission(agentId, "update_permissions", "system", true, "权限配置已更新")
		} catch (error) {
			throw new ACPError({
				type: ACPErrorType.SYSTEM,
				code: ACPErrorCode.CONFIGURATION_ERROR,
				message: `更新权限失败: ${error instanceof Error ? error.message : "未知错误"}`,
				agentId,
				originalError: error instanceof Error ? error : undefined,
				timestamp: new Date(),
			})
		}
	}

	/**
	 * Check if an agent has permission for a specific action on a resource
	 */
	hasPermission(agentId: string, resource: string, action: string): boolean {
		const config = this.permissions.get(agentId)
		if (!config) {
			return false
		}

		switch (action) {
			case "file:read":
				return this.matchesPattern(resource, config.permissions.files.read)
			case "file:write":
				return this.matchesPattern(resource, config.permissions.files.write)
			case "file:execute":
				return this.matchesPattern(resource, config.permissions.files.execute)
			case "network:connect":
				return this.isHostAllowed(resource, config.permissions.network)
			case "system:shell":
				return config.permissions.system.shellAccess
			case "system:environment":
				return config.permissions.system.environmentAccess
			default:
				return false
		}
	}

	/**
	 * Get audit log for a specific agent or all agents
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
	clearAuditLog(agentId?: string): void {
		if (agentId) {
			this.auditLog = this.auditLog.filter((entry) => entry.agentId !== agentId)
		} else {
			this.auditLog = []
		}
	}

	/**
	 * Remove all permissions for an agent
	 */
	async removeAgent(agentId: string): Promise<void> {
		this.permissions.delete(agentId)
		// Remove from global audit log
		this.auditLog = this.auditLog.filter((entry) => entry.agentId !== agentId)
		await this.savePermissions()
	}

	/**
	 * Show permission confirmation dialog to user
	 */
	private async showPermissionDialog(agentId: string, permission: PermissionRequest): Promise<boolean> {
		const actionText = this.getActionDisplayText(permission.action)
		const resourceText = this.getResourceDisplayText(permission.resource)

		const message = `智能体 "${agentId}" 请求 ${actionText} 权限访问 "${resourceText}"。是否允许？`

		const result = await vscode.window.showWarningMessage(message, { modal: true }, "允许", "拒绝", "总是允许")

		switch (result) {
			case "允许":
				return true
			case "总是允许":
				// Grant permanent permission
				await this.grantPermanentPermission(agentId, permission.resource, permission.action)
				return true
			case "拒绝":
			default:
				return false
		}
	}

	/**
	 * Grant permission for a specific resource and action
	 */
	private async grantPermission(agentId: string, resource: string, action: string): Promise<void> {
		const config = this.getPermissions(agentId)

		switch (action) {
			case "file:read":
				if (!config.permissions.files.read.includes(resource)) {
					config.permissions.files.read.push(resource)
				}
				break
			case "file:write":
				if (!config.permissions.files.write.includes(resource)) {
					config.permissions.files.write.push(resource)
				}
				break
			case "file:execute":
				if (!config.permissions.files.execute.includes(resource)) {
					config.permissions.files.execute.push(resource)
				}
				break
			case "network:connect":
				if (!config.permissions.network.allowedHosts.includes(resource)) {
					config.permissions.network.allowedHosts.push(resource)
				}
				break
			case "system:shell":
				config.permissions.system.shellAccess = true
				break
			case "system:environment":
				config.permissions.system.environmentAccess = true
				break
		}

		this.permissions.set(agentId, config)
		await this.savePermissions()
	}

	/**
	 * Grant permanent permission (same as grantPermission but with different logging)
	 */
	private async grantPermanentPermission(agentId: string, resource: string, action: string): Promise<void> {
		await this.grantPermission(agentId, resource, action)
		this.logPermission(agentId, action, resource, true, "用户授权（永久）")
	}

	/**
	 * Check if a resource matches any of the allowed patterns
	 */
	private matchesPattern(resource: string, patterns: string[]): boolean {
		return patterns.some((pattern) => {
			// Convert glob pattern to regex
			// Escape special regex characters except * and ?
			let escapedPattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")

			// Handle glob patterns
			// ** matches any number of directories
			escapedPattern = escapedPattern.replace(/\*\*/g, "§DOUBLESTAR§")
			// * matches anything except directory separators (unless it's part of **)
			escapedPattern = escapedPattern.replace(/\*/g, "[^/]*")
			// Restore ** to match everything including directory separators
			escapedPattern = escapedPattern.replace(/§DOUBLESTAR§/g, ".*")
			// ? matches any single character except directory separator
			escapedPattern = escapedPattern.replace(/\?/g, "[^/]")

			const regex = new RegExp(`^${escapedPattern}$`)
			return regex.test(resource)
		})
	}

	/**
	 * Check if a host is allowed for network access
	 */
	private isHostAllowed(host: string, networkConfig: DetailedPermissionConfig["permissions"]["network"]): boolean {
		// Check if host is explicitly blocked
		if (networkConfig.blockedHosts.some((blocked) => host.includes(blocked))) {
			return false
		}

		// Check if host is explicitly allowed
		if (networkConfig.allowedHosts.length === 0) {
			return false // Default deny
		}

		return networkConfig.allowedHosts.some((allowed) => host.includes(allowed))
	}

	/**
	 * Log permission request/grant/deny
	 */
	private logPermission(agentId: string, action: string, resource: string, granted: boolean, reason?: string): void {
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

		// Also add to agent's specific audit log
		const config = this.permissions.get(agentId)
		if (config) {
			config.auditLog.push(entry)
			if (config.auditLog.length > 100) {
				// Keep per-agent log smaller
				config.auditLog = config.auditLog.slice(-100)
			}
		}
	}

	/**
	 * Get display text for permission action
	 */
	private getActionDisplayText(action: string): string {
		const actionMap: Record<string, string> = {
			"file:read": "文件读取",
			"file:write": "文件写入",
			"file:execute": "文件执行",
			"network:connect": "网络连接",
			"system:shell": "系统命令",
			"system:environment": "环境变量访问",
		}
		return actionMap[action] || action
	}

	/**
	 * Get display text for resource
	 */
	private getResourceDisplayText(resource: string): string {
		// Truncate long paths for display
		if (resource.length > 50) {
			return "..." + resource.slice(-47)
		}
		return resource
	}

	/**
	 * Load permissions from VSCode settings
	 */
	private loadPermissions(): void {
		try {
			const config = vscode.workspace.getConfiguration("cmbt-agent.acp")
			const savedPermissions = config.get<Record<string, DetailedPermissionConfig>>("permissions", {})

			for (const [agentId, permissionConfig] of Object.entries(savedPermissions)) {
				this.permissions.set(agentId, permissionConfig)
			}
		} catch (error) {
			console.warn("Failed to load ACP permissions from settings:", error)
		}
	}

	/**
	 * Save permissions to VSCode settings
	 */
	private async savePermissions(): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration("cmbt-agent.acp")
			const permissionsObj: Record<string, DetailedPermissionConfig> = {}

			for (const [agentId, permissionConfig] of this.permissions.entries()) {
				permissionsObj[agentId] = permissionConfig
			}

			await config.update("permissions", permissionsObj, vscode.ConfigurationTarget.Global)
		} catch (error) {
			console.error("Failed to save ACP permissions to settings:", error)
			throw error
		}
	}
}
