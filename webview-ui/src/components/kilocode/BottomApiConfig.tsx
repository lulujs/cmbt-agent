import { ModelSelector } from "./chat/ModelSelector"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useSelectedModel } from "../ui/hooks/useSelectedModel"
// cmbt-agent_change start
import { AgentSelector } from "../acp/AgentSelector"
import { vscode } from "@src/utils/vscode"
// cmbt-agent_change end

export const BottomApiConfig = () => {
	// cmbt-agent_change start
	const {
		currentApiConfigName,
		apiConfiguration,
		virtualQuotaActiveModel,
		acpAgents,
		activeAcpAgentId,
		activeAcpAgentStatus,
	} = useExtensionState()
	// cmbt-agent_change end
	const { id: selectedModelId, provider: selectedProvider } = useSelectedModel(apiConfiguration)

	if (!apiConfiguration) {
		return null
	}

	// cmbt-agent_change start
	const handleSelectAgent = (agentId: string) => {
		vscode.postMessage({ type: "selectAcpAgent", agentId })
	}
	// cmbt-agent_change end

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
			{/* cmbt-agent_change start */}
			<div className="w-auto acp-agent">
				<AgentSelector
					agents={acpAgents || []}
					activeAgentId={activeAcpAgentId}
					activeAgentStatus={activeAcpAgentStatus}
					onSelectAgent={handleSelectAgent}
				/>
			</div>
			{/* cmbt-agent_change end */}
		</>
	)
}
