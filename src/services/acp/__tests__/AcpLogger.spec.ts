import { AcpLogger, AcpLogLevel } from "../AcpLogger"

// Mock vscode
const mockAppendLine = vi.fn()
const mockDispose = vi.fn()

vi.mock("vscode", () => ({
	window: {
		createOutputChannel: vi.fn(() => ({
			appendLine: mockAppendLine,
			dispose: mockDispose,
		})),
	},
}))

describe("AcpLogger", () => {
	let logger: AcpLogger

	beforeEach(() => {
		vi.clearAllMocks()
		logger = new AcpLogger(AcpLogLevel.TRACE)
	})

	afterEach(() => {
		logger.dispose()
	})

	describe("log level filtering", () => {
		it("should log messages at or above the configured level", () => {
			logger.setLevel(AcpLogLevel.WARN)

			logger.error("error msg")
			logger.warn("warn msg")
			logger.info("info msg")

			expect(mockAppendLine).toHaveBeenCalledTimes(2)
			expect(mockAppendLine).toHaveBeenCalledWith(expect.stringContaining("error msg"))
			expect(mockAppendLine).toHaveBeenCalledWith(expect.stringContaining("warn msg"))
		})

		it("should not log messages below the configured level", () => {
			logger.setLevel(AcpLogLevel.ERROR)

			logger.warn("warn msg")
			logger.info("info msg")
			logger.debug("debug msg")
			logger.trace("send", "trace msg")

			expect(mockAppendLine).not.toHaveBeenCalled()
		})

		it("should log all levels when set to TRACE", () => {
			logger.setLevel(AcpLogLevel.TRACE)

			logger.error("e")
			logger.warn("w")
			logger.info("i")
			logger.debug("d")
			logger.trace("send", "t")

			expect(mockAppendLine).toHaveBeenCalledTimes(5)
		})
	})

	describe("error", () => {
		it("should log error message with Error object", () => {
			const err = new Error("something broke")
			logger.error("operation failed", err)

			expect(mockAppendLine).toHaveBeenCalledTimes(1)
			const output = mockAppendLine.mock.calls[0][0] as string
			expect(output).toContain("[ERROR]")
			expect(output).toContain("operation failed")
			expect(output).toContain("something broke")
		})

		it("should log error message with context", () => {
			logger.error("fail", undefined, { agentId: "test-agent" })

			const output = mockAppendLine.mock.calls[0][0] as string
			expect(output).toContain("[ERROR]")
			expect(output).toContain("fail")
			expect(output).toContain("test-agent")
		})
	})

	describe("warn", () => {
		it("should log warn message with context", () => {
			logger.warn("caution", { detail: "something" })

			const output = mockAppendLine.mock.calls[0][0] as string
			expect(output).toContain("[WARN]")
			expect(output).toContain("caution")
			expect(output).toContain("something")
		})
	})

	describe("info", () => {
		it("should log info message", () => {
			logger.info("connected")

			const output = mockAppendLine.mock.calls[0][0] as string
			expect(output).toContain("[INFO]")
			expect(output).toContain("connected")
		})
	})

	describe("debug", () => {
		it("should log debug message", () => {
			logger.debug("internal state", { key: "val" })

			const output = mockAppendLine.mock.calls[0][0] as string
			expect(output).toContain("[DEBUG]")
			expect(output).toContain("internal state")
			expect(output).toContain("val")
		})
	})

	describe("trace", () => {
		it("should log send direction with >>> arrow", () => {
			logger.trace("send", { method: "initialize" })

			const output = mockAppendLine.mock.calls[0][0] as string
			expect(output).toContain("[TRACE]")
			expect(output).toContain(">>>")
			expect(output).toContain("initialize")
		})

		it("should log receive direction with <<< arrow", () => {
			logger.trace("receive", { result: "ok" })

			const output = mockAppendLine.mock.calls[0][0] as string
			expect(output).toContain("[TRACE]")
			expect(output).toContain("<<<")
			expect(output).toContain("ok")
		})

		it("should handle string messages", () => {
			logger.trace("send", "raw message")

			const output = mockAppendLine.mock.calls[0][0] as string
			expect(output).toContain("raw message")
		})
	})

	describe("dispose", () => {
		it("should dispose the output channel", () => {
			logger.dispose()
			expect(mockDispose).toHaveBeenCalledTimes(1)
		})
	})

	describe("setLevel", () => {
		it("should change the log level dynamically", () => {
			logger.setLevel(AcpLogLevel.ERROR)
			logger.info("should not appear")
			expect(mockAppendLine).not.toHaveBeenCalled()

			logger.setLevel(AcpLogLevel.INFO)
			logger.info("should appear")
			expect(mockAppendLine).toHaveBeenCalledTimes(1)
		})
	})
})
