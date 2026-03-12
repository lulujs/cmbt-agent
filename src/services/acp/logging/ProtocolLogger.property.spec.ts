// cmbt-agent_change - new file
/**
 * Property-based tests for ProtocolLogger
 * Property 9: 协议日志记录完整性
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import * as fc from "fast-check"
import { ProtocolLogger, LogLevel, ProtocolLoggerConfig } from "./ProtocolLogger"
import { ACPMessage, ACPResponse } from "../types"

describe("ProtocolLogger Property Tests", () => {
	let protocolLogger: ProtocolLogger

	beforeEach(() => {
		protocolLogger = new ProtocolLogger({
			maxEntries: 100,
			logLevel: LogLevel.DEBUG,
			enableDebugMode: true,
			logToFile: false,
		})
	})

	// Arbitraries for property testing
	const agentIdArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9-]+$/.test(s))

	const acpMessageArb = fc.record({
		id: fc.string({ minLength: 1, maxLength: 10 }),
		method: fc.oneof(
			fc.constant("initialize"),
			fc.constant("sendMessage"),
			fc.constant("getCapabilities"),
			fc.constant("executeCommand"),
		),
		params: fc.oneof(
			fc.record({ text: fc.string({ maxLength: 100 }) }),
			fc.record({ command: fc.string({ maxLength: 50 }) }),
			fc.constant({}),
		),
	})

	const acpResponseArb = fc.record({
		id: fc.string({ minLength: 1, maxLength: 10 }),
		result: fc.option(
			fc.record({
				success: fc.boolean(),
				data: fc.string({ maxLength: 100 }),
			}),
		),
		error: fc.option(
			fc.record({
				code: fc.integer({ min: -32768, max: -32000 }),
				message: fc.string({ maxLength: 100 }),
			}),
		),
	})

	const logLevelArb = fc.oneof(
		fc.constant(LogLevel.DEBUG),
		fc.constant(LogLevel.INFO),
		fc.constant(LogLevel.WARN),
		fc.constant(LogLevel.ERROR),
	)

	describe("Property 9: 协议日志记录完整性", () => {
		it("所有发送的消息都应该被正确记录", () => {
			fc.assert(
				fc.property(agentIdArb, acpMessageArb, (agentId, message) => {
					const initialCount = protocolLogger.getAgentLogs(agentId).length

					protocolLogger.logSentMessage(agentId, message)

					const logs = protocolLogger.getAgentLogs(agentId)
					expect(logs.length).toBe(initialCount + 1)

					const latestLog = logs[logs.length - 1]
					expect(latestLog.agentId).toBe(agentId)
					expect(latestLog.direction).toBe("send")
					expect(latestLog.messageType).toBe(message.method || "unknown")
					expect(latestLog.messageId).toBe(message.id || "no-id")
					expect(latestLog.timestamp).toBeInstanceOf(Date)
					expect(latestLog.level).toBe(LogLevel.INFO)
				}),
				{ numRuns: 20 },
			)
		})

		it("所有接收的响应都应该被正确记录", () => {
			fc.assert(
				fc.property(agentIdArb, acpResponseArb, (agentId, response) => {
					const initialCount = protocolLogger.getAgentLogs(agentId).length

					protocolLogger.logReceivedMessage(agentId, response)

					const logs = protocolLogger.getAgentLogs(agentId)
					expect(logs.length).toBe(initialCount + 1)

					const latestLog = logs[logs.length - 1]
					expect(latestLog.agentId).toBe(agentId)
					expect(latestLog.direction).toBe("receive")
					expect(latestLog.messageType).toBe(response.error ? "error" : "response")
					expect(latestLog.messageId).toBe(response.id || "no-id")
					expect(latestLog.timestamp).toBeInstanceOf(Date)
					expect(latestLog.level).toBe(response.error ? LogLevel.ERROR : LogLevel.INFO)
				}),
				{ numRuns: 20 },
			)
		})

		it("日志级别过滤应该正确工作", () => {
			fc.assert(
				fc.property(
					logLevelArb,
					fc.array(
						fc.record({
							agentId: agentIdArb,
							level: logLevelArb,
							message: fc.string({ maxLength: 50 }),
						}),
						{ minLength: 5, maxLength: 15 },
					),
					(filterLevel, logEntries) => {
						// Set logger to filter at specified level
						protocolLogger.updateConfig({ logLevel: filterLevel })

						// Clear existing logs
						protocolLogger.clearLogs()

						// Add log entries with different levels
						for (const entry of logEntries) {
							if (entry.level === LogLevel.DEBUG) {
								protocolLogger.logDebug(entry.agentId, entry.message)
							} else if (entry.level === LogLevel.ERROR) {
								protocolLogger.logError(entry.agentId, new Error(entry.message))
							} else {
								// For INFO/WARN, use a mock message
								const mockMessage: ACPMessage = {
									id: "test",
									method: "test",
									params: { text: entry.message },
								}
								protocolLogger.logSentMessage(entry.agentId, mockMessage)
							}
						}

						// Verify only logs at or above filter level are present
						const allLogs = protocolLogger.getAllLogs()
						for (const log of allLogs) {
							expect(log.level).toBeGreaterThanOrEqual(filterLevel)
						}

						// Count expected logs
						const expectedCount = logEntries.filter((entry) => entry.level >= filterLevel).length
						expect(allLogs.length).toBe(expectedCount)
					},
				),
				{ numRuns: 10 },
			)
		})

		it("日志条目数量限制应该正确执行", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 5, max: 20 }),
					fc.integer({ min: 25, max: 50 }),
					agentIdArb,
					(maxEntries, numMessages, agentId) => {
						// Create logger with specific max entries
						const logger = new ProtocolLogger({ maxEntries })

						// Add more messages than the limit
						for (let i = 0; i < numMessages; i++) {
							const message: ACPMessage = {
								id: `msg-${i}`,
								method: "test",
								params: { index: i },
							}
							logger.logSentMessage(agentId, message)
						}

						const logs = logger.getAllLogs()
						expect(logs.length).toBeLessThanOrEqual(maxEntries)

						// If we exceeded the limit, verify we kept the most recent entries
						if (numMessages > maxEntries) {
							expect(logs.length).toBe(maxEntries)

							// Check that we have the most recent entries
							const lastLog = logs[logs.length - 1]
							expect(lastLog.messageId).toBe(`msg-${numMessages - 1}`)
						}
					},
				),
				{ numRuns: 15 },
			)
		})

		it("敏感信息应该被正确清理", () => {
			fc.assert(
				fc.property(
					agentIdArb,
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 10 }),
						method: fc.constant("authenticate"),
						params: fc.record({
							password: fc.string({ minLength: 8, maxLength: 20 }),
							apiKey: fc.string({ minLength: 10, maxLength: 30 }),
							token: fc.string({ minLength: 15, maxLength: 40 }),
							username: fc.string({ minLength: 3, maxLength: 15 }),
						}),
					}),
					(agentId, sensitiveMessage) => {
						protocolLogger.logSentMessage(agentId, sensitiveMessage)

						const logs = protocolLogger.getAgentLogs(agentId)
						const latestLog = logs[logs.length - 1]

						// Verify sensitive fields are redacted
						const content = latestLog.content
						expect(content.params.password).toBe("[REDACTED]")
						expect(content.params.apiKey).toBe("[REDACTED]")
						expect(content.params.token).toBe("[REDACTED]")

						// Non-sensitive fields should remain
						expect(content.params.username).toBe(sensitiveMessage.params.username)
						expect(content.method).toBe(sensitiveMessage.method)
						expect(content.id).toBe(sensitiveMessage.id)
					},
				),
				{ numRuns: 15 },
			)
		})

		it("日志统计应该准确反映实际数据", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							agentId: agentIdArb,
							messageType: fc.oneof(fc.constant("send"), fc.constant("receive"), fc.constant("error")),
						}),
						{ minLength: 10, maxLength: 30 },
					),
					(logEntries) => {
						protocolLogger.clearLogs()

						// Add log entries
						for (const entry of logEntries) {
							if (entry.messageType === "send") {
								const message: ACPMessage = {
									id: "test",
									method: "test",
									params: {},
								}
								protocolLogger.logSentMessage(entry.agentId, message)
							} else if (entry.messageType === "receive") {
								const response: ACPResponse = {
									id: "test",
									result: { success: true },
								}
								protocolLogger.logReceivedMessage(entry.agentId, response)
							} else {
								protocolLogger.logError(entry.agentId, new Error("test error"))
							}
						}

						const stats = protocolLogger.getLogStats()

						// Verify total count
						expect(stats.totalEntries).toBe(logEntries.length)

						// Verify agent counts
						const expectedAgentCounts: Record<string, number> = {}
						for (const entry of logEntries) {
							expectedAgentCounts[entry.agentId] = (expectedAgentCounts[entry.agentId] || 0) + 1
						}

						for (const [agentId, expectedCount] of Object.entries(expectedAgentCounts)) {
							expect(stats.entriesByAgent[agentId]).toBe(expectedCount)
						}

						// Verify level counts
						const errorCount = logEntries.filter((e) => e.messageType === "error").length
						const infoCount = logEntries.filter((e) => e.messageType !== "error").length

						expect(stats.entriesByLevel[LogLevel.ERROR]).toBe(errorCount)
						expect(stats.entriesByLevel[LogLevel.INFO]).toBe(infoCount)
					},
				),
				{ numRuns: 10 },
			)
		})

		it("日志清理应该正确移除指定智能体的日志", () => {
			fc.assert(
				fc.property(
					fc.array(agentIdArb, { minLength: 2, maxLength: 5 }),
					fc.integer({ min: 3, max: 8 }),
					(agentIds, messagesPerAgent) => {
						protocolLogger.clearLogs()

						// Add messages for each agent
						for (const agentId of agentIds) {
							for (let i = 0; i < messagesPerAgent; i++) {
								const message: ACPMessage = {
									id: `msg-${i}`,
									method: "test",
									params: {},
								}
								protocolLogger.logSentMessage(agentId, message)
							}
						}

						// Pick a random agent to clear
						const agentToClear = agentIds[0]
						const initialTotalLogs = protocolLogger.getAllLogs().length
						const initialAgentLogs = protocolLogger.getAgentLogs(agentToClear).length

						protocolLogger.clearLogs(agentToClear)

						// Verify agent's logs are cleared
						expect(protocolLogger.getAgentLogs(agentToClear).length).toBe(0)

						// Verify other agents' logs remain
						const finalTotalLogs = protocolLogger.getAllLogs().length
						expect(finalTotalLogs).toBe(initialTotalLogs - initialAgentLogs)

						// Verify other agents still have their logs
						for (const agentId of agentIds.slice(1)) {
							expect(protocolLogger.getAgentLogs(agentId).length).toBe(messagesPerAgent)
						}
					},
				),
				{ numRuns: 10 },
			)
		})

		it("日志导出应该包含所有必要信息", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.record({
							agentId: agentIdArb,
							message: acpMessageArb,
						}),
						{ minLength: 3, maxLength: 10 },
					),
					(logData) => {
						protocolLogger.clearLogs()

						// Add log entries
						for (const data of logData) {
							protocolLogger.logSentMessage(data.agentId, data.message)
						}

						const exportedJson = protocolLogger.exportLogs()
						const parsedLogs = JSON.parse(exportedJson)

						expect(Array.isArray(parsedLogs)).toBe(true)
						expect(parsedLogs.length).toBe(logData.length)

						// Verify each exported log has required fields
						for (const log of parsedLogs) {
							expect(log).toHaveProperty("timestamp")
							expect(log).toHaveProperty("agentId")
							expect(log).toHaveProperty("direction")
							expect(log).toHaveProperty("messageType")
							expect(log).toHaveProperty("messageId")
							expect(log).toHaveProperty("content")
							expect(log).toHaveProperty("size")
							expect(log).toHaveProperty("level")
						}
					},
				),
				{ numRuns: 10 },
			)
		})
	})
})
