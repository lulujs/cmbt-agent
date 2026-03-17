import { AgentManager, AcpAgentConfig, getSpawnOptions } from "../AgentManager"
import { AcpLogger, AcpLogLevel } from "../AcpLogger"
import * as vscode from "vscode"
import { ChildProcess } from "child_process"

vi.mock("child_process")

describe("AgentManager", () => {
	let manager: AgentManager
	let logger: AcpLogger
	let mockProcess: Partial<ChildProcess>
	let mockConfig: AcpAgentConfig

	beforeEach(() => {
		logger = new AcpLogger(AcpLogLevel.ERROR)

		vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
			get: vi.fn().mockReturnValue([]),
		} as any)

		manager = new AgentManager(logger)

		mockProcess = {
			kill: vi.fn(),
			on: vi.fn(),
			once: vi.fn(),
			stdin: {} as any,
			stdout: {} as any,
			stderr: {} as any,
		}

		mockConfig = {
			id: "test-agent",
			name: "Test Agent",
			command: "test-command",
			args: ["--test"],
			env: { TEST_VAR: "value" },
		}
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("startAgent", () => {
		it("should start agent process successfully", async () => {
			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			const promise = manager.startAgent(mockConfig)
			const result = await promise

			expect(result.config).toEqual(mockConfig)
			expect(result.status).toBe("running")
			expect(spawn).toHaveBeenCalledWith(
				mockConfig.command,
				mockConfig.args,
				expect.objectContaining({
					env: expect.objectContaining(mockConfig.env),
				}),
			)
		})

		it("should use shell:true on Windows", async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, "platform", { value: "win32", configurable: true })

			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			await manager.startAgent(mockConfig)

			expect(spawn).toHaveBeenCalledWith(
				mockConfig.command,
				mockConfig.args,
				expect.objectContaining({ shell: true }),
			)

			Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
		})

		it("should use login shell on macOS/Linux", async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, "platform", { value: "darwin", configurable: true })

			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			await manager.startAgent(mockConfig)

			expect(spawn).toHaveBeenCalledWith(
				mockConfig.command,
				mockConfig.args,
				expect.objectContaining({ shell: expect.any(String) }),
			)

			Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
		})

		it("should handle process startup error", async () => {
			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			const promise = manager.startAgent(mockConfig)

			// Find and trigger the error handler
			const errorCall = vi.mocked(mockProcess.on!).mock.calls.find((call) => (call[0] as string) === "error")
			expect(errorCall).toBeDefined()
			const errorHandler = errorCall![1] as (err: Error) => void
			errorHandler(new Error("Spawn failed"))

			await expect(promise).rejects.toThrow("Spawn failed")
		})

		it("should handle process exit during startup", async () => {
			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			const promise = manager.startAgent(mockConfig)

			const exitCall = vi.mocked(mockProcess.on!).mock.calls.find((call) => (call[0] as string) === "exit")
			expect(exitCall).toBeDefined()
			const exitHandler = exitCall![1] as (code: number | null) => void
			exitHandler(1)

			await expect(promise).rejects.toThrow("Agent exited during startup with code 1")
		})
	})

	describe("stopAgent", () => {
		it("should stop running agent", async () => {
			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			await manager.startAgent(mockConfig)

			const stopPromise = manager.stopAgent(mockConfig.id)
			const exitHandler = vi
				.mocked(mockProcess.once!)
				.mock.calls.find((call) => (call[0] as string) === "exit")?.[1] as () => void
			exitHandler()

			await stopPromise
			expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM")
		})

		it("should do nothing if agent not active", async () => {
			await manager.stopAgent("non-existent")
			expect(mockProcess.kill).not.toHaveBeenCalled()
		})
	})

	describe("switchAgent", () => {
		it("should stop current and start new agent", async () => {
			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			await manager.startAgent(mockConfig)

			const newConfig: AcpAgentConfig = { ...mockConfig, id: "new-agent", name: "New Agent" }
			const switchPromise = manager.switchAgent(newConfig)

			const exitHandler = vi
				.mocked(mockProcess.once!)
				.mock.calls.find((call) => (call[0] as string) === "exit")?.[1] as () => void
			exitHandler()

			const result = await switchPromise
			expect(result.config.id).toBe("new-agent")
		})
	})

	describe("getActiveAgent", () => {
		it("should return active agent after start", async () => {
			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			await manager.startAgent(mockConfig)
			const active = manager.getActiveAgent()
			expect(active?.config.id).toBe(mockConfig.id)
		})

		it("should return undefined when no active agent", () => {
			expect(manager.getActiveAgent()).toBeUndefined()
		})
	})

	describe("getConfiguredAgents", () => {
		it("should return agents from VSCode configuration", () => {
			vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
				get: vi.fn().mockReturnValue([mockConfig]),
			} as any)

			const agents = manager.getConfiguredAgents()
			expect(agents).toEqual([mockConfig])
			expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith("cmbt-agent.acp")
		})

		it("should return empty array when no agents configured", () => {
			const agents = manager.getConfiguredAgents()
			expect(agents).toEqual([])
		})
	})

	describe("disposeAll", () => {
		it("should stop active agent and dispose emitter", async () => {
			const { spawn } = await import("child_process")
			vi.mocked(spawn).mockReturnValue(mockProcess as ChildProcess)

			await manager.startAgent(mockConfig)

			const disposePromise = manager.disposeAll()
			const exitHandler = vi
				.mocked(mockProcess.once!)
				.mock.calls.find((call) => (call[0] as string) === "exit")?.[1] as () => void
			exitHandler()

			await disposePromise
			expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM")
		})

		it("should dispose without error when no active agent", async () => {
			await expect(manager.disposeAll()).resolves.toBeUndefined()
		})
	})

	describe("validateConfig", () => {
		it("should return true for valid config with all required fields", () => {
			expect(manager.validateConfig(mockConfig)).toBe(true)
		})

		it("should return false when command is missing", () => {
			const invalidConfig = { ...mockConfig, command: "" }
			expect(manager.validateConfig(invalidConfig)).toBe(false)
		})

		it("should return false when args is missing", () => {
			const invalidConfig = { ...mockConfig, args: undefined as any }
			expect(manager.validateConfig(invalidConfig)).toBe(false)
		})

		it("should return false when env is missing", () => {
			const invalidConfig = { ...mockConfig, env: undefined }
			expect(manager.validateConfig(invalidConfig)).toBe(false)
		})

		it("should log error on validation failure", () => {
			const errorSpy = vi.spyOn(logger, "error")
			const invalidConfig = { ...mockConfig, command: "" }
			manager.validateConfig(invalidConfig)
			expect(errorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Invalid agent configuration"),
				undefined,
				expect.objectContaining({ hasCommand: false }),
			)
		})

		it("should show error message to user on validation failure", () => {
			const showErrorSpy = vi.spyOn(vscode.window, "showErrorMessage")
			const invalidConfig = { ...mockConfig, command: "" }
			manager.validateConfig(invalidConfig)
			expect(showErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Missing required fields"))
		})
	})

	describe("startAgent with invalid config", () => {
		it("should throw error for invalid config", async () => {
			const invalidConfig = { ...mockConfig, command: "" }
			await expect(manager.startAgent(invalidConfig)).rejects.toThrow("Invalid configuration for agent")
		})
	})

	describe("getSpawnOptions", () => {
		it("should return shell:true for Windows", () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, "platform", { value: "win32", configurable: true })

			const options = getSpawnOptions(mockConfig)
			expect(options.shell).toBe(true)
			expect(options.env).toEqual(expect.objectContaining(mockConfig.env))

			Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
		})

		it("should return login shell for macOS", () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, "platform", { value: "darwin", configurable: true })

			const options = getSpawnOptions(mockConfig)
			expect(typeof options.shell).toBe("string")
			expect(options.env).toEqual(expect.objectContaining(mockConfig.env))

			Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
		})

		it("should fallback to /bin/bash when SHELL not set", () => {
			const originalPlatform = process.platform
			const originalShell = process.env.SHELL
			Object.defineProperty(process, "platform", { value: "linux", configurable: true })
			delete process.env.SHELL

			const options = getSpawnOptions(mockConfig)
			expect(options.shell).toBe("/bin/bash")

			Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
			process.env.SHELL = originalShell
		})
	})
})
