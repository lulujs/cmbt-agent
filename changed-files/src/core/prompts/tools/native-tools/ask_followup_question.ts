import type OpenAI from "openai"

// test-agent_change start
const ASK_FOLLOWUP_QUESTION_DESCRIPTION = `Ask the user a question to gather additional information needed to complete the task. Use when you need clarification or more details to proceed effectively.

Single question mode (use question + follow_up):
- question: A clear, specific question addressing the information needed
- follow_up: A list of 2-4 suggested answers. Suggestions must be complete, actionable answers without placeholders. Optionally include mode to switch modes (code/architect/etc.)

Multi-question carousel mode (use questions array):
- questions: A list of questions to ask in sequence. Each item has a "question" string and optional "follow_up" suggestions. Use this when you need to gather several pieces of information at once instead of asking one at a time.

Example: Single question
{ "question": "What is the path to the frontend-config.json file?", "follow_up": [{ "text": "./src/frontend-config.json", "mode": null }, { "text": "./config/frontend-config.json", "mode": null }], "questions": null }

Example: Multiple questions carousel
{ "question": null, "follow_up": null, "questions": [{ "question": "Which framework?", "follow_up": [{ "text": "React", "mode": null }, { "text": "Vue", "mode": null }] }, { "question": "Need TypeScript?", "follow_up": [{ "text": "Yes", "mode": null }, { "text": "No", "mode": null }] }] }`

const QUESTION_PARAMETER_DESCRIPTION = `Single question to ask. Use this for a single question, or set to null when using the questions array.`

const FOLLOW_UP_PARAMETER_DESCRIPTION = `Suggested responses for a single question. Set to null when using the questions array.`

const FOLLOW_UP_TEXT_DESCRIPTION = `Suggested answer the user can pick`

const FOLLOW_UP_MODE_DESCRIPTION = `Optional mode slug to switch to if this suggestion is chosen (e.g., code, architect)`

const QUESTIONS_PARAMETER_DESCRIPTION = `Array of questions for carousel mode. Use this to ask multiple questions at once. Set to null when using the single question/follow_up fields.`

export default {
	type: "function",
	function: {
		name: "ask_followup_question",
		description: ASK_FOLLOWUP_QUESTION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				question: {
					type: ["string", "null"],
					description: QUESTION_PARAMETER_DESCRIPTION,
				},
				follow_up: {
					type: ["array", "null"],
					description: FOLLOW_UP_PARAMETER_DESCRIPTION,
					items: {
						type: "object",
						properties: {
							text: {
								type: "string",
								description: FOLLOW_UP_TEXT_DESCRIPTION,
							},
							mode: {
								type: ["string", "null"],
								description: FOLLOW_UP_MODE_DESCRIPTION,
							},
						},
						required: ["text", "mode"],
						additionalProperties: false,
					},
				},
				questions: {
					type: ["array", "null"],
					description: QUESTIONS_PARAMETER_DESCRIPTION,
					items: {
						type: "object",
						properties: {
							question: {
								type: "string",
								description: "The question text",
							},
							follow_up: {
								type: ["array", "null"],
								description: "Optional suggested answers for this question",
								items: {
									type: "object",
									properties: {
										text: { type: "string", description: FOLLOW_UP_TEXT_DESCRIPTION },
										mode: { type: ["string", "null"], description: FOLLOW_UP_MODE_DESCRIPTION },
									},
									required: ["text", "mode"],
									additionalProperties: false,
								},
							},
						},
						required: ["question", "follow_up"],
						additionalProperties: false,
					},
				},
			},
			required: ["question", "follow_up", "questions"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
// test-agent_change end
