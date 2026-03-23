// test-agent_change - new file
import { useState, useCallback, useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import type { FollowUpData, SuggestionItem } from "@roo-code/types"
import { Markdown } from "./Markdown"
import { cn } from "@/lib/utils"

interface QuestionCarouselProps {
	data: FollowUpData
	onSuggestionClick?: (suggestion: SuggestionItem, event?: React.MouseEvent) => void
	onFollowUpUnmount?: () => void
	isAnswered?: boolean
	isFollowUpAutoApprovalPaused?: boolean
	ts: number
}

/**
 * Renders questions in paginated carousel mode (currentIndex === -1).
 * Each question defaults to its first suggestion. User can navigate between pages,
 * modify selections, then submit all answers on the last page.
 *
 * Falls back to single-question display for legacy carousel messages
 * (currentIndex >= 0).
 */
export const QuestionCarousel = ({ data, onSuggestionClick, isAnswered }: QuestionCarouselProps) => {
	const { t } = useAppTranslation()
	const questions = useMemo(() => data.questions ?? [], [data.questions])
	const total = questions.length
	const isAllAtOnce = data.currentIndex === -1

	// Current page index for navigation
	const [viewIndex, setViewIndex] = useState(0)

	// Initialize each question's answer to the first suggestion (if any)
	const [selectedAnswers, setSelectedAnswers] = useState<string[]>(() =>
		questions.map((q) => q.suggest?.[0]?.answer ?? ""),
	)
	const [customInputs, setCustomInputs] = useState<string[]>(() => questions.map(() => ""))
	// Track which questions are using custom input
	const [usingCustom, setUsingCustom] = useState<boolean[]>(() => questions.map(() => false))

	const handleSelectOption = useCallback((qIndex: number, answer: string) => {
		setSelectedAnswers((prev) => {
			const next = [...prev]
			next[qIndex] = answer
			return next
		})
		setUsingCustom((prev) => {
			const next = [...prev]
			next[qIndex] = false
			return next
		})
	}, [])

	const handleCustomInput = useCallback((qIndex: number, value: string) => {
		setCustomInputs((prev) => {
			const next = [...prev]
			next[qIndex] = value
			return next
		})
		setSelectedAnswers((prev) => {
			const next = [...prev]
			next[qIndex] = value
			return next
		})
		setUsingCustom((prev) => {
			const next = [...prev]
			next[qIndex] = true
			return next
		})
	}, [])

	const handlePrev = useCallback(() => {
		setViewIndex((i) => Math.max(0, i - 1))
	}, [])

	const handleNext = useCallback(() => {
		setViewIndex((i) => Math.min(total - 1, i + 1))
	}, [total])

	const handleSubmit = useCallback(() => {
		if (!onSuggestionClick) return
		// Collect final answers: custom input takes priority if non-empty, else selected
		const finalAnswers = questions.map((_, i) => {
			if (usingCustom[i] && customInputs[i].trim()) return customInputs[i].trim()
			return selectedAnswers[i] ?? ""
		})
		// Send as JSON array so the backend can parse all answers at once
		const syntheticSuggestion: SuggestionItem = {
			answer: JSON.stringify(finalAnswers),
		}
		onSuggestionClick(syntheticSuggestion)
	}, [onSuggestionClick, questions, selectedAnswers, customInputs, usingCustom])

	if (!total) return null

	// Legacy single-step carousel (currentIndex >= 0): show only the active question
	if (!isAllAtOnce) {
		const activeIndex = data.currentIndex ?? 0
		const current = questions[activeIndex]
		if (!current) return null
		const suggest: SuggestionItem[] = (current.suggest ?? []).map((s) => ({ answer: s.answer, mode: s.mode }))
		const previousAnswer = data.answers?.[activeIndex]

		return (
			<div className="flex flex-col gap-2">
				<Markdown markdown={current.question} />
				{previousAnswer && (
					<div className="text-xs text-vscode-descriptionForeground italic px-3 py-1 rounded border border-vscode-input-border bg-vscode-input-background">
						{previousAnswer}
					</div>
				)}
				{!isAnswered && suggest.length > 0 && (
					<div className="flex flex-col gap-2">
						{suggest.map((s) => (
							<Button
								key={s.answer}
								variant="outline"
								className="text-left whitespace-normal break-words w-full h-auto px-3 py-2 justify-start rounded-xl"
								onClick={() => onSuggestionClick?.(s)}>
								{s.answer}
							</Button>
						))}
					</div>
				)}
				{total > 1 && (
					<span className="text-xs text-vscode-descriptionForeground tabular-nums">
						{activeIndex + 1}/{total}
					</span>
				)}
			</div>
		)
	}

	// All-at-once mode with pagination: show one question per page
	const currentQuestion = questions[viewIndex]
	if (!currentQuestion) return null

	const suggest: SuggestionItem[] = (currentQuestion.suggest ?? []).map((s) => ({
		answer: s.answer,
		mode: s.mode,
	}))
	const currentAnswer = selectedAnswers[viewIndex]
	const isLastPage = viewIndex === total - 1

	return (
		<div className="flex flex-col gap-2">
			<Markdown markdown={currentQuestion.question} />

			{suggest.length > 0 && (
				<div className="flex flex-col gap-1">
					{suggest.map((s, sIndex) => {
						const isSelected = !usingCustom[viewIndex] && currentAnswer === s.answer
						return (
							<button
								key={`${s.answer}-${sIndex}`}
								disabled={isAnswered}
								onClick={() => handleSelectOption(viewIndex, s.answer)}
								className={cn(
									"flex items-center gap-3 text-left w-full px-3 py-2 rounded-xl border transition-colors",
									"text-sm text-vscode-foreground",
									isSelected
										? "border-vscode-focusBorder bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
										: "border-vscode-input-border bg-vscode-input-background hover:border-vscode-focusBorder",
									isAnswered && "opacity-60 cursor-not-allowed",
								)}>
								<span
									className={cn(
										"flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center",
										isSelected ? "border-vscode-focusBorder" : "border-vscode-input-border",
									)}>
									{isSelected && <span className="w-2.5 h-2.5 rounded-full bg-vscode-focusBorder" />}
								</span>
								<span className="flex-1">{s.answer}</span>
							</button>
						)
					})}

					{/* Custom input option */}
					{!isAnswered && (
						<div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-vscode-input-border bg-vscode-input-background">
							<span
								className={cn(
									"flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center",
									usingCustom[viewIndex] ? "border-vscode-focusBorder" : "border-vscode-input-border",
								)}>
								{usingCustom[viewIndex] && (
									<span className="w-2.5 h-2.5 rounded-full bg-vscode-focusBorder" />
								)}
							</span>
							<input
								type="text"
								value={customInputs[viewIndex]}
								onChange={(e) => handleCustomInput(viewIndex, e.target.value)}
								onFocus={() => {
									if (customInputs[viewIndex] === "") {
										setUsingCustom((prev) => {
											const next = [...prev]
											next[viewIndex] = true
											return next
										})
									}
								}}
								placeholder={t("chat:carousel.customPlaceholder")}
								className="flex-1 bg-transparent outline-none text-sm text-vscode-foreground placeholder:text-vscode-descriptionForeground"
							/>
						</div>
					)}
				</div>
			)}

			{/* No suggestions: plain text input */}
			{suggest.length === 0 && !isAnswered && (
				<input
					type="text"
					value={customInputs[viewIndex]}
					onChange={(e) => handleCustomInput(viewIndex, e.target.value)}
					placeholder={t("chat:carousel.customPlaceholder")}
					className="w-full px-3 py-2 rounded-xl border border-vscode-input-border bg-vscode-input-background text-sm text-vscode-foreground placeholder:text-vscode-descriptionForeground outline-none"
				/>
			)}

			{/* Navigation and Submit */}
			{!isAnswered && total > 1 && (
				<div className="flex items-center justify-between mt-1">
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6"
							onClick={handlePrev}
							disabled={viewIndex === 0}
							aria-label={t("chat:carousel.prev")}>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6"
							onClick={handleNext}
							disabled={viewIndex === total - 1}
							aria-label={t("chat:carousel.next")}>
							<ChevronRight className="h-4 w-4" />
						</Button>
						<span className="text-xs text-vscode-descriptionForeground tabular-nums ml-1">
							{viewIndex + 1}/{total}
						</span>
					</div>

					{/* Submit button only on last page */}
					{isLastPage && (
						<Button variant="primary" size="sm" onClick={handleSubmit} disabled={!onSuggestionClick}>
							{t("chat:carousel.submit")}
						</Button>
					)}
				</div>
			)}

			{/* Single question: show submit immediately */}
			{!isAnswered && total === 1 && (
				<div className="flex justify-end mt-1">
					<Button variant="primary" size="sm" onClick={handleSubmit} disabled={!onSuggestionClick}>
						{t("chat:carousel.submit")}
					</Button>
				</div>
			)}
		</div>
	)
}
