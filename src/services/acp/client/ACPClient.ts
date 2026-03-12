// cmbt-agent_change - new file
/**
 * ACP Client implementation for managing connections to ACP agents
 *
 * This class provides the core functionality for connecting to and communicating
 * with ACP (Agent Client Protocol) agents using JSON-RPC 2.0 over various transports.
 */

import { EventEmitter } from "events"
import WebSocket from "ws"
import {
	ACPMessage,
	ACPResponse,
	ACPAgentConfig,
	ACPConnection,
	ConnectionStatus,
	ACPTransportType,
	MessageCallback,
	StatusCallback,
	ErrorCallback,
	ACPEvent,
	ACPEventType,
	ConnectionPoolConfig,
} from "../types"
import {
	ACPError,
	ACPConnectionError,
	ACPProtocolError,
	ACPAuthenticationError,
	ACPTimeoutError,
	ACPErrorHandler,
} from "../errors"
import { DEFAULT_CONFIG, DEFAULT_CONNECTION_POOL_CONFIG, VALIDATION, TRANSPORT_DEFAULTS } from "../constants"
import { ACPUtils } from "../utils"

/**
 * Core ACP Client class that handles protocol communication
 */
export class ACPClient extends EventEmitter {
	// cmbt-agent_change start - Enhanced connection management for concurrent connections
	private connections = new Map<string, ACPConnection>()
	private websockets = new Map<string, WebSocket>()
	private messageHandlers = new Map<string, MessageCallback[]>()
	private statusHandlers = new Map<string, StatusCallback[]>()
	private errorHandler: ACPErrorHandler
	private messageIdCounter = 0

	// Store agent configs for retry logic
	private agentConfigs = new Map<string, ACPAgentConfig>()

	// Connection pool management for concurrent connections
	private connectionPool: Map<string, ACPConnection[]> = new Map()
	private activeConnections = new Set<string>()
	private connectionLocks = new Map<string, Promise<void>>()
	private poolConfig: ConnectionPoolConfig
	private maxConcurrentConnections: number
	private connectionMetrics = new Map<string, { messageCount: number; lastActivity: Date; latency?: number }>()

	// Enhanced concurrent connection tracking
	private connectionQueue = new Map<
		string,
		Array<{ resolve: (config: ACPAgentConfig) => void; reject: (error: Error) => void; config: ACPAgentConfig }>
	>()
	private connectionAttempts = new Map<string, number>()
	private connectionTimeouts = new Map<string, NodeJS.Timeout>()
	private pendingMessages = new Map<
		string,
		Array<{ message: ACPMessage; resolve: (response: ACPResponse) => void; reject: (error: Error) => void }>
	>()

	// Enhanced concurrent connection support
	private connectionPriorities = new Map<string, number>() // Priority levels for connection management
	private connectionLoadBalancer = new Map<string, number>() // Round-robin load balancing for pooled connections
	private concurrentMessageLimits = new Map<string, number>() // Per-agent concurrent message limits
	private activeMessageCounts = new Map<string, number>() // Track active messages per agent

	// Resource management
	private cleanupInterval?: NodeJS.Timeout
	private heartbeatInterval?: NodeJS.Timeout
	private connectionMonitorInterval?: NodeJS.Timeout
	// cmbt-agent_change end

	constructor(poolConfig?: Partial<ConnectionPoolConfig>) {
		super()
		this.errorHandler = new ACPErrorHandler()
		// cmbt-agent_change start - Initialize connection pool configuration
		this.poolConfig = {
			...DEFAULT_CONNECTION_POOL_CONFIG,
			...poolConfig,
		}
		this.maxConcurrentConnections = this.poolConfig.maxConnections
		// cmbt-agent_change end
		this.setupErrorHandling()
		// cmbt-agent_change start - Start resource management
		this.startResourceManagement()
		// cmbt-agent_change end
	}
	// cmbt-agent_change start - Connection pool management methods

	/**
	 * Start resource management timers for connection cleanup and heartbeat
	 */
	private startResourceManagement(): void {
		// Cleanup idle connections every minute
		this.cleanupInterval = setInterval(() => {
			this.cleanupIdleConnections()
		}, 60000)

		// Send heartbeat to active connections every minute
		this.heartbeatInterval = setInterval(() => {
			this.sendHeartbeats()
		}, DEFAULT_CONFIG.HEARTBEAT_INTERVAL)

		// cmbt-agent_change start - Enhanced connection monitoring
		// Monitor connection health and process queued connections
		this.connectionMonitorInterval = setInterval(() => {
			this.processConnectionQueue()
			this.monitorConnectionHealth()
		}, 5000) // Check every 5 seconds
		// cmbt-agent_change end
	}

	/**
	 * Acquire a connection from the pool or create a new one
	 * Enhanced with connection queuing and load balancing for better concurrent handling
	 */
	private async acquireConnection(agentId: string, config: ACPAgentConfig): Promise<ACPConnection> {
		// Check for pooled connection first (load balanced)
		if (this.poolConfig.connectionReuse) {
			const pooledConnection = this.getPooledConnection(agentId)
			if (pooledConnection && pooledConnection.status === "connected") {
				return pooledConnection
			}
		}

		// Check if we're at the connection limit
		if (this.activeConnections.size >= this.maxConcurrentConnections) {
			// cmbt-agent_change start - Queue connection requests when at limit
			return this.queueConnectionRequest(agentId, config)
			// cmbt-agent_change end
		}

		// Check for existing connection lock to prevent race conditions
		const existingLock = this.connectionLocks.get(agentId)
		if (existingLock) {
			await existingLock
		}

		// Check if connection already exists and is active
		const existingConnection = this.connections.get(agentId)
		if (existingConnection && existingConnection.status === "connected") {
			return existingConnection
		}

		// Create connection lock for thread safety
		const connectionPromise = this.createNewConnection(agentId, config)
		this.connectionLocks.set(
			agentId,
			connectionPromise.then(() => {}),
		)

		try {
			const connection = await connectionPromise
			this.activeConnections.add(agentId)
			// cmbt-agent_change start - Track connection attempts and initialize counters
			this.connectionAttempts.delete(agentId) // Reset on success
			this.activeMessageCounts.set(agentId, 0) // Initialize message counter
			// cmbt-agent_change end
			return connection
		} finally {
			this.connectionLocks.delete(agentId)
		}
	}

