// cmbt-agent_change - new file
/**
 * Tests for ACPService pre-configured agent functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as vscode from "vscode"
import { ACPService } from "./ACPService"
import { PRE_CONFIGURED_AGENTS } from "./constants"

// Mock VSCode
vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(() => ({})),
			update: vi.fn(),
		})),
	},
	ConfigurationTarget: {
		Global: 1,
	},
}))

// Mock SecurityManager
vi.mock("../security/SecurityManager", () => ({
	SecurityManager: vi.fn().mockImplementation(() => ({
		encrypt: vi.fn((value) => `encrypted_${value}`),
		decrypt: vi.fn((value) => value.replace("encrypted_", "")),
	})),
}))

describe("ACPService Pre-configured Agents", () => {
	let acpService: ACPService
	let mockContext: any

	beforeEach(() => {
		mockContext = {
			globalStorageUri: { fsPath: "/mock/storage" },
			subscriptions: [],
		}
		acpService = new ACPService(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Pre-configured agents", () => {
		it("should have all required pre-configured agents", () => {
			expect(PRE_CONFIGURED_AGENTS).toHaveLength(4)

			const agentIds = PRE_CONFIGURED_AGENTS.map((agent) => agent.id)
			expect(agentIds).toContain("github-copilot")
			expect(agentIds).toContain("claude-code")
			expect(agentIds).toContain("gemini-cli")
			expect(agentIds).toContain("opencode")
		})

		it("should initialize pre-configured agents on service init", async () => {
			await acpService.initialize()

			const agents = acpService.getAllAgents()
			expect(agents.length).toBeGreaterThanOrEqual(4)
		})

		it("should detect pre-configured agent status", async () => {
			await acpService.initialize()

			const status = await acpService.getPreConfiguredAgentsStatus()
			expect(status).toHaveLength(4)

			status.forEach((agent) => {
				expect(agent).toHaveProperty("id")
				expect(agent).toHaveProperty("name")
				expect(agent).toHaveProperty("available")
				expect(agent).toHaveProperty("configured")
			})
		})
	})
})
