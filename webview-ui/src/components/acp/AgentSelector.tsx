// cmbt-agent_change - new file
import { cn } from "@src/lib/utils"

export type AcpAgentStatus = "starting" | "running" | "stopped" | "error"

export interface AcpAgentInfo {
	id: string
	name: string
}

export interface AgentSelectorProps {
	agents: AcpAgentInfo[]
	activeAgentId?: string
	activeAgentStatus?: AcpAgentStatus
	onSelectAgent: (agentId: string) => void
	onDisconnectAgent: (agentId: string) => void
}

const statusColors: Record<AcpAgentStatus, string> = {
	starting: "bg-yellow-400",
	running: "bg-green-400",
	stopped: "bg-gray-400",
	error: "bg-red-400",
}

const statusLabels: Record<AcpAgentStatus, string> = {
	starting: "Starting",
	running: "Running",
	stopped: "Stopped",
	error: "Error",
}

export const AgentSelector = ({
	agents,
	activeAgentId,
	activeAgentStatus,
	onSelectAgent,
	onDisconnectAgent,
}: AgentSelectorProps) => {
	if (agents.length === 0) {
		return <span className="text-xs text-vscode-descriptionForeground opacity-70">No agents configured</span>
	}

	return (
		<div className="flex flex-col gap-1">
			{agents.map((agent) => {
				const isActive = agent.id === activeAgentId
				const isConnected = isActive && (activeAgentStatus === "running" || activeAgentStatus === "starting")

				const handleClick = () => {
					if (isConnected) {
						onDisconnectAgent(agent.id)
					} else {
						onSelectAgent(agent.id)
					}
				}

				return (
					<button
						key={agent.id}
						onClick={handleClick}
						title={isConnected ? `Disconnect ${agent.name}` : `Connect ${agent.name}`}
						className={cn(
							"flex items-center gap-2 px-2 py-1 rounded text-xs text-left",
							"hover:bg-vscode-list-hoverBackground",
							isActive && "bg-vscode-list-activeSelectionBackground",
						)}>
						{isActive && activeAgentStatus && (
							<span
								className={cn("w-2 h-2 rounded-full", statusColors[activeAgentStatus])}
								title={statusLabels[activeAgentStatus]}
							/>
						)}
						<span className="truncate">{agent.name}</span>
					</button>
				)
			})}
		</div>
	)
}
