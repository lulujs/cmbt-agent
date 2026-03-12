import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type DifyProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	simplifySettings?: boolean
}

export const Dify = ({ apiConfiguration, setApiConfigurationField }: DifyProps) => {
	const { t } = useAppTranslation()

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.difyBaseUrl || ""}
				onInput={handleInputChange("difyBaseUrl")}
				placeholder="http://testhub-ai-runtime-gateway.paasuat.cmbchina.cn/v1"
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.difyBaseUrl")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.difyBaseUrlNotice")}
			</div>

			<VSCodeTextField
				value={apiConfiguration?.difyApiKey || ""}
				type="password"
				onInput={handleInputChange("difyApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.difyApiKey")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			{!apiConfiguration?.difyApiKey && (
				<VSCodeButtonLink href="https://dify.ai/" appearance="secondary">
					{t("settings:providers.getDifyApiKey")}
				</VSCodeButtonLink>
			)}
		</>
	)
}
