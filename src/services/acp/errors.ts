// cmbt-agent_change - new file
/**
 * Error handling classes for ACP (Agent Client Protocol) implementation
 *
 * This file provides comprehensive error handling with user-friendly messages,
 * error categorization, and recovery strategies for the ACP service layer.
 */

import { ACPErrorType, ACPErrorDetails } from "./types"

/**
 * Base ACP Error class that extends the standard Error
 * Provides structured error information for better debugging and user feedback
 */
export class ACPError extends Error {
	public readonly type: ACPErrorType
	public readonly code: string
	public readonly agentId?: string
	public readonly resource?: string
	public readonly originalError?: Error
	public readonly timestamp: Date

	constructor(details: ACPErrorDetails) {
		super(details.message)
		this.name = "ACPError"
		this.type = details.type
		this.code = details.code
		this.agentId = details.agentId
		this.resource = details.resource
		this.originalError = details.originalError
		this.timestamp = details.timestamp
	}

	/**
	 * Creates a user-friendly error message for display in the UI
	 */
	toUserMessage(): string {
		switch (this.type) {
			case ACPErrorType.CONNECTION:
				return `连接智能体失败: ${this.message}`
			case ACPErrorType.PROTOCOL:
				return `协议错误: ${this.message}`
			case ACPErrorType.PERMISSION:
				return `权限被拒绝: ${this.resource || "未知资源"}`
			case ACPErrorType.AUTHENTICATION:
				return `身份验证失败: ${this.message}`
			case ACPErrorType.TIMEOUT:
				return `操作超时: ${this.message}`
			case ACPErrorType.SYSTEM:
				return `系统错误: ${this.message}`
			default:
				return `ACP错误: ${this.message}`
		}
	}

	/**
	 * Converts the error to a structured object for logging or serialization
	 */
	toJSON(): Record<string, any> {
		return {
			name: this.name,
			type: this.type,
			code: this.code,
			message: this.message,
			agentId: this.agentId,
			resource: this.resource,
			timestamp: this.timestamp.toISOString(),
			originalError: this.originalError?.message,
			stack: this.stack,
		}
	}
}

/**
 * Connection-specific error for network and transport issues
 */
export class ACPConnectionError extends ACPError {
	constructor(message: string, agentId?: string, originalError?: Error) {
		super({
			type: ACPErrorType.CONNECTION,
			code: "CONNECTION_FAILED",
			message,
			agentId,
			originalError,
			timestamp: new Date(),
		})
		this.name = "ACPConnectionError"
	}

	static networkFailure(agentId: string, endpoint: string, originalError?: Error): ACPConnectionError {
		return new ACPConnectionError(`无法连接到智能体端点: ${endpoint}`, agentId, originalError)
	}

	static handshakeFailure(agentId: string, originalError?: Error): ACPConnectionError {
		return new ACPConnectionError(`协议握手失败`, agentId, originalError)
	}

	static timeout(agentId: string, timeout: number): ACPConnectionError {
		return new ACPConnectionError(`连接超时 (${timeout}ms)`, agentId)
	}
}

/**
 * Protocol-specific error for message format and version issues
 */
export class ACPProtocolError extends ACPError {
	constructor(message: string, agentId?: string, originalError?: Error) {
		super({
			type: ACPErrorType.PROTOCOL,
			code: "PROTOCOL_ERROR",
			message,
			agentId,
			originalError,
			timestamp: new Date(),
		})
		this.name = "ACPProtocolError"
	}

	static invalidMessage(agentId: string, messageData: any): ACPProtocolError {
		return new ACPProtocolError(`无效的协议消息格式`, agentId)
	}

	static versionMismatch(agentId: string, clientVersion: string, serverVersion: string): ACPProtocolError {
		return new ACPProtocolError(`协议版本不兼容: 客户端 ${clientVersion}, 服务器 ${serverVersion}`, agentId)
	}

	static unsupportedMethod(agentId: string, method: string): ACPProtocolError {
		return new ACPProtocolError(`不支持的方法: ${method}`, agentId)
	}
}

/**
 * Permission-specific error for access control issues
 */