	/**
	 * Create a new connection with proper initialization
	 */
	private async createNewConnection(agentId: string, config: ACPAgentConfig): Promise<ACPConnection> {
		const connection: ACPConnection = {
			id: ACPUtils.generateConnectionId(),
			agentId,
			status: "connecting",
			transport: config.transport,
			endpoint: config.endpoint,
			lastActivity: new Date(),
			retryCount: 0,
		}

		this.connections.set(agentId, connection)
		this.initializeConnectionMetrics(agentId)

		return connection
	}

	/**
	 * Release a connection back to the pool or cleanup
	 */
	private async releaseConnection(agentId: string): Promise<void> {
		const connection = this.connections.get(agentId)
		if (!connection) {
			return
		}

		// If connection pooling is enabled and connection is reusable
		if (this.poolConfig.connectionReuse && connection.status === "connected") {
			// Add to pool for reuse
			if (!this.connectionPool.has(agentId)) {
				this.connectionPool.set(agentId, [])
			}
			this.connectionPool.get(agentId)!.push(connection)
		} else {
			// Clean up connection completely
			await this.closeTransportConnection(agentId, connection)
			this.cleanupConnection(agentId)
		}

		this.activeConnections.delete(agentId)
	}

	/**
	 * Initialize connection metrics tracking
	 */
	private initializeConnectionMetrics(agentId: string): void {
		this.connectionMetrics.set(agentId, {
			messageCount: 0,
			lastActivity: new Date(),
		})
	}

	/**
	 * Update connection metrics
	 */
	private updateConnectionMetrics(agentId: string, latency?: number): void {
		const metrics = this.connectionMetrics.get(agentId)
		if (metrics) {
			metrics.messageCount++
			metrics.lastActivity = new Date()
			if (latency !== undefined) {
				metrics.latency = latency
			}
		}
	}

	/**
	 * Clean up idle connections based on timeout configuration
	 */
	private cleanupIdleConnections(): void {
		const now = new Date()
		const idleTimeout = this.poolConfig.idleTimeout

		for (const [agentId, connection] of this.connections.entries()) {
			const timeSinceActivity = now.getTime() - connection.lastActivity.getTime()

			if (timeSinceActivity > idleTimeout && connection.status === "connected") {
				this.disconnect(agentId).catch((error) => {
					console.warn(`Failed to cleanup idle connection for ${agentId}:`, error)
				})
			}
		}
	}

	/**
	 * Send heartbeat messages to maintain active connections
	 */
	private async sendHeartbeats(): Promise<void> {
		const heartbeatPromises: Promise<void>[] = []

		for (const [agentId, connection] of this.connections.entries()) {
			if (connection.status === "connected") {
				const heartbeatPromise = this.sendHeartbeat(agentId).catch((error) => {
					console.warn(`Heartbeat failed for ${agentId}:`, error)
					// Mark connection as error if heartbeat fails
					this.updateConnectionStatus(agentId, "error")
				})
				heartbeatPromises.push(heartbeatPromise)
			}
		}

		await Promise.allSettled(heartbeatPromises)
	}

	/**
	 * Send a heartbeat message to a specific agent
	 */
	private async sendHeartbeat(agentId: string): Promise<void> {
		const heartbeatMessage: ACPMessage = {
			jsonrpc: "2.0",
			method: "ping",
			id: this.generateMessageId(),
		}

		try {
			const startTime = Date.now()
			await this.sendMessage(agentId, heartbeatMessage)
			const latency = Date.now() - startTime
			this.updateConnectionMetrics(agentId, latency)
		} catch (error) {
			// Heartbeat failure indicates connection issues
			throw new ACPConnectionError(`心跳检测失败: ${error.message}`, agentId, error as Error)
		}
	}

	/**
	 * Get connection pool statistics
	 */
	getConnectionPoolStats(): {
		activeConnections: number
		maxConnections: number
		pooledConnections: number
		totalConnections: number
		connectionMetrics: Map<string, { messageCount: number; lastActivity: Date; latency?: number }>
	} {
		const pooledConnections = Array.from(this.connectionPool.values()).reduce(
			(total, pool) => total + pool.length,
			0,
		)

		return {
			activeConnections: this.activeConnections.size,
			maxConnections: this.maxConcurrentConnections,
			pooledConnections,
			totalConnections: this.connections.size,
			connectionMetrics: new Map(this.connectionMetrics),
		}
	}

	/**
	 * Update connection pool configuration
	 */
	updatePoolConfig(newConfig: Partial<ConnectionPoolConfig>): void {
		this.poolConfig = {
			...this.poolConfig,
			...newConfig,
		}

		// Update max connections if changed
		if (newConfig.maxConnections !== undefined) {
			this.maxConcurrentConnections = newConfig.maxConnections
		}
	}

