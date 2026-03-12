// cmbt-agent_change - new file
/**
 * Utility functions for ACP (Agent Client Protocol) implementation
 *
 * This file provides helper functions for validation, configuration management,
 * and common operations used throughout the ACP service implementation.
 */

import type { ACPAgentConfig, ACPTransportType, ValidationResult, ACPMessage, ACPResponse } from "./types"
import { VALIDATION, TRANSPORT_DEFAULTS, PRE_CONFIGURED_AGENTS, DEFAULT_AGENT_CONFIG } from "./constants"

/**
 * Validates an agent ID according to ACP naming conventions
 */
export function validateAgentId(id: string): ValidationResult {
	const errors: string[] = []
	const warnings: string[] = []

	if (!id) {
		errors.push("智能体ID不能为空")
		return { valid: false, errors, warnings }
	}

	if (id.length < VALIDATION.AGENT_ID.MIN_LENGTH) {
		errors.push(`智能体ID长度不能少于${VALIDATION.AGENT_ID.MIN_LENGTH}个字符`)
	}

	if (id.length > VALIDATION.AGENT_ID.MAX_LENGTH) {
		errors.push(`智能体ID长度不能超过${VALIDATION.AGENT_ID.MAX_LENGTH}个字符`)
	}

	if (!VALIDATION.AGENT_ID.PATTERN.test(id)) {
		errors.push("智能体ID只能包含小写字母、数字和连字符")
	}

	if (id.startsWith("-") || id.endsWith("-")) {
		errors.push("智能体ID不能以连字符开头或结尾")
	}

	if (id.includes("--")) {
		warnings.push("智能体ID包含连续的连字符，建议避免使用")
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	}
}

/**
 * Validates an endpoint URL or address
 */
export function validateEndpoint(endpoint: string, transport: ACPTransportType): ValidationResult {
	const errors: string[] = []
	const warnings: string[] = []

	if (!endpoint) {
		errors.push("端点地址不能为空")
		return { valid: false, errors, warnings }
	}

	if (endpoint.length > VALIDATION.ENDPOINT.MAX_LENGTH) {
		errors.push(`端点地址长度不能超过${VALIDATION.ENDPOINT.MAX_LENGTH}个字符`)
	}

	switch (transport) {
		case "websocket":
			if (!endpoint.startsWith("ws://") && !endpoint.startsWith("wss://")) {
				errors.push("WebSocket端点必须以ws://或wss://开头")
			}
			break

		case "http":
			if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
				errors.push("HTTP端点必须以http://或https://开头")
			}
			break

		case "stdio":
			// For stdio, endpoint can be a command or path
			if (endpoint.includes("://")) {
				warnings.push("stdio传输通常不需要协议前缀")
			}
			break

		default:
			errors.push(`不支持的传输类型: ${transport}`)
	}

	// Check for localhost in production warnings
	if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1")) {
		warnings.push("使用localhost地址可能在生产环境中无法访问")
	}

	// Validate URL format for websocket and http
	if (transport === "websocket" || transport === "http") {
		try {
			new URL(endpoint)
		} catch {
			errors.push("端点地址格式无效")
		}
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	}
}

/**
 * Sanitizes and normalizes agent configuration
 */
