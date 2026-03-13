// cmbt-agent_change - new file
import * as vscode from "vscode"

export enum AcpLogLevel {
	ERROR = "error",
	WARN = "warn",
	INFO = "info",
	DEBUG = "debug",
	TRACE = "trace",
}

const LOG_LEVEL_PRIORITY: Record<AcpLogLevel, number> = {
	[AcpLogLevel.ERROR]: 0,
	[AcpLogLevel.WARN]: 1,
	[AcpLogLevel.INFO]: 2,
	[AcpLogLevel.DEBUG]: 3,
	[AcpLogLevel.TRACE]: 4,
}

export interface IAcpLogger {
	error(message: string, error?: Error, context?: Record<string, unknown>): void
	warn(message: string, context?: Record<string, unknown>): void
	info(message: string, context?: Record<string, unknown>): void
	debug(message: string, context?: Record<string, unknown>): void
	trace(direction: "send" | "receive", message: unknown): void
	setLevel(level: AcpLogLevel): void
	dispose(): void
}

export class AcpLogger implements IAcpLogger {
	private outputChannel: vscode.OutputChannel
	private level: AcpLogLevel

	constructor(level: AcpLogLevel = AcpLogLevel.INFO) {
		this.outputChannel = vscode.window.createOutputChannel("ACP Client")
		this.level = level
	}

	setLevel(level: AcpLogLevel): void {
		this.level = level
	}

	error(message: string, error?: Error, context?: Record<string, unknown>): void {
		if (!this.shouldLog(AcpLogLevel.ERROR)) {
			return
		}
		let line = this.formatMessage("ERROR", message)
		if (error) {
			line += `\n  Error: ${error.message}`
			if (error.stack) {
				line += `\n  Stack: ${error.stack}`
			}
		}
		if (context) {
			line += `\n  Context: ${JSON.stringify(context)}`
		}
		this.outputChannel.appendLine(line)
	}

	warn(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog(AcpLogLevel.WARN)) {
			return
		}
		let line = this.formatMessage("WARN", message)
		if (context) {
			line += `\n  Context: ${JSON.stringify(context)}`
		}
		this.outputChannel.appendLine(line)
	}

	info(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog(AcpLogLevel.INFO)) {
			return
		}
		let line = this.formatMessage("INFO", message)
		if (context) {
			line += `\n  Context: ${JSON.stringify(context)}`
		}
		this.outputChannel.appendLine(line)
	}

	debug(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog(AcpLogLevel.DEBUG)) {
			return
		}
		let line = this.formatMessage("DEBUG", message)
		if (context) {
			line += `\n  Context: ${JSON.stringify(context)}`
		}
		this.outputChannel.appendLine(line)
	}

	trace(direction: "send" | "receive", message: unknown): void {
		if (!this.shouldLog(AcpLogLevel.TRACE)) {
			return
		}
		const arrow = direction === "send" ? ">>>" : "<<<"
		const serialized = typeof message === "string" ? message : JSON.stringify(message, null, 2)
		this.outputChannel.appendLine(`[TRACE] ${arrow} ${serialized}`)
	}

	dispose(): void {
		this.outputChannel.dispose()
	}

	private shouldLog(messageLevel: AcpLogLevel): boolean {
		return LOG_LEVEL_PRIORITY[messageLevel] <= LOG_LEVEL_PRIORITY[this.level]
	}

	private formatMessage(level: string, message: string): string {
		return `[${level}] ${message}`
	}
}
