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
		isAcpMode,
		acpSessionModels, // cmbt-agent_change
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

	const handleDisconnectAgent = (agentId: string) => {
		vscode.postMessage({ type: "disconnectAcpAgent", agentId })
	}
	// cmbt-agent_change end
	// cmbt-agent_change start: ACP model change handler
	const handleAcpModelChange = (modelId: string) => {
		vscode.postMessage({ type: "setAcpModel", modelId })
	}
	// cmbt-agent_change end

	return (
		<>
			{/* kilocode_change - add data-testid="model-selector" below */}
			{/* cmbt-agent_change start: hide ModelSelector in ACP mode, show ACP model selector instead */}
			{isAcpMode && acpSessionModels && acpSessionModels.availableModels.length > 0 ? (
				<div className="w-auto overflow-hidden" data-testid="acp-model-selector">
					<select
						value={acpSessionModels.currentModelId}
						onChange={(e) => handleAcpModelChange(e.target.value)}
						className="bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-vscode-dropdown-border rounded px-2 py-1 text-xs cursor-pointer truncate"
						style={{ maxWidth: "120px", width: "120px" }}>
						{acpSessionModels.availableModels.map((model) => (
							<option key={model.id} value={model.id}>
								{model.name ?? model.id}
							</option>
						))}
					</select>
				</div>
			) : !isAcpMode ? (
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
			) : null}
			{/* cmbt-agent_change end */}
			{/* cmbt-agent_change start */}
			<div className="w-auto acp-agent">
				<AgentSelector
					agents={acpAgents || []}
					activeAgentId={activeAcpAgentId}
					activeAgentStatus={activeAcpAgentStatus}
					onSelectAgent={handleSelectAgent}
					onDisconnectAgent={handleDisconnectAgent}
				/>
			</div>
			{/* cmbt-agent_change end */}
		</>
	)
}