export class ACPPermissionError extends ACPError {
	constructor(message: string, agentId: string, resource: string, originalError?: Error) {
		super({
			type: ACPErrorType.PERMISSION,
			code: "PERMISSION_DENIED",
			message,
			agentId,
			resource,
			originalError,
			timestamp: new Date(),
		})
		this.name = "ACPPermissionError"
	}

	static accessDenied(agentId: string, resource: string, action: string): ACPPermissionError {
		return new ACPPermissionError(`访问被拒绝: ${action} 操作`, agentId, resource)
	}

	static insufficientPermissions(agentId: string, resource: string, requiredPermission: string): ACPPermissionError {
		return new ACPPermissionError(`权限不足: 需要 ${requiredPermission} 权限`, agentId, resource)
	}
}

/**
 * Authentication-specific error for credential and token issues
 */
export class ACPAuthenticationError extends ACPError {
	constructor(message: string, agentId?: string, originalError?: Error) {
		super({
			type: ACPErrorType.AUTHENTICATION,
			code: "AUTH_FAILED",
			message,
			agentId,
			originalError,
			timestamp: new Date(),
		})
		this.name = "ACPAuthenticationError"
	}

	static invalidCredentials(agentId: string): ACPAuthenticationError {
		return new ACPAuthenticationError(`无效的认证凭据`, agentId)
	}

	static tokenExpired(agentId: string): ACPAuthenticationError {
		return new ACPAuthenticationError(`认证令牌已过期`, agentId)
	}

	static missingCredentials(agentId: string): ACPAuthenticationError {
		return new ACPAuthenticationError(`缺少认证凭据`, agentId)
	}
}

/**
 * Timeout-specific error for operation timeouts
 */
export class ACPTimeoutError extends ACPError {
	constructor(message: string, agentId?: string, timeout?: number) {
		super({
			type: ACPErrorType.TIMEOUT,
			code: "OPERATION_TIMEOUT",
			message: timeout ? `${message} (超时: ${timeout}ms)` : message,
			agentId,
			timestamp: new Date(),
		})
		this.name = "ACPTimeoutError"
	}

	static requestTimeout(agentId: string, timeout: number): ACPTimeoutError {
		return new ACPTimeoutError(`请求超时`, agentId, timeout)
	}

	static connectionTimeout(agentId: string, timeout: number): ACPTimeoutError {
		return new ACPTimeoutError(`连接超时`, agentId, timeout)
	}
}

/**
 * Configuration-specific error for agent configuration issues
 */
export class ACPConfigurationError extends ACPError {
	constructor(message: string, agentId?: string, originalError?: Error) {
		super({
			type: ACPErrorType.SYSTEM,
			code: "CONFIGURATION_ERROR",
			message,
			agentId,
			originalError,
			timestamp: new Date(),
		})
		this.name = "ACPConfigurationError"
	}

	static invalidConfig(agentId: string, field: string, value: any): ACPConfigurationError {
		return new ACPConfigurationError(`无效的配置字段 ${field}: ${value}`, agentId)
	}

	static missingConfig(agentId: string, field: string): ACPConfigurationError {
		return new ACPConfigurationError(`缺少必需的配置字段: ${field}`, agentId)
	}

	static configNotFound(agentId: string): ACPConfigurationError {
		return new ACPConfigurationError(`未找到智能体配置`, agentId)
	}
}

/**
 * System-specific error for resource and configuration issues
 */
export class ACPSystemError extends ACPError {
	constructor(message: string, agentId?: string, originalError?: Error) {
		super({
			type: ACPErrorType.SYSTEM,
			code: "SYSTEM_ERROR",
			message,
			agentId,
			originalError,
			timestamp: new Date(),
		})
		this.name = "ACPSystemError"
	}

	static resourceExhausted(resource: string): ACPSystemError {
		return new ACPSystemError(`系统资源不足: ${resource}`)
	}

	static configurationError(message: string): ACPSystemError {
		return new ACPSystemError(`配置错误: ${message}`)
	}

	static fileSystemError(path: string, operation: string, originalError?: Error): ACPSystemError {
		return new ACPSystemError(`文件系统错误: 无法${operation} ${path}`, undefined, originalError)
	}
}

