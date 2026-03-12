// cmbt-agent_change start
import { ModelSelector } from "./chat/ModelSelector"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useSelectedModel } from "../ui/hooks/useSelectedModel"
import AgentSelector from "../acp/AgentSelector"
import { useState, useEffect } from "react"
// cmbt-agent_change end

export const BottomApiConfig = () => {
	const { currentApiConfigName, apiConfiguration, virtualQuotaActiveModel } = useExtensionState() // kilocode_change: Get virtual quota active model for UI display
	const { id: selectedModelId, provider: selectedProvider } = useSelectedModel(apiConfiguration)

	// cmbt-agent_change start - ACP Agent state management
	const [acpAgents, setAcpAgents] = useState<any[]>([])
	// const [showAcpSelector, setShowAcpSelector] = useState(false)

	// Mock ACP agents data - in real implementation, this would come from the extension
	useEffect(() => {
		// This would be replaced with actual communication to the extension
		const mockAgents = [
			{
				id: "github-copilot-1",
				name: "GitHub Copilot",
				type: "github_copilot",
				status: "connected" as const,
				isSelected: true,
				capabilities: ["tools", "streaming"],
			},
			{
				id: "claude-code-1",
				name: "Claude Code",
				type: "claude_code",
				status: "disconnected" as const,
				isSelected: false,
				capabilities: ["images", "tools", "computer_use"],
			},
		]
		setAcpAgents(mockAgents)
	}, [])

	const handleAgentSelect = (agentId: string) => {
		// This would send a message to the extension to select the agent
		console.log("Selecting ACP agent:", agentId)
	}

	const handleAgentConnect = (agentId: string) => {
		// This would send a message to the extension to connect the agent
		console.log("Connecting ACP agent:", agentId)
	}

	const handleAgentDisconnect = (agentId: string) => {
		// This would send a message to the extension to disconnect the agent
		console.log("Disconnecting ACP agent:", agentId)
	}

	const handleRefresh = () => {
		// This would refresh the agent list from the extension
		console.log("Refreshing ACP agents")
	}
	// cmbt-agent_change end

	if (!apiConfiguration) {
		return null
	}

	return (
		<>
			{/* kilocode_change - add data-testid="model-selector" below */}
			<div className="w-auto overflow-hidden" data-testid="model-selector">
				<ModelSelector
					currentApiConfigName={currentApiConfigName}
					apiConfiguration={apiConfiguration}
					fallbackText={`${selectedProvider}:${selectedModelId}`}
					//kilocode_change: Pass virtual quota active model to ModelSelector
					virtualQuotaActiveModel={
						virtualQuotaActiveModel
							? {
									id: virtualQuotaActiveModel.id,
									name: virtualQuotaActiveModel.id,
									activeProfileNumber: virtualQuotaActiveModel.activeProfileNumber,
								}
							: undefined
					}
				/>
			</div>
			<div className="w-auto acp-agent">
				{/* cmbt-agent_change start - ACP Agent Selector integration */}
				{acpAgents.length > 0 && (
					<AgentSelector
						agents={acpAgents}
						onAgentSelect={handleAgentSelect}
						onAgentConnect={handleAgentConnect}
						onAgentDisconnect={handleAgentDisconnect}
						onRefresh={handleRefresh}
						className="ml-2"
					/>
				)}
				{/* cmbt-agent_change end */}
			</div>
		</>
	)
}
