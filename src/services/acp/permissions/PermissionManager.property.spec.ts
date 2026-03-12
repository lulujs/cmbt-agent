// cmbt-agent_change - new file
/**
 * Property-based tests for PermissionManager
 * Property 8: 权限管理完整性
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import * as fc from "fast-check"
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

describe("PermissionManager Property Tests", () => {
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

	// Generators for test data
	const agentIdArb = fc.stringMatching(/^[a-z0-9-]{3,20}$/)
	const resourceArb = fc.oneof(
		fc.stringMatching(/^\/[a-z0-9\/.-]{1,50}$/), // File paths
		fc.stringMatching(/^[a-z0-9.-]{1,30}(:[0-9]{1,5})?$/), // Network hosts
		fc.constant("shell"),
		fc.constant("environment"),
	)
	const actionArb = fc.oneof(
		fc.constant("file:read"),
		fc.constant("file:write"),
		fc.constant("file:execute"),
		fc.constant("network:connect"),
		fc.constant("system:shell"),
		fc.constant("system:environment"),
	)

	const permissionRequestArb = fc.record({
		agentId: agentIdArb,
		resource: resourceArb,
		action: actionArb,
		timestamp: fc.date(),
	})

	const filePermissionsArb = fc.record({
		read: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
		write: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
		execute: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
	})

	const networkPermissionsArb = fc.record({
		allowedHosts: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
		blockedHosts: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
	})

	const systemPermissionsArb = fc.record({
		shellAccess: fc.boolean(),
		environmentAccess: fc.boolean(),
	})

	const detailedPermissionConfigArb = fc.record({
		agentId: agentIdArb,
		permissions: fc.record({
			files: filePermissionsArb,
			network: networkPermissionsArb,
			system: systemPermissionsArb,
		}),
		auditLog: fc.array(
			fc.record({
				timestamp: fc.date(),
				agentId: agentIdArb,
				action: actionArb,
				resource: resourceArb,
				granted: fc.boolean(),
				reason: fc.option(fc.string({ maxLength: 50 })),
			}),
			{ maxLength: 3 },
		),
	})

	describe("Property 8: 权限管理完整性", () => {
		it("权限请求应该正确验证和记录审计日志", async () => {
			await fc.assert(
				fc.asyncProperty(permissionRequestArb, async (request) => {
					// Mock user always allows for this test
					mockShowWarningMessage.mockResolvedValue("允许")

					const initialAuditCount = permissionManager.getAuditLog(request.agentId).length

					// Request permission
					const granted = await permissionManager.requestPermission(request.agentId, request)

					// Verify permission was granted
					expect(granted).toBe(true)

					// Verify audit log was updated
					const auditLog = permissionManager.getAuditLog(request.agentId)
					expect(auditLog.length).toBeGreaterThan(initialAuditCount)

					// Verify audit entry contains correct information
					const latestEntry = auditLog[auditLog.length - 1]
					expect(latestEntry.agentId).toBe(request.agentId)
					expect(latestEntry.action).toBe(request.action)
					expect(latestEntry.resource).toBe(request.resource)
					expect(latestEntry.granted).toBe(true)
					expect(latestEntry.timestamp).toBeInstanceOf(Date)
				}),
				{ numRuns: 10 },
			)
		})

		it("权限配置更新应该保持一致性", async () => {
			await fc.assert(
				fc.asyncProperty(detailedPermissionConfigArb, async (config) => {
					// Update permissions
					await permissionManager.updatePermissions(config.agentId, config)

					// Retrieve permissions
					const retrieved = permissionManager.getPermissions(config.agentId)

					// Verify configuration consistency
					expect(retrieved.agentId).toBe(config.agentId)
					expect(retrieved.permissions.files.read).toEqual(config.permissions.files.read)
					expect(retrieved.permissions.files.write).toEqual(config.permissions.files.write)
					expect(retrieved.permissions.files.execute).toEqual(config.permissions.files.execute)
					expect(retrieved.permissions.network.allowedHosts).toEqual(config.permissions.network.allowedHosts)
					expect(retrieved.permissions.network.blockedHosts).toEqual(config.permissions.network.blockedHosts)
					expect(retrieved.permissions.system.shellAccess).toBe(config.permissions.system.shellAccess)
					expect(retrieved.permissions.system.environmentAccess).toBe(
						config.permissions.system.environmentAccess,
					)
				}),
				{ numRuns: 10 },
			)
		})

		it("权限检查应该与配置一致", async () => {
			await fc.assert(
				fc.asyncProperty(
					agentIdArb,
					detailedPermissionConfigArb,
					resourceArb,
					actionArb,
					async (agentId, config, resource, action) => {
						// Set up permissions
						const configWithCorrectId = { ...config, agentId }
						await permissionManager.updatePermissions(agentId, configWithCorrectId)

						// Check permission
						const hasPermission = permissionManager.hasPermission(agentId, resource, action)

						// Verify permission check logic
						let expectedPermission = false
						switch (action) {
							case "file:read":
								expectedPermission = config.permissions.files.read.some((pattern) =>
									new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, ".")).test(resource),
								)
								break
							case "file:write":
								expectedPermission = config.permissions.files.write.some((pattern) =>
									new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, ".")).test(resource),
								)
								break
							case "file:execute":
								expectedPermission = config.permissions.files.execute.some((pattern) =>
									new RegExp(pattern.replace(/\*/g, ".*").replace(/\?/g, ".")).test(resource),
								)
								break
							case "network:connect": {
								const isBlocked = config.permissions.network.blockedHosts.some((blocked) =>
									resource.includes(blocked),
								)
								const isAllowed =
									config.permissions.network.allowedHosts.length === 0
										? false
										: config.permissions.network.allowedHosts.some((allowed) =>
												resource.includes(allowed),
											)
								expectedPermission = !isBlocked && isAllowed
								break
							}
							case "system:shell":
								expectedPermission = config.permissions.system.shellAccess
								break
							case "system:environment":
								expectedPermission = config.permissions.system.environmentAccess
								break
						}

						expect(hasPermission).toBe(expectedPermission)
					},
				),
				{ numRuns: 10 },
			)
		})

		it("审计日志应该正确记录所有权限操作", async () => {
			await fc.assert(
				fc.asyncProperty(fc.array(permissionRequestArb, { minLength: 1, maxLength: 5 }), async (requests) => {
					// Mock user responses (mix of allow/deny)
					const responses = requests.map((_, i) => (i % 2 === 0 ? "允许" : "拒绝"))
					mockShowWarningMessage.mockImplementation((_, __, ...options) => {
						const response = responses.shift()
						return Promise.resolve(response)
					})

					const initialAuditCount = permissionManager.getAuditLog().length

					// Process all requests
					const results = []
					for (const request of requests) {
						const result = await permissionManager.requestPermission(request.agentId, request)
						results.push(result)
					}

					// Verify audit log contains all operations
					const finalAuditLog = permissionManager.getAuditLog()
					expect(finalAuditLog.length).toBe(initialAuditCount + requests.length)

					// Verify each request was logged correctly
					const newEntries = finalAuditLog.slice(initialAuditCount)
					for (let i = 0; i < requests.length; i++) {
						const entry = newEntries[i]
						const request = requests[i]
						const expectedGranted = i % 2 === 0 // Based on our mock responses

						expect(entry.agentId).toBe(request.agentId)
						expect(entry.action).toBe(request.action)
						expect(entry.resource).toBe(request.resource)
						expect(entry.granted).toBe(expectedGranted)
						expect(entry.timestamp).toBeInstanceOf(Date)
					}
				}),
				{ numRuns: 5 },
			)
		})

		it("权限拒绝应该不授予访问权限", async () => {
			await fc.assert(
				fc.asyncProperty(permissionRequestArb, async (request) => {
					// Mock user denies permission
					mockShowWarningMessage.mockResolvedValue("拒绝")

					// Ensure agent has no existing permissions
					await permissionManager.removeAgent(request.agentId)

					// Request permission
					const granted = await permissionManager.requestPermission(request.agentId, request)

					// Verify permission was denied
					expect(granted).toBe(false)

					// Verify agent still doesn't have permission
					const hasPermission = permissionManager.hasPermission(
						request.agentId,
						request.resource,
						request.action,
					)
					expect(hasPermission).toBe(false)

					// Verify denial was logged
					const auditLog = permissionManager.getAuditLog(request.agentId)
					const latestEntry = auditLog[auditLog.length - 1]
					expect(latestEntry.granted).toBe(false)
					expect(latestEntry.reason).toContain("拒绝")
				}),
				{ numRuns: 10 },
			)
		})

		it("智能体移除应该清理所有相关数据", async () => {
			await fc.assert(
				fc.asyncProperty(agentIdArb, detailedPermissionConfigArb, async (agentId, config) => {
					// Set up agent with permissions and audit log
					const configWithCorrectId = { ...config, agentId }
					await permissionManager.updatePermissions(agentId, configWithCorrectId)

					// Create some audit entries
					mockShowWarningMessage.mockResolvedValue("允许")
					await permissionManager.requestPermission(agentId, {
						agentId,
						resource: "test.txt",
						action: "file:read",
						timestamp: new Date(),
					})

					// Verify agent has data
					const beforeRemoval = permissionManager.getPermissions(agentId)
					const auditBefore = permissionManager.getAuditLog(agentId)
					expect(auditBefore.length).toBeGreaterThan(0)

					// Remove agent
					await permissionManager.removeAgent(agentId)

					// Verify agent data is cleaned up
					const afterRemoval = permissionManager.getPermissions(agentId)
					const auditAfter = permissionManager.getAuditLog(agentId)

					// Should return default permissions for new agent
					expect(afterRemoval.permissions.files.read).toEqual([])
					expect(afterRemoval.permissions.files.write).toEqual([])
					expect(afterRemoval.permissions.files.execute).toEqual([])
					expect(afterRemoval.permissions.network.allowedHosts).toEqual([])
					expect(afterRemoval.permissions.network.blockedHosts).toEqual([])
					expect(afterRemoval.permissions.system.shellAccess).toBe(false)
					expect(afterRemoval.permissions.system.environmentAccess).toBe(false)

					// Audit log should be empty
					expect(auditAfter).toEqual([])
				}),
				{ numRuns: 10 },
			)
		})
	})
})