/**
 * Error recovery strategies
 */
export interface ErrorRecoveryStrategy {
	canRecover(error: ACPError): boolean
	recover(error: ACPError): Promise<boolean>
}

/**
 * Enhanced connection error recovery strategy with exponential backoff
 */
export class ConnectionRecoveryStrategy implements ErrorRecoveryStrategy {
	private retryAttempts = new Map<string, number>()
	private lastRetryTime = new Map<string, number>()
	private circuitBreakerState = new Map<string, "closed" | "open" | "half-open">()
	private circuitBreakerOpenTime = new Map<string, number>()
	private readonly maxRetries: number
	private readonly baseDelay: number
	private readonly maxDelay: number
	private readonly backoffMultiplier: number
	private readonly jitter: boolean
	private readonly circuitBreakerTimeout: number
	private readonly circuitBreakerThreshold: number

	constructor(
		maxRetries = 5,
		baseDelay = 2000,
		maxDelay = 60000,
		backoffMultiplier = 2,
		jitter = true,
		circuitBreakerTimeout = 300000, // 5 minutes
		circuitBreakerThreshold = 3,
	) {
		this.maxRetries = maxRetries
		this.baseDelay = baseDelay
		this.maxDelay = maxDelay
		this.backoffMultiplier = backoffMultiplier
		this.jitter = jitter
		this.circuitBreakerTimeout = circuitBreakerTimeout
		this.circuitBreakerThreshold = circuitBreakerThreshold
	}

	canRecover(error: ACPError): boolean {
		if (error.type !== ACPErrorType.CONNECTION && error.type !== ACPErrorType.TIMEOUT) {
			return false
		}

		const agentId = error.agentId
		if (!agentId) {
			return false
		}

		// Check circuit breaker state
		const circuitState = this.getCircuitBreakerState(agentId)
		if (circuitState === "open") {
			return false
		}

		const attempts = this.retryAttempts.get(agentId) || 0
		const lastRetry = this.lastRetryTime.get(agentId) || 0
		const now = Date.now()

		// Prevent too frequent retries (minimum 1 second between attempts)
		if (now - lastRetry < 1000) {
			return false
		}

		// Check if we've exceeded retry threshold for circuit breaker
		if (attempts >= this.circuitBreakerThreshold) {
			this.openCircuitBreaker(agentId)
			return false
		}

		return attempts < this.maxRetries
	}

	async recover(error: ACPError): Promise<boolean> {
		const agentId = error.agentId
		if (!agentId) {
			return false
		}

		const attempts = this.retryAttempts.get(agentId) || 0
		this.retryAttempts.set(agentId, attempts + 1)
		this.lastRetryTime.set(agentId, Date.now())

		// Calculate delay with exponential backoff
		let delay = Math.min(this.baseDelay * Math.pow(this.backoffMultiplier, attempts), this.maxDelay)

		// Add jitter to prevent thundering herd
		if (this.jitter) {
			const jitterAmount = delay * 0.1 // 10% jitter
			delay += (Math.random() - 0.5) * 2 * jitterAmount
		}

		// Additional delay for network-related errors
		if (error.code === "NETWORK_ERROR" || error.code === "CONNECTION_TIMEOUT") {
			delay *= 1.5 // 50% longer delay for network issues
		}

		console.log(
			`Retrying connection for agent ${agentId} in ${Math.round(delay)}ms (attempt ${attempts + 1}/${this.maxRetries})`,
		)

		await new Promise((resolve) => setTimeout(resolve, delay))

		return true
	}

	private getCircuitBreakerState(agentId: string): "closed" | "open" | "half-open" {
		const state = this.circuitBreakerState.get(agentId) || "closed"

		if (state === "open") {
			const openTime = this.circuitBreakerOpenTime.get(agentId) || 0
			const now = Date.now()

			if (now - openTime > this.circuitBreakerTimeout) {
				// Transition to half-open state
				this.circuitBreakerState.set(agentId, "half-open")
				return "half-open"
			}
		}

		return state
	}

