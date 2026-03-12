// cmbt-agent_change - new file
/**
 * Protocol Logger for ACP (Agent Client Protocol)
 * Implements ACP message logging with timestamp and agent identification
 * Requirements: 8.1, 8.2, 8.3
 */

import * as vscode from "vscode"
import { ACPMessage, ACPResponse } from "../types"

export interface ProtocolLogEntry {
	timestamp: Date
	agentId: string
	direction: "send" | "receive"
	messageType: string
	messageId: string
	content: any
	size: number
	level: LogLevel
}

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

export interface ProtocolLoggerConfig {
	maxEntries: number
	logLevel: LogLevel
	enableDebugMode: boolean
	logToFile: boolean
	logFilePath?: string
}

export class ProtocolLogger {
	private logs: ProtocolLogEntry[] = []
	private config: ProtocolLoggerConfig
	private readonly maxLogSize = 10000 // Maximum entries to keep in memory

	constructor(config?: Partial<ProtocolLoggerConfig>) {
		this.config = {
			maxEntries: 1000,
			logLevel: LogLevel.INFO,
			enableDebugMode: false,
			logToFile: false,
			...config,
		}
	}

	/**
	 * Log an outgoing ACP message
	 */
	logSentMessage(agentId: string, message: ACPMessage): void {
		this.addLogEntry({
			timestamp: new Date(),
			agentId,
			direction: "send",
			messageType: message.method || "unknown",
			messageId: message.id || "no-id",
			content: this.sanitizeContent(message),
			size: JSON.stringify(message).length,
			level: LogLevel.INFO,
		})
	}

	/**
	 * Log an incoming ACP response
	 */
	logReceivedMessage(agentId: string, response: ACPResponse): void {
		const level = response.error ? LogLevel.ERROR : LogLevel.INFO

		this.addLogEntry({
			timestamp: new Date(),
			agentId,
			direction: "receive",
			messageType: response.error ? "error" : "response",
			messageId: response.id || "no-id",
			content: this.sanitizeContent(response),
			size: JSON.stringify(response).length,
			level,
		})
	}

	/**
	 * Log debug information
	 */
	logDebug(agentId: string, message: string, data?: any): void {
		if (!this.config.enableDebugMode) return

		this.addLogEntry({
			timestamp: new Date(),
			agentId,
			direction: "send",
			messageType: "debug",
			messageId: "debug",
			content: { message, data },
			size: JSON.stringify({ message, data }).length,
			level: LogLevel.DEBUG,
		})
	}

	/**
	 * Log error information
	 */
	logError(agentId: string, error: Error, context?: any): void {
		this.addLogEntry({
			timestamp: new Date(),
			agentId,
			direction: "receive",
			messageType: "error",
			messageId: "error",
			content: {
				error: error.message,
				stack: error.stack,
				context,
			},
			size: JSON.stringify({ error: error.message, context }).length,
			level: LogLevel.ERROR,
		})
	}

	/**
	 * Get logs for a specific agent
	 */
	getAgentLogs(agentId: string, limit?: number): ProtocolLogEntry[] {
		const agentLogs = this.logs.filter((log) => log.agentId === agentId)
		return limit ? agentLogs.slice(-limit) : agentLogs
	}

	/**
	 * Get all logs with optional filtering
	 */
	getAllLogs(options?: {
		agentId?: string
		level?: LogLevel
		direction?: "send" | "receive"
		limit?: number
	}): ProtocolLogEntry[] {
		let filteredLogs = this.logs

		if (options?.agentId) {
			filteredLogs = filteredLogs.filter((log) => log.agentId === options.agentId)
		}

		if (options?.level !== undefined) {
			filteredLogs = filteredLogs.filter((log) => log.level >= options.level!)
		}

		if (options?.direction) {
			filteredLogs = filteredLogs.filter((log) => log.direction === options.direction)
		}

		return options?.limit ? filteredLogs.slice(-options.limit) : filteredLogs
	}

	/**
	 * Clear logs for a specific agent or all logs
	 */
	clearLogs(agentId?: string): void {
		if (agentId) {
			this.logs = this.logs.filter((log) => log.agentId !== agentId)
		} else {
			this.logs = []
		}
	}

	/**
	 * Export logs as JSON string
	 */
	exportLogs(agentId?: string): string {
		const logsToExport = agentId ? this.getAgentLogs(agentId) : this.logs
		return JSON.stringify(logsToExport, null, 2)
	}

	/**
	 * Get log statistics
	 */
	getLogStats(): {
		totalEntries: number
		entriesByAgent: Record<string, number>
		entriesByLevel: Record<LogLevel, number>
		oldestEntry?: Date
		newestEntry?: Date
	} {
		const entriesByAgent: Record<string, number> = {}
		const entriesByLevel: Record<LogLevel, number> = {
			[LogLevel.DEBUG]: 0,
			[LogLevel.INFO]: 0,
			[LogLevel.WARN]: 0,
			[LogLevel.ERROR]: 0,
		}

		let oldestEntry: Date | undefined
		let newestEntry: Date | undefined

		for (const log of this.logs) {
			// Count by agent
			entriesByAgent[log.agentId] = (entriesByAgent[log.agentId] || 0) + 1

			// Count by level
			entriesByLevel[log.level]++

			// Track oldest and newest
			if (!oldestEntry || log.timestamp < oldestEntry) {
				oldestEntry = log.timestamp
			}
			if (!newestEntry || log.timestamp > newestEntry) {
				newestEntry = log.timestamp
			}
		}

		return {
			totalEntries: this.logs.length,
			entriesByAgent,
			entriesByLevel,
			oldestEntry,
			newestEntry,
		}
	}

	/**
	 * Update logger configuration
	 */
	updateConfig(config: Partial<ProtocolLoggerConfig>): void {
		this.config = { ...this.config, ...config }

		// Trim logs if max entries changed
		if (this.logs.length > this.config.maxEntries) {
			this.logs = this.logs.slice(-this.config.maxEntries)
		}
	}

	/**
	 * Get current configuration
	 */
	getConfig(): ProtocolLoggerConfig {
		return { ...this.config }
	}

	private addLogEntry(entry: ProtocolLogEntry): void {
		// Check if we should log this level
		if (entry.level < this.config.logLevel) {
			return
		}

		this.logs.push(entry)

		// Trim logs if we exceed max entries
		if (this.logs.length > this.config.maxEntries) {
			this.logs = this.logs.slice(-this.config.maxEntries)
		}

		// Log to VSCode output channel if debug mode is enabled
		if (this.config.enableDebugMode) {
			this.logToOutputChannel(entry)
		}
	}

	private sanitizeContent(content: any): any {
		// Remove sensitive information from logs
		if (typeof content === "object" && content !== null) {
			const sanitized = { ...content }

			// Remove common sensitive fields
			const sensitiveFields = ["password", "token", "apiKey", "secret", "auth"]
			for (const field of sensitiveFields) {
				if (field in sanitized) {
					sanitized[field] = "[REDACTED]"
				}
			}

			return sanitized
		}

		return content
	}

	private logToOutputChannel(entry: ProtocolLogEntry): void {
		const levelName = LogLevel[entry.level]
		const direction = entry.direction === "send" ? "→" : "←"
		const timestamp = entry.timestamp.toISOString()

		const message = `[${timestamp}] ${levelName} ${direction} ${entry.agentId}: ${entry.messageType} (${entry.size} bytes)`

		// Use VSCode output channel for logging
		// This would typically be injected or configured
		console.log(message)
	}
}
