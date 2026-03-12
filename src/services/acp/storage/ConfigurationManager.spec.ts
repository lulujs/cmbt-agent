// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import * as fs from "fs/promises"
import { ConfigurationManager } from "./ConfigurationManager"
import { ConfigurationStorage } from "./ConfigurationStorage"
import { ACPAgentConfig, ACPTransportType } from "../types"
import { ACPError } from "../errors"

// Mock VSCode API
vi.mock("vscode", () => ({
	window: {
		showSaveDialog: vi.fn(),
		showOpenDialog: vi.fn(),
		showQuickPick: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	Uri: {
		file: vi.fn(),
	},
}))

// Mock fs/promises
vi.mock("fs/promises")

// Mock ConfigurationStorage
vi.mock("./ConfigurationStorage")

describe("ConfigurationManager", () => {
	let manager: ConfigurationManager
	let mockContext: vscode.ExtensionContext
	let mockStorage: ConfigurationStorage

	const sampleConfig: ACPAgentConfig = {
		id: "test-agent",
		name: "Test Agent",
		endpoint: "ws://localhost:8080",
		transport: "websocket" as ACPTransportType,
		timeout: 30000,
		retryAttempts: 3,
		retryDelay: 1000,
		permissions: {
			fileAccess: { read: true, write: false, execute: false },
			networkAccess: true,
		},
		enabled: true,
	}

	beforeEach(() => {
		mockContext = {
			globalStorageUri: {
				fsPath: "/mock/storage/path",
			},
		} as any

		mockStorage = {
			exportConfigs: vi.fn(),
			importConfigs: vi.fn(),
			loadAllConfigs: vi.fn(),
			saveAgentConfig: vi.fn(),
			deleteAgentConfig: vi.fn(),
			getDefaultConfig: vi.fn(),
		} as any

		vi.mocked(ConfigurationStorage).mockImplementation(() => mockStorage)

		manager = new ConfigurationManager(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("exportToFile", () => {
		it("should export to specified file path", async () => {
			const exportData = JSON.stringify([sampleConfig])
			mockStorage.exportConfigs.mockResolvedValue(exportData)
			vi.mocked(fs.writeFile).mockResolvedValue()

			const result = await manager.exportToFile("/test/export.json")

			expect(mockStorage.exportConfigs).toHaveBeenCalled()
			expect(fs.writeFile).toHaveBeenCalledWith("/test/export.json", exportData, "utf8")
			expect(result).toBe("/test/export.json")
		})

		it("should show save dialog when no file path provided", async () => {
			const exportData = JSON.stringify([sampleConfig])
			mockStorage.exportConfigs.mockResolvedValue(exportData)
			vi.mocked(vscode.window.showSaveDialog).mockResolvedValue({
				fsPath: "/selected/path.json",
			} as any)
			vi.mocked(fs.writeFile).mockResolvedValue()

			const result = await manager.exportToFile()

			expect(vscode.window.showSaveDialog).toHaveBeenCalled()
			expect(fs.writeFile).toHaveBeenCalledWith("/selected/path.json", exportData, "utf8")
			expect(result).toBe("/selected/path.json")
		})

		it("should throw error when user cancels save dialog", async () => {
			mockStorage.exportConfigs.mockResolvedValue("{}")
			vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(undefined)

			await expect(manager.exportToFile()).rejects.toThrow(ACPError)
		})
	})

	describe("importFromFile", () => {
		it("should import from specified file path", async () => {
			const configData = JSON.stringify([sampleConfig])
			vi.mocked(fs.readFile).mockResolvedValue(configData)
			mockStorage.importConfigs.mockResolvedValue()

			await manager.importFromFile("/test/import.json")

			expect(fs.readFile).toHaveBeenCalledWith("/test/import.json", "utf8")
			expect(mockStorage.importConfigs).toHaveBeenCalledWith(configData)
		})

		it("should show open dialog when no file path provided", async () => {
			const configData = JSON.stringify([sampleConfig])
			vi.mocked(vscode.window.showOpenDialog).mockResolvedValue([
				{
					fsPath: "/selected/import.json",
				},
			] as any)
			vi.mocked(fs.readFile).mockResolvedValue(configData)
			mockStorage.importConfigs.mockResolvedValue()

			await manager.importFromFile()

			expect(vscode.window.showOpenDialog).toHaveBeenCalled()
			expect(fs.readFile).toHaveBeenCalledWith("/selected/import.json", "utf8")
		})

		it("should throw error when user cancels open dialog", async () => {
			vi.mocked(vscode.window.showOpenDialog).mockResolvedValue(undefined)

			await expect(manager.importFromFile()).rejects.toThrow(ACPError)
		})
	})

	describe("createBackup", () => {
		it("should create backup with timestamp", async () => {
			const exportData = JSON.stringify([sampleConfig])
			mockStorage.exportConfigs.mockResolvedValue(exportData)
			vi.mocked(fs.mkdir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue()
			vi.mocked(fs.readdir).mockResolvedValue([])

			const backupPath = await manager.createBackup()

			expect(fs.mkdir).toHaveBeenCalledWith("/mock/storage/path/backups", { recursive: true })
			expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining("acp-config-backup-"), exportData, "utf8")
			expect(backupPath).toContain("acp-config-backup-")
		})

		it("should cleanup old backups", async () => {
			mockStorage.exportConfigs.mockResolvedValue("{}")
			vi.mocked(fs.mkdir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue()

			// Mock many backup files
			const oldBackups = Array.from({ length: 15 }, (_, i) => `acp-config-backup-${i}.json`)
			vi.mocked(fs.readdir).mockResolvedValue(oldBackups as any)
			vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date(), size: 100 } as any)
			vi.mocked(fs.unlink).mockResolvedValue()

			await manager.createBackup()

			// Should delete old backups (keep only 10)
			expect(fs.unlink).toHaveBeenCalledTimes(5)
		})
	})

	describe("restoreFromBackup", () => {
		it("should restore from specified backup file", async () => {
			const configData = JSON.stringify([sampleConfig])
			vi.mocked(fs.readFile).mockResolvedValue(configData)
			mockStorage.importConfigs.mockResolvedValue()

			await manager.restoreFromBackup("/backup/file.json")

			expect(fs.readFile).toHaveBeenCalledWith("/backup/file.json", "utf8")
			expect(mockStorage.importConfigs).toHaveBeenCalledWith(configData)
		})

		it("should show backup selection when no file specified", async () => {
			vi.mocked(fs.readdir).mockResolvedValue(["acp-config-backup-1.json"] as any)
			vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date(), size: 100 } as any)
			vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
				detail: "/backup/selected.json",
			} as any)
			vi.mocked(fs.readFile).mockResolvedValue("{}")
			mockStorage.importConfigs.mockResolvedValue()

			await manager.restoreFromBackup()

			expect(vscode.window.showQuickPick).toHaveBeenCalled()
			expect(fs.readFile).toHaveBeenCalledWith("/backup/selected.json", "utf8")
		})
	})

	describe("createTemplate", () => {
		it("should create configuration template", async () => {
			vi.mocked(fs.mkdir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue()

			await manager.createTemplate("test-template", [sampleConfig])

			expect(fs.mkdir).toHaveBeenCalledWith("/mock/storage/path/templates", { recursive: true })
			expect(fs.writeFile).toHaveBeenCalledWith(
				"/mock/storage/path/templates/test-template.json",
				expect.stringContaining("test-template"),
				"utf8",
			)
		})
	})

	describe("applyTemplate", () => {
		it("should apply specified template", async () => {
			const templateData = {
				name: "test-template",
				description: "Test template",
				created: new Date().toISOString(),
				configs: [sampleConfig],
			}
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(templateData))
			mockStorage.saveAgentConfig.mockResolvedValue()

			await manager.applyTemplate("test-template")

			expect(fs.readFile).toHaveBeenCalledWith("/mock/storage/path/templates/test-template.json", "utf8")
			expect(mockStorage.saveAgentConfig).toHaveBeenCalledWith(sampleConfig)
		})

		it("should show template selection when no template specified", async () => {
			vi.mocked(fs.readdir).mockResolvedValue(["template1.json"] as any)
			vi.mocked(fs.readFile)
				.mockResolvedValueOnce(
					JSON.stringify({
						name: "template1",
						description: "Template 1",
						created: new Date().toISOString(),
					}),
				)
				.mockResolvedValueOnce(
					JSON.stringify({
						name: "template1",
						configs: [sampleConfig],
					}),
				)
			vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
				label: "template1",
			} as any)
			mockStorage.saveAgentConfig.mockResolvedValue()

			await manager.applyTemplate()

			expect(vscode.window.showQuickPick).toHaveBeenCalled()
			expect(mockStorage.saveAgentConfig).toHaveBeenCalled()
		})
	})

	describe("resetToDefaults", () => {
		it("should reset to default configurations", async () => {
			mockStorage.loadAllConfigs.mockResolvedValue([sampleConfig])
			mockStorage.deleteAgentConfig.mockResolvedValue()
			mockStorage.getDefaultConfig.mockReturnValue({
				transport: "websocket",
				timeout: 30000,
				retryAttempts: 3,
				retryDelay: 1000,
				permissions: {
					fileAccess: { read: false, write: false, execute: false },
					networkAccess: false,
				},
				enabled: true,
			})
			mockStorage.saveAgentConfig.mockResolvedValue()

			// Mock backup creation
			mockStorage.exportConfigs.mockResolvedValue("{}")
			vi.mocked(fs.mkdir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue()
			vi.mocked(fs.readdir).mockResolvedValue([])

			await manager.resetToDefaults()

			expect(mockStorage.deleteAgentConfig).toHaveBeenCalledWith("test-agent")
			expect(mockStorage.saveAgentConfig).toHaveBeenCalledTimes(2) // 2 default configs
		})
	})

	describe("getConfigurationStats", () => {
		it("should return configuration statistics", async () => {
			const configs = [
				{ ...sampleConfig, enabled: true, transport: "websocket" as ACPTransportType },
				{ ...sampleConfig, id: "agent2", enabled: false, transport: "http" as ACPTransportType },
			]
			mockStorage.loadAllConfigs.mockResolvedValue(configs)

			// Mock backups and templates
			vi.mocked(fs.readdir)
				.mockResolvedValueOnce(["backup1.json", "backup2.json"] as any) // backups
				.mockResolvedValueOnce(["template1.json"] as any) // templates
			vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date(), size: 100 } as any)
			vi.mocked(fs.readFile).mockResolvedValue(
				JSON.stringify({
					name: "template1",
					description: "Test",
					created: new Date().toISOString(),
				}),
			)

			const stats = await manager.getConfigurationStats()

			expect(stats).toEqual({
				totalConfigs: 2,
				enabledConfigs: 1,
				transportTypes: {
					websocket: 1,
					http: 1,
				},
				backupCount: 2,
				templateCount: 1,
			})
		})
	})
})
