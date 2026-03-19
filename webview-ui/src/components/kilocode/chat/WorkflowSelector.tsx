// test-agent_change - new file
import { useEffect, useMemo } from "react"
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

const NO_WORKFLOW_PLACEHOLDER = "__no_workflow__"

export const WorkflowSelector = ({ localWorkflows, globalWorkflows, value, onChange }: WorkflowSelectorProps) => {
	const options = useMemo(() => {
		const enabledLocal = Object.entries(localWorkflows)
			.filter(([, enabled]) => enabled)
			.map(([path]) => ({ value: getBasename(path), label: getBasename(path), type: DropdownOptionType.ITEM }))

		const enabledGlobal = Object.entries(globalWorkflows)
			.filter(([, enabled]) => enabled)
			.map(([path]) => ({ value: getBasename(path), label: getBasename(path), type: DropdownOptionType.ITEM }))

		const workflows = [...enabledLocal, ...enabledGlobal]

		// If no workflows, show placeholder
		if (workflows.length === 0) {
			return [
				{
					value: NO_WORKFLOW_PLACEHOLDER,
					label: "无可用工作流",
					type: DropdownOptionType.ITEM,
				},
			]
		}

		return workflows
	}, [localWorkflows, globalWorkflows])

	// Auto-select the first workflow when options load and nothing is selected
	useEffect(() => {
		if (options.length > 0 && !value && options[0].value !== NO_WORKFLOW_PLACEHOLDER) {
			onChange(options[0].value)
		}
	}, [options, value, onChange])

	const hasWorkflows = options.length > 0 && options[0].value !== NO_WORKFLOW_PLACEHOLDER

	return (
		<SelectDropdown
			value={hasWorkflows ? value || options[0]?.value || "" : NO_WORKFLOW_PLACEHOLDER}
			title={hasWorkflows ? "选择工作流" : "请先添加工作流"}
			options={options}
			onChange={onChange}
			disabled={!hasWorkflows}
			triggerClassName={cn(
				"bg-[var(--background)] border-[var(--vscode-input-border)] hover:bg-[var(--color-vscode-list-hoverBackground)]",
			)}
		/>
	)
}

export default WorkflowSelector
