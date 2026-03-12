// cmbt-agent_change - new file
/**
 * Unit tests for PermissionManager
 * Tests task 6.2: Permission request handling (user confirmation dialogs and audit logging)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import * as vscode from "vscode"
import { PermissionManager } from "./PermissionManager"
import { PermissionRequest, ACPAgentConfig } from "./types"

// Mock VSCode API
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" },
			},
		],
	},
	ConfigurationTarget: {
		Global: 1,
	},
}))

describe("PermissionManager", () => {
	let permissionManager: PermissionManager
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		// Mock extension context
		mockContext = {
			globalState: {
				get: vi.fn().mockReturnValue({}),
				update: vi.fn().mockResolvedValue(undefined),
			},
		} as any

		permissionManager = new PermissionManager(mockContext)
		vi.clearAllMocks()
	})

	afterEach(() => {
		permissionManager.dispose()
	})

	describe("Task 6.2: Permission request handling", () => {
		it("should show user confirmation dialog for permission requests", async () => {
			// Arrange
			const request: PermissionRequest = {
				agentId: "test-agent",
				action: "file:read",
				resource: "/test/file.ts",
			}

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("允许 (Allow)")

			// Act
			const result = await permissionManager.requestPermission(request)

			// Assert
			expect(result).toBe(true)
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining('智能体 "test-agent" 请求 文件读取 权限访问资源'),
				{ modal: true },
				"允许 (Allow)",
				"拒绝 (Deny)",
				"总是允许 (Always Allow)",
			)
		})

		it("should handle user denial of permission requests", async () => {
			// Arrange
			const request: PermissionRequest = {
				agentId: "test-agent",
				action: "file:write",
				resource: "/test/file.ts",
			}

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("拒绝 (Deny)")

			// Act
			const result = await permissionManager.requestPermission(request)

			// Assert
			expect(result).toBe(false)
		})

		it("should handle permanent permission grants", async () => {
			// Arrange
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				endpoint: "http://localhost:3000",
				transport: "http",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "read",
					networkAccess: false,
					shellAccess: false,
				},
			}

			await permissionManager.initializeAgentPermissions(agentConfig)

			const request: PermissionRequest = {
				agentId: "test-agent",
				action: "file:read",
				resource: "/test/file.ts",
			}

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("总是允许 (Always Allow)")

			// Act
			const result = await permissionManager.requestPermission(request)

			// Assert
			expect(result).toBe(true)

			// Verify permission was permanently granted
			const hasPermission = await permissionManager.checkPermission("test-agent", "/test/file.ts", "file:read")
			expect(hasPermission).toBe(true)
		})

		it("should log permission requests to audit trail", async () => {
			// Arrange
			const request: PermissionRequest = {
				agentId: "test-agent",
				action: "network:access",
				resource: "api.example.com",
			}

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("允许 (Allow)")

			// Act
			await permissionManager.requestPermission(request)

			// Assert
			const auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog).toHaveLength(1)
			expect(auditLog[0]).toMatchObject({
				agentId: "test-agent",
				action: "network:access",
				resource: "api.example.com",
				granted: true,
				reason: "用户授权",
			})
		})

		it("should log permission denials to audit trail", async () => {
			// Arrange
			const request: PermissionRequest = {
				agentId: "test-agent",
				action: "system:shell",
				resource: "shell",
			}

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("拒绝 (Deny)")

			// Act
			await permissionManager.requestPermission(request)

			// Assert
			const auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog).toHaveLength(1)
			expect(auditLog[0]).toMatchObject({
				agentId: "test-agent",
				action: "system:shell",
				resource: "shell",
				granted: false,
				reason: "用户拒绝",
			})
		})

		it("should return true for already granted permissions without showing dialog", async () => {
			// Arrange
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				endpoint: "http://localhost:3000",
				transport: "http",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "read",
					networkAccess: false,
					shellAccess: false,
				},
			}

			await permissionManager.initializeAgentPermissions(agentConfig)

			const request: PermissionRequest = {
				agentId: "test-agent",
				action: "file:read",
				resource: "/test/workspace/test.ts", // Should match default read patterns
			}

			// Act
			const result = await permissionManager.requestPermission(request)

			// Assert
			expect(result).toBe(true)
			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled()
		})

		it("should handle errors during permission requests", async () => {
			// Arrange
			const request: PermissionRequest = {
				agentId: "test-agent",
				action: "file:read",
				resource: "/test/file.ts",
			}

			vi.mocked(vscode.window.showWarningMessage).mockRejectedValue(new Error("Dialog error"))

			// Act & Assert
			await expect(permissionManager.requestPermission(request)).rejects.toThrow("权限请求失败")

			// Verify error was logged
			const auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog).toHaveLength(1)
			expect(auditLog[0].granted).toBe(false)
			expect(auditLog[0].reason).toContain("权限请求错误")
		})
	})

	describe("Audit log management", () => {
		it("should retrieve audit logs for specific agents", async () => {
			// Arrange
			const request1: PermissionRequest = {
				agentId: "agent-1",
				action: "file:read",
				resource: "/test/file1.ts",
			}
			const request2: PermissionRequest = {
				agentId: "agent-2",
				action: "file:write",
				resource: "/test/file2.ts",
			}

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("允许 (Allow)")

			// Act
			await permissionManager.requestPermission(request1)
			await permissionManager.requestPermission(request2)

			// Assert
			const agent1Log = permissionManager.getAuditLog("agent-1")
			const agent2Log = permissionManager.getAuditLog("agent-2")
			const allLogs = permissionManager.getAuditLog()

			expect(agent1Log).toHaveLength(1)
			expect(agent2Log).toHaveLength(1)
			expect(allLogs).toHaveLength(2)
			expect(agent1Log[0].agentId).toBe("agent-1")
			expect(agent2Log[0].agentId).toBe("agent-2")
		})

		it("should clear audit logs", async () => {
			// Arrange
			const request: PermissionRequest = {
				agentId: "test-agent",
				action: "file:read",
				resource: "/test/file.ts",
			}

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("允许 (Allow)")
			await permissionManager.requestPermission(request)

			// Act
			await permissionManager.clearAuditLog("test-agent")

			// Assert
			const auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog).toHaveLength(0)
		})
	})
})
