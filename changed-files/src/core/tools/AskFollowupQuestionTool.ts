import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { parseXml } from "../../utils/xml"
import type { ToolUse } from "../../shared/tools"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface Suggestion {
	text: string
	mode?: string
}

interface AskFollowupQuestionParams {
	question: string
	follow_up: Suggestion[]
	// test-agent_change start
	questions?: Array<{ question: string; follow_up?: Suggestion[] }>
	// test-agent_change end
}

export class AskFollowupQuestionTool extends BaseTool<"ask_followup_question"> {
	readonly name = "ask_followup_question" as const

	parseLegacy(params: Partial<Record<string, string>>): AskFollowupQuestionParams {
		const question = params.question || ""
		const follow_up_xml = params.follow_up

		const suggestions: Suggestion[] = []

		if (follow_up_xml) {
			// Define the actual structure returned by the XML parser
			type ParsedSuggestion = string | { "#text": string; "@_mode"?: string }

			try {
				const parsedSuggest = parseXml(follow_up_xml, ["suggest"]) as {
					suggest: ParsedSuggestion[] | ParsedSuggestion
				}

				const rawSuggestions = Array.isArray(parsedSuggest?.suggest)
					? parsedSuggest.suggest
					: [parsedSuggest?.suggest].filter((sug): sug is ParsedSuggestion => sug !== undefined)

				// Transform parsed XML to our Suggest format
				for (const sug of rawSuggestions) {
					if (typeof sug === "string") {
						// Simple string suggestion (no mode attribute)
						suggestions.push({ text: sug })
					} else {
						// XML object with text content and optional mode attribute
						const suggestion: Suggestion = { text: sug["#text"] }
						if (sug["@_mode"]) {
							suggestion.mode = sug["@_mode"]
						}
						suggestions.push(suggestion)
					}
				}
			} catch (error) {
				throw new Error(
					`Failed to parse follow_up XML: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}

		// test-agent_change start: parse multi-question carousel
		if (params.questions) {
			try {
				type ParsedSuggest = string | { "#text": string; "@_mode"?: string }
				type ParsedItem = {
					question?: string
					follow_up?: { suggest?: ParsedSuggest | ParsedSuggest[] }
				}
				// Don't use stopNodes here — we need nested parsing of <question> and <follow_up>
				const parsed = parseXml(`<root>${params.questions}</root>`) as {
					root?: { item?: ParsedItem | ParsedItem[] }
				}
				const rawItems = parsed?.root?.item
					? Array.isArray(parsed.root.item)
						? parsed.root.item
						: [parsed.root.item]
					: []

				const questions = rawItems.map((item) => {
					const q = item?.question ?? ""
					const itemSuggestions: Suggestion[] = []

					const suggestRaw = item?.follow_up?.suggest
					if (suggestRaw !== undefined) {
						const rawSugs: ParsedSuggest[] = Array.isArray(suggestRaw) ? suggestRaw : [suggestRaw]
						for (const sug of rawSugs) {
							if (typeof sug === "string") {
								itemSuggestions.push({ text: sug })
							} else {
								const s: Suggestion = { text: sug["#text"] }
								if (sug["@_mode"]) s.mode = sug["@_mode"]
								itemSuggestions.push(s)
							}
						}
					}

					return { question: q, follow_up: itemSuggestions }
				})

				return { question: "", follow_up: [], questions }
			} catch (error) {
				throw new Error(
					`Failed to parse questions XML: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
		// test-agent_change end

		return {
			question,
			follow_up: suggestions,
		}
	}

	async execute(params: AskFollowupQuestionParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { question, follow_up } = params
		const { handleError, pushToolResult } = callbacks

		try {
			// kilocode_change start
			// Check if yolo mode is enabled - if so, don't ask questions
			const state = await task.providerRef.deref()?.getState()
			if (state?.yoloMode) {
				pushToolResult(
					formatResponse.toolResult(
						"<error>This tool is not available in yolo mode. Do not ask questions - make your best judgment and proceed with the task.</error>",
					),
				)
				return
			}
			// kilocode_change end

			// test-agent_change start: multi-question carousel support
			// Both XML (parseLegacy) and native protocol (nativeArgs assigned to params) populate params.questions
			if (params.questions && params.questions.length > 0) {
				await this.executeMultiQuestion(params.questions, task, callbacks)
				return
			}
			// test-agent_change end

			if (!question) {
				task.consecutiveMistakeCount++
				task.recordToolError("ask_followup_question")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("ask_followup_question", "question"))
				return
			}

			// Transform follow_up suggestions to the format expected by task.ask
			const follow_up_json = {
				question,
				suggest: follow_up.map((s) => ({ answer: s.text, mode: s.mode })),
			}

			task.consecutiveMistakeCount = 0
			const { text, images } = await task.ask("followup", JSON.stringify(follow_up_json), false)
			await task.say("user_feedback", text ?? "", images)
			pushToolResult(formatResponse.toolResult(`<answer>\n${text}\n</answer>`, images))
		} catch (error) {
			await handleError("asking question", error as Error)
		}
	}

	// test-agent_change start
	private async executeMultiQuestion(
		questions: Array<{ question: string; follow_up?: Suggestion[] }>,
		task: Task,
		callbacks: ToolCallbacks,
	): Promise<void> {
		const { handleError, pushToolResult } = callbacks

		try {
			task.consecutiveMistakeCount = 0

			// Send all questions at once (currentIndex: -1 signals "all-at-once" mode)
			const carouselData = {
				questions: questions.map((item) => ({
					question: item.question,
					suggest: (item.follow_up ?? []).map((s) => ({ answer: s.text, mode: s.mode })),
				})),
				currentIndex: -1,
			}

			const { text, images } = await task.ask("followup", JSON.stringify(carouselData), false)

			// Parse the JSON array of answers returned by the frontend
			let answers: string[]
			try {
				const parsed = JSON.parse(text ?? "[]")
				answers = Array.isArray(parsed) ? parsed.map(String) : [text ?? ""]
			} catch {
				answers = [text ?? ""]
			}

			if (images && images.length > 0) {
				await task.say("user_feedback", text ?? "", images)
			}

			// Return all answers to the AI
			const answersXml = answers.map((answer, i) => `<answer index="${i + 1}">\n${answer}\n</answer>`).join("\n")
			pushToolResult(formatResponse.toolResult(`<answers>\n${answersXml}\n</answers>`))
		} catch (error) {
			await handleError("asking questions", error as Error)
		}
	}
	// test-agent_change end

	override async handlePartial(task: Task, block: ToolUse<"ask_followup_question">): Promise<void> {
		// kilocode_change start
		// Don't show the question in yolo mode - the tool will be rejected in execute()
		const state = await task.providerRef.deref()?.getState()
		if (state?.yoloMode) {
			return
		}
		// kilocode_change end

		// Get question from params (for XML protocol) or nativeArgs (for native protocol)
		const question: string | undefined = block.params.question ?? block.nativeArgs?.question

		// During partial streaming, only show the question to avoid displaying raw JSON
		// The full JSON with suggestions will be sent when the tool call is complete (!block.partial)
		await task
			.ask("followup", this.removeClosingTag("question", question, block.partial), block.partial)
			.catch(() => {})
	}
}

export const askFollowupQuestionTool = new AskFollowupQuestionTool()
