import { Anthropic } from "@anthropic-ai/sdk"

import type { ModelInfo } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import { ApiStream } from "../transform/stream"

import { BaseProvider } from "./base-provider"
import type { ApiHandlerCreateMessageMetadata } from "../index"

interface DifyHandlerOptions extends ApiHandlerOptions {
	difyApiKey?: string
	difyBaseUrl?: string
}

export class DifyHandler extends BaseProvider {
	private baseUrl: string
	private apiKey: string
	private conversationId: string | null = null

	constructor(options: DifyHandlerOptions) {
		super()
		this.apiKey = options.difyApiKey || ""
		this.baseUrl = options.difyBaseUrl || ""

		if (!this.apiKey) {
			throw new Error("Dify API key is required")
		}
		if (!this.baseUrl) {
			throw new Error("Dify base URL is required")
		}
	}

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		_metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Debug: Log systemPrompt to verify it contains tool descriptions
		console.log("[Dify DEBUG] ========== createMessage called ==========")
		console.log("[Dify DEBUG] systemPrompt length:", systemPrompt?.length || 0)
		console.log("[Dify DEBUG] systemPrompt preview:", systemPrompt)
		console.log(
			"[Dify DEBUG] systemPrompt contains 'Tools':",
			systemPrompt?.includes("Tools") || systemPrompt?.includes("tools"),
		)
		console.log("[Dify DEBUG] systemPrompt contains 'read_file':", systemPrompt?.includes("read_file"))
		console.log("[Dify DEBUG] messages count:", messages?.length || 0)
		console.log("[Dify DEBUG] conversationId:", this.conversationId)

		// Convert messages to Dify format
		const query = this.convertMessagesToQuery(systemPrompt, messages)

		console.log("[Dify DEBUG] ========== Query to be sent ==========")
		console.log("[Dify DEBUG] query length:", query.length)
		console.log("[Dify DEBUG] query preview :", query)
		console.log("[Dify DEBUG] query contains 'Tools':", query.includes("Tools") || query.includes("tools"))
		console.log("[Dify DEBUG] query contains 'read_file':", query.includes("read_file"))
		console.log("[Dify DEBUG] ==========================================")

		const requestBody = {
			inputs: {},
			query: query,
			response_mode: "streaming",
			conversation_id: this.conversationId || "",
			user: "test-agent",
			files: [],
		}

		const fullUrl = `${this.baseUrl}/chat-messages`

