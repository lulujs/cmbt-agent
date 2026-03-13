// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach } from "vitest"
import { AcpResourceManager } from "../AcpResourceManager"
import { IAgentManager } from "../AgentManager"
import { IConnectionManager } from "../ConnectionManager"
import { ISessionManager } from "../SessionManager"
import * as vscode from "vscode"

describe("AcpResourceManager", () => {
	let resourceManager: AcpResourceManager
	let mockSessionManager: ISessionManager
	let mockConnectionManager: IConnectionManager
	let mockAgentManager: IAgentManager

	beforeEach(() => {
		mockSessionManager = {
			getActiveSession: vi.fn(),
			endSession: vi.fn(),
		} as unknown as ISessionManager

		mockConnectionManager = {
			dispose: vi.fn(),
		} as unknown as IConnectionManager

		mockAgentManager = {
			disposeAll: vi.fn(),
		} as unknown as IAgentManager

		resourceManager = new AcpResourceManager(mockSessionManager, mockConnectionManager, mockAgentManager)
	})

	it("should register disposable resources", () => {
		const mockDisposable = { dispose: vi.fn() }
		resourceManager.register(mockDisposable)
		expect(mockDisposable.dispose).not.toHaveBeenCalled()
	})

	it("should dispose all resources in correct order", async () => {
		const callOrder: string[] = []

		vi.mocked(mockSessionManager.getActiveSession).mockReturnValue({
			id: "session-1",
			agentId: "agent-1",
			agentName: "Test Agent",
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			status: "active",
		})

		vi.mocked(mockSessionManager.endSession).mockImplementation(async () => {
			callOrder.push("session")
		})

		vi.mocked(mockConnectionManager.dispose).mockImplementation(() => {
			callOrder.push("connection")
		})

		vi.mocked(mockAgentManager.disposeAll).mockImplementation(async () => {
			callOrder.push("agent")
		})

		const mockDisposable = {
			dispose: vi.fn(() => {
				callOrder.push("other")
			}),
		}
		resourceManager.register(mockDisposable)

		await resourceManager.dispose()

		expect(callOrder).toEqual(["session", "connection", "agent", "other"])
		expect(mockSessionManager.endSession).toHaveBeenCalledWith("session-1")
		expect(mockConnectionManager.dispose).toHaveBeenCalled()
		expect(mockAgentManager.disposeAll).toHaveBeenCalled()
		expect(mockDisposable.dispose).toHaveBeenCalled()
	})

	it("should handle dispose when no active session exists", async () => {
		vi.mocked(mockSessionManager.getActiveSession).mockReturnValue(undefined)

		await resourceManager.dispose()

		expect(mockSessionManager.endSession).not.toHaveBeenCalled()
		expect(mockConnectionManager.dispose).toHaveBeenCalled()
		expect(mockAgentManager.disposeAll).toHaveBeenCalled()
	})

	it("should clear disposables array after dispose", async () => {
		const mockDisposable = { dispose: vi.fn() }
		resourceManager.register(mockDisposable)

		await resourceManager.dispose()
		await resourceManager.dispose()

		expect(mockDisposable.dispose).toHaveBeenCalledTimes(1)
	})

	it("should work without managers", async () => {
		const standaloneManager = new AcpResourceManager()
		const mockDisposable = { dispose: vi.fn() }
		standaloneManager.register(mockDisposable)

		await standaloneManager.dispose()

		expect(mockDisposable.dispose).toHaveBeenCalled()
	})
})
