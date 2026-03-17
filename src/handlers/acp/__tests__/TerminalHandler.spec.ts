import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as vscode from "vscode"
import { TerminalHandler } from "../TerminalHandler"
import { AcpLogger, AcpLogLevel } from "../../../services/acp/AcpLogger"

vi.mock("vscode", () => ({
	window: {
		createTerminal: vi.fn(),
		onDidCloseTerminal: vi.fn(),
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			dispose: vi.fn(),
		})),
	},
}))

describe("TerminalHandler", () => {
	let handler: TerminalHandler
	let logger: AcpLogger
	let mockTerminal: any
	let closeTerminalCallback: ((terminal: vscode.Terminal) => void) | undefined

	beforeEach(() => {
		logger = new AcpLogger(AcpLogLevel.DEBUG)

		mockTerminal = {
			dispose: vi.fn(),
			exitStatus: undefined,
		}

		vi.mocked(vscode.window.createTerminal).mockReturnValue(mockTerminal)
		vi.mocked(vscode.window.onDidCloseTerminal).mockImplementation((callback) => {
			closeTerminalCallback = callback
			return { dispose: vi.fn() }
		})

		handler = new TerminalHandler(logger)
	})

	afterEach(() => {
		handler.dispose()
		logger.dispose()
		vi.clearAllMocks()
	})

	describe("handleCreateTerminal", () => {
		it("should create terminal with default name", async () => {
			const result = await handler.handleCreateTerminal({})

			expect(result.terminalId).toBeDefined()
			expect(vscode.window.createTerminal).toHaveBeenCalledWith({
				name: "ACP Terminal",
				cwd: undefined,
			})
		})

		it("should create terminal with custom name and cwd", async () => {
			const result = await handler.handleCreateTerminal({
				name: "Test Terminal",
				cwd: "/test/path",
			})

			expect(result.terminalId).toBeDefined()
			expect(vscode.window.createTerminal).toHaveBeenCalledWith({
				name: "Test Terminal",
				cwd: "/test/path",
			})
		})
	})

	describe("handleGetOutput", () => {
		it("should return empty output for new terminal", async () => {
			const { terminalId } = await handler.handleCreateTerminal({})
			const result = await handler.handleGetOutput({ terminalId })

			expect(result.output).toBe("")
		})

		it("should throw error for non-existent terminal", async () => {
			await expect(handler.handleGetOutput({ terminalId: "invalid" })).rejects.toThrow(
				"Terminal invalid not found",
			)
		})
	})

	describe("handleWaitForExit", () => {
		it("should wait for terminal exit and return exit code", async () => {
			const { terminalId } = await handler.handleCreateTerminal({})

			setTimeout(() => {
				mockTerminal.exitStatus = { code: 0 }
				closeTerminalCallback?.(mockTerminal)
			}, 50)

			const result = await handler.handleWaitForExit({ terminalId })
			expect(result.exitCode).toBe(0)
		})

		it("should throw error for non-existent terminal", async () => {
			await expect(handler.handleWaitForExit({ terminalId: "invalid" })).rejects.toThrow(
				"Terminal invalid not found",
			)
		})
	})

	describe("handleKillTerminal", () => {
		it("should kill terminal", async () => {
			const { terminalId } = await handler.handleCreateTerminal({})
			await handler.handleKillTerminal({ terminalId })

			expect(mockTerminal.dispose).toHaveBeenCalled()
		})

		it("should throw error for non-existent terminal", async () => {
			await expect(handler.handleKillTerminal({ terminalId: "invalid" })).rejects.toThrow(
				"Terminal invalid not found",
			)
		})
	})

	describe("handleDisposeTerminal", () => {
		it("should dispose terminal and remove from map", async () => {
			const { terminalId } = await handler.handleCreateTerminal({})
			await handler.handleDisposeTerminal({ terminalId })

			expect(mockTerminal.dispose).toHaveBeenCalled()
			await expect(handler.handleGetOutput({ terminalId })).rejects.toThrow()
		})

		it("should throw error for non-existent terminal", async () => {
			await expect(handler.handleDisposeTerminal({ terminalId: "invalid" })).rejects.toThrow(
				"Terminal invalid not found",
			)
		})
	})

	describe("dispose", () => {
		it("should dispose all terminals", async () => {
			const { terminalId: id1 } = await handler.handleCreateTerminal({})
			const mockTerminal2 = { dispose: vi.fn(), exitStatus: undefined } as unknown as vscode.Terminal
			vi.mocked(vscode.window.createTerminal).mockReturnValue(mockTerminal2)
			const { terminalId: id2 } = await handler.handleCreateTerminal({})

			handler.dispose()

			expect(mockTerminal.dispose).toHaveBeenCalled()
			expect(mockTerminal2.dispose).toHaveBeenCalled()
		})
	})
})