	private openCircuitBreaker(agentId: string): void {
		console.log(`Opening circuit breaker for agent ${agentId} due to repeated failures`)
		this.circuitBreakerState.set(agentId, "open")
		this.circuitBreakerOpenTime.set(agentId, Date.now())
	}

	onSuccessfulConnection(agentId: string): void {
		// Reset circuit breaker on successful connection
		this.circuitBreakerState.set(agentId, "closed")
		this.circuitBreakerOpenTime.delete(agentId)
		this.resetRetries(agentId)
	}

	resetRetries(agentId: string): void {
		this.retryAttempts.delete(agentId)
		this.lastRetryTime.delete(agentId)
	}

	getRetryInfo(agentId: string): { attempts: number; lastRetry: number | undefined; circuitState: string } {
		return {
			attempts: this.retryAttempts.get(agentId) || 0,
			lastRetry: this.lastRetryTime.get(agentId),
			circuitState: this.getCircuitBreakerState(agentId),
		}
	}
}

/**
 * Enhanced error handler that manages different error types and recovery strategies
 */
export class ACPErrorHandler {
	private recoveryStrategies: ErrorRecoveryStrategy[] = []
	private errorCallbacks: ((error: ACPError) => void)[] = []
	private fallbackStrategy: FallbackProviderStrategy
	private connectionRecovery: ConnectionRecoveryStrategy
	private authRecovery: AuthenticationRecoveryStrategy
	private protocolRecovery: ProtocolRecoveryStrategy
	private errorHistory = new Map<string, ACPError[]>()
	private readonly maxErrorHistory = 10

	constructor() {
		// Initialize recovery strategies with enhanced configurations
		this.connectionRecovery = new ConnectionRecoveryStrategy(
			5, // maxRetries
			2000, // baseDelay
			60000, // maxDelay
			2, // backoffMultiplier
			true, // jitter
			300000, // circuitBreakerTimeout (5 minutes)
			3, // circuitBreakerThreshold
		)
		this.authRecovery = new AuthenticationRecoveryStrategy(3, 5000) // More auth retries
		this.protocolRecovery = new ProtocolRecoveryStrategy(2, 3000)
		this.fallbackStrategy = new FallbackProviderStrategy(
			2000, // fallbackDelay (faster fallback)
			300000, // retryAfterFallbackDelay (5 minutes)
			1800000, // maxFallbackDuration (30 minutes)
		)

		// Add default recovery strategies
		this.addRecoveryStrategy(this.connectionRecovery)
		this.addRecoveryStrategy(this.authRecovery)
		this.addRecoveryStrategy(this.protocolRecovery)
	}

	addRecoveryStrategy(strategy: ErrorRecoveryStrategy): void {
		this.recoveryStrategies.push(strategy)
	}

	onError(callback: (error: ACPError) => void): void {
		this.errorCallbacks.push(callback)
	}

	onFallbackActivated(callback: (agentId: string, reason: string) => void): void {
		this.fallbackStrategy.onFallbackActivated(callback)
	}

	onFallbackProviderChange(callback: (agentId: string, activate: boolean) => Promise<void>): void {
		this.fallbackStrategy.onFallbackProviderChange(callback)
	}

	async handleError(error: ACPError): Promise<boolean> {
		// Record error in history for analysis
		this.recordError(error)

		// Notify error callbacks
		this.errorCallbacks.forEach((callback) => {
			try {
				callback(error)
			} catch (callbackError) {
				console.error("Error in error callback:", callbackError)
			}
		})

		// Enhanced error analysis for better recovery decisions
		const errorPattern = this.analyzeErrorPattern(error)

		// Check if immediate fallback is needed (critical errors)
		if (this.shouldImmediateFallback(error, errorPattern)) {
			const agentId = error.agentId || "unknown"
			await this.fallbackStrategy.activateFallback(agentId, error.toUserMessage())
			return false
		}

		// Try recovery strategies in order of priority
		for (const strategy of this.recoveryStrategies) {
			if (strategy.canRecover(error)) {
				try {
					const recovered = await strategy.recover(error)
					if (recovered) {
						console.log(`Successfully recovered from error: ${error.message}`)

						// Notify connection recovery success for circuit breaker reset
						if (strategy === this.connectionRecovery && error.agentId) {
							this.connectionRecovery.onSuccessfulConnection(error.agentId)
						}

						return true
					}
				} catch (recoveryError) {
					console.error("Error during recovery:", recoveryError)
					// Continue to next strategy or fallback
				}
			}
		}

		// If no recovery was possible and fallback is appropriate, activate it
		if (this.fallbackStrategy.shouldFallback(error) && error.agentId) {
			await this.fallbackStrategy.activateFallback(error.agentId, error.toUserMessage())
		}

		return false
	}

