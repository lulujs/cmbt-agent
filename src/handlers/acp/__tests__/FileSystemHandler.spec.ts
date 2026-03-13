// cmbt-agent_change - new file
import { FileSystemHandler } from "../FileSystemHandler"
import { AcpLogger, AcpLogLevel } from "../../../services/acp/AcpLogger"
import { promises as fs } from "fs"

const mocks = vi.hoisted(() => ({
	workspaceFolders: [
		{
			uri: { fsPath: "/workspace" },
			name: "test-workspace",
			index: 0,
		},
	],
}))

vi.mock("vscode", () => ({
	workspace: {
		get workspaceFolders() {
			return mocks.workspaceFolders
		},
	},
	window: {
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			dispose: vi.fn(),
		})),
	},
}))

vi.mock("fs", () => ({
	promises: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
	},
}))

describe("FileSystemHandler", () => {
	let handler: FileSystemHandler
	let logger: AcpLogger

	beforeEach(() => {
		vi.clearAllMocks()
		logger = new AcpLogger(AcpLogLevel.ERROR)
		handler = new FileSystemHandler(logger)
	})

	afterEach(() => {
		logger.dispose()
	})

	describe("validatePath", () => {
		it("should accept paths within workspace", () => {
			expect(handler.validatePath("/workspace/file.txt")).toBe(true)
			expect(handler.validatePath("/workspace/subdir/file.txt")).toBe(true)
		})

		it("should reject paths outside workspace", () => {
			expect(handler.validatePath("/outside/file.txt")).toBe(false)
			expect(handler.validatePath("/other/path.txt")).toBe(false)
		})

		it("should accept workspace root path", () => {
			expect(handler.validatePath("/workspace")).toBe(true)
		})

		it("should reject path traversal attempts", () => {
			expect(handler.validatePath("/workspace/../etc/passwd")).toBe(false)
		})

		it("should return false when no workspace folders exist", () => {
			mocks.workspaceFolders = [] as any
			expect(handler.validatePath("/workspace/file.txt")).toBe(false)
			mocks.workspaceFolders = [{ uri: { fsPath: "/workspace" }, name: "test-workspace", index: 0 }]
		})
	})

	describe("handleReadFile", () => {
		it("should read file content successfully", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("file content")

			const result = await handler.handleReadFile({ path: "/workspace/test.txt" })

			expect(result.content).toBe("file content")
			expect(fs.readFile).toHaveBeenCalledWith("/workspace/test.txt", "utf-8")
		})

		it("should throw error for path outside workspace", async () => {
			await expect(handler.handleReadFile({ path: "/outside/test.txt" })).rejects.toThrow(
				"Path is outside workspace",
			)
			expect(fs.readFile).not.toHaveBeenCalled()
		})

		it("should throw descriptive error when file does not exist", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT: no such file"))

			await expect(handler.handleReadFile({ path: "/workspace/missing.txt" })).rejects.toThrow(
				"Failed to read file: ENOENT: no such file",
			)
		})
	})

	describe("handleWriteFile", () => {
		it("should write file content successfully", async () => {
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			const result = await handler.handleWriteFile({ path: "/workspace/test.txt", content: "data" })

			expect(result.success).toBe(true)
			expect(fs.writeFile).toHaveBeenCalledWith("/workspace/test.txt", "data", "utf-8")
		})

		it("should throw error for path outside workspace", async () => {
			await expect(handler.handleWriteFile({ path: "/outside/test.txt", content: "data" })).rejects.toThrow(
				"Path is outside workspace",
			)
			expect(fs.writeFile).not.toHaveBeenCalled()
		})

		it("should throw descriptive error on write failure", async () => {
			vi.mocked(fs.writeFile).mockRejectedValue(new Error("EACCES: permission denied"))

			await expect(handler.handleWriteFile({ path: "/workspace/test.txt", content: "data" })).rejects.toThrow(
				"Failed to write file: EACCES: permission denied",
			)
		})
	})
})
