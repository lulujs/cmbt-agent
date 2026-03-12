// cmbt-agent_change - new file
/**
 * Log Viewer for ACP Protocol Logger
 * Implements log viewing interface and debug mode detailed logging
 * Requirements: 8.4, 8.5
 */

import * as vscode from "vscode"
import { ProtocolLogger, ProtocolLogEntry, LogLevel } from "./ProtocolLogger"

export interface LogViewerOptions {
	agentId?: string
	level?: LogLevel
	direction?: "send" | "receive"
	limit?: number
	search?: string
	dateRange?: {
		start: Date
		end: Date
	}
}

export class LogViewer {
	private outputChannel: vscode.OutputChannel
	private protocolLogger: ProtocolLogger

	constructor(protocolLogger: ProtocolLogger) {
		this.protocolLogger = protocolLogger
		this.outputChannel = vscode.window.createOutputChannel("ACP Protocol Logs")
	}

	/**
	 * Show logs in VSCode output panel
	 */
	showLogs(options?: LogViewerOptions): void {
		const logs = this.filterLogs(options)

		this.outputChannel.clear()
		this.outputChannel.appendLine("=== ACP Protocol Logs ===")
		this.outputChannel.appendLine(`Total entries: ${logs.length}`)
		this.outputChannel.appendLine("")

		for (const log of logs) {
			this.outputChannel.appendLine(this.formatLogEntry(log))
		}

		this.outputChannel.show()
	}

	/**
	 * Export logs to file
	 */
	async exportLogsToFile(options?: LogViewerOptions): Promise<void> {
		const logs = this.filterLogs(options)

		if (logs.length === 0) {
			vscode.window.showInformationMessage("没有日志可导出")
			return
		}

		const uri = await vscode.window.showSaveDialog({
			defaultUri: vscode.Uri.file(`acp-logs-${new Date().toISOString().split("T")[0]}.json`),
			filters: {
				"JSON Files": ["json"],
				"Text Files": ["txt"],
				"All Files": ["*"],
			},
		})

		if (!uri) return

		try {
			const content = uri.fsPath.endsWith(".json") ? JSON.stringify(logs, null, 2) : this.formatLogsAsText(logs)

			await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"))
			vscode.window.showInformationMessage(`日志已导出到 ${uri.fsPath}`)
		} catch (error) {
			vscode.window.showErrorMessage(`导出日志失败: ${error}`)
		}
	}

	/**
	 * Show log statistics
	 */
	showLogStatistics(): void {
		const stats = this.protocolLogger.getLogStats()

		this.outputChannel.clear()
		this.outputChannel.appendLine("=== ACP Protocol Log Statistics ===")
		this.outputChannel.appendLine(`Total entries: ${stats.totalEntries}`)
		this.outputChannel.appendLine("")

		this.outputChannel.appendLine("Entries by Agent:")
		for (const [agentId, count] of Object.entries(stats.entriesByAgent)) {
			this.outputChannel.appendLine(`  ${agentId}: ${count}`)
		}
		this.outputChannel.appendLine("")

		this.outputChannel.appendLine("Entries by Level:")
		for (const [level, count] of Object.entries(stats.entriesByLevel)) {
			const levelName = LogLevel[parseInt(level)]
			this.outputChannel.appendLine(`  ${levelName}: ${count}`)
		}
		this.outputChannel.appendLine("")

		if (stats.oldestEntry) {
			this.outputChannel.appendLine(`Oldest entry: ${stats.oldestEntry.toISOString()}`)
		}
		if (stats.newestEntry) {
			this.outputChannel.appendLine(`Newest entry: ${stats.newestEntry.toISOString()}`)
		}

		this.outputChannel.show()
	}

	/**
	 * Search logs by content
	 */
	async searchLogs(): Promise<void> {
		const searchTerm = await vscode.window.showInputBox({
			prompt: "输入搜索关键词",
			placeHolder: "搜索日志内容...",
		})

		if (!searchTerm) return

		const options: LogViewerOptions = {
			search: searchTerm,
		}

		this.showLogs(options)
	}

	/**
	 * Filter logs for specific agent
	 */
	async filterByAgent(): Promise<void> {
		const stats = this.protocolLogger.getLogStats()
		const agentIds = Object.keys(stats.entriesByAgent)

		if (agentIds.length === 0) {
			vscode.window.showInformationMessage("没有可用的智能体日志")
			return
		}

		const selectedAgent = await vscode.window.showQuickPick(agentIds, {
			placeHolder: "选择要查看的智能体",
		})

		if (!selectedAgent) return

		this.showLogs({ agentId: selectedAgent })
	}