	private recordError(error: ACPError): void {
		const agentId = error.agentId || "unknown"
		const history = this.errorHistory.get(agentId) || []

		history.push(error)

		// Keep only recent errors
		if (history.length > this.maxErrorHistory) {
			history.shift()
		}

		this.errorHistory.set(agentId, history)
	}

	private analyzeErrorPattern(error: ACPError): {
		isRepeated: boolean
		frequency: number
		recentErrors: number
		errorTypes: Set<string>
	} {
		const agentId = error.agentId || "unknown"
		const history = this.errorHistory.get(agentId) || []
		const now = Date.now()
		const recentThreshold = 60000 // 1 minute

		const recentErrors = history.filter((e) => now - e.timestamp.getTime() < recentThreshold)

		const errorTypes = new Set(history.map((e) => e.type))
		const sameTypeErrors = history.filter((e) => e.type === error.type)

		return {
			isRepeated: sameTypeErrors.length > 1,
			frequency: recentErrors.length,
			recentErrors: recentErrors.length,
			errorTypes,
		}
	}

	private shouldImmediateFallback(error: ACPError, pattern: any): boolean {
		// Immediate fallback for critical system errors
		if (error.type === ACPErrorType.SYSTEM && error.code === "RESOURCE_EXHAUSTED") {
			return true
		}

		// Immediate fallback for high-frequency errors (potential DoS or system overload)
		if (pattern.frequency > 5) {
			console.log(`High error frequency detected for agent ${error.agentId}, triggering immediate fallback`)
			return true
		}

		// Immediate fallback for protocol version mismatches
		if (error.type === ACPErrorType.PROTOCOL && error.code === "VERSION_MISMATCH") {
			return true
		}

		return false
	}

	/**
	 * Reset retry attempts for a specific agent
	 */
	resetRetries(agentId: string): void {
		this.connectionRecovery.resetRetries(agentId)
		this.authRecovery.resetRetries(agentId)
		this.protocolRecovery.resetRetries(agentId)

		// Clear error history on manual reset
		this.errorHistory.delete(agentId)
	}

	/**
	 * Check if fallback is active for an agent
	 */
	isFallbackActive(agentId: string): boolean {
		return this.fallbackStrategy.isFallbackActive(agentId)
	}

	/**
	 * Deactivate fallback for an agent (when connection is restored)
	 */
	async deactivateFallback(agentId: string): Promise<void> {
		await this.fallbackStrategy.deactivateFallback(agentId)
	}

	/**
	 * Get comprehensive retry information for an agent
	 */
	getRetryInfo(agentId: string): {
		connection: { attempts: number; lastRetry: number | undefined; circuitState: string }
		auth: { attempts: number }
		protocol: { attempts: number }
		fallbackActive: boolean
		fallbackReason?: string
		errorHistory: number
	} {
		const connectionInfo = this.connectionRecovery.getRetryInfo(agentId)
		const history = this.errorHistory.get(agentId) || []

		return {
			connection: connectionInfo,
			auth: { attempts: this.authRecovery["retryAttempts"]?.get(agentId) || 0 },
			protocol: { attempts: this.protocolRecovery["retryAttempts"]?.get(agentId) || 0 },
			fallbackActive: this.fallbackStrategy.isFallbackActive(agentId),
			fallbackReason: this.fallbackStrategy.getFallbackReason(agentId),
			errorHistory: history.length,
		}
	}

