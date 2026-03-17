// test-agent_change - new file
import { useMemo } from "react"
import { SelectDropdown, DropdownOptionType } from "@/components/ui"
import { getBasename } from "@/utils/kilocode/path-webview"
import { ClineRulesToggles } from "@roo/cline-rules"
import { cn } from "@/lib/utils"

interface WorkflowSelectorProps {
	localWorkflows: ClineRulesToggles
	globalWorkflows: ClineRulesToggles
	value: string
	onChange: (value: string) => void
}

const NO_WORKFLOW = "__none__"

export const WorkflowSelector = ({ localWorkflows, globalWorkflows, value, onChange }: WorkflowSelectorProps) => {
	const options = useMemo(() => {
		const enabledLocal = Object.entries(localWorkflows)
			.filter(([, enabled]) => enabled)
			.map(([path]) => ({ value: getBasename(path), label: getBasename(path), type: DropdownOptionType.ITEM }))

		const enabledGlobal = Object.entries(globalWorkflows)
			.filter(([, enabled]) => enabled)
			.map(([path]) => ({ value: getBasename(path), label: getBasename(path), type: DropdownOptionType.ITEM }))

		const allWorkflows = [...enabledLocal, ...enabledGlobal]

		if (allWorkflows.length === 0) return []

		return [
			{ value: NO_WORKFLOW, label: "Workflow", disabled: false, type: DropdownOptionType.ITEM },
			{ value: "sep", label: "", type: DropdownOptionType.SEPARATOR },
			...allWorkflows,
		]
	}, [localWorkflows, globalWorkflows])

	if (options.length === 0) return null

	return (
		<SelectDropdown
			value={value || NO_WORKFLOW}
			title="Select workflow"
			options={options}
			onChange={(v) => onChange(v === NO_WORKFLOW ? "" : v)}
			triggerClassName={cn(
				"bg-[var(--background)] border-[var(--vscode-input-border)] hover:bg-[var(--color-vscode-list-hoverBackground)]",
			)}
		/>
	)
}

export default WorkflowSelector
