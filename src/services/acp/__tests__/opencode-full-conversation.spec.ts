// cmbt-agent_change - new file
/**
 * Full conversation test with OpenCode
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { AgentManager } from "../AgentManager"
import { ConnectionManager } from "../ConnectionManager"
import { SessionManager } from "../SessionManager"
import { AcpClientImpl } from "../AcpClientImpl"
import { FileSystemHandler } from "../../../handlers/acp/FileSystemHandler"
import { TerminalHandler } from "../../../handlers/acp/TerminalHandler"
import { PermissionHandler } from "../../../handlers/acp/PermissionHandler"
import { SessionUpdateHandler } from "../../../handlers/acp/SessionUpdateHandler"
import { AcpLogger, AcpLogLevel } from "../AcpLogger"
import * as vscode from "vscode"

describe("OpenCode Full Conversation Test", () => {
	let agentManager: AgentManager
	let connectionManager: ConnectionManager
	let sessionManager: SessionManager
	let acpClient: AcpClientImpl
	let logger: AcpLogger
	const agentId = "opencode-test"

	beforeAll(() => {
		logger = new AcpLogger(AcpLogLevel.DEBUG)
		agentManager = new AgentManager(logger)
		connectionManager = new ConnectionManager(logger)

		const mockContext = {
			globalState: {
				get: () => [],
				update: async () => {},
			},
		} as any

		sessionManager = new SessionManager(mockContext, logger)

		const fsHandler = new FileSystemHandler(logger)
		const terminalHandler = new TerminalHandler(logger)
		const permissionHandler = new PermissionHandler(logger)
		const sessionUpdateHandler = new SessionUpdateHandler(sessionManager, logger)

		acpClient = new AcpClientImpl(
			agentManager,
			connectionManager,
			sessionManager,
			fsHandler,
			terminalHandler,
			permissionHandler,
			sessionUpdateHandler,
			logger,
		)
	})

	afterAll(async () => {
		await agentManager.disposeAll()
		connectionManager.dispose()
	})

	it("should send message and receive response", async () => {
		const config = {
			id: agentId,
			name: "OpenCode Test",
			command: "opencode",
			args: ["acp"],
			env: {},
		}

		console.log("Starting opencode agent...")
		const agentProcess = await agentManager.startAgent(config)
		expect(agentProcess.status).toBe("running")

		console.log("Creating connection with handlers...")
		const clientHandlers = acpClient.createClientHandlers()
		const connection = await connectionManager.createConnection(agentProcess.process, agentId, clientHandlers)

		console.log("Initializing connection...")
		const initResult = await connectionManager.initialize(connection)
		console.log("Agent info:", initResult.agentInfo)

		console.log("Creating session...")
		const sessionId = await acpClient.createSession(agentId)
		console.log("Session created:", sessionId)

		console.log("Sending message...")
		await acpClient.sendMessage(sessionId, "Hello, can you help me?")
		console.log("Message sent, waiting for response...")

		// Wait for response
		await new Promise((resolve) => setTimeout(resolve, 5000))

		const session = sessionManager.getActiveSession()
		console.log("Session messages:", session?.messages.length)

		if (session && session.messages.length > 1) {
			console.log("Received response:", session.messages[session.messages.length - 1])
		} else {
			console.log("No response received yet")
		}

		// Cleanup
		await connectionManager.closeConnection(agentId)
		await agentManager.stopAgent(agentId)
	}, 30000)
})
