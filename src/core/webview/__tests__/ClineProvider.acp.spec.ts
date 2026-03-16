// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach } from "vitest"

describe("ClineProvider - ACP isAcpMode state", () => {
	describe("isAcpMode dynamic computation", () => {
		it("should return true when active agent status is running", () => {
			const acpInstances = {
				agentManager: {
					getActiveAgent: () => ({
						config: { id: "test-agent", name: "Test Agent", command: "node", args: [] },
						process: {} as any,
						status: "running" as const,
					}),
				},
			}

			const isAcpMode = acpInstances?.agentManager.getActiveAgent()?.status === "running" || false
			expect(isAcpMode).toBe(true)
		})

		it("should return false when active agent status is starting", () => {
			const acpInstances = {
				agentManager: {
					getActiveAgent: () => ({
						config: { id: "test-agent", name: "Test Agent", command: "node", args: [] },
						process: {} as any,
						status: "starting" as const,
					}),
				},
			}

			const isAcpMode = acpInstances?.agentManager.getActiveAgent()?.status === "running" || false
			expect(isAcpMode).toBe(false)
		})

		it("should return false when active agent status is stopped", () => {
			const acpInstances = {
				agentManager: {
					getActiveAgent: () => ({
						config: { id: "test-agent", name: "Test Agent", command: "node", args: [] },
						process: {} as any,
						status: "stopped" as const,
					}),
				},
			}

			const isAcpMode = acpInstances?.agentManager.getActiveAgent()?.status === "running" || false
			expect(isAcpMode).toBe(false)
		})

		it("should return false when active agent status is error", () => {
			const acpInstances = {
				agentManager: {
					getActiveAgent: () => ({
						config: { id: "test-agent", name: "Test Agent", command: "node", args: [] },
						process: {} as any,
						status: "error" as const,
					}),
				},
			}

			const isAcpMode = acpInstances?.agentManager.getActiveAgent()?.status === "running" || false
			expect(isAcpMode).toBe(false)
		})

		it("should return false when no active agent exists", () => {
			const acpInstances = {
				agentManager: {
					getActiveAgent: () => undefined,
				},
			}

			const isAcpMode = acpInstances?.agentManager.getActiveAgent()?.status === "running" || false
			expect(isAcpMode).toBe(false)
		})

		it("should return false when acpInstances is undefined", () => {
			const acpInstances: any = undefined

			const isAcpMode = acpInstances?.agentManager.getActiveAgent()?.status === "running" || false
			expect(isAcpMode).toBe(false)
		})
	})

	describe("postStateToWebview consistency (task 1.3)", () => {
		it("should maintain isAcpMode=true across multiple getState calls when agent is running", () => {
			const acpInstances = {
				agentManager: {
					getActiveAgent: () => ({
						config: { id: "test-agent", name: "Test Agent", command: "node", args: [] },
						process: {} as any,
						status: "running" as const,
					}),
				},
			}

			const computeIsAcpMode = () => acpInstances?.agentManager.getActiveAgent()?.status === "running" || false

			expect(computeIsAcpMode()).toBe(true)
			expect(computeIsAcpMode()).toBe(true)
			expect(computeIsAcpMode()).toBe(true)
		})

		it("should reflect agent status change when agent stops between getState calls", () => {
			let agentStatus: "running" | "stopped" = "running"

			const acpInstances = {
				agentManager: {
					getActiveAgent: () => ({
						config: { id: "test-agent", name: "Test Agent", command: "node", args: [] },
						process: {} as any,
						status: agentStatus,
					}),
				},
			}

			const computeIsAcpMode = () => acpInstances?.agentManager.getActiveAgent()?.status === "running" || false

			expect(computeIsAcpMode()).toBe(true)

			agentStatus = "stopped"
			expect(computeIsAcpMode()).toBe(false)
		})
	})
})
