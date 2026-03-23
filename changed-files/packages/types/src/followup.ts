import { z } from "zod"

/**
 * Interface for follow-up data structure used in follow-up questions
 * This represents the data structure for follow-up questions that the LLM can ask
 * to gather more information needed to complete a task.
 */
export interface FollowUpData {
	/** The question being asked by the LLM */
	question?: string
	/** Array of suggested answers that the user can select */
	suggest?: Array<SuggestionItem>
	// test-agent_change start
	/** Multiple questions carousel mode */
	questions?: Array<FollowUpQuestion>
	/** Current question index (0-based) when in carousel mode; -1 means all-at-once mode */
	currentIndex?: number
	/** Answers collected so far in carousel mode */
	answers?: Record<number, string>
	// test-agent_change end
}

/**
 * Interface for a suggestion item with optional mode switching
 */
export interface SuggestionItem {
	/** The text of the suggestion */
	answer: string
	/** Optional mode to switch to when selecting this suggestion */
	mode?: string
}

// test-agent_change start
/**
 * A single question in a multi-question carousel
 */
export interface FollowUpQuestion {
	/** The question text */
	question: string
	/** Optional suggested answers */
	suggest?: Array<SuggestionItem>
}

export const followUpQuestionSchema = z.object({
	question: z.string(),
	suggest: z
		.array(
			z.object({
				answer: z.string(),
				mode: z.string().optional(),
			}),
		)
		.optional(),
})
// test-agent_change end

/**
 * Zod schema for SuggestionItem
 */
export const suggestionItemSchema = z.object({
	answer: z.string(),
	mode: z.string().optional(),
})

/**
 * Zod schema for FollowUpData
 */
export const followUpDataSchema = z.object({
	question: z.string().optional(),
	suggest: z.array(suggestionItemSchema).optional(),
	// test-agent_change start
	questions: z.array(followUpQuestionSchema).optional(),
	currentIndex: z.number().optional(),
	answers: z.record(z.string()).optional(),
	// test-agent_change end
})

export type FollowUpDataType = z.infer<typeof followUpDataSchema>
