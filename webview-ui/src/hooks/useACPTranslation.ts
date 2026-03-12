// cmbt-agent_change - new file
/**
 * ACP Translation Hook
 * Provides Chinese internationalization support for ACP components
 * Requirements: 3.5, 12.1
 */

import { useMemo } from "react"

// Import translation files
import zhCN from "../locales/zh-CN/acp.json"
import zhTW from "../locales/zh-TW/acp.json"

type Locale = "zh-CN" | "zh-TW" | "en"
// type TranslationKey = keyof typeof zhCN

const translations = {
	"zh-CN": zhCN,
	"zh-TW": zhTW,
	en: zhCN, // Fallback to simplified Chinese for now
}

export const useACPTranslation = (locale: Locale = "zh-CN") => {
	const t = useMemo(() => {
		const translation = translations[locale] || translations["zh-CN"]

		return (key: string, fallback?: string): string => {
			const keys = key.split(".")
			let value: any = translation

			for (const k of keys) {
				value = value?.[k]
				if (value === undefined) break
			}

			return value || fallback || key
		}
	}, [locale])

	return { t }
}
