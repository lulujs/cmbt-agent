// cmbt-agent_change - new file
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import * as vscode from "vscode"
import { PermissionManager } from "./PermissionManager"
import { ACPAgentConfig, PermissionRequest } from "../types"

// Mock VSCode
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" },
			},
		],
	},
	window: {
		showWarningMessage: vi.fn(),
	},
}))

describe("PermissionManager", () => {
	let permissionManager: PermissionManager
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		// Create mock extension context
		mockContext = {
			globalState: {
				get: vi.fn().mockReturnValue({}),
				update: vi.fn().mockResolvedValue(undefined),
			},
			secrets: {
				get: vi.fn(),
				store: vi.fn(),
				delete: vi.fn(),
			},
		} as any

		permissionManager = new PermissionManager(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
		permissionManager.dispose()
	})

	describe("initializeAgentPermissions", () => {
		it("should initialize permissions for a new agent", async () => {
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				displayName: "Test Agent",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "read",
					networkAccess: true,
					shellAccess: false,
				},
				settings: {
					autoConnect: false,
					idleTimeout: 300000,
					retryAttempts: 3,
					retryDelay: 1000,
				},
				metadata: {
					version: "1.0.0",
					capabilities: [],
					created: new Date(),
				},
			}

			await permissionManager.initializeAgentPermissions(agentConfig)

			const permissions = permissionManager.getPermissions("test-agent")
			expect(permissions).toBeDefined()
			expect(permissions?.agentId).toBe("test-agent")
			expect(permissions?.permissions.network.allowedHosts).toContain("*")
			expect(permissions?.permissions.system.shellAccess).toBe(false)
		})

		it("should set appropriate file patterns based on file access level", async () => {
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				displayName: "Test Agent",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "write",
					networkAccess: false,
					shellAccess: false,
				},
				settings: {
					autoConnect: false,
					idleTimeout: 300000,
					retryAttempts: 3,
					retryDelay: 1000,
				},
				metadata: {
					version: "1.0.0",
					capabilities: [],
					created: new Date(),
				},
			}

			await permissionManager.initializeAgentPermissions(agentConfig)

			const permissions = permissionManager.getPermissions("test-agent")
			expect(permissions?.permissions.files.read.length).toBeGreaterThan(0)
			expect(permissions?.permissions.files.write.length).toBeGreaterThan(0)
			expect(permissions?.permissions.network.allowedHosts).toEqual([])
		})
	})

	describe("checkPermission", () => {
		beforeEach(async () => {
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				displayName: "Test Agent",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "read",
					networkAccess: true,
					shellAccess: false,
				},
				settings: {
					autoConnect: false,
					idleTimeout: 300000,
					retryAttempts: 3,
					retryDelay: 1000,
				},
				metadata: {
					version: "1.0.0",
					capabilities: [],
					created: new Date(),
				},
			}
			await permissionManager.initializeAgentPermissions(agentConfig)
		})

		it("should allow file read for configured patterns", async () => {
			const hasPermission = await permissionManager.checkPermission(
				"test-agent",
				"/test/workspace/src/test.ts",
				"file:read",
			)
			expect(hasPermission).toBe(true)
		})

		it("should deny file write when not configured", async () => {
			const hasPermission = await permissionManager.checkPermission(
				"test-agent",
				"/test/workspace/src/test.ts",
				"file:write",
			)
			expect(hasPermission).toBe(false)
		})

		it("should allow network access when configured", async () => {
			const hasPermission = await permissionManager.checkPermission("test-agent", "example.com", "network:access")
			expect(hasPermission).toBe(true)
		})

		it("should deny shell access when not configured", async () => {
			const hasPermission = await permissionManager.checkPermission("test-agent", "shell", "system:shell")
			expect(hasPermission).toBe(false)
		})

		it("should deny permission for unknown agent", async () => {
			const hasPermission = await permissionManager.checkPermission(
				"unknown-agent",
				"/test/workspace/src/test.ts",
				"file:read",
			)
			expect(hasPermission).toBe(false)
		})

		it("should log permission checks to audit trail", async () => {
			await permissionManager.checkPermission("test-agent", "/test/workspace/src/test.ts", "file:read")

			const auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog.length).toBeGreaterThan(0)
			expect(auditLog[auditLog.length - 1].action).toBe("file:read")
			expect(auditLog[auditLog.length - 1].granted).toBe(true)
		})
	})

	describe("requestPermission", () => {
		beforeEach(async () => {
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				displayName: "Test Agent",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "none",
					networkAccess: false,
					shellAccess: false,
				},
				settings: {
					autoConnect: false,
					idleTimeout: 300000,
					retryAttempts: 3,
					retryDelay: 1000,
				},
				metadata: {
					version: "1.0.0",
					capabilities: [],
					created: new Date(),
				},
			}
			await permissionManager.initializeAgentPermissions(agentConfig)
		})

		it("should return true if permission already granted", async () => {
			// First grant permission by updating config
			await permissionManager.updatePermissions("test-agent", {
				files: {
					read: ["/test/workspace/**/*.ts"],
					write: [],
					execute: [],
				},
			})

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "/test/workspace/src/test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			const granted = await permissionManager.requestPermission(request)
			expect(granted).toBe(true)
		})

		it("should show user dialog when permission not granted", async () => {
			const mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage)
			mockShowWarningMessage.mockResolvedValue("允许 (Allow)")

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "/test/workspace/src/test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			const granted = await permissionManager.requestPermission(request)
			expect(granted).toBe(true)
			expect(mockShowWarningMessage).toHaveBeenCalled()
		})

		it("should deny permission when user selects deny", async () => {
			const mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage)
			mockShowWarningMessage.mockResolvedValue("拒绝 (Deny)")

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "/test/workspace/src/test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			const granted = await permissionManager.requestPermission(request)
			expect(granted).toBe(false)
		})

		it("should permanently grant permission when user selects always allow", async () => {
			const mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage)
			mockShowWarningMessage.mockResolvedValue("总是允许 (Always Allow)")

			const request: PermissionRequest = {
				agentId: "test-agent",
				resource: "/test/workspace/src/test.ts",
				action: "file:read",
				timestamp: new Date(),
			}

			const granted = await permissionManager.requestPermission(request)
			expect(granted).toBe(true)

			// Check that permission was permanently granted
			const hasPermission = await permissionManager.checkPermission(
				"test-agent",
				"/test/workspace/src/test.ts",
				"file:read",
			)
			expect(hasPermission).toBe(true)
		})
	})

	describe("updatePermissions", () => {
		beforeEach(async () => {
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				displayName: "Test Agent",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "none",
					networkAccess: false,
					shellAccess: false,
				},
				settings: {
					autoConnect: false,
					idleTimeout: 300000,
					retryAttempts: 3,
					retryDelay: 1000,
				},
				metadata: {
					version: "1.0.0",
					capabilities: [],
					created: new Date(),
				},
			}
			await permissionManager.initializeAgentPermissions(agentConfig)
		})

		it("should update file permissions", async () => {
			await permissionManager.updatePermissions("test-agent", {
				files: {
					read: ["/test/workspace/**/*.ts"],
					write: ["/test/workspace/**/*.js"],
					execute: [],
				},
			})

			const permissions = permissionManager.getPermissions("test-agent")
			expect(permissions?.permissions.files.read).toContain("/test/workspace/**/*.ts")
			expect(permissions?.permissions.files.write).toContain("/test/workspace/**/*.js")
		})

		it("should update network permissions", async () => {
			await permissionManager.updatePermissions("test-agent", {
				network: {
					allowedHosts: ["example.com", "*.github.com"],
					blockedHosts: ["malicious.com"],
				},
			})

			const permissions = permissionManager.getPermissions("test-agent")
			expect(permissions?.permissions.network.allowedHosts).toContain("example.com")
			expect(permissions?.permissions.network.blockedHosts).toContain("malicious.com")
		})

		it("should update system permissions", async () => {
			await permissionManager.updatePermissions("test-agent", {
				system: {
					shellAccess: true,
					environmentAccess: true,
				},
			})

			const permissions = permissionManager.getPermissions("test-agent")
			expect(permissions?.permissions.system.shellAccess).toBe(true)
			expect(permissions?.permissions.system.environmentAccess).toBe(true)
		})

		it("should throw error for unknown agent", async () => {
			await expect(
				permissionManager.updatePermissions("unknown-agent", {
					files: { read: [], write: [], execute: [] },
				}),
			).rejects.toThrow("未找到智能体配置")
		})
	})

	describe("audit logging", () => {
		beforeEach(async () => {
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				displayName: "Test Agent",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "read",
					networkAccess: true,
					shellAccess: false,
				},
				settings: {
					autoConnect: false,
					idleTimeout: 300000,
					retryAttempts: 3,
					retryDelay: 1000,
				},
				metadata: {
					version: "1.0.0",
					capabilities: [],
					created: new Date(),
				},
			}
			await permissionManager.initializeAgentPermissions(agentConfig)
		})

		it("should log permission checks", async () => {
			await permissionManager.checkPermission("test-agent", "/test/file.ts", "file:read")

			const auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog.length).toBeGreaterThan(0)

			const lastEntry = auditLog[auditLog.length - 1]
			expect(lastEntry.agentId).toBe("test-agent")
			expect(lastEntry.action).toBe("file:read")
			expect(lastEntry.resource).toBe("/test/file.ts")
		})

		it("should get audit log for specific agent", async () => {
			await permissionManager.checkPermission("test-agent", "/test/file.ts", "file:read")

			const agentLog = permissionManager.getAuditLog("test-agent")
			const allLog = permissionManager.getAuditLog()

			expect(agentLog.length).toBeGreaterThan(0)
			expect(allLog.length).toBeGreaterThanOrEqual(agentLog.length)
			expect(agentLog.every((entry) => entry.agentId === "test-agent")).toBe(true)
		})

		it("should clear audit log", async () => {
			await permissionManager.checkPermission("test-agent", "/test/file.ts", "file:read")

			let auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog.length).toBeGreaterThan(0)

			await permissionManager.clearAuditLog("test-agent")
			auditLog = permissionManager.getAuditLog("test-agent")
			expect(auditLog.length).toBe(0)
		})
	})

	describe("pattern matching", () => {
		beforeEach(async () => {
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				displayName: "Test Agent",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "none",
					networkAccess: false,
					shellAccess: false,
				},
				settings: {
					autoConnect: false,
					idleTimeout: 300000,
					retryAttempts: 3,
					retryDelay: 1000,
				},
				metadata: {
					version: "1.0.0",
					capabilities: [],
					created: new Date(),
				},
			}
			await permissionManager.initializeAgentPermissions(agentConfig)
		})

		it("should match wildcard file patterns", async () => {
			await permissionManager.updatePermissions("test-agent", {
				files: {
					read: ["/test/workspace/**/*.ts"],
					write: [],
					execute: [],
				},
			})

			const hasPermission1 = await permissionManager.checkPermission(
				"test-agent",
				"/test/workspace/src/file.ts",
				"file:read",
			)
			const hasPermission2 = await permissionManager.checkPermission(
				"test-agent",
				"/test/workspace/nested/deep/file.ts",
				"file:read",
			)
			const hasPermission3 = await permissionManager.checkPermission(
				"test-agent",
				"/test/workspace/file.js",
				"file:read",
			)

			expect(hasPermission1).toBe(true)
			expect(hasPermission2).toBe(true)
			expect(hasPermission3).toBe(false)
		})

		it("should match wildcard network patterns", async () => {
			await permissionManager.updatePermissions("test-agent", {
				network: {
					allowedHosts: ["*.example.com"],
					blockedHosts: [],
				},
			})

			const hasPermission1 = await permissionManager.checkPermission(
				"test-agent",
				"api.example.com",
				"network:access",
			)
			const hasPermission2 = await permissionManager.checkPermission(
				"test-agent",
				"example.com",
				"network:access",
			)
			const hasPermission3 = await permissionManager.checkPermission("test-agent", "other.com", "network:access")

			expect(hasPermission1).toBe(true)
			expect(hasPermission2).toBe(true)
			expect(hasPermission3).toBe(false)
		})

		it("should respect blocked hosts", async () => {
			await permissionManager.updatePermissions("test-agent", {
				network: {
					allowedHosts: ["*"],
					blockedHosts: ["malicious.com", "*.blocked.com"],
				},
			})

			const hasPermission1 = await permissionManager.checkPermission("test-agent", "safe.com", "network:access")
			const hasPermission2 = await permissionManager.checkPermission(
				"test-agent",
				"malicious.com",
				"network:access",
			)
			const hasPermission3 = await permissionManager.checkPermission(
				"test-agent",
				"api.blocked.com",
				"network:access",
			)

			expect(hasPermission1).toBe(true)
			expect(hasPermission2).toBe(false)
			expect(hasPermission3).toBe(false)
		})
	})

	describe("removeAgentPermissions", () => {
		beforeEach(async () => {
			const agentConfig: ACPAgentConfig = {
				id: "test-agent",
				name: "Test Agent",
				displayName: "Test Agent",
				endpoint: "ws://localhost:8080",
				transport: "websocket",
				authentication: { type: "none" },
				permissions: {
					fileAccess: "read",
					networkAccess: true,
					shellAccess: false,
				},
				settings: {
					autoConnect: false,
					idleTimeout: 300000,
					retryAttempts: 3,
					retryDelay: 1000,
				},
				metadata: {
					version: "1.0.0",
					capabilities: [],
					created: new Date(),
				},
			}
			await permissionManager.initializeAgentPermissions(agentConfig)
		})

		it("should remove agent permissions", async () => {
			let permissions = permissionManager.getPermissions("test-agent")
			expect(permissions).toBeDefined()

			await permissionManager.removeAgentPermissions("test-agent")

			permissions = permissionManager.getPermissions("test-agent")
			expect(permissions).toBeNull()
		})
	})
})
