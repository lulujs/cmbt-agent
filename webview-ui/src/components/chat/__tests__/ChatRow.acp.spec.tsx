// cmbt-agent_change - new file
// pnpm --filter @roo-code/vscode-webview test src/components/chat/__tests__/ChatRow.acp.spec.tsx

import React from "react"
import { render, screen } from "@/utils/test-utils"
import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import ChatRow from "../ChatRow"

// Mock vscode API
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock use-sound
vi.mock("use-sound", () => ({
	default: vi.fn(() => [vi.fn()]),
}))

describe("ChatRow - ACP Message Display", () => {
	const renderChatRow = (message: any) => {
		return render(
			<ExtensionStateContextProvider>
				<ChatRow
					message={message}
					isExpanded={false}
					isLast={false}
					isStreaming={false}
					onToggleExpand={vi.fn()}
					onHeightChange={vi.fn()}
				/>
			</ExtensionStateContextProvider>,
		)
	}

	it("should display ACP agent name for text messages from ACP agent", () => {
		const acpMessage = {
			ts: Date.now(),
			type: "say" as const,
			say: "text" as const,
			text: "Hello from ACP agent",
			source: "acp-agent" as const,
			agentId: "claude-code",
			agentName: "Claude Code",
		}

		renderChatRow(acpMessage)
		expect(screen.getByText("Claude Code")).toBeInTheDocument()
	})

	it("should display default text for non-ACP messages", () => {
		const normalMessage = {
			ts: Date.now(),
			type: "say" as const,
			say: "text" as const,
			text: "Hello from Kilo Code",
		}

		renderChatRow(normalMessage)
		expect(screen.getByText(/said/i)).toBeInTheDocument()
	})

	it("should display agent name in user feedback for ACP messages", () => {
		const acpFeedback = {
			ts: Date.now(),
			type: "say" as const,
			say: "user_feedback" as const,
			text: "User message to ACP",
			source: "acp-agent" as const,
			agentId: "github-copilot",
			agentName: "GitHub Copilot",
		}

		renderChatRow(acpFeedback)
		// In tests, i18n returns the key, so we check for the presence of the translation key
		expect(screen.getByText(/youSaidToAgent|GitHub Copilot/i)).toBeInTheDocument()
	})
})
