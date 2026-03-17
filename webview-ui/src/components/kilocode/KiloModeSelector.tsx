import React from "react"
import { Mode, defaultModeSlug, getAllModes } from "@roo/modes"
import { ModeConfig } from "@roo-code/types"
import { SelectDropdown, DropdownOptionType } from "@/components/ui"
import type { DropdownOption } from "@/components/ui/select-dropdown" // kilocode_change
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"

interface KiloModeSelectorProps {
	value: Mode
	onChange: (value: Mode) => void
	modeShortcutText: string
	customModes?: ModeConfig[]
	disabled?: boolean
	title?: string
	triggerClassName?: string
	initiallyOpen?: boolean
	allowedModes?: Mode[] // test-agent_change: restrict available modes
}

export const KiloModeSelector = ({
	value,
	onChange,
	modeShortcutText,
	customModes,
	disabled = false,
	title,
	triggerClassName,
	initiallyOpen,
	allowedModes, // test-agent_change
}: KiloModeSelectorProps) => {
	const { t } = useAppTranslation()
	const allModes = React.useMemo(() => getAllModes(customModes), [customModes])

	// test-agent_change start: filter modes if allowedModes is provided
	const filteredModes = React.useMemo(() => {
		if (!allowedModes || allowedModes.length === 0) return allModes
		return allModes.filter((mode) => allowedModes.includes(mode.slug as Mode))
	}, [allModes, allowedModes])
	// test-agent_change end

	// test-agent_change: use filteredModes instead of allModes
	// Group modes by source
	const { organizationModes, otherModes } = React.useMemo(() => {
		const orgModes = filteredModes.filter((mode) => mode.source === "organization")
		const other = filteredModes.filter((mode) => mode.source !== "organization")
		return { organizationModes: orgModes, otherModes: other }
	}, [filteredModes])

	const handleChange = React.useCallback(
		(selectedValue: string) => {
			const newMode = selectedValue as Mode
			onChange(newMode)
			vscode.postMessage({ type: "mode", text: selectedValue })
		},
		[onChange],
	)

	// Build options with organization modes grouped separately
	const options = React.useMemo(() => {
		const opts: DropdownOption[] = [
			{
				value: "shortcut",
				label: modeShortcutText,
				disabled: true,
				type: DropdownOptionType.SHORTCUT,
			},
		]

		// Add organization modes section if any exist
		if (organizationModes.length > 0) {
			// Add header as a disabled item
			opts.push({
				value: "org-header",
				label: t("chat:modeSelector.organizationModes"),
				disabled: true,
				type: DropdownOptionType.SHORTCUT,
			})
			opts.push(
				...organizationModes.map((mode) => ({
					value: mode.slug,
					label: mode.name,
					codicon: mode.iconName || "codicon-organization",
					description: mode.description,
					type: DropdownOptionType.ITEM,
				})),
			)
			opts.push({
				value: "sep-org",
				label: t("chat:separator"),
				type: DropdownOptionType.SEPARATOR,
			})
		}

		// Add other modes
		opts.push(
			...otherModes.map((mode) => ({
				value: mode.slug,
				label: mode.name,
				codicon: mode.iconName,
				description: mode.description,
				type: DropdownOptionType.ITEM,
			})),
		)

		opts.push(
			{
				value: "sep-1",
				label: t("chat:separator"),
				type: DropdownOptionType.SEPARATOR,
			},
			{
				value: "promptsButtonClicked",
				label: t("chat:edit"),
				type: DropdownOptionType.ACTION,
			},
		)

		return opts
	}, [organizationModes, otherModes, modeShortcutText, t])

	// test-agent_change start: disable mode selector if only one mode is allowed
	const isModeSelectorDisabled = disabled || (allowedModes && allowedModes.length === 1)
	// test-agent_change end

	return (
		<SelectDropdown
			value={filteredModes.find((m) => m.slug === value)?.slug ?? defaultModeSlug}
			title={title || t("chat:selectMode")}
			disabled={isModeSelectorDisabled} // test-agent_change
			initiallyOpen={initiallyOpen}
			options={options}
			onChange={handleChange}
			shortcutText={modeShortcutText}
			triggerClassName={cn(
				"w-full bg-[var(--background)] border-[var(--vscode-input-border)] hover:bg-[var(--color-vscode-list-hoverBackground)]",
				triggerClassName,
			)}
		/>
	)
}

export default KiloModeSelector