	/**
	 * Get error handling statistics
	 */
	getErrorStats(): {
		totalErrors: number
		errorsByType: Record<string, number>
		fallbackStats: any
		agentsWithErrors: number
	} {
		let totalErrors = 0
		const errorsByType: Record<string, number> = {}

		for (const history of this.errorHistory.values()) {
			totalErrors += history.length
			for (const error of history) {
				errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
			}
		}

		return {
			totalErrors,
			errorsByType,
			fallbackStats: this.fallbackStrategy.getFallbackStats(),
			agentsWithErrors: this.errorHistory.size,
		}
	}

	/**
	 * Cleanup resources
	 */
	cleanup(): void {
		this.fallbackStrategy.cleanup()
		this.errorCallbacks.length = 0
		this.recoveryStrategies.length = 0
		this.errorHistory.clear()
	}

	/**
	 * Creates appropriate error instances based on error conditions
	 */
	static createError(
		type: ACPErrorType,
		message: string,
		agentId?: string,
		resource?: string,
		originalError?: Error,
	): ACPError {
		switch (type) {
			case ACPErrorType.CONNECTION:
				return new ACPConnectionError(message, agentId, originalError)
			case ACPErrorType.PROTOCOL:
				return new ACPProtocolError(message, agentId, originalError)
			case ACPErrorType.PERMISSION:
				return new ACPPermissionError(message, agentId!, resource!, originalError)
			case ACPErrorType.AUTHENTICATION:
				return new ACPAuthenticationError(message, agentId, originalError)
			case ACPErrorType.TIMEOUT:
				return new ACPTimeoutError(message, agentId)
			case ACPErrorType.SYSTEM:
				return new ACPSystemError(message, agentId, originalError)
			default:
				return new ACPError({
					type,
					code: "UNKNOWN_ERROR",
					message,
					agentId,
					resource,
					originalError,
					timestamp: new Date(),
				})
		}
	}
}

/**
 * Utility functions for error handling
 */
export class ACPErrorUtils {
	/**
	 * Checks if an error is recoverable
	 */
	static isRecoverable(error: ACPError): boolean {
		switch (error.type) {
			case ACPErrorType.CONNECTION:
			case ACPErrorType.TIMEOUT:
				return true
			case ACPErrorType.AUTHENTICATION:
				// Only recoverable if it's a token expiry
				return error.code === "AUTH_FAILED" && error.message.includes("过期")
			default:
				return false
		}
	}

	/**
	 * Determines if an error should trigger a fallback to default provider
	 */
	static shouldFallback(error: ACPError): boolean {
		switch (error.type) {
			case ACPErrorType.CONNECTION:
			case ACPErrorType.PROTOCOL:
			case ACPErrorType.SYSTEM:
				return true
			default:
				return false
		}
	}

	/**
	 * Extracts relevant error information for logging
	 */
	static getLogContext(error: ACPError): Record<string, any> {
		return {
			type: error.type,
			code: error.code,
			agentId: error.agentId,
			resource: error.resource,
			timestamp: error.timestamp.toISOString(),
			stack: error.stack,
		}
	}

	/**
	 * Creates a sanitized error message safe for user display
	 */
	static sanitizeErrorMessage(error: ACPError): string {
		// Remove sensitive information like API keys, tokens, etc.
		let message = error.toUserMessage()

		// Remove potential sensitive data patterns
		message = message.replace(/[a-zA-Z0-9]{32,}/g, "[REDACTED]") // API keys
		message = message.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]") // Bearer tokens
		message = message.replace(/token[:\s]+[^\s]+/gi, "token: [REDACTED]") // Generic tokens

		return message
	}
}

/**
 * Authentication error recovery strategy
 */
export class AuthenticationRecoveryStrategy implements ErrorRecoveryStrategy {
	private retryAttempts = new Map<string, number>()
	private readonly maxRetries: number
	private readonly baseDelay: number

	constructor(maxRetries = 2, baseDelay = 5000) {
		this.maxRetries = maxRetries
		this.baseDelay = baseDelay
	}

	canRecover(error: ACPError): boolean {
		if (error.type !== ACPErrorType.AUTHENTICATION) {
			return false
		}

		const agentId = error.agentId
		if (!agentId) {
			return false
		}

		const attempts = this.retryAttempts.get(agentId) || 0
		return attempts < this.maxRetries && error.code === "AUTH_FAILED" && error.message.includes("过期")
	}

