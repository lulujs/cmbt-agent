// test-agent_change - new file
import { useState } from "react"
import { MessageSquare, AlignLeft } from "lucide-react"
import { Mode } from "@roo/modes"
import { cn } from "@/lib/utils"

type WorkflowType = "vibe" | "spec"

interface VibeModeProps {
	mode: Mode
	onModeChange: (mode: Mode) => void
	onWorkflowChange?: (isSpec: boolean) => void // test-agent_change: notify parent of workflow type
}

const VIBE_DEFAULT_MODE: Mode = "code"
const SPEC_DEFAULT_MODE: Mode = "architect"

export const VibeModeSelector = ({ mode, onModeChange, onWorkflowChange }: VibeModeProps) => {
	// Derive initial workflow from current mode
	const [workflow, setWorkflow] = useState<WorkflowType>(mode === SPEC_DEFAULT_MODE ? "spec" : "vibe")

	// When workflow changes, update the mode
	const handleWorkflowSelect = (selected: WorkflowType) => {
		if (selected === workflow) return
		setWorkflow(selected)
		const isSpec = selected === "spec"
		onModeChange(isSpec ? SPEC_DEFAULT_MODE : VIBE_DEFAULT_MODE)
		onWorkflowChange?.(isSpec)
	}

	const vibeSelected = workflow === "vibe"
	const specSelected = workflow === "spec"

	return (
		<div className="w-full max-w-[380px] mx-auto flex flex-col gap-3">
			<div className="flex gap-2">
				{/* Vibe card */}
				<button
					onClick={() => handleWorkflowSelect("vibe")}
					className={cn(
						"flex-1 flex flex-col gap-2 p-3 rounded-lg border text-left cursor-pointer transition-colors",
						vibeSelected
							? "border-[var(--vscode-focusBorder)] bg-[rgba(128,0,255,0.15)]"
							: "border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] hover:border-[var(--vscode-focusBorder)]",
					)}>
					<div className="flex items-center gap-2">
						<MessageSquare
							className={cn(
								"w-4 h-4",
								vibeSelected ? "text-[var(--vscode-focusBorder)]" : "text-vscode-foreground",
							)}
						/>
						<span
							className={cn(
								"font-semibold text-sm",
								vibeSelected ? "text-[var(--vscode-focusBorder)]" : "text-vscode-foreground",
							)}>
							Vibe
						</span>
					</div>
					<p className="text-xs text-vscode-descriptionForeground m-0 leading-relaxed">
						Chat first, then build. Explore ideas and iterate as you discover needs.
					</p>
				</button>

				{/* Spec card */}
				<button
					onClick={() => handleWorkflowSelect("spec")}
					className={cn(
						"flex-1 flex flex-col gap-2 p-3 rounded-lg border text-left cursor-pointer transition-colors",
						specSelected
							? "border-[var(--vscode-focusBorder)] bg-[rgba(128,0,255,0.15)]"
							: "border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] hover:border-[var(--vscode-focusBorder)]",
					)}>
					<div className="flex items-center gap-2">
						<AlignLeft
							className={cn(
								"w-4 h-4",
								specSelected ? "text-[var(--vscode-focusBorder)]" : "text-vscode-foreground",
							)}
						/>
						<span
							className={cn(
								"font-semibold text-sm",
								specSelected ? "text-[var(--vscode-focusBorder)]" : "text-vscode-foreground",
							)}>
							Spec
						</span>
					</div>
					<p className="text-xs text-vscode-descriptionForeground m-0 leading-relaxed">
						Plan first, then build. Create requirements and design before coding starts.
					</p>
				</button>
			</div>

			{/* Description bullets */}
			<div className="flex gap-2">
				<div className="w-0.5 bg-[var(--vscode-focusBorder)] rounded-full shrink-0" />
				<div className="text-xs text-vscode-descriptionForeground">
					<p className="m-0 mb-1 font-medium text-vscode-foreground">Great for:</p>
					{vibeSelected ? (
						<ul className="m-0 pl-4 space-y-0.5 list-disc">
							<li>Rapid exploration and testing</li>
							<li>Building when requirements are unclear</li>
							<li>Implementing a task</li>
						</ul>
					) : (
						<ul className="m-0 pl-4 space-y-0.5 list-disc">
							<li>Thinking through features in-depth</li>
							<li>Projects needing upfront planning</li>
							<li>Building features in a structured way</li>
						</ul>
					)}
				</div>
			</div>
		</div>
	)
}

export default VibeModeSelector