export function sanitizeAgentConfig(config: ACPAgentConfig): ACPAgentConfig {
	const sanitized = { ...config }

	// Normalize ID
	sanitized.id = sanitized.id.toLowerCase().trim()

	// Trim string fields
	sanitized.name = sanitized.name.trim()
	sanitized.displayName = sanitized.displayName.trim()
	sanitized.endpoint = sanitized.endpoint.trim()

	// Normalize description
	if (sanitized.description) {
		sanitized.description = sanitized.description.trim()
	}

	// Ensure metadata has required fields
	if (!sanitized.metadata.created) {
		sanitized.metadata.created = new Date()
	}

	// Ensure capabilities is an array
	if (!Array.isArray(sanitized.metadata.capabilities)) {
		sanitized.metadata.capabilities = []
	}

	// Validate and normalize timeout values
	if (sanitized.settings.idleTimeout < VALIDATION.TIMEOUT.MIN) {
		sanitized.settings.idleTimeout = VALIDATION.TIMEOUT.MIN
	}
	if (sanitized.settings.idleTimeout > VALIDATION.TIMEOUT.MAX) {
		sanitized.settings.idleTimeout = VALIDATION.TIMEOUT.MAX
	}

	// Ensure retry attempts is positive
	if (sanitized.settings.retryAttempts < 0) {
		sanitized.settings.retryAttempts = 0
	}

	// Ensure retry delay is positive
	if (sanitized.settings.retryDelay < 0) {
		sanitized.settings.retryDelay = 1000
	}

	return sanitized
}

/**
 * Generates a unique message ID for ACP messages
 */
export function generateMessageId(): string {
	return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generates a unique connection ID for ACP connections
 */
export function generateConnectionId(): string {
	return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Utility class for ACP operations
 */
export class ACPUtils {
	static generateConnectionId(): string {
		return generateConnectionId()
	}
}

/**
 * Creates a properly formatted ACP message
 */
export function createACPMessage(method: string, params?: any, id?: string | number): ACPMessage {
	return {
		jsonrpc: "2.0",
		id: id || generateMessageId(),
		method,
		params,
	}
}

/**
 * Creates a properly formatted ACP response
 */
export function createACPResponse(id: string | number, result?: any, error?: any): ACPResponse {
	const response: ACPResponse = {
		jsonrpc: "2.0",
		id,
	}

	if (error) {
		response.error = error
	} else {
		response.result = result
	}

	return response
}

/**
 * Validates an ACP message format
 */
export function validateACPMessage(message: any): ValidationResult {
	const errors: string[] = []
	const warnings: string[] = []

	if (!message || typeof message !== "object") {
		errors.push("消息必须是一个对象")
		return { valid: false, errors, warnings }
	}

	if (message.jsonrpc !== "2.0") {
		errors.push("jsonrpc字段必须为'2.0'")
	}

	if (!message.method || typeof message.method !== "string") {
		errors.push("method字段必须是非空字符串")
	}

	if (message.id !== undefined && typeof message.id !== "string" && typeof message.id !== "number") {
		errors.push("id字段必须是字符串或数字")
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	}
}

/**
 * Validates an ACP response format
 */
export function validateACPResponse(response: any): ValidationResult {
	const errors: string[] = []
	const warnings: string[] = []

	if (!response || typeof response !== "object") {
		errors.push("响应必须是一个对象")
		return { valid: false, errors, warnings }
	}

	if (response.jsonrpc !== "2.0") {
		errors.push("jsonrpc字段必须为'2.0'")
	}

	if (response.id === undefined) {
		errors.push("响应必须包含id字段")
	}

	if (typeof response.id !== "string" && typeof response.id !== "number") {
		errors.push("id字段必须是字符串或数字")
	}

	if (response.result === undefined && response.error === undefined) {
		errors.push("响应必须包含result或error字段")
	}

	if (response.result !== undefined && response.error !== undefined) {
		errors.push("响应不能同时包含result和error字段")
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	}
}

/**
 * Extracts the default port for a transport type
 */
export function getDefaultPort(transport: ACPTransportType): number | undefined {
	return TRANSPORT_DEFAULTS[transport]?.port
}

/**
 * Extracts the protocol scheme for a transport type
 */
export function getProtocolScheme(transport: ACPTransportType): string | undefined {
	return TRANSPORT_DEFAULTS[transport]?.protocol
}

/**
 * Normalizes an endpoint URL by adding default protocol and port if needed
 */
export function normalizeEndpoint(endpoint: string, transport: ACPTransportType): string {
	let normalized = endpoint.trim()

	// Add protocol if missing
	const scheme = getProtocolScheme(transport)
	if (scheme && !normalized.includes("://")) {
		normalized = `${scheme}://${normalized}`
	}

	// Add default port if missing (for websocket and http)
	if ((transport === "websocket" || transport === "http") && scheme) {
		try {
			const url = new URL(normalized)
			if (!url.port) {
				const defaultPort = getDefaultPort(transport)
				if (defaultPort) {
					url.port = defaultPort.toString()
					normalized = url.toString()
				}
			}
		} catch {
			// Invalid URL, return as-is
		}
	}

	return normalized
}

/**
 * Checks if an endpoint is a local address
 */
export function isLocalEndpoint(endpoint: string): boolean {
	const localPatterns = ["localhost", "127.0.0.1", "::1", "0.0.0.0"]

	return localPatterns.some((pattern) => endpoint.includes(pattern))
}

/**
 * Masks sensitive information in configuration for logging
 */
export function maskSensitiveConfig(config: ACPAgentConfig): Partial<ACPAgentConfig> {
	const masked = { ...config }

	// Mask authentication credentials
	if (masked.authentication?.credentials) {
		masked.authentication = {
			...masked.authentication,
			credentials: Object.keys(masked.authentication.credentials).reduce(
				(acc, key) => {
					acc[key] = "[MASKED]"
					return acc
				},
				{} as Record<string, string>,
			),
		}
	}

	return masked
}

/**
 * Calculates exponential backoff delay with jitter
 */
export function calculateBackoffDelay(
	attempt: number,
	baseDelay: number,
	maxDelay: number,
	multiplier: number = 2,
	jitter: boolean = true,
): number {
	const exponentialDelay = Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay)

	if (jitter) {
		// Add random jitter up to 25% of the delay
		const jitterAmount = exponentialDelay * 0.25 * Math.random()
		return exponentialDelay + jitterAmount
	}

	return exponentialDelay
}

/**
 * Debounces a function to prevent excessive calls
 */
export function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
	let timeoutId: NodeJS.Timeout | undefined

	return (...args: Parameters<T>) => {
		if (timeoutId) {
			clearTimeout(timeoutId)
		}

		timeoutId = setTimeout(() => {
			func(...args)
		}, delay)
	}
}