	async recover(error: ACPError): Promise<boolean> {
		const agentId = error.agentId
		if (!agentId) {
			return false
		}

		const attempts = this.retryAttempts.get(agentId) || 0
		this.retryAttempts.set(agentId, attempts + 1)

		console.log(
			`Attempting authentication recovery for agent ${agentId} (attempt ${attempts + 1}/${this.maxRetries})`,
		)

		// Wait before retry (no exponential backoff for auth)
		await new Promise((resolve) => setTimeout(resolve, this.baseDelay))

		return true
	}

	resetRetries(agentId: string): void {
		this.retryAttempts.delete(agentId)
	}
}

/**
 * Protocol error recovery strategy
 */
export class ProtocolRecoveryStrategy implements ErrorRecoveryStrategy {
	private retryAttempts = new Map<string, number>()
	private readonly maxRetries: number
	private readonly baseDelay: number

	constructor(maxRetries = 2, baseDelay = 3000) {
		this.maxRetries = maxRetries
		this.baseDelay = baseDelay
	}

	canRecover(error: ACPError): boolean {
		if (error.type !== ACPErrorType.PROTOCOL) {
			return false
		}

		const agentId = error.agentId
		if (!agentId) {
			return false
		}

		const attempts = this.retryAttempts.get(agentId) || 0
		// Only retry for certain protocol errors (not version mismatches)
		return attempts < this.maxRetries && !error.message.includes("版本不兼容")
	}

	async recover(error: ACPError): Promise<boolean> {
		const agentId = error.agentId
		if (!agentId) {
			return false
		}

		const attempts = this.retryAttempts.get(agentId) || 0
		this.retryAttempts.set(agentId, attempts + 1)

		console.log(`Attempting protocol recovery for agent ${agentId} (attempt ${attempts + 1}/${this.maxRetries})`)

		// Wait before retry
		await new Promise((resolve) => setTimeout(resolve, this.baseDelay))

		return true
	}

	resetRetries(agentId: string): void {
		this.retryAttempts.delete(agentId)
	}
}

/**
 * Enhanced fallback provider strategy with better default provider integration
 */
export class FallbackProviderStrategy {
	private fallbackActive = new Map<string, boolean>()
	private fallbackCallbacks: ((agentId: string, reason: string) => void)[] = []
	private retryAfterFallbackTimeouts = new Map<string, NodeJS.Timeout>()
	private fallbackProviderCallbacks: ((agentId: string, activate: boolean) => Promise<void>)[] = []
	private fallbackReasons = new Map<string, string>()

	constructor(
		private readonly fallbackDelay = 2000, // Reduced delay for faster fallback
		private readonly retryAfterFallbackDelay = 300000, // 5 minutes
		private readonly maxFallbackDuration = 1800000, // 30 minutes max fallback
	) {}

	shouldFallback(error: ACPError): boolean {
		// Enhanced fallback logic based on error severity and type
		if (this.fallbackActive.get(error.agentId || "")) {
			return false // Already in fallback mode
		}

		switch (error.type) {
			case ACPErrorType.CONNECTION:
				// Fallback for persistent connection issues
				return (
					error.code === "CONNECTION_FAILED" ||
					error.code === "NETWORK_ERROR" ||
					error.code === "CONNECTION_TIMEOUT"
				)

			case ACPErrorType.PROTOCOL:
				// Fallback for protocol incompatibility
				return (
					error.code === "VERSION_MISMATCH" ||
					error.code === "UNSUPPORTED_METHOD" ||
					error.code === "PROTOCOL_ERROR"
				)

			case ACPErrorType.SYSTEM:
				// Fallback for system-level issues
				return error.code === "RESOURCE_EXHAUSTED" || error.code === "SERVICE_UNAVAILABLE"

			case ACPErrorType.AUTHENTICATION:
				// Fallback for persistent auth failures
				return error.code === "AUTH_FAILED" && !error.message.includes("过期") // Don't fallback for token expiry

			default:
				return false
		}
	}

