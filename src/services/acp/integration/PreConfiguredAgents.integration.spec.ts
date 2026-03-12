// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { ACPService } from "../ACPService"
import { PRE_CONFIGURED_AGENTS } from "../constants"

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showInputBox: vi.fn(),
		showQuickPick: vi.fn(),
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path })),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
			update: vi.fn(),
		})),
	},
}))

// Mock file system operations
vi.mock("fs/promises", () => ({
	writeFile: vi.fn(),
	readFile: vi.fn(),
	mkdir: vi.fn(),
	readdir: vi.fn(),
	stat: vi.fn(),
	unlink: vi.fn(),
}))

describe("PreConfigured Agents Integration", () => {
	let acpService: ACPService
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		mockContext = {
			globalStorageUri: { fsPath: "/mock/storage" },
			workspaceState: {
				get: vi.fn(),
				update: vi.fn(),
			},
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any

		acpService = new ACPService(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Pre-configured Agent Access", () => {
		it("should provide access to all pre-configured agents", () => {
			const preConfiguredAgents = acpService.getPreConfiguredAgents()

			expect(preConfiguredAgents).toHaveLength(4)
			expect(preConfiguredAgents.map((a) => a.id)).toEqual([
				"github-copilot",
				"claude-code",
				"gemini-cli",
				"opencode",
			])
		})

		it("should correctly identify pre-configured agents", () => {
			expect(acpService.isPreConfiguredAgent("github-copilot")).toBe(true)
			expect(acpService.isPreConfiguredAgent("claude-code")).toBe(true)
			expect(acpService.isPreConfiguredAgent("gemini-cli")).toBe(true)
			expect(acpService.isPreConfiguredAgent("opencode")).toBe(true)
			expect(acpService.isPreConfiguredAgent("custom-agent")).toBe(false)
		})

		it("should provide access to pre-configured agent manager", () => {
			const manager = acpService.getPreConfiguredAgentManager()

			expect(manager).toBeDefined()
			expect(typeof manager.getPreConfiguredAgents).toBe("function")
			expect(typeof manager.setupPreConfiguredAgent).toBe("function")
			expect(typeof manager.detectAvailableAgents).toBe("function")
		})
	})

	describe("Agent Configuration Details", () => {
		it("should have correct GitHub Copilot configuration", () => {
			const githubAgent = PRE_CONFIGURED_AGENTS.find((a) => a.id === "github-copilot")

			expect(githubAgent).toBeDefined()
			expect(githubAgent?.name).toBe("GitHub Copilot")
			expect(githubAgent?.endpoint).toBe("copilot://agent")
			expect(githubAgent?.transport).toBe("stdio")
			expect(githubAgent?.authentication.type).toBe("token")
			expect(githubAgent?.authentication.credentials?.tokenType).toBe("github")
			expect(githubAgent?.authentication.credentials?.tokenKey).toBe("GITHUB_TOKEN")
			expect(githubAgent?.metadata.capabilities).toContain("code-completion")
			expect(githubAgent?.metadata.capabilities).toContain("code-explanation")
			expect(githubAgent?.metadata.capabilities).toContain("code-refactoring")
		})

		it("should have correct Claude Code configuration", () => {
			const claudeAgent = PRE_CONFIGURED_AGENTS.find((a) => a.id === "claude-code")

			expect(claudeAgent).toBeDefined()
			expect(claudeAgent?.name).toBe("Claude Code")
			expect(claudeAgent?.endpoint).toBe("claude-code://agent")
			expect(claudeAgent?.transport).toBe("stdio")
			expect(claudeAgent?.authentication.type).toBe("token")
			expect(claudeAgent?.authentication.credentials?.tokenType).toBe("anthropic")
			expect(claudeAgent?.authentication.credentials?.tokenKey).toBe("ANTHROPIC_API_KEY")
			expect(claudeAgent?.metadata.capabilities).toContain("code-analysis")
			expect(claudeAgent?.metadata.capabilities).toContain("code-generation")
			expect(claudeAgent?.metadata.capabilities).toContain("code-debugging")
		})

		it("should have correct Gemini CLI configuration", () => {
			const geminiAgent = PRE_CONFIGURED_AGENTS.find((a) => a.id === "gemini-cli")

			expect(geminiAgent).toBeDefined()
			expect(geminiAgent?.name).toBe("Gemini CLI")
			expect(geminiAgent?.endpoint).toBe("gemini-cli://agent")
			expect(geminiAgent?.transport).toBe("stdio")
			expect(geminiAgent?.authentication.type).toBe("token")
			expect(geminiAgent?.authentication.credentials?.tokenType).toBe("google")
			expect(geminiAgent?.authentication.credentials?.tokenKey).toBe("GOOGLE_API_KEY")
			expect(geminiAgent?.capabilities).toContain("code-generation")
			expect(geminiAgent?.capabilities).toContain("documentation-writing")
		})

		it("should have correct OpenCode configuration", () => {
			const opencodeAgent = PRE_CONFIGURED_AGENTS.find((a) => a.id === "opencode")

			expect(opencodeAgent).toBeDefined()
			expect(opencodeAgent?.name).toBe("OpenCode")
			expect(opencodeAgent?.endpoint).toBe("opencode://agent")
			expect(opencodeAgent?.transport).toBe("stdio")
			expect(opencodeAgent?.authentication.type).toBe("token")
			expect(opencodeAgent?.authentication.credentials?.tokenType).toBe("openai")
			expect(opencodeAgent?.authentication.credentials?.tokenKey).toBe("OPENAI_API_KEY")
			expect(opencodeAgent?.capabilities).toContain("code-completion")
			expect(opencodeAgent?.capabilities).toContain("general-programming")
		})
	})

	describe("Agent Permissions and Settings", () => {
		it("should configure appropriate permissions for all agents", () => {
			for (const agent of PRE_CONFIGURED_AGENTS) {
				expect(agent.permissions.fileAccess).toBe("write")
				expect(agent.permissions.networkAccess).toBe(true)
				expect(agent.permissions.shellAccess).toBe(false)
			}
		})

		it("should have consistent default settings", () => {
			for (const agent of PRE_CONFIGURED_AGENTS) {
				expect(agent.settings.autoConnect).toBe(false)
				expect(agent.settings.idleTimeout).toBe(300000) // 5 minutes
				expect(agent.settings.retryAttempts).toBe(3)
				expect(agent.settings.retryDelay).toBe(1000)
			}
		})

		it("should have proper metadata structure", () => {
			for (const agent of PRE_CONFIGURED_AGENTS) {
				expect(agent.metadata.version).toBe("1.0.0")
				expect(Array.isArray(agent.metadata.capabilities)).toBe(true)
				expect(agent.metadata.capabilities.length).toBeGreaterThan(0)
				expect(agent.metadata.created).toBeInstanceOf(Date)
			}
		})
	})

	describe("Service Integration", () => {
		it("should expose pre-configured agent functionality through service", async () => {
			// Test that the service properly exposes pre-configured agent methods
			expect(typeof acpService.setupPreConfiguredAgent).toBe("function")
			expect(typeof acpService.resetPreConfiguredAgent).toBe("function")
			expect(typeof acpService.showSetupInstructions).toBe("function")
			expect(typeof acpService.getPreConfiguredAgentsStatus).toBe("function")
		})

		it("should handle auto-detection of available agents", async () => {
			// Mock environment variables for testing
			const originalEnv = process.env
			process.env = {
				...originalEnv,
				GITHUB_TOKEN: "mock-token",
			}

			const availableAgents = await acpService.autoDetectAvailableAgents()

			expect(Array.isArray(availableAgents)).toBe(true)

			// Restore environment
			process.env = originalEnv
		})

		it("should provide status information for all pre-configured agents", async () => {
			const status = await acpService.getPreConfiguredAgentsStatus()

			expect(Array.isArray(status)).toBe(true)
			expect(status).toHaveLength(4)

			for (const agentStatus of status) {
				expect(agentStatus).toHaveProperty("id")
				expect(agentStatus).toHaveProperty("name")
				expect(agentStatus).toHaveProperty("displayName")
				expect(agentStatus).toHaveProperty("description")
				expect(agentStatus).toHaveProperty("available")
				expect(agentStatus).toHaveProperty("configured")
				expect(agentStatus).toHaveProperty("connected")

				expect(typeof agentStatus.available).toBe("boolean")
				expect(typeof agentStatus.configured).toBe("boolean")
				expect(typeof agentStatus.connected).toBe("boolean")
			}
		})
	})

	describe("Constants Validation", () => {
		it("should have all required pre-configured agents in constants", () => {
			const requiredAgents = ["github-copilot", "claude-code", "gemini-cli", "opencode"]
			const actualAgents = PRE_CONFIGURED_AGENTS.map((a) => a.id)

			for (const requiredAgent of requiredAgents) {
				expect(actualAgents).toContain(requiredAgent)
			}
		})

		it("should have unique agent IDs", () => {
			const agentIds = PRE_CONFIGURED_AGENTS.map((a) => a.id)
			const uniqueIds = new Set(agentIds)

			expect(uniqueIds.size).toBe(agentIds.length)
		})

		it("should have valid endpoint formats", () => {
			for (const agent of PRE_CONFIGURED_AGENTS) {
				expect(agent.endpoint).toMatch(/^[a-z-]+:\/\/agent$/)
			}
		})

		it("should use stdio transport for all agents", () => {
			for (const agent of PRE_CONFIGURED_AGENTS) {
				expect(agent.transport).toBe("stdio")
			}
		})
	})
})
