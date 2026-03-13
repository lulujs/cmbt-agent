// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach } from "vitest"
import { webviewMessageHandler } from "../webviewMessageHandler"
import { ClineProvider } from "../ClineProvider"

describe("webviewMessageHandler - ACP messages", () => {
	let mockProvider: any
	let mockMarketplaceManager: any

	beforeEach(() => {
		mockProvider = {
			handleSelectAcpAgent: vi.fn(),
			handleSendAcpMessage: vi.fn(),
			log: vi.fn(),
		}
		mockMarketplaceManager = {}
	})

	describe("selectAcpAgent", () => {
		it("should call handleSelectAcpAgent with agentId", async () => {
			const message = {
				type: "selectAcpAgent" as const,
				agentId: "test-agent-id",
			}

			await webviewMessageHandler(mockProvider as ClineProvider, message, mockMarketplaceManager)

			expect(mockProvider.handleSelectAcpAgent).toHaveBeenCalledWith("test-agent-id")
		})

		it("should not call handleSelectAcpAgent if agentId is missing", async () => {
			const message = {
				type: "selectAcpAgent" as const,
			}

			await webviewMessageHandler(mockProvider as ClineProvider, message, mockMarketplaceManager)

			expect(mockProvider.handleSelectAcpAgent).not.toHaveBeenCalled()
		})
	})

	describe("sendAcpMessage", () => {
		it("should call handleSendAcpMessage with text", async () => {
			const message = {
				type: "sendAcpMessage" as const,
				text: "Hello ACP agent",
			}

			await webviewMessageHandler(mockProvider as ClineProvider, message, mockMarketplaceManager)

			expect(mockProvider.handleSendAcpMessage).toHaveBeenCalledWith("Hello ACP agent")
		})

		it("should not call handleSendAcpMessage if text is missing", async () => {
			const message = {
				type: "sendAcpMessage" as const,
			}

			await webviewMessageHandler(mockProvider as ClineProvider, message, mockMarketplaceManager)

			expect(mockProvider.handleSendAcpMessage).not.toHaveBeenCalled()
		})
	})
})