	// cmbt-agent_change start - Enhanced concurrent connection management methods

	/**
	 * Queue a connection request when at connection limit
	 */
	private async queueConnectionRequest(agentId: string, config: ACPAgentConfig): Promise<ACPConnection> {
		return new Promise((resolve, reject) => {
			if (!this.connectionQueue.has(agentId)) {
				this.connectionQueue.set(agentId, [])
			}

			const queue = this.connectionQueue.get(agentId)!
			queue.push({ resolve, reject, config })

			// Set timeout for queued request
			const timeout = setTimeout(() => {
				const index = queue.findIndex((item) => item.resolve === resolve)
				if (index > -1) {
					queue.splice(index, 1)
					reject(new ACPConnectionError(`连接请求超时 (队列中等待)`, agentId))
				}
			}, ACP_PROTOCOL.DEFAULT_TIMEOUT)

			this.connectionTimeouts.set(`${agentId}-${Date.now()}`, timeout)
		})
	}

	/**
	 * Process queued connection requests when connections become available
	 * Enhanced with priority-based processing
	 */
	private async processConnectionQueue(): Promise<void> {
		if (this.activeConnections.size >= this.maxConcurrentConnections) {
			return
		}

		// Collect all queued requests with their priorities
		const queuedRequests: Array<{
			agentId: string
			request: {
				resolve: (config: ACPAgentConfig) => void
				reject: (error: Error) => void
				config: ACPAgentConfig
			}
			priority: number
		}> = []

		for (const [agentId, queue] of this.connectionQueue.entries()) {
			if (queue.length === 0) {
				continue
			}

			const priority = this.connectionPriorities.get(agentId) || 0
			const request = queue[0] // Get first request for this agent
			queuedRequests.push({ agentId, request, priority })
		}

		// Sort by priority (higher priority first)
		queuedRequests.sort((a, b) => b.priority - a.priority)

		// Process requests in priority order
		for (const { agentId, request } of queuedRequests) {
			if (this.activeConnections.size >= this.maxConcurrentConnections) {
				break
			}

			// Remove the request from the queue
			const queue = this.connectionQueue.get(agentId)!
			queue.shift()

			try {
				const connection = await this.acquireConnection(agentId, request.config)
				request.resolve(connection)
			} catch (error) {
				request.reject(error)
			}
		}
	}

	/**
	 * Monitor connection health and handle failed connections
	 */
	private monitorConnectionHealth(): void {
		const now = new Date()

		for (const [agentId, connection] of this.connections.entries()) {
			// Check for stale connections
			const timeSinceActivity = now.getTime() - connection.lastActivity.getTime()

			if (connection.status === "connecting" && timeSinceActivity > ACP_PROTOCOL.DEFAULT_TIMEOUT) {
				// Connection attempt timed out
				this.handleConnectionTimeout(agentId)
			} else if (connection.status === "error") {
				// Handle error connections
				this.handleConnectionError(agentId)
			}
		}
	}

	/**
	 * Handle connection timeout
	 */
	private handleConnectionTimeout(agentId: string): void {
		const connection = this.connections.get(agentId)
		if (connection) {
			connection.status = "error"
			this.updateConnectionStatus(agentId, "error")
			this.activeConnections.delete(agentId)

			// Process any queued messages for this agent
			this.rejectPendingMessages(agentId, new ACPTimeoutError("连接超时", agentId, ACP_PROTOCOL.DEFAULT_TIMEOUT))
		}
	}

	/**
	 * Handle connection error
	 */
	private handleConnectionError(agentId: string): void {
		const attempts = this.connectionAttempts.get(agentId) || 0
		const config = this.getAgentConfig(agentId) // We'll need to store this

		if (attempts < DEFAULT_RETRY_CONFIG.maxAttempts) {
			// Use enhanced exponential backoff with jitter
			this.connectionAttempts.set(agentId, attempts + 1)

			let delay = DEFAULT_RETRY_CONFIG.baseDelay * Math.pow(DEFAULT_RETRY_CONFIG.backoffMultiplier, attempts)
			delay = Math.min(delay, DEFAULT_RETRY_CONFIG.maxDelay)

			// Add jitter if enabled
			if (DEFAULT_RETRY_CONFIG.jitter) {
				const jitterAmount = delay * 0.1 // 10% jitter
				delay += (Math.random() - 0.5) * 2 * jitterAmount
			}

			console.log(
				`Retrying connection for agent ${agentId} in ${Math.round(delay)}ms (attempt ${attempts + 1}/${DEFAULT_RETRY_CONFIG.maxAttempts})`,
			)

			setTimeout(() => {
				this.retryConnection(agentId)
			}, delay)
		} else {
			// Max retries exceeded, cleanup
			console.error(`Max retry attempts exceeded for agent ${agentId}`)
			this.activeConnections.delete(agentId)
			this.rejectPendingMessages(agentId, new ACPConnectionError("连接失败，已达到最大重试次数", agentId))
		}
	}

	/**
	 * Retry connection for a failed agent
	 */
	private async retryConnection(agentId: string): Promise<void> {
		const connection = this.connections.get(agentId)
		const config = this.getAgentConfig(agentId)

		if (!connection || !config) {
			console.error(`Cannot retry connection for ${agentId}: missing connection or config`)
			return
		}

		try {
			// Reset connection status
			connection.status = "connecting"
			connection.retryCount++
			this.updateConnectionStatus(agentId, "connecting")

			console.log(`Retrying connection for agent ${agentId} (retry count: ${connection.retryCount})`)

			// Attempt to reconnect using stored config
			await this.connect(config)
		} catch (error) {
			console.error(`Failed to retry connection for ${agentId}:`, error)
			// Let the error handler manage further retries
		}
	}

