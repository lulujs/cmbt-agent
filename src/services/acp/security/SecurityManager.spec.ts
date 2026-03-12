// cmbt-agent_change - new file
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import * as crypto from "crypto"
import { SecurityManager } from "./SecurityManager"
import { ACPError, ACPErrorCode } from "../errors"

// Mock VSCode API
vi.mock("vscode")

// Mock crypto module
vi.mock("crypto", () => ({
	randomBytes: vi.fn(),
	pbkdf2Sync: vi.fn(),
	createCipher: vi.fn(),
	createDecipher: vi.fn(),
}))

describe("SecurityManager", () => {
	let securityManager: SecurityManager
	let mockContext: vscode.ExtensionContext
	let mockCipher: any
	let mockDecipher: any

	beforeEach(() => {
		mockContext = {
			secrets: {
				store: vi.fn(),
				get: vi.fn(),
				delete: vi.fn(),
			},
		} as any

		mockCipher = {
			setAAD: vi.fn(),
			update: vi.fn(),
			final: vi.fn(),
			getAuthTag: vi.fn(),
		}

		mockDecipher = {
			setAAD: vi.fn(),
			setAuthTag: vi.fn(),
			update: vi.fn(),
			final: vi.fn(),
		}

		vi.mocked(crypto.randomBytes).mockReturnValue(Buffer.from("random-bytes"))
		vi.mocked(crypto.pbkdf2Sync).mockReturnValue(Buffer.from("derived-key"))
		vi.mocked(crypto.createCipher).mockReturnValue(mockCipher)
		vi.mocked(crypto.createDecipher).mockReturnValue(mockDecipher)

		securityManager = new SecurityManager(mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("encrypt", () => {
		it("should encrypt data successfully", async () => {
			mockContext.secrets.get.mockResolvedValue("existing-salt-hex")
			mockCipher.update.mockReturnValue("encrypted-part")
			mockCipher.final.mockReturnValue("final-part")
			mockCipher.getAuthTag.mockReturnValue(Buffer.from("auth-tag"))

			const result = await securityManager.encrypt("test-data")

			expect(mockCipher.setAAD).toHaveBeenCalledWith(Buffer.from("acp-config"))
			expect(mockCipher.update).toHaveBeenCalledWith("test-data", "utf8", "hex")
			expect(result).toContain("encrypted-partfinal-part")
		})

		it("should generate new key if salt not found", async () => {
			mockContext.secrets.get.mockResolvedValue(null)
			mockContext.secrets.store.mockResolvedValue()
			mockCipher.update.mockReturnValue("encrypted")
			mockCipher.final.mockReturnValue("")
			mockCipher.getAuthTag.mockReturnValue(Buffer.from("tag"))

			await securityManager.encrypt("test-data")

			expect(mockContext.secrets.store).toHaveBeenCalledWith("acp-encryption-salt", expect.any(String))
		})

		it("should throw ACPError on encryption failure", async () => {
			mockContext.secrets.get.mockRejectedValue(new Error("Secrets error"))

			await expect(securityManager.encrypt("test-data")).rejects.toThrow(ACPError)
		})
	})

	describe("decrypt", () => {
		it("should decrypt data successfully", async () => {
			const encryptedData = "0".repeat(32) + "1".repeat(32) + "encrypted-data"
			mockContext.secrets.get.mockResolvedValue("existing-salt-hex")
			mockDecipher.update.mockReturnValue("decrypted-part")
			mockDecipher.final.mockReturnValue("final-part")

			const result = await securityManager.decrypt(encryptedData)

			expect(mockDecipher.setAAD).toHaveBeenCalledWith(Buffer.from("acp-config"))
			expect(mockDecipher.setAuthTag).toHaveBeenCalled()
			expect(result).toBe("decrypted-partfinal-part")
		})

		it("should throw ACPError on decryption failure", async () => {
			mockContext.secrets.get.mockRejectedValue(new Error("Secrets error"))

			await expect(securityManager.decrypt("invalid-data")).rejects.toThrow(ACPError)
		})

		it("should handle invalid encrypted data format", async () => {
			mockContext.secrets.get.mockResolvedValue("salt-hex")
			mockDecipher.update.mockImplementation(() => {
				throw new Error("Invalid data")
			})

			await expect(securityManager.decrypt("short")).rejects.toThrow(ACPError)
		})
	})

	describe("clearEncryptionKey", () => {
		it("should clear encryption key from memory", () => {
			// This is a simple test since the key is private
			expect(() => securityManager.clearEncryptionKey()).not.toThrow()
		})
	})

	describe("resetEncryption", () => {
		it("should reset encryption and generate new key", async () => {
			mockContext.secrets.delete.mockResolvedValue()
			mockContext.secrets.get.mockResolvedValue(null)
			mockContext.secrets.store.mockResolvedValue()

			await securityManager.resetEncryption()

			expect(mockContext.secrets.delete).toHaveBeenCalledWith("acp-encryption-salt")
		})

		it("should throw ACPError on reset failure", async () => {
			mockContext.secrets.delete.mockRejectedValue(new Error("Delete failed"))

			await expect(securityManager.resetEncryption()).rejects.toThrow(ACPError)
		})
	})

	describe("key generation", () => {
		it("should use existing salt when available", async () => {
			const saltHex = Buffer.from("existing-salt").toString("hex")
			mockContext.secrets.get.mockResolvedValue(saltHex)

			// Trigger key generation by calling encrypt
			mockCipher.update.mockReturnValue("encrypted")
			mockCipher.final.mockReturnValue("")
			mockCipher.getAuthTag.mockReturnValue(Buffer.from("tag"))

			await securityManager.encrypt("test")

			expect(crypto.pbkdf2Sync).toHaveBeenCalledWith(
				"acp-encryption-key",
				Buffer.from("existing-salt"),
				100000,
				32,
				"sha256",
			)
		})

		it("should generate new salt when not available", async () => {
			mockContext.secrets.get.mockResolvedValue(null)
			mockContext.secrets.store.mockResolvedValue()
			mockCipher.update.mockReturnValue("encrypted")
			mockCipher.final.mockReturnValue("")
			mockCipher.getAuthTag.mockReturnValue(Buffer.from("tag"))

			await securityManager.encrypt("test")

			expect(crypto.randomBytes).toHaveBeenCalledWith(32)
			expect(mockContext.secrets.store).toHaveBeenCalledWith("acp-encryption-salt", expect.any(String))
		})
	})
})
