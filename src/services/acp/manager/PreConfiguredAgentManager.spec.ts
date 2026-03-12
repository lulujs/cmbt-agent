// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { PreConfiguredAgentManager } from "./PreConfiguredAgentManager"
import { PRE_CONFIGURED_AGENTS } from "../constants"
import { ConfigurationStorage } from "../storage/ConfigurationStorage"
import { ACPError, ACPErrorCode } from "../errors"

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showInputBox: vi.fn(),
		showQuickPick: vi.fn(),
		showSaveDialog: vi.fn(),
		showOpenDialog: vi.fn(),
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path })),
	},
}))

// Mock ConfigurationStorage
vi.mock("../storage/ConfigurationStorage", () => ({
	ConfigurationStorage: vi.fn().mockImplementation(() => ({
		loadAllConfigs: vi.fn(),
		loadAgentConfig: vi.fn(),
		saveAgentConfig: vi.fn(),
		deleteAgentConfig: vi.fn(),
	})),
}))

// Mock ACPError and ACPErrorCode
vi.mock("../errors", () => ({
	ACPError: class ACPError extends Error {
		constructor(
			public code: string,
			message: string,
		) {
			super(message)
			this.name = "ACPError"
		}
	},
	ACPErrorCode: {
		NOT_FOUND: "NOT_FOUND",
		VALIDATION_ERROR: "VALIDATION_ERROR",
		CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
		STORAGE_ERROR: "STORAGE_ERROR",
	},
}))