	/**
	 * Queue message for sending when connection becomes available
	 */
	private queueMessage(agentId: string, message: ACPMessage): Promise<ACPResponse> {
		return new Promise((resolve, reject) => {
			if (!this.pendingMessages.has(agentId)) {
				this.pendingMessages.set(agentId, [])
			}

			const queue = this.pendingMessages.get(agentId)!
			queue.push({ message, resolve, reject })

			// Set timeout for queued message
			setTimeout(() => {
				const index = queue.findIndex((item) => item.message.id === message.id)
				if (index > -1) {
					queue.splice(index, 1)
					reject(new ACPTimeoutError("消息发送超时 (队列中等待)", agentId, ACP_PROTOCOL.DEFAULT_TIMEOUT))
				}
			}, ACP_PROTOCOL.DEFAULT_TIMEOUT)
		})
	}

	/**
	 * Process queued messages for a connected agent
	 */
	private async processQueuedMessages(agentId: string): Promise<void> {
		const queue = this.pendingMessages.get(agentId)
		if (!queue || queue.length === 0) {
			return
		}

		const connection = this.connections.get(agentId)
		if (!connection || connection.status !== "connected") {
			return
		}

		// Process messages in batches to avoid overwhelming the connection
		const batchSize = 5
		while (queue.length > 0 && connection.status === "connected") {
			const batch = queue.splice(0, batchSize)

			await Promise.allSettled(
				batch.map(async ({ message, resolve, reject }) => {
					try {
						const response = await this.sendMessage(agentId, message)
						resolve(response)
					} catch (error) {
						reject(error)
					}
				}),
			)
		}
	}

	/**
	 * Reject all pending messages for an agent
	 */
	private rejectPendingMessages(agentId: string, error: Error): void {
		const queue = this.pendingMessages.get(agentId)
		if (queue) {
			queue.forEach(({ reject }) => reject(error))
			queue.length = 0
		}
	}

	/**
	 * Get detailed connection statistics for monitoring
	 */
	getDetailedConnectionStats(): {
		activeConnections: number
		maxConnections: number
		pooledConnections: number
		totalConnections: number
		queuedConnections: number
		queuedMessages: number
		connectionsByStatus: Record<ConnectionStatus, number>
		connectionMetrics: Map<string, { messageCount: number; lastActivity: Date; latency?: number }>
	} {
		const pooledConnections = Array.from(this.connectionPool.values()).reduce(
			(total, pool) => total + pool.length,
			0,
		)

		const queuedConnections = Array.from(this.connectionQueue.values()).reduce(
			(total, queue) => total + queue.length,
			0,
		)

		const queuedMessages = Array.from(this.pendingMessages.values()).reduce(
			(total, queue) => total + queue.length,
			0,
		)

		const connectionsByStatus: Record<ConnectionStatus, number> = {
			connecting: 0,
			connected: 0,
			disconnected: 0,
			error: 0,
		}

		for (const connection of this.connections.values()) {
			connectionsByStatus[connection.status]++
		}

		return {
			activeConnections: this.activeConnections.size,
			maxConnections: this.maxConcurrentConnections,
			pooledConnections,
			totalConnections: this.connections.size,
			queuedConnections,
			queuedMessages,
			connectionsByStatus,
			connectionMetrics: new Map(this.connectionMetrics),
		}
	}

	/**
	 * Force disconnect all connections for an agent (useful for cleanup)
	 */
	async forceDisconnect(agentId: string): Promise<void> {
		// Cancel any queued connections
		const queue = this.connectionQueue.get(agentId)
		if (queue) {
			queue.forEach(({ reject }) => reject(new ACPConnectionError("连接被强制取消", agentId)))
			queue.length = 0
		}

		// Reject pending messages
		this.rejectPendingMessages(agentId, new ACPConnectionError("连接被强制断开", agentId))

		// Clear timeouts
		for (const [key, timeout] of this.connectionTimeouts.entries()) {
			if (key.startsWith(agentId)) {
				clearTimeout(timeout)
				this.connectionTimeouts.delete(key)
			}
		}

		// Disconnect normally
		await this.disconnect(agentId)
	}

	/**
	 * Check if agent can accept new connections
	 */
	canAcceptConnection(agentId?: string): boolean {
		if (agentId && this.connections.has(agentId)) {
			const connection = this.connections.get(agentId)!
			return connection.status === "disconnected" || connection.status === "error"
		}

		return this.activeConnections.size < this.maxConcurrentConnections
	}

	/**
	 * Get connection queue status for an agent
	 */
	getConnectionQueueStatus(agentId: string): {
		queueLength: number
		position?: number
		estimatedWaitTime?: number
	} {
		const queue = this.connectionQueue.get(agentId)
		if (!queue) {
			return { queueLength: 0 }
		}

		// Calculate estimated wait time based on average connection time
		const avgConnectionTime = 5000 // 5 seconds estimate
		const position = queue.length
		const estimatedWaitTime = position * avgConnectionTime

		return {
			queueLength: queue.length,
			position,
			estimatedWaitTime,
		}
	}

	/**
	 * Set connection priority for load balancing and resource allocation
	 */
	setConnectionPriority(agentId: string, priority: number): void {
		this.connectionPriorities.set(agentId, priority)
	}

	/**
	 * Set concurrent message limit for an agent
	 */
	setConcurrentMessageLimit(agentId: string, limit: number): void {
		this.concurrentMessageLimits.set(agentId, limit)
	}

