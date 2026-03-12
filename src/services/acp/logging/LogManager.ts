// cmbt-agent_change - new file
/**
 * Log Manager for ACP Protocol
 * Integrates ProtocolLogger and LogViewer with VSCode commands
 * Requirements: 8.4, 8.5
 */

import * as vscode from "vscode"
import { ProtocolLogger, LogLevel } from "./ProtocolLogger"
import { LogViewer } from "./LogViewer"

export class LogManager implements vscode.Disposable {
	private protocolLogger: ProtocolLogger
	private logViewer: LogViewer
	private disposables: vscode.Disposable[] = []

	constructor() {
		this.protocolLogger = new ProtocolLogger({
			maxEntries: 5000,
			logLevel: LogLevel.INFO,
			enableDebugMode: false,
			logToFile: false,
		})

		this.logViewer = new LogViewer(this.protocolLogger)
		this.registerCommands()
	}

	/**
	 * Get the protocol logger instance
	 */
	getProtocolLogger(): ProtocolLogger {
		return this.protocolLogger
	}

	/**
	 * Get the log viewer instance
	 */
	getLogViewer(): LogViewer {
		return this.logViewer
	}

	private registerCommands(): void {
		// Register VSCode commands for log management
		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.show", () => {
				this.logViewer.showLogs()
			}),
		)

		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.showStats", () => {
				this.logViewer.showLogStatistics()
			}),
		)

		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.export", () => {
				this.logViewer.exportLogsToFile()
			}),
		)

		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.search", () => {
				this.logViewer.searchLogs()
			}),
		)

		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.filterByAgent", () => {
				this.logViewer.filterByAgent()
			}),
		)

		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.filterByLevel", () => {
				this.logViewer.filterByLevel()
			}),
		)

		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.clear", () => {
				this.logViewer.clearLogs()
			}),
		)

		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.toggleDebug", () => {
				this.logViewer.toggleDebugMode()
			}),
		)

		this.disposables.push(
			vscode.commands.registerCommand("acp.logs.tail", () => {
				this.logViewer.startTailMode()
			}),
		)
	}

	dispose(): void {
		this.disposables.forEach((d) => d.dispose())
		this.logViewer.dispose()
	}
}
