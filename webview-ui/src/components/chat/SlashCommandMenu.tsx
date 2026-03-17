import React, { useCallback, useRef, useEffect, useMemo } from "react"
import { getAllModes } from "@roo/modes" // test-agent_change
import { SlashCommand, getMatchingSlashCommands } from "@/utils/slash-commands"
import { useExtensionState } from "@/context/ExtensionStateContext" // kilocode_change

interface SlashCommandMenuProps {
	onSelect: (command: SlashCommand) => void
	selectedIndex: number
	setSelectedIndex: (index: number) => void
	onMouseDown: () => void
	query: string
	customModes?: any[]
	excludeModeCommands?: boolean // test-agent_change: hide mode-switching commands in spec mode
}

const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
	onSelect,
	selectedIndex,
	setSelectedIndex,
	onMouseDown,
	query,
	customModes,
	excludeModeCommands = false, // test-agent_change
}) => {
	const { localWorkflows, globalWorkflows } = useExtensionState() // kilocode_change
	const menuRef = useRef<HTMLDivElement>(null)

	const handleClick = useCallback(
		(command: SlashCommand) => {
			onSelect(command)
		},
		[onSelect],
	)

	// Auto-scroll logic remains the same...
	useEffect(() => {
		if (menuRef.current) {
			const selectedElement = menuRef.current.children[selectedIndex] as HTMLElement
			if (selectedElement) {
				const menuRect = menuRef.current.getBoundingClientRect()
				const selectedRect = selectedElement.getBoundingClientRect()

				if (selectedRect.bottom > menuRect.bottom) {
					menuRef.current.scrollTop += selectedRect.bottom - menuRect.bottom
				} else if (selectedRect.top < menuRect.top) {
					menuRef.current.scrollTop -= menuRect.top - selectedRect.top
				}
			}
		}
	}, [selectedIndex])

	// Filter commands based on query
	// test-agent_change start: exclude mode-switching commands in spec mode
	const allModeSlugSet = useMemo(() => {
		if (!excludeModeCommands) return null
		return new Set(getAllModes(customModes).map((m) => m.slug))
	}, [excludeModeCommands, customModes])

	const filteredCommands = useMemo(() => {
		const cmds = getMatchingSlashCommands(query, customModes, localWorkflows, globalWorkflows)
		if (!excludeModeCommands || !allModeSlugSet) return cmds
		return cmds.filter((cmd) => !allModeSlugSet.has(cmd.name))
	}, [query, customModes, localWorkflows, globalWorkflows, excludeModeCommands, allModeSlugSet])
	// test-agent_change end

	return (
		<div
			className="absolute bottom-[calc(100%-10px)] left-[15px] right-[15px] overflow-x-hidden z-[1000]"
			onMouseDown={onMouseDown}>
			<div
				ref={menuRef}
				className="bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-editorGroup-border)] rounded-[3px] shadow-[0_4px_10px_rgba(0,0,0,0.25)] flex flex-col max-h-[200px] overflow-y-auto" // Corrected rounded and shadow
			>
				{filteredCommands.length > 0 ? (
					filteredCommands.map((command, index) => (
						<div
							key={command.name}
							className={`py-2 px-3 cursor-pointer flex flex-col border-b border-[var(--vscode-editorGroup-border)] ${
								// Corrected padding
								index === selectedIndex
									? "bg-[var(--vscode-quickInputList-focusBackground)] text-[var(--vscode-quickInputList-focusForeground)]"
									: "" // Removed bg-transparent
							} hover:bg-[var(--vscode-list-hoverBackground)]`}
							onClick={() => handleClick(command)}
							onMouseEnter={() => setSelectedIndex(index)}>
							<div className="font-bold whitespace-nowrap overflow-hidden text-ellipsis">
								/{command.name}
							</div>
							<div className="text-[0.85em] text-[var(--vscode-descriptionForeground)] whitespace-normal overflow-hidden text-ellipsis">
								{command.description}
							</div>
						</div>
					))
				) : (
					<div className="py-2 px-3 cursor-default flex flex-col">
						{" "}
						{/* Corrected padding, removed border, changed cursor */}
						<div className="text-[0.85em] text-[var(--vscode-descriptionForeground)]">
							No matching commands found
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default SlashCommandMenu
