// cmbt-agent_change - new file
import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { ConfigurationStorage } from "./ConfigurationStorage"
import { ACPAgentConfig } from "../types"
import { ACPError, ACPErrorCode } from "../errors"

/**
 * Enhanced configuration manager with backup, restore, and template functionality
 */
export class ConfigurationManager {
	private storage: ConfigurationStorage
	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.storage = new ConfigurationStorage(context)
	}

	/**
	 * Export configurations to a file
	 */
	async exportToFile(filePath?: string): Promise<string> {
		try {
			const exportData = await this.storage.exportConfigs()

			if (!filePath) {
				// Show save dialog
				const uri = await vscode.window.showSaveDialog({
					defaultUri: vscode.Uri.file("acp-agents-config.json"),
					filters: {
						"JSON Files": ["json"],
						"All Files": ["*"],
					},
					title: "导出ACP智能体配置",
				})

				if (!uri) {
					throw new ACPError(ACPErrorCode.VALIDATION_ERROR, "用户取消了导出操作")
				}

				filePath = uri.fsPath
			}

			await fs.writeFile(filePath, exportData, "utf8")

			vscode.window.showInformationMessage(`配置已导出到: ${filePath}`)
			return filePath
		} catch (error) {
			if (error instanceof ACPError) {
				throw error
			}
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`导出配置失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Import configurations from a file
	 */
	async importFromFile(filePath?: string): Promise<void> {
		try {
			if (!filePath) {
				// Show open dialog
				const uris = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: false,
					canSelectMany: false,
					filters: {
						"JSON Files": ["json"],
						"All Files": ["*"],
					},
					title: "导入ACP智能体配置",
				})

				if (!uris || uris.length === 0) {
					throw new ACPError(ACPErrorCode.VALIDATION_ERROR, "用户取消了导入操作")
				}

				filePath = uris[0].fsPath
			}

			const configData = await fs.readFile(filePath, "utf8")
			await this.storage.importConfigs(configData)

			vscode.window.showInformationMessage(`配置已从 ${filePath} 导入成功`)
		} catch (error) {
			if (error instanceof ACPError) {
				throw error
			}
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`导入配置失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Create automatic backup of current configurations
	 */
	async createBackup(): Promise<string> {
		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
			const backupDir = path.join(this.context.globalStorageUri.fsPath, "backups")
			const backupFile = path.join(backupDir, `acp-config-backup-${timestamp}.json`)

			// Ensure backup directory exists
			await fs.mkdir(backupDir, { recursive: true })

			const exportData = await this.storage.exportConfigs()
			await fs.writeFile(backupFile, exportData, "utf8")

			// Keep only last 10 backups
			await this.cleanupOldBackups(backupDir)

			return backupFile
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`创建备份失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Restore from a backup file
	 */
	async restoreFromBackup(backupFile?: string): Promise<void> {
		try {
			if (!backupFile) {
				const backupDir = path.join(this.context.globalStorageUri.fsPath, "backups")
				const backups = await this.listBackups()

				if (backups.length === 0) {
					throw new ACPError(ACPErrorCode.NOT_FOUND, "没有找到备份文件")
				}

				// Show quick pick for backup selection
				const selectedBackup = await vscode.window.showQuickPick(
					backups.map((backup) => ({
						label: path.basename(backup.path),
						description: `创建时间: ${backup.created.toLocaleString()}`,
						detail: backup.path,
					})),
					{
						title: "选择要恢复的备份",
						placeHolder: "选择一个备份文件进行恢复",
					},
				)

				if (!selectedBackup) {
					throw new ACPError(ACPErrorCode.VALIDATION_ERROR, "用户取消了恢复操作")
				}

				backupFile = selectedBackup.detail!
			}

			const configData = await fs.readFile(backupFile, "utf8")
			await this.storage.importConfigs(configData)

			vscode.window.showInformationMessage(`配置已从备份恢复: ${path.basename(backupFile)}`)
		} catch (error) {
			if (error instanceof ACPError) {
				throw error
			}
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`恢复备份失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * List available backups
	 */
	async listBackups(): Promise<Array<{ path: string; created: Date; size: number }>> {
		try {
			const backupDir = path.join(this.context.globalStorageUri.fsPath, "backups")

			try {
				const files = await fs.readdir(backupDir)
				const backups = []

				for (const file of files) {
					if (file.startsWith("acp-config-backup-") && file.endsWith(".json")) {
						const filePath = path.join(backupDir, file)
						const stats = await fs.stat(filePath)
						backups.push({
							path: filePath,
							created: stats.mtime,
							size: stats.size,
						})
					}
				}

				return backups.sort((a, b) => b.created.getTime() - a.created.getTime())
			} catch (error) {
				// Backup directory doesn't exist
				return []
			}
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`列出备份失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Create configuration template
	 */
	async createTemplate(templateName: string, configs: ACPAgentConfig[]): Promise<void> {
		try {
			const templateDir = path.join(this.context.globalStorageUri.fsPath, "templates")
			await fs.mkdir(templateDir, { recursive: true })

			const templateFile = path.join(templateDir, `${templateName}.json`)
			const templateData = {
				name: templateName,
				description: `配置模板: ${templateName}`,
				created: new Date().toISOString(),
				configs: configs,
			}

			await fs.writeFile(templateFile, JSON.stringify(templateData, null, 2), "utf8")

			vscode.window.showInformationMessage(`模板 "${templateName}" 已创建`)
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`创建模板失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Apply configuration template
	 */
	async applyTemplate(templateName?: string): Promise<void> {
		try {
			if (!templateName) {
				const templates = await this.listTemplates()

				if (templates.length === 0) {
					throw new ACPError(ACPErrorCode.NOT_FOUND, "没有找到配置模板")
				}

				const selectedTemplate = await vscode.window.showQuickPick(
					templates.map((template) => ({
						label: template.name,
						description: template.description,
						detail: `创建时间: ${new Date(template.created).toLocaleString()}`,
					})),
					{
						title: "选择配置模板",
						placeHolder: "选择要应用的配置模板",
					},
				)

				if (!selectedTemplate) {
					throw new ACPError(ACPErrorCode.VALIDATION_ERROR, "用户取消了模板应用")
				}

				templateName = selectedTemplate.label
			}

			const templateDir = path.join(this.context.globalStorageUri.fsPath, "templates")
			const templateFile = path.join(templateDir, `${templateName}.json`)

			const templateData = JSON.parse(await fs.readFile(templateFile, "utf8"))

			// Apply each configuration from template
			for (const config of templateData.configs) {
				await this.storage.saveAgentConfig(config)
			}

			vscode.window.showInformationMessage(`模板 "${templateName}" 已应用`)
		} catch (error) {
			if (error instanceof ACPError) {
				throw error
			}
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`应用模板失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * List available templates
	 */
	async listTemplates(): Promise<Array<{ name: string; description: string; created: string }>> {
		try {
			const templateDir = path.join(this.context.globalStorageUri.fsPath, "templates")

			try {
				const files = await fs.readdir(templateDir)
				const templates = []

				for (const file of files) {
					if (file.endsWith(".json")) {
						const filePath = path.join(templateDir, file)
						const templateData = JSON.parse(await fs.readFile(filePath, "utf8"))
						templates.push({
							name: templateData.name,
							description: templateData.description,
							created: templateData.created,
						})
					}
				}

				return templates.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
			} catch (error) {
				return []
			}
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`列出模板失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Reset to default configuration
	 */
	async resetToDefaults(): Promise<void> {
		try {
			// Create backup before reset
			await this.createBackup()

			// Get all current configs
			const currentConfigs = await this.storage.loadAllConfigs()

			// Delete all current configs
			for (const config of currentConfigs) {
				await this.storage.deleteAgentConfig(config.id)
			}

			// Create default configurations
			const defaultConfigs = this.getDefaultConfigurations()
			for (const config of defaultConfigs) {
				await this.storage.saveAgentConfig(config)
			}

			vscode.window.showInformationMessage("配置已重置为默认值（已自动备份原配置）")
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`重置配置失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Get default configurations for common agents
	 */
	private getDefaultConfigurations(): ACPAgentConfig[] {
		const baseDefaults = this.storage.getDefaultConfig()

		return [
			{
				...baseDefaults,
				id: "github-copilot",
				name: "GitHub Copilot",
				endpoint: "ws://localhost:8080/copilot",
				transport: "websocket",
				permissions: {
					fileAccess: { read: true, write: true, execute: false },
					networkAccess: true,
				},
			} as ACPAgentConfig,
			{
				...baseDefaults,
				id: "claude-code",
				name: "Claude Code",
				endpoint: "ws://localhost:8081/claude",
				transport: "websocket",
				permissions: {
					fileAccess: { read: true, write: true, execute: false },
					networkAccess: true,
				},
			} as ACPAgentConfig,
		]
	}

	/**
	 * Clean up old backup files (keep only last 10)
	 */
	private async cleanupOldBackups(backupDir: string): Promise<void> {
		try {
			const backups = await this.listBackups()

			if (backups.length > 10) {
				const oldBackups = backups.slice(10)
				for (const backup of oldBackups) {
					await fs.unlink(backup.path)
				}
			}
		} catch (error) {
			// Ignore cleanup errors
			console.warn("Failed to cleanup old backups:", error)
		}
	}

	/**
	 * Get configuration statistics
	 */
	async getConfigurationStats(): Promise<{
		totalConfigs: number
		enabledConfigs: number
		transportTypes: Record<string, number>
		backupCount: number
		templateCount: number
	}> {
		try {
			const configs = await this.storage.loadAllConfigs()
			const backups = await this.listBackups()
			const templates = await this.listTemplates()

			const transportTypes: Record<string, number> = {}
			let enabledConfigs = 0

			for (const config of configs) {
				if (config.enabled) {
					enabledConfigs++
				}
				transportTypes[config.transport] = (transportTypes[config.transport] || 0) + 1
			}

			return {
				totalConfigs: configs.length,
				enabledConfigs,
				transportTypes,
				backupCount: backups.length,
				templateCount: templates.length,
			}
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.STORAGE_ERROR,
				`获取配置统计失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}
}