	/**
	 * Get the next available connection from pool using load balancing
	 */
	private getPooledConnection(agentId: string): ACPConnection | null {
		const pool = this.connectionPool.get(agentId)
		if (!pool || pool.length === 0) {
			return null
		}

		// Use round-robin load balancing
		const currentIndex = this.connectionLoadBalancer.get(agentId) || 0
		const connection = pool[currentIndex % pool.length]
		this.connectionLoadBalancer.set(agentId, (currentIndex + 1) % pool.length)

		return connection
	}

	/**
	 * Check if agent can accept more concurrent messages
	 */
	private canAcceptMessage(agentId: string): boolean {
		const limit = this.concurrentMessageLimits.get(agentId) || 10 // Default limit
		const activeCount = this.activeMessageCounts.get(agentId) || 0
		return activeCount < limit
	}

	/**
	 * Increment active message count for an agent
	 */
	private incrementActiveMessages(agentId: string): void {
		const current = this.activeMessageCounts.get(agentId) || 0
		this.activeMessageCounts.set(agentId, current + 1)
	}

	/**
	 * Decrement active message count for an agent
	 */
	private decrementActiveMessages(agentId: string): void {
		const current = this.activeMessageCounts.get(agentId) || 0
		this.activeMessageCounts.set(agentId, Math.max(0, current - 1))
	}

	/**
	 * Get connection statistics with enhanced concurrent connection metrics
	 */
	getEnhancedConnectionStats(): {
		activeConnections: number
		maxConnections: number
		pooledConnections: number
		totalConnections: number
		queuedConnections: number
		queuedMessages: number
		connectionsByStatus: Record<ConnectionStatus, number>
		connectionsByPriority: Record<number, number>
		activeMessagesByAgent: Record<string, number>
		connectionMetrics: Map<string, { messageCount: number; lastActivity: Date; latency?: number }>
	} {
		const baseStats = this.getDetailedConnectionStats()

		// Group connections by priority
		const connectionsByPriority: Record<number, number> = {}
		for (const [agentId] of this.connections.entries()) {
			const priority = this.connectionPriorities.get(agentId) || 0
			connectionsByPriority[priority] = (connectionsByPriority[priority] || 0) + 1
		}

		// Get active messages by agent
		const activeMessagesByAgent: Record<string, number> = {}
		for (const [agentId, count] of this.activeMessageCounts.entries()) {
			activeMessagesByAgent[agentId] = count
		}

		return {
			...baseStats,
			connectionsByPriority,
			activeMessagesByAgent,
		}
	}

	/**
	 * Connect to an ACP agent using the provided configuration
	 * Enhanced with connection pool management and thread-safe operations
	 */
	async connect(config: ACPAgentConfig): Promise<void> {
		const agentId = config.id

		// Store agent config for retry logic
		this.storeAgentConfig(config)

		try {
			// cmbt-agent_change start - Use connection pool management
			// Acquire connection from pool (thread-safe)
			const connection = await this.acquireConnection(agentId, config)

			// If connection is already established, return early
			if (connection.status === "connected") {
				return
			}

			this.updateConnectionStatus(agentId, "connecting")

			// Establish transport connection
			await this.establishTransportConnection(config, connection)

			// Perform protocol handshake
			await this.performHandshake(config, connection)

			// Authenticate if required
			if (config.authentication.type !== "none") {
				await this.authenticate(config, connection)
			}

			// Mark as connected
			connection.status = "connected"
			connection.lastActivity = new Date()
			this.updateConnectionStatus(agentId, "connected")
			this.updateConnectionMetrics(agentId)

			// cmbt-agent_change start - Process queued messages after connection
			// Process any queued messages for this agent
			await this.processQueuedMessages(agentId)
			// cmbt-agent_change end

			this.emitEvent("agent-connected", agentId)
			// cmbt-agent_change end
		} catch (error) {
			// cmbt-agent_change start - Enhanced error handling with connection cleanup
			const connection = this.connections.get(agentId)
			if (connection) {
				connection.status = "error"
				this.updateConnectionStatus(agentId, "error")
			}

			// Remove from active connections on failure
			this.activeConnections.delete(agentId)

			const acpError =
				error instanceof ACPError
					? error
					: new ACPConnectionError(`连接失败: ${error.message}`, agentId, error as Error)

			await this.errorHandler.handleError(acpError)
			throw acpError
			// cmbt-agent_change end
		}
	}

	/**
	 * Disconnect from an ACP agent
	 * Enhanced with connection pool management
	 */
	async disconnect(agentId: string): Promise<void> {
		const connection = this.connections.get(agentId)
		if (!connection) {
			throw new ACPConnectionError(`智能体 ${agentId} 未连接`, agentId)
		}

		try {
			// cmbt-agent_change start - Use connection pool for cleanup
			// Release connection back to pool or cleanup
			await this.releaseConnection(agentId)

			// Update status
			connection.status = "disconnected"
			this.updateConnectionStatus(agentId, "disconnected")

			this.emitEvent("agent-disconnected", agentId)
			// cmbt-agent_change end
		} catch (error) {
			const acpError = new ACPConnectionError(`断开连接失败: ${error.message}`, agentId, error as Error)
			await this.errorHandler.handleError(acpError)
			throw acpError
		}
	}

