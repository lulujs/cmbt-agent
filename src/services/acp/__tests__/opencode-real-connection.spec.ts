// cmbt-agent_change - new file
/**
 * Real connection test for OpenCode (requires opencode installed)
 * Run with: cd src && pnpm test services/acp/__tests__/opencode-real-connection.spec.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { AgentManager } from "../AgentManager"
import { ConnectionManager } from "../ConnectionManager"
import { AcpLogger, AcpLogLevel } from "../AcpLogger"

describe("OpenCode Real Connection Test", () => {
	let agentManager: AgentManager
	let connectionManager: ConnectionManager
	let logger: AcpLogger
	const agentId = "opencode-test"

	beforeAll(() => {
		logger = new AcpLogger(AcpLogLevel.INFO)
		agentManager = new AgentManager(logger)
		connectionManager = new ConnectionManager(logger)
	})

	afterAll(async () => {
		await agentManager.disposeAll()
		connectionManager.dispose()
	})

	it("should connect to opencode and get agent info", async () => {
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

		console.log("Creating connection...")
		const connection = await connectionManager.createConnection(agentProcess.process, agentId, () => ({
			requestPermission: async () => ({ outcome: "denied" as const }),
			sessionUpdate: async () => {},
		}))
		expect(connection).toBeDefined()

		console.log("Initializing connection...")
		const initResult = await connectionManager.initialize(connection)

		console.log("Agent info:", initResult.agentInfo)
		console.log("Agent capabilities:", initResult.agentCapabilities)

		expect(initResult.agentInfo.name).toBeDefined()
		expect(initResult.agentInfo.version).toBeDefined()

		// Cleanup
		await connectionManager.closeConnection(agentId)
		await agentManager.stopAgent(agentId)
	}, 30000)
})
