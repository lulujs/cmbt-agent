// cmbt-agent_change - new file
/**
 * Agent Selector React Component
 * Implements agent list display with status indicators and selection functionality
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import React, { useState, useEffect, useCallback } from "react"
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { useACPTranslation } from "../../hooks/useACPTranslation"

export interface AgentInfo {
	id: string
	name: string
	type: string
	status: "connected" | "connecting" | "disconnected" | "error"
	isSelected: boolean
	capabilities: string[]
}

export interface AgentSelectorProps {
	agents: AgentInfo[]
	onAgentSelect: (agentId: string) => void
	onAgentConnect: (agentId: string) => void
	onAgentDisconnect: (agentId: string) => void
	onRefresh: () => void
	className?: string
}

const AgentSelector: React.FC<AgentSelectorProps> = ({
	agents,
	onAgentSelect,
	onAgentConnect,
	onAgentDisconnect,
	onRefresh,
	className = "",
}) => {
	const [selectedAgentId, setSelectedAgentId] = useState<string>("")
	const { t } = useACPTranslation()

	// Update selected agent when agents change
	useEffect(() => {
		const selectedAgent = agents.find((agent) => agent.isSelected)
		if (selectedAgent && selectedAgent.id !== selectedAgentId) {
			setSelectedAgentId(selectedAgent.id)
		}
	}, [agents, selectedAgentId])

	const handleAgentSelect = useCallback(
		(agentId: string) => {
			setSelectedAgentId(agentId)
			onAgentSelect(agentId)
		},
		[onAgentSelect],
	)

	const handleConnect = useCallback(
		(agentId: string) => {
			onAgentConnect(agentId)
		},
		[onAgentConnect],
	)

	const handleDisconnect = useCallback(
		(agentId: string) => {
			onAgentDisconnect(agentId)
		},
		[onAgentDisconnect],
	)

	const getStatusIcon = (status: AgentInfo["status"]): string => {
		switch (status) {
			case "connected":
				return "🟢"
			case "connecting":
				return "🟡"
			case "disconnected":
				return "⚪"
			case "error":
				return "🔴"
			default:
				return "⚪"
		}
	}

	const getStatusText = (status: AgentInfo["status"]): string => {
		return t(`status.${status}`, status)
	}

	const getCapabilityIcon = (capability: string): string => {
		switch (capability) {
			case "images":
				return "🖼️"
			case "tools":
				return "🔧"
			case "streaming":
				return "📡"
			case "computer_use":
				return "💻"
			default:
				return "⚙️"
		}
	}

	const getCapabilityText = (capability: string): string => {
		return t(`capabilities.${capability}`, capability)
	}

	if (agents.length === 0) {
		return (
			<div className={`acp-agent-selector ${className}`}>
				<div className="text-center py-4 text-vscode-descriptionForeground">
					<div className="mb-2">📭</div>
					<div className="text-sm">暂无可用的 ACP 智能体</div>
					<VSCodeButton appearance="secondary" className="mt-2" onClick={onRefresh}>
						刷新
					</VSCodeButton>
				</div>
			</div>
		)
	}

	return (
		<div className={`acp-agent-selector ${className}`}>
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-medium text-vscode-foreground">ACP 智能体选择器</h3>
				<VSCodeButton appearance="icon" aria-label="刷新智能体列表" onClick={onRefresh}>
					🔄
				</VSCodeButton>
			</div>

			{/* Agent Dropdown */}
			<div className="mb-3">
				<VSCodeDropdown
					value={selectedAgentId}
					onChange={(e) => {
						const target = e.target as HTMLSelectElement
						handleAgentSelect(target.value)
					}}
					className="w-full">
					<VSCodeOption value="">选择智能体...</VSCodeOption>
					{agents.map((agent) => (
						<VSCodeOption key={agent.id} value={agent.id}>
							{getStatusIcon(agent.status)} {agent.name} ({agent.type})
						</VSCodeOption>
					))}
				</VSCodeDropdown>
			</div>

			{/* Selected Agent Details */}
			{selectedAgentId && (
				<div className="border border-vscode-widget-border rounded p-3 bg-vscode-editor-background">
					{(() => {
						const selectedAgent = agents.find((a) => a.id === selectedAgentId)
						if (!selectedAgent) return null

						return (
							<>
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center space-x-2">
										<span className="text-lg">{getStatusIcon(selectedAgent.status)}</span>
										<div>
											<div className="font-medium text-vscode-foreground">
												{selectedAgent.name}
											</div>
											<div className="text-xs text-vscode-descriptionForeground">
												{selectedAgent.type} • {getStatusText(selectedAgent.status)}
											</div>
										</div>
									</div>
									<div className="flex space-x-1">
										{selectedAgent.status === "disconnected" && (
											<VSCodeButton
												appearance="secondary"
												onClick={() => handleConnect(selectedAgent.id)}>
												连接
											</VSCodeButton>
										)}
										{selectedAgent.status === "connected" && (
											<VSCodeButton
												appearance="secondary"
												onClick={() => handleDisconnect(selectedAgent.id)}>
												断开
											</VSCodeButton>
										)}
									</div>
								</div>

								{/* Capabilities */}
								{selectedAgent.capabilities.length > 0 && (
									<div className="mt-2">
										<div className="text-xs text-vscode-descriptionForeground mb-1">
											支持的功能:
										</div>
										<div className="flex flex-wrap gap-1">
											{selectedAgent.capabilities.map((capability) => (
												<span
													key={capability}
													className="inline-flex items-center space-x-1 px-2 py-1 bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground rounded text-xs"
													title={getCapabilityText(capability)}>
													<span>{getCapabilityIcon(capability)}</span>
													<span>{getCapabilityText(capability)}</span>
												</span>
											))}
										</div>
									</div>
								)}

								{/* Status Messages */}
								{selectedAgent.status === "connecting" && (
									<div className="mt-2 text-xs text-vscode-descriptionForeground">
										正在连接到智能体...
									</div>
								)}
								{selectedAgent.status === "error" && (
									<div className="mt-2 text-xs text-vscode-errorForeground">
										连接失败，请检查智能体配置
									</div>
								)}
							</>
						)
					})()}
				</div>
			)}

			{/* Agent List */}
			<div className="mt-3">
				<div className="text-xs text-vscode-descriptionForeground mb-2">所有智能体 ({agents.length})</div>
				<div className="space-y-1 max-h-32 overflow-y-auto">
					{agents.map((agent) => (
						<div
							key={agent.id}
							className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
								agent.isSelected
									? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
									: "hover:bg-vscode-list-hoverBackground"
							}`}
							onClick={() => handleAgentSelect(agent.id)}>
							<div className="flex items-center space-x-2 flex-1 min-w-0">
								<span>{getStatusIcon(agent.status)}</span>
								<div className="flex-1 min-w-0">
									<div className="text-xs font-medium truncate">{agent.name}</div>
									<div className="text-xs text-vscode-descriptionForeground truncate">
										{agent.type}
									</div>
								</div>
							</div>
							<div className="flex items-center space-x-1">
								{agent.capabilities.slice(0, 3).map((capability) => (
									<span key={capability} className="text-xs" title={getCapabilityText(capability)}>
										{getCapabilityIcon(capability)}
									</span>
								))}
								{agent.capabilities.length > 3 && (
									<span className="text-xs text-vscode-descriptionForeground">
										+{agent.capabilities.length - 3}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

export default AgentSelector