	/**
	 * Send a message to an ACP agent
	 * Enhanced with connection metrics tracking, message queuing, and concurrent message limiting
	 */
	async sendMessage(agentId: string, message: ACPMessage): Promise<ACPResponse> {
		const connection = this.connections.get(agentId)

		// cmbt-agent_change start - Enhanced message handling with queuing and concurrency control
		if (!connection) {
			throw new ACPConnectionError(`智能体 ${agentId} 未配置`, agentId)
		}

		if (connection.status === "connecting") {
			// Queue message if connection is in progress
			return this.queueMessage(agentId, message)
		}

		if (connection.status !== "connected") {
			throw new ACPConnectionError(`智能体 ${agentId} 未连接 (状态: ${connection.status})`, agentId)
		}

		// Check concurrent message limit
		if (!this.canAcceptMessage(agentId)) {
			return this.queueMessage(agentId, message)
		}
		// cmbt-agent_change end

		// Add message ID if not present
		if (!message.id) {
			message.id = this.generateMessageId()
		}

		try {
			// cmbt-agent_change start - Track message timing for metrics and concurrency
			const startTime = Date.now()
			this.incrementActiveMessages(agentId)

			// Serialize message
			const serializedMessage = this.serializeMessage(message)

			// Send via transport
			const response = await this.sendViaTransport(agentId, connection, serializedMessage)

			// Update activity and metrics
			const latency = Date.now() - startTime
			connection.lastActivity = new Date()
			this.updateConnectionMetrics(agentId, latency)

			this.emitEvent("message-sent", agentId, { message })

			return response
			// cmbt-agent_change end
		} catch (error) {
			const acpError =
				error instanceof ACPError
					? error
					: new ACPProtocolError(`发送消息失败: ${error.message}`, agentId, error as Error)

			await this.errorHandler.handleError(acpError)
			throw acpError
		} finally {
			// cmbt-agent_change start - Always decrement active message count
			this.decrementActiveMessages(agentId)
			// cmbt-agent_change end
		}
	}

	/**
	 * Subscribe to messages from an ACP agent
	 */
	subscribe(agentId: string, callback: MessageCallback): void {
		if (!this.messageHandlers.has(agentId)) {
			this.messageHandlers.set(agentId, [])
		}
		this.messageHandlers.get(agentId)!.push(callback)
	}

	/**
	 * Unsubscribe from messages from an ACP agent
	 */
	unsubscribe(agentId: string, callback: MessageCallback): void {
		const handlers = this.messageHandlers.get(agentId)
		if (handlers) {
			const index = handlers.indexOf(callback)
			if (index > -1) {
				handlers.splice(index, 1)
			}
		}
	}

	/**
	 * Subscribe to status changes for an ACP agent
	 */
	onStatusChange(agentId: string, callback: StatusCallback): void {
		if (!this.statusHandlers.has(agentId)) {
			this.statusHandlers.set(agentId, [])
		}
		this.statusHandlers.get(agentId)!.push(callback)
	}

	/**
	 * Get connection status for an ACP agent
	 */
	getConnectionStatus(agentId: string): ConnectionStatus {
		const connection = this.connections.get(agentId)
		return connection ? connection.status : "disconnected"
	}

	/**
	 * Get all active connections
	 */
	getConnections(): Map<string, ACPConnection> {
		return new Map(this.connections)
	}

