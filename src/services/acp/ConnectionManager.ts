// cmbt-agent_change - new file
import * as vscode from "vscode"
import { ChildProcess } from "child_process"
import { ClientSideConnection, ndJsonStream, Agent, Client } from "@agentclientprotocol/sdk"
import { Readable, Writable } from "stream"
import { AcpLogger } from "./AcpLogger"

export interface InitializeResult {
	agentInfo: { name: string; version: string }
	agentCapabilities: Record<string, unknown>
}

export interface ReconnectionConfig {
	maxAttempts: number
	initialDelay: number
	maxDelay: number
	backoffMultiplier: number
}

export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
	maxAttempts: 3,
	initialDelay: 1000,
	maxDelay: 10000,
	backoffMultiplier: 2,
}

export type ReconnectHandler = (agentId: string) => Promise<{ process: ChildProcess; connection: ClientSideConnection }>

export interface IConnectionManager {
	createConnection(
		process: ChildProcess,
		agentId: string,
		clientFactory: (agent: Agent) => Client,
	): Promise<ClientSideConnection>
	initialize(connection: ClientSideConnection): Promise<InitializeResult>
	closeConnection(agentId: string): Promise<void>
	getConnection(agentId: string): ClientSideConnection | undefined
	setTrafficLogging(enabled: boolean): void
	setReconnectHandler(handler: ReconnectHandler): void
	onConnectionLost: vscode.Event<{ agentId: string; reason: string }>
	onReconnectFailed: vscode.Event<{ agentId: string; attempts: number }>
}

export class ConnectionManager implements IConnectionManager {
	private connections = new Map<string, ClientSideConnection>()
	private trafficLoggingEnabled = false
	private reconnectHandler: ReconnectHandler | undefined
	private reconnecting = new Set<string>()
	private readonly reconnectionConfig: ReconnectionConfig
	private readonly _connectionLostEmitter = new vscode.EventEmitter<{ agentId: string; reason: string }>()
	readonly onConnectionLost = this._connectionLostEmitter.event
	private readonly _reconnectFailedEmitter = new vscode.EventEmitter<{ agentId: string; attempts: number }>()
	readonly onReconnectFailed = this._reconnectFailedEmitter.event

	constructor(
		private logger: AcpLogger,
		reconnectionConfig?: Partial<ReconnectionConfig>,
	) {
		this.reconnectionConfig = { ...DEFAULT_RECONNECTION_CONFIG, ...reconnectionConfig }
	}

	setReconnectHandler(handler: ReconnectHandler): void {
		this.reconnectHandler = handler
	}

	async createConnection(
		process: ChildProcess,
		agentId: string,
		clientFactory: (agent: Agent) => Client,
	): Promise<ClientSideConnection> {
		if (!process.stdin || !process.stdout) {
			throw new Error("Process stdin/stdout not available")
		}

		this.logger.debug("Creating ACP connection streams", { agentId })

		const writable = Writable.toWeb(process.stdin)
		const readable = Readable.toWeb(process.stdout)
		const stream = ndJsonStream(writable, readable)

		const connection = new ClientSideConnection(clientFactory, stream)

		this.connections.set(agentId, connection)
		this.setupConnectionLostHandler(connection, agentId)

		if (this.trafficLoggingEnabled) {
			this.setupTrafficLogging(connection)
		}

		this.logger.info("ACP connection created", { agentId })
		return connection
	}

	async initialize(connection: ClientSideConnection): Promise<InitializeResult> {
		// 创建链接
		this.logger.info("Initializing ACP connection")

		const response = await connection.initialize({
			protocolVersion: 0,
			clientInfo: { name: "cmbt-agent", version: "1.0.0" },
			clientCapabilities: {
				fs: { readTextFile: true, writeTextFile: true },
				terminal: true,
			},
		})
		this.logger.info("连接了啥反悔了什么===1231232131", response)
		const agentInfo = response.agentInfo ?? { name: "unknown", version: "unknown" }

		this.logger.info("ACP connection initialized", {
			agentName: agentInfo.name,
			agentVersion: agentInfo.version,
		})

		return {
			agentInfo,
			agentCapabilities: (response.agentCapabilities as Record<string, unknown>) ?? {},
		}
	}

