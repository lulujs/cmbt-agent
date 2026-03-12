// cmbt-agent_change - new file
/**
 * Unit tests for PermissionManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import * as vscode from "vscode"
import { PermissionManager } from "./PermissionManager"
import { PermissionRequest, DetailedPermissionConfig } from "../types"

// Mock VSCode API
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(() => ({})),
			update: vi.fn(),
		})),
	},
	window: {
		showWarningMessage: vi.fn(),
	},
	ConfigurationTarget: {
		Global: 1,
	},
}))

describe("PermissionManager", () => {
	let permissionManager: PermissionManager
	let mockConfig: any
	let mockShowWarningMessage: any

	beforeEach(() => {
		mockConfig = {
			get: vi.fn(() => ({})),
			update: vi.fn(),
		}
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig)

		mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage)
		mockShowWarningMessage.mockResolvedValue("允许")

		permissionManager = new PermissionManager()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("getPermissions", () => {
		it("should return default permissions for new agent", () => {
			const permissions = permissionManager.getPermissions("test-agent")

			expect(permissions).toEqual({
				agentId: "test-agent",
				permissions: {
					files: {
						read: [],
						write: [],
						execute: [],
					},
					network: {
						allowedHosts: [],
						blockedHosts: [],
					},
					system: {
						shellAccess: false,
						environmentAccess: false,
					},
				},
				auditLog: [],
			})
		})

		it("should return existing permissions for known agent", async () => {
			const testPermissions: DetailedPermissionConfig = {
				agentId: "test-agent",
				permissions: {
					files: {
						read: ["*.ts"],
						write: [],
						execute: [],
					},
					network: {
						allowedHosts: ["localhost"],
						blockedHosts: [],
					},
					system: {
						shellAccess: false,
						environmentAccess: false,
					},
				},
				auditLog: [],
			}

			await permissionManager.updatePermissions("test-agent", testPermissions)
			const permissions = permissionManager.getPermissions("test-agent")

			expect(permissions.permissions.files.read).toContain("*.ts")
			expect(permissions.permissions.network.allowedHosts).toContain("localhost")
		})
	})

	describe("hasPermission", () => {
		beforeEach(async () => {
			const testPermissions: DetailedPermissionConfig = {
				agentId: "test-agent",
				permissions: {
					files: {
						read: ["*.ts", "/workspace/**"],
						write: ["/workspace/src/**"],
						execute: [],
					},
					network: {
						allowedHosts: ["localhost", "api.example.com"],
						blockedHosts: ["malicious.com"],
					},
					system: {
						shellAccess: true,
						environmentAccess: false,
					},
				},
				auditLog: [],
			}

			await permissionManager.updatePermissions("test-agent", testPermissions)
		})

		it("should check file read permissions correctly", () => {
			expect(permissionManager.hasPermission("test-agent", "test.ts", "file:read")).toBe(true)
			expect(permissionManager.hasPermission("test-agent", "/workspace/file.js", "file:read")).toBe(true)
			expect(permissionManager.hasPermission("test-agent", "/other/file.ts", "file:read")).toBe(false)
		})

		it("should check file write permissions correctly", () => {
			expect(permissionManager.hasPermission("test-agent", "/workspace/src/file.ts", "file:write")).toBe(true)
			expect(permissionManager.hasPermission("test-agent", "/workspace/file.ts", "file:write")).toBe(false)
		})

		it("should check network permissions correctly", () => {
			expect(permissionManager.hasPermission("test-agent", "localhost:8080", "network:connect")).toBe(true)
			expect(permissionManager.hasPermission("test-agent", "api.example.com", "network:connect")).toBe(true)
			expect(permissionManager.hasPermission("test-agent", "malicious.com", "network:connect")).toBe(false)
			expect(permissionManager.hasPermission("test-agent", "unknown.com", "network:connect")).toBe(false)
		})

		it("should check system permissions correctly", () => {
			expect(permissionManager.hasPermission("test-agent", "shell", "system:shell")).toBe(true)
			expect(permissionManager.hasPermission("test-agent", "env", "system:environment")).toBe(false)
		})

		it("should return false for unknown agent", () => {
			expect(permissionManager.hasPermission("unknown-agent", "test.ts", "file:read")).toBe(false)
		})
	})

	describe("requestPermission", () => {
		it("should return true if permission already granted", async () => {
			// Grant permission first
			await permissionManager.updatePermissions("test-agent", {
				permissions: {
					files: {
						read: ["test.ts"],
						write: [],
						execute: [],
					},
				},
			} as any)

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			const result = await permissionManager.requestPermission("test-agent", request)
			expect(result).toBe(true)
			expect(mockShowWarningMessage).not.toHaveBeenCalled()
		})

		it("should show dialog and grant permission when user allows", async () => {
			mockShowWarningMessage.mockResolvedValue("允许")

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			const result = await permissionManager.requestPermission("test-agent", request)
			expect(result).toBe(true)
			expect(mockShowWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining('智能体 "test-agent" 请求 文件读取 权限'),
				{ modal: true },
				"允许",
				"拒绝",
				"总是允许",
			)
		})

		it("should deny permission when user refuses", async () => {
			mockShowWarningMessage.mockResolvedValue("拒绝")

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			const result = await permissionManager.requestPermission("test-agent", request)
			expect(result).toBe(false)
		})

		it('should grant permanent permission when user selects "总是允许"', async () => {
			mockShowWarningMessage.mockResolvedValue("总是允许")

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			const result = await permissionManager.requestPermission("test-agent", request)
			expect(result).toBe(true)

			// Check that permission was permanently granted
			expect(permissionManager.hasPermission("test-agent", "test.ts", "file:read")).toBe(true)
		})
	})

	describe("updatePermissions", () => {
		it("should update permissions and save to settings", async () => {
			const newPermissions: Partial<DetailedPermissionConfig> = {
				permissions: {
					files: {
						read: ["*.ts"],
						write: ["src/**"],
						execute: [],
					},
					network: {
						allowedHosts: ["localhost"],
						blockedHosts: [],
					},
					system: {
						shellAccess: true,
						environmentAccess: false,
					},
				},
			}

			await permissionManager.updatePermissions("test-agent", newPermissions)

			const permissions = permissionManager.getPermissions("test-agent")
			expect(permissions.permissions.files.read).toEqual(["*.ts"])
			expect(permissions.permissions.files.write).toEqual(["src/**"])
			expect(permissions.permissions.system.shellAccess).toBe(true)
			expect(mockConfig.update).toHaveBeenCalledWith("permissions", expect.any(Object), 1)
		})
	})

	describe("audit logging", () => {
		it("should log permission requests", async () => {
			mockShowWarningMessage.mockResolvedValue("允许")

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			await permissionManager.requestPermission("test-agent", request)

			const auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog).toHaveLength(1)
			expect(auditLog[0]).toMatchObject({
				agentId: "test-agent",
				action: "file:read",
				resource: "test.ts",
				granted: true,
				reason: "用户授权",
			})
		})

		it("should get audit log for specific agent", async () => {
			mockShowWarningMessage.mockResolvedValue("允许")

			// Create requests for different agents
			await permissionManager.requestPermission("agent1", {
				agentId: "agent1",
				resource: "file1.ts",
				action: "file:read",
				timestamp: new Date(),
			})

			await permissionManager.requestPermission("agent2", {
				agentId: "agent2",
				resource: "file2.ts",
				action: "file:read",
				timestamp: new Date(),
			})

			const agent1Log = permissionManager.getAuditLog("agent1")
			const agent2Log = permissionManager.getAuditLog("agent2")
			const allLog = permissionManager.getAuditLog()

			expect(agent1Log).toHaveLength(1)
			expect(agent2Log).toHaveLength(1)
			expect(allLog).toHaveLength(2)
			expect(agent1Log[0].agentId).toBe("agent1")
			expect(agent2Log[0].agentId).toBe("agent2")
		})

		it("should clear audit log", async () => {
			mockShowWarningMessage.mockResolvedValue("允许")

			await permissionManager.requestPermission("test-agent", {
				agentId: "test-agent",
				resource: "test.ts",
				action: "file:read",
				timestamp: new Date(),
			})

			expect(permissionManager.getAuditLog()).toHaveLength(1)

			permissionManager.clearAuditLog()
			expect(permissionManager.getAuditLog()).toHaveLength(0)
		})
	})

	describe("removeAgent", () => {
		it("should remove agent permissions and audit log", async () => {
			await permissionManager.updatePermissions("test-agent", {
				permissions: {
					files: { read: ["*.ts"], write: [], execute: [] },
				},
			} as any)

			mockShowWarningMessage.mockResolvedValue("允许")
			await permissionManager.requestPermission("test-agent", {
				agentId: "test-agent",
				resource: "test.ts",
				action: "file:read",
				timestamp: new Date(),
			})

			expect(permissionManager.getAuditLog("test-agent")).toHaveLength(2) // updatePermissions + requestPermission

			await permissionManager.removeAgent("test-agent")

			const permissions = permissionManager.getPermissions("test-agent")
			expect(permissions.permissions.files.read).toEqual([]) // Should be default
			expect(permissionManager.getAuditLog("test-agent")).toHaveLength(0)
		})
	})
})