		let response: Response
		try {
			response = await fetch(fullUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			})
		} catch (error: any) {
			const cause = error.cause ? ` | Cause: ${error.cause}` : ""
			throw new Error(`Dify API network error: ${error.message}${cause}`)
		}

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Dify API error: ${response.status} ${response.statusText} - ${errorText}`)
		}

		if (!response.body) {
			throw new Error("No response body from Dify API")
		}

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""
		let fullText = ""

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) {
					break
				}

				const chunk = decoder.decode(value, { stream: true })
				buffer += chunk
				const lines = buffer.split("\n")

				// Keep the last incomplete line in the buffer
				buffer = lines.pop() || ""

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6).trim()

						if (data === "[DONE]") {
							return
						}

						if (data === "") {
							continue
						}

						try {
							const parsed = JSON.parse(data)

							// Capture conversation_id as soon as it's available
							if (parsed.conversation_id && !this.conversationId) {
								this.conversationId = parsed.conversation_id
								console.log("[Dify DEBUG] ========== Captured conversation_id ==========")
								console.log("[Dify DEBUG] conversation_id:", this.conversationId)
								console.log("[Dify DEBUG] Future requests will use this ID and skip systemPrompt")
								console.log("[Dify DEBUG] ================================================")
							}

							// Handle different Dify event types
							if (parsed.event === "message") {
								// Dify sends the full text in each "answer" chunk, so we replace
								if (typeof parsed.answer === "string") {
									fullText = parsed.answer
									yield {
										type: "text",
										text: fullText,
									}
								}
							} else if (parsed.event === "message_replace") {
								if (parsed.answer) {
									fullText = parsed.answer // Replace instead of append
									yield {
										type: "text",
										text: fullText,
									}
								}
							} else if (parsed.event === "message_end") {
								// Message completed. Yield final text if we have any.
								if (fullText) {
									yield {
										type: "text",
										text: fullText,
									}
								}
								// Yield usage data if available
								if (parsed.metadata?.usage) {
									const usage = parsed.metadata.usage
									yield {
										type: "usage",
										inputTokens: usage.prompt_tokens || 0,
										outputTokens: usage.completion_tokens || usage.total_tokens || 0,
										totalCost: parseFloat(usage.total_price || "0"),
									}
								}
								return // End of stream
							} else if (parsed.event === "error") {
								throw new Error(`Dify API error: ${parsed.message || "Unknown error"}`)
							}
							// Silently ignore other event types (workflow_started, workflow_finished, node_started, node_finished, ping)
						} catch (e) {
							// Ignore JSON parse errors for malformed chunks
							continue
						}
					} else if (line.trim() !== "") {
						// Try to parse as direct JSON (fallback for non-SSE responses)
						try {
							const parsed = JSON.parse(line.trim())

							if (parsed.event === "message" && parsed.answer) {
								fullText = parsed.answer
								yield {
									type: "text",
									text: fullText,
								}
							} else if (parsed.event === "message_end") {
								if (fullText) {
									yield {
										type: "text",
										text: fullText,
									}
								}
								return
							} else if (parsed.event === "error") {
								throw new Error(`Dify API error: ${parsed.message || "Unknown error"}`)
							}
						} catch (_e) {
							// Not JSON, continue
						}
					}
				}
			}
		} finally {
			reader.releaseLock()
		}
	}

	private convertMessagesToQuery(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): string {
		// Dify's context is managed by conversation_id. The query should be the last user message.
		// The system prompt is typically configured in the Dify App itself.

		console.log("[Dify DEBUG] ========== convertMessagesToQuery ==========")
		console.log("[Dify DEBUG] conversationId:", this.conversationId)
		console.log("[Dify DEBUG] systemPrompt length:", systemPrompt?.length || 0)
		console.log("[Dify DEBUG] messages count:", messages?.length || 0)

		const lastUserMessage = messages.filter((m) => m.role === "user").pop()

		if (!lastUserMessage) {
			console.log("[Dify DEBUG] No user message found, returning empty string")
			return ""
		}

		const userQuery = Array.isArray(lastUserMessage.content)
			? lastUserMessage.content.map((c) => ("text" in c ? c.text : "")).join("\n")
			: (lastUserMessage.content as string)

		console.log("[Dify DEBUG] userQuery length:", userQuery.length)
		console.log("[Dify DEBUG] userQuery preview:", userQuery.substring(0, 200))

		// Only prepend the system prompt if it's the very first message of a new conversation.
		if (!this.conversationId && systemPrompt) {
			console.log("[Dify DEBUG] NEW CONVERSATION - Prepending systemPrompt to query")
			const result = `${systemPrompt}\n\n---\n\n${userQuery}`
			console.log("[Dify DEBUG] Final query length:", result.length)
			console.log(
				"[Dify DEBUG] Final query contains tools:",
				result.includes("read_file") || result.includes("Tools"),
			)
			return result
		}

		console.log("[Dify DEBUG] EXISTING CONVERSATION - Returning only userQuery (no systemPrompt)")
		return userQuery
	}

	override getModel(): { id: string; info: ModelInfo } {
		return {
			id: "dify-workflow",
			info: {
				maxTokens: 8192,
				contextWindow: 128000,
				supportsImages: true,
				supportsPromptCache: false,
				inputPrice: 0,
				outputPrice: 0,
				description:
					"Model configured in Dify workflow. Note: Dify manages tools within its own workflow system and does not support test-agent's tool calling feature.",
				// Dify does not support native tool calling through the API
				// Tools are configured within the Dify workflow itself
				supportsNativeTools: false,
				// Use XML protocol as fallback, but tools still won't work
				// Users should configure tools within Dify's workflow instead
				defaultToolProtocol: "xml",
			},
		}
	}
}