	/**
	 * Close all connections and cleanup
	 * Enhanced with connection pool and resource cleanup
	 */
	async shutdown(): Promise<void> {
		// cmbt-agent_change start - Enhanced shutdown with resource cleanup
		// Stop resource management timers
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = undefined
		}

		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval)
			this.heartbeatInterval = undefined
		}

		if (this.connectionMonitorInterval) {
			clearInterval(this.connectionMonitorInterval)
			this.connectionMonitorInterval = undefined
		}

		// Clear all timeouts
		for (const timeout of this.connectionTimeouts.values()) {
			clearTimeout(timeout)
		}
		this.connectionTimeouts.clear()

		// Reject all queued connections and messages
		for (const [agentId, queue] of this.connectionQueue.entries()) {
			queue.forEach(({ reject }) => reject(new ACPConnectionError("系统关闭中", agentId)))
		}

		for (const [agentId] of this.pendingMessages.entries()) {
			this.rejectPendingMessages(agentId, new ACPConnectionError("系统关闭中", agentId))
		}

		// Disconnect all active connections
		const disconnectPromises = Array.from(this.connections.keys()).map((agentId) =>
			this.disconnect(agentId).catch((error) => console.error(`Error disconnecting ${agentId}:`, error)),
		)

		await Promise.all(disconnectPromises)

		// Clear all pools and tracking data
		this.connectionPool.clear()
		this.activeConnections.clear()
		this.connectionLocks.clear()
		this.connectionMetrics.clear()
		this.connectionQueue.clear()
		this.connectionAttempts.clear()
		this.pendingMessages.clear()

		// Clear enhanced concurrent connection tracking
		this.connectionPriorities.clear()
		this.connectionLoadBalancer.clear()
		this.concurrentMessageLimits.clear()
		this.activeMessageCounts.clear()

		// Clear stored agent configs
		this.agentConfigs.clear()

		this.removeAllListeners()
		// cmbt-agent_change end
	}

	// Private methods

	private async establishTransportConnection(config: ACPAgentConfig, connection: ACPConnection): Promise<void> {
		switch (config.transport) {
			case "websocket":
				await this.establishWebSocketConnection(config, connection)
				break
			case "http":
				await this.establishHttpConnection(config, connection)
				break
			case "stdio":
				await this.establishStdioConnection(config, connection)
				break
			default:
				throw new ACPConnectionError(`不支持的传输类型: ${config.transport}`, config.id)
		}
	}

	private async establishWebSocketConnection(config: ACPAgentConfig, connection: ACPConnection): Promise<void> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(config.endpoint)
			const timeout = setTimeout(() => {
				ws.close()
				reject(new ACPTimeoutError("WebSocket连接超时", config.id, ACP_PROTOCOL.DEFAULT_TIMEOUT))
			}, ACP_PROTOCOL.DEFAULT_TIMEOUT)

			ws.on("open", () => {
				clearTimeout(timeout)
				this.websockets.set(config.id, ws)
				this.setupWebSocketHandlers(config.id, ws)
				resolve()
			})

			ws.on("error", (error) => {
				clearTimeout(timeout)
				reject(new ACPConnectionError(`WebSocket连接失败: ${error.message}`, config.id, error))
			})
		})
	}

	private async establishHttpConnection(config: ACPAgentConfig, connection: ACPConnection): Promise<void> {
		// HTTP transport implementation
		// For now, we'll implement a basic HTTP client
		try {
			const response = await fetch(config.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "CMBT-Agent-ACP-Client/1.0",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					method: "ping",
					id: this.generateMessageId(),
				}),
			})

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
		} catch (error) {
			throw new ACPConnectionError(`HTTP连接失败: ${error.message}`, config.id, error as Error)
		}
	}

	private async establishStdioConnection(config: ACPAgentConfig, connection: ACPConnection): Promise<void> {
		// Stdio transport implementation
		// This would typically involve spawning a child process
		throw new ACPConnectionError("Stdio传输暂未实现", config.id)
	}

	private setupWebSocketHandlers(agentId: string, ws: WebSocket): void {
		ws.on("message", (data) => {
			try {
				const message = this.deserializeMessage(data.toString())
				this.handleIncomingMessage(agentId, message)
			} catch (error) {
				const acpError = new ACPProtocolError(`消息解析失败: ${error.message}`, agentId, error as Error)
				this.errorHandler.handleError(acpError)
			}
		})

		ws.on("close", () => {
			this.updateConnectionStatus(agentId, "disconnected")
			this.emitEvent("agent-disconnected", agentId)
		})

		ws.on("error", (error) => {
			const acpError = new ACPConnectionError(`WebSocket错误: ${error.message}`, agentId, error)
			this.errorHandler.handleError(acpError)
		})
	}

	private async performHandshake(config: ACPAgentConfig, connection: ACPConnection): Promise<void> {
		const handshakeMessage: ACPMessage = {
			jsonrpc: "2.0",
			method: "initialize",
			params: {
				clientInfo: {
					name: "CMBT-Agent",
					version: "1.0.0",
				},
				capabilities: ["code-completion", "code-explanation", "debugging"],
			},
			id: this.generateMessageId(),
		}

		try {
			const response = await this.sendViaTransport(config.id, connection, this.serializeMessage(handshakeMessage))

			if (response.error) {
				throw new ACPProtocolError(`握手失败: ${response.error.message}`, config.id)
			}

			// Validate server capabilities
			if (response.result && response.result.capabilities) {
				this.validateServerCapabilities(config.id, response.result.capabilities)
			}
		} catch (error) {
			throw new ACPProtocolError(`协议握手失败: ${error.message}`, config.id, error as Error)
		}
	}

	private async authenticate(config: ACPAgentConfig, connection: ACPConnection): Promise<void> {
		const authConfig = config.authentication

		if (authConfig.type === "token" && authConfig.credentials?.token) {
			const authMessage: ACPMessage = {
				jsonrpc: "2.0",
				method: "authenticate",
				params: {
					type: "token",
					token: authConfig.credentials.token,
				},
				id: this.generateMessageId(),
			}

			try {
				const response = await this.sendViaTransport(config.id, connection, this.serializeMessage(authMessage))

				if (response.error) {
					throw new ACPAuthenticationError(`认证失败: ${response.error.message}`, config.id)
				}
			} catch (error) {
				throw new ACPAuthenticationError(`身份验证失败: ${error.message}`, config.id, error as Error)
			}
		}
	}

	private async sendViaTransport(
		agentId: string,
		connection: ACPConnection,
		serializedMessage: string,
	): Promise<ACPResponse> {
		switch (connection.transport) {
			case "websocket":
				return this.sendViaWebSocket(agentId, serializedMessage)
			case "http":
				return this.sendViaHttp(agentId, connection, serializedMessage)
			case "stdio":
				return this.sendViaStdio(agentId, serializedMessage)
			default:
				throw new ACPProtocolError(`不支持的传输类型: ${connection.transport}`, agentId)
		}
	}

	private async sendViaWebSocket(agentId: string, serializedMessage: string): Promise<ACPResponse> {
		const ws = this.websockets.get(agentId)
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			throw new ACPConnectionError(`WebSocket连接不可用`, agentId)
		}

		return new Promise((resolve, reject) => {
			const messageData = JSON.parse(serializedMessage)
			const messageId = messageData.id

			// Set up response handler
			const responseHandler = (response: ACPResponse) => {
				if (response.id === messageId) {
					this.off(`response-${agentId}`, responseHandler)
					resolve(response)
				}
			}

			this.on(`response-${agentId}`, responseHandler)

			// Set timeout
			const timeout = setTimeout(() => {
				this.off(`response-${agentId}`, responseHandler)
				reject(new ACPTimeoutError("消息响应超时", agentId, ACP_PROTOCOL.DEFAULT_TIMEOUT))
			}, ACP_PROTOCOL.DEFAULT_TIMEOUT)

			// Send message
			ws.send(serializedMessage, (error) => {
				if (error) {
					clearTimeout(timeout)
					this.off(`response-${agentId}`, responseHandler)
					reject(new ACPConnectionError(`发送消息失败: ${error.message}`, agentId, error))
				}
			})
		})
	}

	private async sendViaHttp(
		agentId: string,
		connection: ACPConnection,
		serializedMessage: string,
	): Promise<ACPResponse> {
		try {
			const response = await fetch(connection.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "CMBT-Agent-ACP-Client/1.0",
				},
				body: serializedMessage,
			})

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			const responseData = await response.json()
			return this.deserializeMessage(JSON.stringify(responseData)) as ACPResponse
		} catch (error) {
			throw new ACPConnectionError(`HTTP请求失败: ${error.message}`, agentId, error as Error)
		}
	}

	private async sendViaStdio(agentId: string, serializedMessage: string): Promise<ACPResponse> {
		throw new ACPProtocolError("Stdio传输暂未实现", agentId)
	}

	private async closeTransportConnection(agentId: string, connection: ACPConnection): Promise<void> {
		switch (connection.transport) {
			case "websocket": {
				const ws = this.websockets.get(agentId)
				if (ws) {
					ws.close()
					this.websockets.delete(agentId)
				}
				break
			}
			case "http":
				// HTTP is stateless, no persistent connection to close
				break
			case "stdio":
				// Close stdio connection if implemented
				break
		}
	}

	private cleanupConnection(agentId: string): void {
		this.connections.delete(agentId)
		this.messageHandlers.delete(agentId)
		this.statusHandlers.delete(agentId)
		this.websockets.delete(agentId)
		// cmbt-agent_change start - Clean up connection pool and metrics
		this.connectionPool.delete(agentId)
		this.connectionMetrics.delete(agentId)
		this.activeConnections.delete(agentId)
		this.connectionLocks.delete(agentId)

		// Clean up queues and attempts
		this.connectionQueue.delete(agentId)
		this.connectionAttempts.delete(agentId)
		this.pendingMessages.delete(agentId)

		// Clean up enhanced concurrent connection tracking
		this.connectionPriorities.delete(agentId)
		this.connectionLoadBalancer.delete(agentId)
		this.concurrentMessageLimits.delete(agentId)
		this.activeMessageCounts.delete(agentId)

		// Clean up stored agent config
		this.agentConfigs.delete(agentId)

		// Clear timeouts for this agent
		for (const [key, timeout] of this.connectionTimeouts.entries()) {
			if (key.startsWith(agentId)) {
				clearTimeout(timeout)
				this.connectionTimeouts.delete(key)
			}
		}
		// cmbt-agent_change end
	}

	private handleIncomingMessage(agentId: string, message: ACPMessage | ACPResponse): void {
		// Update activity
		const connection = this.connections.get(agentId)
		if (connection) {
			connection.lastActivity = new Date()
		}

		// Handle response messages
		if ("result" in message || "error" in message) {
			this.emit(`response-${agentId}`, message)
			this.emitEvent("message-received", agentId, { message })
			return
		}

		// Handle notification messages
		const handlers = this.messageHandlers.get(agentId) || []
		handlers.forEach((handler) => {
			try {
				handler(message as ACPMessage)
			} catch (error) {
				console.error(`Error in message handler for ${agentId}:`, error)
			}
		})

		this.emitEvent("message-received", agentId, { message })
	}

	private updateConnectionStatus(agentId: string, status: ConnectionStatus): void {
		const connection = this.connections.get(agentId)
		if (connection) {
			connection.status = status
		}

		// Notify status handlers
		const handlers = this.statusHandlers.get(agentId) || []
		handlers.forEach((handler) => {
			try {
				handler(agentId, status)
			} catch (error) {
				console.error(`Error in status handler for ${agentId}:`, error)
			}
		})
	}

	private serializeMessage(message: ACPMessage | ACPResponse): string {
		try {
			return JSON.stringify(message)
		} catch (error) {
			throw new ACPProtocolError(`消息序列化失败: ${error.message}`)
		}
	}

	private deserializeMessage(data: string): ACPMessage | ACPResponse {
		try {
			const parsed = JSON.parse(data)

			// Validate JSON-RPC 2.0 format
			if (parsed.jsonrpc !== "2.0") {
				throw new Error("Invalid JSON-RPC version")
			}

			return parsed
		} catch (error) {
			throw new ACPProtocolError(`消息反序列化失败: ${error.message}`)
		}
	}

	private generateMessageId(): string {
		return `msg_${++this.messageIdCounter}_${Date.now()}`
	}

	private validateServerCapabilities(agentId: string, serverCapabilities: any): void {
		// Validate that server supports required capabilities
		const requiredCapabilities = ["initialize", "authenticate"]

		for (const capability of requiredCapabilities) {
			if (!serverCapabilities.includes(capability)) {
				throw new ACPProtocolError(`服务器不支持必需的功能: ${capability}`, agentId)
			}
		}
	}

	private setupErrorHandling(): void {
		this.errorHandler.onError((error) => {
			this.emit("error", error)
		})
	}

	private emitEvent(type: ACPEventType, agentId: string, data?: any): void {
		const event: ACPEvent = {
			type,
			agentId,
			timestamp: new Date(),
			data,
		}

		this.emit("acp-event", event)
	}
	/**
	 * Get agent configuration for retry logic
	 */
	private getAgentConfig(agentId: string): ACPAgentConfig | undefined {
		return this.agentConfigs.get(agentId)
	}

	/**
	 * Store agent configuration for retry logic
	 */
	private storeAgentConfig(config: ACPAgentConfig): void {
		this.agentConfigs.set(config.id, config)
	}
}