/**
 * Throttles a function to limit call frequency
 */
export function throttle<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
	let lastCall = 0

	return (...args: Parameters<T>) => {
		const now = Date.now()

		if (now - lastCall >= delay) {
			lastCall = now
			func(...args)
		}
	}
}

/**
 * Creates a timeout promise that rejects after the specified delay
 */
export function createTimeoutPromise(delay: number, message?: string): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new Error(message || `操作超时 (${delay}ms)`))
		}, delay)
	})
}

/**
 * Wraps a promise with a timeout
 */
export function withTimeout<T>(promise: Promise<T>, timeout: number, message?: string): Promise<T> {
	return Promise.race([promise, createTimeoutPromise(timeout, message)])
}

/**
 * Safely parses JSON with error handling
 */
export function safeJsonParse<T = any>(json: string): { success: boolean; data?: T; error?: string } {
	try {
		const data = JSON.parse(json)
		return { success: true, data }
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "JSON解析失败",
		}
	}
}

/**
 * Safely stringifies an object to JSON
 */
export function safeJsonStringify(obj: any, space?: number): { success: boolean; json?: string; error?: string } {
	try {
		const json = JSON.stringify(obj, null, space)
		return { success: true, json }
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "JSON序列化失败",
		}
	}
}

/**
 * Deep clones an object
 */
export function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== "object") {
		return obj
	}

	if (obj instanceof Date) {
		return new Date(obj.getTime()) as unknown as T
	}

	if (obj instanceof Array) {
		return obj.map((item) => deepClone(item)) as unknown as T
	}

	if (typeof obj === "object") {
		const cloned = {} as T
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				cloned[key] = deepClone(obj[key])
			}
		}
		return cloned
	}

	return obj
}
