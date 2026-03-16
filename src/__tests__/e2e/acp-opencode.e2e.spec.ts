// cmbt-agent_change - new file
/**
 * E2E test for OpenCode ACP integration
 * Run with: pnpm test:e2e
 */
import * as vscode from "vscode"
import { describe, it, expect, beforeAll, afterAll } from "vitest"

describe("OpenCode ACP E2E", () => {
	let extension: vscode.Extension<any>

	beforeAll(async () => {
		// Activate extension
		extension = vscode.extensions.getExtension("your-publisher.cmbt-agent")!
		await extension.activate()
	}, 30000)

	it("should select opencode agent and establish connection", async () => {
		// Execute command to select ACP agent
		await vscode.commands.executeCommand("cmbt-agent.selectAcpAgent", "opencode")

		// Wait for agent to start
		await new Promise((resolve) => setTimeout(resolve, 5000))

		// Check extension state
		const state = await vscode.commands.executeCommand("cmbt-agent.getState")
		expect(state).toHaveProperty("activeAcpAgentId", "opencode")
		expect(state).toHaveProperty("activeAcpAgentStatus", "running")
	}, 30000)

	afterAll(async () => {
		// Cleanup
		await vscode.commands.executeCommand("cmbt-agent.stopAcpAgent")
	})
})
