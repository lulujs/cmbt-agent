// cmbt-agent_change - new file
import * as vscode from "vscode"
import { ChildProcess, spawn, SpawnOptions } from "child_process"
import { AcpLogger } from "./AcpLogger"

export interface AcpAgentConfig {
	id: string
	name: string
	command: string
	args: string[]
	env?: Record<string, string>
}

export interface AgentProcess {
	config: AcpAgentConfig
	process: ChildProcess
	status: "starting" | "running" | "stopped" | "error"
}

export interface IAgentManager {
	startAgent(config: AcpAgentConfig): Promise<AgentProcess>
	stopAgent(agentId: string): Promise<void>
	switchAgent(config: AcpAgentConfig): Promise<AgentProcess>
	getActiveAgent(): AgentProcess | undefined
	getConfiguredAgents(): AcpAgentConfig[]
	disposeAll(): Promise<void>
	onAgentStatusChanged: vscode.Event<{ agentId: string; status: AgentProcess["status"] }>
}

export function getSpawnOptions(config: AcpAgentConfig): SpawnOptions {
	const isWindows = process.platform === "win32"
	if (isWindows) {
		return { shell: true, env: { ...process.env, ...config.env } }
	}
	const loginShell = process.env.SHELL || "/bin/bash"
	return {
		shell: loginShell,
		env: { ...process.env, ...config.env },
	}
}

export class AgentManager implements IAgentManager {
	private activeAgent: AgentProcess | undefined
	private readonly _statusEmitter = new vscode.EventEmitter<{ agentId: string; status: AgentProcess["status"] }>()
	readonly onAgentStatusChanged: vscode.Event<{ agentId: string; status: AgentProcess["status"] }> =
		this._statusEmitter.event

	constructor(private logger: AcpLogger) {}

	validateConfig(config: AcpAgentConfig): boolean {
		if (!config.command || !Array.isArray(config.args)) {
			this.logger.error(`Invalid agent configuration: ${config.name || config.id}`, undefined, {
				agentId: config.id,
				hasCommand: !!config.command,
				hasArgs: Array.isArray(config.args),
			})
			vscode.window.showErrorMessage(
				`Invalid ACP agent configuration for "${config.name || config.id}". Missing required fields: command or args.`,
			)
			return false
		}
		return true
	}

	async startAgent(config: AcpAgentConfig): Promise<AgentProcess> {
		if (!this.validateConfig(config)) {
			throw new Error(`Invalid configuration for agent: ${config.name || config.id}`)
		}

		this.logger.info(`Starting agent: ${config.name}`, { agentId: config.id })

		const spawnOptions = getSpawnOptions(config)
		const childProcess = spawn(config.command, config.args, spawnOptions)

		// Log agent stderr for debugging
		if (childProcess.stderr) {
			childProcess.stderr.on("data", (data) => {
				this.logger.debug(`[Agent ${config.id} stderr]: ${data.toString()}`)
			})
		}

		const agentProcess: AgentProcess = {
			config,
			process: childProcess,
			status: "starting",
		}

		this.activeAgent = agentProcess
		this._statusEmitter.fire({ agentId: config.id, status: "starting" })

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				agentProcess.status = "running"
				this._statusEmitter.fire({ agentId: config.id, status: "running" })
				this.logger.info(`Agent started successfully: ${config.name}`)
				resolve(agentProcess)
			}, 1000)

			childProcess.on("error", (error) => {
				clearTimeout(timeout)
				agentProcess.status = "error"
				this._statusEmitter.fire({ agentId: config.id, status: "error" })
				this.logger.error(`Failed to start agent: ${config.name}`, error, { agentId: config.id })
				reject(error)
			})

			childProcess.on("exit", (code) => {
				if (agentProcess.status === "starting") {
					clearTimeout(timeout)
					const error = new Error(`Agent exited during startup with code ${code}`)
					agentProcess.status = "error"
					this._statusEmitter.fire({ agentId: config.id, status: "error" })
					this.logger.error(`Agent exited during startup: ${config.name}`, error, { code })
					reject(error)
				} else {
					agentProcess.status = "stopped"
					this._statusEmitter.fire({ agentId: config.id, status: "stopped" })
					this.logger.info(`Agent exited: ${config.name}`, { code })
				}
			})
		})
	}

	async stopAgent(agentId: string): Promise<void> {
		if (!this.activeAgent || this.activeAgent.config.id !== agentId) {
			return
		}

		this.logger.info(`Stopping agent: ${this.activeAgent.config.name}`, { agentId })

		const agentProcess = this.activeAgent
		this.activeAgent = undefined

		return new Promise((resolve) => {
			const proc = agentProcess.process
			const timeout = setTimeout(() => {
				proc.kill("SIGKILL")
				resolve()
			}, 5000)

			proc.once("exit", () => {
				clearTimeout(timeout)
				resolve()
			})

			proc.kill("SIGTERM")
			agentProcess.status = "stopped"
			this._statusEmitter.fire({ agentId, status: "stopped" })
		})
	}

	async switchAgent(config: AcpAgentConfig): Promise<AgentProcess> {
		if (this.activeAgent) {
			await this.stopAgent(this.activeAgent.config.id)
		}
		return this.startAgent(config)
	}

	getActiveAgent(): AgentProcess | undefined {
		return this.activeAgent
	}

	getConfiguredAgents(): AcpAgentConfig[] {
		const config = vscode.workspace.getConfiguration("cmbt-agent")
		const agents = config.get<AcpAgentConfig[]>("acp.agents", [])
		return agents
	}

	getWorkspaceRoot(): string | undefined {
		return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	}

	async disposeAll(): Promise<void> {
		if (this.activeAgent) {
			await this.stopAgent(this.activeAgent.config.id)
		}
		this._statusEmitter.dispose()
	}
}