	async closeConnection(agentId: string): Promise<void> {
		const connection = this.connections.get(agentId)
		if (!connection) {
			return
		}

		this.logger.info("Closing ACP connection", { agentId })
		this.connections.delete(agentId)
	}

	getConnection(agentId: string): ClientSideConnection | undefined {
		return this.connections.get(agentId)
	}

	setTrafficLogging(enabled: boolean): void {
		this.trafficLoggingEnabled = enabled
		this.logger.info(`Traffic logging ${enabled ? "enabled" : "disabled"}`)
		// cmbt-agent_change - For manual testing procedures, see src/services/acp/__tests__/manual-testing/
	}

	private setupTrafficLogging(connection: ClientSideConnection): void {
		// cmbt-agent_change start - Document application-level traffic logging approach
		// The ACP SDK does not directly expose message interception interfaces.
		// Traffic logging is implemented at the application level through:
		// 1. AcpClientImpl.sendMessage() - logs prompt() requests and responses (including stopReason)
		// 2. Client handlers (sessionUpdate, requestPermission, etc.) - log incoming notifications
		// 3. ConnectionManager.initialize() - logs initialization handshake and agent capabilities
		// 4. Connection lifecycle events - logged below
		// cmbt-agent_change end

		connection.signal.addEventListener("abort", () => {
			this.logger.trace("receive", "Connection closed")
		})
	}

	private setupConnectionLostHandler(connection: ClientSideConnection, agentId: string): void {
		connection.signal.addEventListener("abort", () => {
			if (this.connections.has(agentId)) {
				this.connections.delete(agentId)
				this.logger.warn("Connection lost", { agentId })
				this._connectionLostEmitter.fire({ agentId, reason: "Connection closed unexpectedly" })
				this.attemptReconnect(agentId)
			}
		})
	}

	async attemptReconnect(agentId: string): Promise<boolean> {
		if (!this.reconnectHandler) {
			this.logger.warn("No reconnect handler registered, cannot reconnect", { agentId })
			return false
		}

		if (this.reconnecting.has(agentId)) {
			this.logger.debug("Reconnection already in progress", { agentId })
			return false
		}

		this.reconnecting.add(agentId)

		try {
			for (let attempt = 1; attempt <= this.reconnectionConfig.maxAttempts; attempt++) {
				const delay = this.calculateDelay(attempt)
				this.logger.info(`Reconnection attempt ${attempt}/${this.reconnectionConfig.maxAttempts}`, {
					agentId,
					delay,
				})

				await this.sleep(delay)

				try {
					const result = await this.reconnectHandler(agentId)
					this.connections.set(agentId, result.connection)
					this.setupConnectionLostHandler(result.connection, agentId)

					if (this.trafficLoggingEnabled) {
						this.setupTrafficLogging(result.connection)
					}

					this.logger.info("Reconnection successful", { agentId, attempt })
					return true
				} catch (error) {
					this.logger.warn(`Reconnection attempt ${attempt} failed`, {
						agentId,
						error: error instanceof Error ? error.message : String(error),
					})
				}
			}

			this.logger.error(`Failed to reconnect after ${this.reconnectionConfig.maxAttempts} attempts`, undefined, {
				agentId,
			})
			this._reconnectFailedEmitter.fire({ agentId, attempts: this.reconnectionConfig.maxAttempts })
			return false
		} finally {
			this.reconnecting.delete(agentId)
		}
	}

	calculateDelay(attempt: number): number {
		const delay =
			this.reconnectionConfig.initialDelay * Math.pow(this.reconnectionConfig.backoffMultiplier, attempt - 1)
		return Math.min(delay, this.reconnectionConfig.maxDelay)
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	dispose(): void {
		this.connections.clear()
		this.reconnecting.clear()
		this._connectionLostEmitter.dispose()
		this._reconnectFailedEmitter.dispose()
	}
}
