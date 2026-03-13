// cmbt-agent_change - new file
import * as vscode from "vscode"
import { v4 as uuidv4 } from "uuid"
import { AcpLogger } from "../../services/acp/AcpLogger"

interface TerminalEntry {
	terminal: vscode.Terminal
	output: string[]
	exitCode: number | undefined
}

export class TerminalHandler {
	private terminals = new Map<string, TerminalEntry>()
	private disposables: vscode.Disposable[] = []

	constructor(private logger: AcpLogger) {
		this.disposables.push(
			vscode.window.onDidCloseTerminal((terminal) => {
				for (const [id, entry] of this.terminals.entries()) {
					if (entry.terminal === terminal) {
						entry.exitCode = terminal.exitStatus?.code ?? 0
						this.logger.debug(`Terminal ${id} closed with exit code ${entry.exitCode}`)
					}
				}
			}),
		)
	}

	async handleCreateTerminal(params: { name?: string; cwd?: string }): Promise<{ terminalId: string }> {
		const terminalId = uuidv4()
		const terminal = vscode.window.createTerminal({
			name: params.name || "ACP Terminal",
			cwd: params.cwd,
		})

		this.terminals.set(terminalId, {
			terminal,
			output: [],
			exitCode: undefined,
		})

		this.logger.info(`Created terminal ${terminalId}`, { name: params.name, cwd: params.cwd })
		return { terminalId }
	}

	async handleGetOutput(params: { terminalId: string }): Promise<{ output: string }> {
		const entry = this.terminals.get(params.terminalId)
		if (!entry) {
			throw new Error(`Terminal ${params.terminalId} not found`)
		}

		return { output: entry.output.join("\n") }
	}

	async handleWaitForExit(params: { terminalId: string }): Promise<{ exitCode: number }> {
		const entry = this.terminals.get(params.terminalId)
		if (!entry) {
			throw new Error(`Terminal ${params.terminalId} not found`)
		}

		return new Promise((resolve) => {
			const checkExit = () => {
				if (entry.exitCode !== undefined) {
					resolve({ exitCode: entry.exitCode })
				} else {
					setTimeout(checkExit, 100)
				}
			}
			checkExit()
		})
	}

	async handleKillTerminal(params: { terminalId: string }): Promise<void> {
		const entry = this.terminals.get(params.terminalId)
		if (!entry) {
			throw new Error(`Terminal ${params.terminalId} not found`)
		}

		entry.terminal.dispose()
		this.logger.info(`Killed terminal ${params.terminalId}`)
	}

	async handleDisposeTerminal(params: { terminalId: string }): Promise<void> {
		const entry = this.terminals.get(params.terminalId)
		if (!entry) {
			throw new Error(`Terminal ${params.terminalId} not found`)
		}

		entry.terminal.dispose()
		this.terminals.delete(params.terminalId)
		this.logger.info(`Disposed terminal ${params.terminalId}`)
	}

	dispose(): void {
		for (const entry of this.terminals.values()) {
			entry.terminal.dispose()
		}
		this.terminals.clear()
		this.disposables.forEach((d) => d.dispose())
	}
}
