// cmbt-agent_change - new file
import { PermissionHandler } from "../PermissionHandler"
import { AcpLogger, AcpLogLevel } from "../../../services/acp/AcpLogger"
import * as vscode from "vscode"

vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			dispose: vi.fn(),
		})),
	},
}))

describe("PermissionHandler", () => {
	let handler: PermissionHandler
	let logger: AcpLogger

	beforeEach(() => {
		vi.clearAllMocks()
		logger = new AcpLogger(AcpLogLevel.ERROR)
		handler = new PermissionHandler(logger)
	})

	afterEach(() => {
		logger.dispose()
	})

	const defaultParams = {
		operation: "fs.write",
		resource: "/workspace/file.txt",
		description: "Write to file",
	}

	describe("handlePermissionRequest", () => {
		it("should return allowed=true when user clicks Allow", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Allow" as any)

			const result = await handler.handlePermissionRequest(defaultParams)

			expect(result.allowed).toBe(true)
			expect(result.remember).toBe(false)
		})

		it("should return allowed=true and remember=true when user clicks Allow and Remember", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Allow and Remember" as any)

			const result = await handler.handlePermissionRequest(defaultParams)

			expect(result.allowed).toBe(true)
			expect(result.remember).toBe(true)
		})

		it("should return allowed=false when user clicks Deny", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Deny" as any)

			const result = await handler.handlePermissionRequest(defaultParams)

			expect(result.allowed).toBe(false)
			expect(result.remember).toBe(false)
		})

		it("should return allowed=false when user dismisses dialog", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as any)

			const result = await handler.handlePermissionRequest(defaultParams)

			expect(result.allowed).toBe(false)
			expect(result.remember).toBe(false)
		})

		it("should cache decision when remember is true", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Allow and Remember" as any)

			await handler.handlePermissionRequest(defaultParams)

			const cached = handler.checkCachedDecision(defaultParams.operation, defaultParams.resource)
			expect(cached).toBeDefined()
			expect(cached!.allowed).toBe(true)
		})

		it("should use cached decision on subsequent requests", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Allow and Remember" as any)

			await handler.handlePermissionRequest(defaultParams)
			vi.mocked(vscode.window.showInformationMessage).mockClear()

			const result = await handler.handlePermissionRequest(defaultParams)

			expect(result.allowed).toBe(true)
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
		})

		it("should not cache decision when remember is false", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Allow" as any)

			await handler.handlePermissionRequest(defaultParams)

			const cached = handler.checkCachedDecision(defaultParams.operation, defaultParams.resource)
			expect(cached).toBeUndefined()
		})
	})

	describe("checkCachedDecision", () => {
		it("should return undefined when no cached decision", () => {
			expect(handler.checkCachedDecision("op", "res")).toBeUndefined()
		})
	})

	describe("clearCachedDecisions", () => {
		it("should clear all cached decisions", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Allow and Remember" as any)

			await handler.handlePermissionRequest(defaultParams)
			handler.clearCachedDecisions()

			expect(handler.checkCachedDecision(defaultParams.operation, defaultParams.resource)).toBeUndefined()
		})
	})
})