	async activateFallback(agentId: string, reason: string): Promise<void> {
		if (this.fallbackActive.get(agentId)) {
			return
		}

		console.log(`Activating fallback provider for agent ${agentId}: ${reason}`)

		// Store fallback reason for diagnostics
		this.fallbackReasons.set(agentId, reason)

		// Brief delay before activating fallback to allow for quick recovery
		await new Promise((resolve) => setTimeout(resolve, this.fallbackDelay))

		this.fallbackActive.set(agentId, true)

		// Notify fallback provider callbacks to switch to default provider
		for (const callback of this.fallbackProviderCallbacks) {
			try {
				await callback(agentId, true)
			} catch (error) {
				console.error("Error activating fallback provider:", error)
			}
		}

		// Notify general callbacks
		this.fallbackCallbacks.forEach((callback) => {
			try {
				callback(agentId, reason)
			} catch (error) {
				console.error("Error in fallback callback:", error)
			}
		})

		// Schedule retry after fallback
		this.scheduleRetryAfterFallback(agentId)

		// Schedule maximum fallback duration timeout
		this.scheduleMaxFallbackTimeout(agentId)
	}

	private scheduleRetryAfterFallback(agentId: string): void {
		// Clear existing timeout
		const existingTimeout = this.retryAfterFallbackTimeouts.get(agentId)
		if (existingTimeout) {
			clearTimeout(existingTimeout)
		}

		// Schedule new retry
		const timeout = setTimeout(async () => {
			console.log(`Attempting to retry ACP connection for agent ${agentId} after fallback period`)
			await this.deactivateFallback(agentId)
			this.retryAfterFallbackTimeouts.delete(agentId)
		}, this.retryAfterFallbackDelay)

		this.retryAfterFallbackTimeouts.set(agentId, timeout)
	}

	private scheduleMaxFallbackTimeout(agentId: string): void {
		// Ensure fallback doesn't last indefinitely
		setTimeout(async () => {
			if (this.fallbackActive.get(agentId)) {
				console.log(`Maximum fallback duration reached for agent ${agentId}, forcing deactivation`)
				await this.deactivateFallback(agentId)
			}
		}, this.maxFallbackDuration)
	}

	async deactivateFallback(agentId: string): Promise<void> {
		if (!this.fallbackActive.get(agentId)) {
			return
		}

		console.log(`Deactivating fallback provider for agent ${agentId}`)

		this.fallbackActive.set(agentId, false)
		this.fallbackReasons.delete(agentId)

		// Notify fallback provider callbacks to switch back to ACP
		for (const callback of this.fallbackProviderCallbacks) {
			try {
				await callback(agentId, false)
			} catch (error) {
				console.error("Error deactivating fallback provider:", error)
			}
		}

		// Clear retry timeout
		const timeout = this.retryAfterFallbackTimeouts.get(agentId)
		if (timeout) {
			clearTimeout(timeout)
			this.retryAfterFallbackTimeouts.delete(agentId)
		}
	}

	isFallbackActive(agentId: string): boolean {
		return this.fallbackActive.get(agentId) || false
	}

	getFallbackReason(agentId: string): string | undefined {
		return this.fallbackReasons.get(agentId)
	}

	onFallbackActivated(callback: (agentId: string, reason: string) => void): void {
		this.fallbackCallbacks.push(callback)
	}

	onFallbackProviderChange(callback: (agentId: string, activate: boolean) => Promise<void>): void {
		this.fallbackProviderCallbacks.push(callback)
	}

	getFallbackStats(): {
		activeFallbacks: number
		totalFallbackActivations: number
		averageFallbackDuration: number
	} {
		const activeFallbacks = Array.from(this.fallbackActive.values()).filter(Boolean).length

		return {
			activeFallbacks,
			totalFallbackActivations: this.fallbackReasons.size,
			averageFallbackDuration: this.retryAfterFallbackDelay,
		}
	}

	cleanup(): void {
		// Clear all timeouts
		for (const timeout of this.retryAfterFallbackTimeouts.values()) {
			clearTimeout(timeout)
		}
		this.retryAfterFallbackTimeouts.clear()
		this.fallbackActive.clear()
		this.fallbackReasons.clear()
		this.fallbackCallbacks.length = 0
		this.fallbackProviderCallbacks.length = 0
	}
}