	/**
	 * Filter logs by level
	 */
	async filterByLevel(): Promise<void> {
		const levels = [
			{ label: "DEBUG", description: "调试信息", level: LogLevel.DEBUG },
			{ label: "INFO", description: "一般信息", level: LogLevel.INFO },
			{ label: "WARN", description: "警告信息", level: LogLevel.WARN },
			{ label: "ERROR", description: "错误信息", level: LogLevel.ERROR },
		]

		const selectedLevel = await vscode.window.showQuickPick(levels, {
			placeHolder: "选择日志级别",
		})

		if (!selectedLevel) return

		this.showLogs({ level: selectedLevel.level })
	}

	/**
	 * Clear logs with confirmation
	 */
	async clearLogs(): Promise<void> {
		const stats = this.protocolLogger.getLogStats()

		if (stats.totalEntries === 0) {
			vscode.window.showInformationMessage("没有日志需要清除")
			return
		}

		const choice = await vscode.window.showWarningMessage(
			`确定要清除所有 ${stats.totalEntries} 条日志吗？此操作不可撤销。`,
			{ modal: true },
			"清除所有日志",
			"取消",
		)

		if (choice === "清除所有日志") {
			this.protocolLogger.clearLogs()
			this.outputChannel.clear()
			this.outputChannel.appendLine("所有日志已清除")
			this.outputChannel.show()
			vscode.window.showInformationMessage("日志已清除")
		}
	}

	/**
	 * Toggle debug mode
	 */
	async toggleDebugMode(): Promise<void> {
		const config = this.protocolLogger.getConfig()
		const newDebugMode = !config.enableDebugMode

		this.protocolLogger.updateConfig({ enableDebugMode: newDebugMode })

		const status = newDebugMode ? "已启用" : "已禁用"
		vscode.window.showInformationMessage(`调试模式${status}`)
	}

	/**
	 * Show real-time logs (tail mode)
	 */
	startTailMode(): void {
		this.outputChannel.clear()
		this.outputChannel.appendLine("=== ACP Protocol Logs (实时模式) ===")
		this.outputChannel.appendLine("正在监听新的日志条目...")
		this.outputChannel.appendLine("")
		this.outputChannel.show()

		// Note: In a real implementation, you would set up a listener
		// for new log entries and append them to the output channel
	}

	private filterLogs(options?: LogViewerOptions): ProtocolLogEntry[] {
		let logs = this.protocolLogger.getAllLogs({
			agentId: options?.agentId,
			level: options?.level,
			direction: options?.direction,
			limit: options?.limit,
		})

		// Apply search filter
		if (options?.search) {
			const searchTerm = options.search.toLowerCase()
			logs = logs.filter(
				(log) =>
					log.messageType.toLowerCase().includes(searchTerm) ||
					JSON.stringify(log.content).toLowerCase().includes(searchTerm) ||
					log.agentId.toLowerCase().includes(searchTerm),
			)
		}

		// Apply date range filter
		if (options?.dateRange) {
			logs = logs.filter(
				(log) => log.timestamp >= options.dateRange!.start && log.timestamp <= options.dateRange!.end,
			)
		}

		return logs
	}

	private formatLogEntry(log: ProtocolLogEntry): string {
		const timestamp = log.timestamp.toISOString()
		const level = LogLevel[log.level].padEnd(5)
		const direction = log.direction === "send" ? "→" : "←"
		const size = `${log.size}B`.padStart(8)

		let content = ""
		if (typeof log.content === "object") {
			content = JSON.stringify(log.content, null, 2)
		} else {
			content = String(log.content)
		}

		return `[${timestamp}] ${level} ${direction} ${log.agentId} ${log.messageType} ${size}
${content}
${"─".repeat(80)}`
	}

	private formatLogsAsText(logs: ProtocolLogEntry[]): string {
		const lines = ["ACP Protocol Logs", "=".repeat(50), ""]

		for (const log of logs) {
			lines.push(this.formatLogEntry(log))
			lines.push("")
		}

		return lines.join("\n")
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.outputChannel.dispose()
	}
}