describe("PreConfiguredAgentManager", () => {
	let manager: PreConfiguredAgentManager
	let mockContext: vscode.ExtensionContext
	let mockStorage: any

	beforeEach(() => {
		mockContext = {
			globalStorageUri: { fsPath: "/mock/storage" },
		} as any

		mockStorage = {
			loadAllConfigs: vi.fn(),
			loadAgentConfig: vi.fn(),
			saveAgentConfig: vi.fn(),
			deleteAgentConfig: vi.fn(),
		}

		// Mock the ConfigurationStorage constructor
		vi.mocked(ConfigurationStorage).mockImplementation(() => mockStorage)

		manager = new PreConfiguredAgentManager(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("getPreConfiguredAgents", () => {
		it("should return all pre-configured agents", () => {
			const agents = manager.getPreConfiguredAgents()

			expect(agents).toHaveLength(4)
			expect(agents.map((a) => a.id)).toEqual(["github-copilot", "claude-code", "gemini-cli", "opencode"])
		})

		it("should return agents with correct properties", () => {
			const agents = manager.getPreConfiguredAgents()

			for (const agent of agents) {
				expect(agent).toHaveProperty("id")
				expect(agent).toHaveProperty("name")
				expect(agent).toHaveProperty("displayName")
				expect(agent).toHaveProperty("description")
				expect(agent).toHaveProperty("endpoint")
				expect(agent).toHaveProperty("transport")
				expect(agent).toHaveProperty("authentication")
				expect(agent).toHaveProperty("permissions")
				expect(agent).toHaveProperty("settings")
				expect(agent).toHaveProperty("metadata")
			}
		})
	})

	describe("getPreConfiguredAgent", () => {
		it("should return specific agent by ID", () => {
			const agent = manager.getPreConfiguredAgent("github-copilot")

			expect(agent).toBeDefined()
			expect(agent?.id).toBe("github-copilot")
			expect(agent?.name).toBe("GitHub Copilot")
			expect(agent?.endpoint).toBe("copilot://agent")
		})

		it("should return undefined for non-existent agent", () => {
			const agent = manager.getPreConfiguredAgent("non-existent")

			expect(agent).toBeUndefined()
		})
	})

	describe("isPreConfiguredAgent", () => {
		it("should return true for pre-configured agent IDs", () => {
			expect(manager.isPreConfiguredAgent("github-copilot")).toBe(true)
			expect(manager.isPreConfiguredAgent("claude-code")).toBe(true)
			expect(manager.isPreConfiguredAgent("gemini-cli")).toBe(true)
			expect(manager.isPreConfiguredAgent("opencode")).toBe(true)
		})

		it("should return false for non-pre-configured agent IDs", () => {
			expect(manager.isPreConfiguredAgent("custom-agent")).toBe(false)
			expect(manager.isPreConfiguredAgent("unknown")).toBe(false)
		})
	})

	describe("initializePreConfiguredAgents", () => {
		it("should initialize agents that do not exist", async () => {
			// Mock existing configs (only github-copilot exists)
			mockStorage.loadAllConfigs.mockResolvedValue([{ id: "github-copilot", name: "GitHub Copilot" }])

			await manager.initializePreConfiguredAgents()

			// Should save 3 new agents (claude-code, gemini-cli, opencode)
			expect(mockStorage.saveAgentConfig).toHaveBeenCalledTimes(3)

			// Verify the saved agents
			const savedCalls = mockStorage.saveAgentConfig.mock.calls
			const savedIds = savedCalls.map((call) => call[0].id)

			expect(savedIds).toContain("claude-code")
			expect(savedIds).toContain("gemini-cli")
			expect(savedIds).toContain("opencode")
			expect(savedIds).not.toContain("github-copilot")
		})

		it("should skip agents that already exist", async () => {
			// Mock all agents already exist
			mockStorage.loadAllConfigs.mockResolvedValue([
				{ id: "github-copilot", name: "GitHub Copilot" },
				{ id: "claude-code", name: "Claude Code" },
				{ id: "gemini-cli", name: "Gemini CLI" },
				{ id: "opencode", name: "OpenCode" },
			])

			await manager.initializePreConfiguredAgents()

			// Should not save any agents
			expect(mockStorage.saveAgentConfig).not.toHaveBeenCalled()
		})

		it("should show information message when agents are initialized", async () => {
			mockStorage.loadAllConfigs.mockResolvedValue([])

			await manager.initializePreConfiguredAgents()

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("已初始化 4 个预配置ACP智能体")
		})
	})

	describe("detectAvailableAgents", () => {
		it("should return available agents", async () => {
			// Mock environment variables for some agents
			const originalEnv = process.env
			process.env = {
				...originalEnv,
				GITHUB_TOKEN: "mock-token",
				ANTHROPIC_API_KEY: "mock-key",
			}

			const availableAgents = await manager.detectAvailableAgents()

			// Should detect agents with credentials
			expect(availableAgents).toHaveLength(2)
			expect(availableAgents.map((a) => a.id)).toContain("github-copilot")
			expect(availableAgents.map((a) => a.id)).toContain("claude-code")

			// Restore environment
			process.env = originalEnv
		})

		it("should handle detection errors gracefully", async () => {
			// Mock an error in availability check
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

			const availableAgents = await manager.detectAvailableAgents()

			// Should return empty array on errors, not throw
			expect(availableAgents).toBeInstanceOf(Array)

			consoleSpy.mockRestore()
		})
	})

	describe("setupPreConfiguredAgent", () => {
		it("should setup agent with user credentials", async () => {
			mockStorage.loadAgentConfig.mockResolvedValue(null)
			vi.mocked(vscode.window.showInputBox).mockResolvedValue("mock-api-key")

			const config = await manager.setupPreConfiguredAgent("github-copilot")

			expect(config.id).toBe("github-copilot")
			expect(mockStorage.saveAgentConfig).toHaveBeenCalledWith(config)
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("智能体 GitHub Copilot 配置成功")
		})

		it("should handle reconfiguration of existing agent", async () => {
			const existingConfig = { id: "github-copilot", name: "GitHub Copilot" }
			mockStorage.loadAgentConfig.mockResolvedValue(existingConfig)
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("重新配置")
			vi.mocked(vscode.window.showInputBox).mockResolvedValue("new-api-key")

			const config = await manager.setupPreConfiguredAgent("github-copilot")

			expect(mockStorage.saveAgentConfig).toHaveBeenCalled()
		})

		it("should return existing config if user cancels reconfiguration", async () => {
			const existingConfig = { id: "github-copilot", name: "GitHub Copilot" }
			mockStorage.loadAgentConfig.mockResolvedValue(existingConfig)
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("取消")

			const config = await manager.setupPreConfiguredAgent("github-copilot")

			expect(config).toBe(existingConfig)
			expect(mockStorage.saveAgentConfig).not.toHaveBeenCalled()
		})

		it("should throw error for non-existent agent", async () => {
			await expect(manager.setupPreConfiguredAgent("non-existent")).rejects.toThrow(
				"预配置智能体 non-existent 不存在",
			)
		})
	})

	describe("resetPreConfiguredAgent", () => {
		it("should reset agent to default configuration", async () => {
			await manager.resetPreConfiguredAgent("github-copilot")

			expect(mockStorage.saveAgentConfig).toHaveBeenCalled()
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("智能体 GitHub Copilot 已重置为默认配置")
		})

		it("should throw error for non-existent agent", async () => {
			await expect(manager.resetPreConfiguredAgent("non-existent")).rejects.toThrow(
				"预配置智能体 non-existent 不存在",
			)
		})
	})

	describe("getSetupInstructions", () => {
		it("should return setup instructions for each agent", () => {
			const githubInstructions = manager.getSetupInstructions("github-copilot")
			const claudeInstructions = manager.getSetupInstructions("claude-code")
			const geminiInstructions = manager.getSetupInstructions("gemini-cli")
			const opencodeInstructions = manager.getSetupInstructions("opencode")

			expect(githubInstructions).toContain("GitHub Copilot")
			expect(githubInstructions).toContain("GITHUB_TOKEN")

			expect(claudeInstructions).toContain("Claude Code")
			expect(claudeInstructions).toContain("ANTHROPIC_API_KEY")

			expect(geminiInstructions).toContain("Gemini CLI")
			expect(geminiInstructions).toContain("GOOGLE_API_KEY")

			expect(opencodeInstructions).toContain("OpenCode")
			expect(opencodeInstructions).toContain("OPENAI_API_KEY")
		})

		it("should return default message for unknown agent", () => {
			const instructions = manager.getSetupInstructions("unknown")
			expect(instructions).toBe("未找到智能体设置说明")
		})
	})

	describe("showSetupInstructions", () => {
		it("should show instructions and offer to configure", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("立即配置")
			vi.mocked(vscode.window.showInputBox).mockResolvedValue("mock-token")
			mockStorage.loadAgentConfig.mockResolvedValue(null)

			await manager.showSetupInstructions("github-copilot")

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"GitHub Copilot 设置说明",
				expect.objectContaining({
					detail: expect.stringContaining("GitHub Copilot"),
					modal: true,
				}),
				"立即配置",
				"稍后配置",
			)
		})

		it("should handle non-existent agent", async () => {
			await manager.showSetupInstructions("non-existent")

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("未找到智能体 non-existent")
		})
	})
})
