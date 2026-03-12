// cmbt-agent_change - new file
import * as vscode from "vscode"
import * as crypto from "crypto"
import { ACPError, ACPErrorCode } from "../errors"

/**
 * Security manager for handling encryption/decryption of sensitive data
 */
export class SecurityManager {
	private static readonly ALGORITHM = "aes-256-gcm"
	private static readonly KEY_LENGTH = 32
	private static readonly IV_LENGTH = 16
	private static readonly TAG_LENGTH = 16
	private static readonly SALT_LENGTH = 32

	private context: vscode.ExtensionContext
	private encryptionKey: Buffer | null = null

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	/**
	 * Encrypt sensitive data
	 */
	async encrypt(data: string): Promise<string> {
		try {
			const key = await this.getOrCreateEncryptionKey()
			const iv = crypto.randomBytes(SecurityManager.IV_LENGTH)
			const cipher = crypto.createCipher(SecurityManager.ALGORITHM, key)
			cipher.setAAD(Buffer.from("acp-config"))

			let encrypted = cipher.update(data, "utf8", "hex")
			encrypted += cipher.final("hex")

			const tag = cipher.getAuthTag()

			// Combine IV, tag, and encrypted data
			const result = iv.toString("hex") + tag.toString("hex") + encrypted
			return result
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.ENCRYPTION_ERROR,
				`Failed to encrypt data: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Decrypt sensitive data
	 */
	async decrypt(encryptedData: string): Promise<string> {
		try {
			const key = await this.getOrCreateEncryptionKey()

			// Extract IV, tag, and encrypted data
			const ivHex = encryptedData.slice(0, SecurityManager.IV_LENGTH * 2)
			const tagHex = encryptedData.slice(
				SecurityManager.IV_LENGTH * 2,
				(SecurityManager.IV_LENGTH + SecurityManager.TAG_LENGTH) * 2,
			)
			const encrypted = encryptedData.slice((SecurityManager.IV_LENGTH + SecurityManager.TAG_LENGTH) * 2)

			const iv = Buffer.from(ivHex, "hex")
			const tag = Buffer.from(tagHex, "hex")

			const decipher = crypto.createDecipher(SecurityManager.ALGORITHM, key)
			decipher.setAAD(Buffer.from("acp-config"))
			decipher.setAuthTag(tag)

			let decrypted = decipher.update(encrypted, "hex", "utf8")
			decrypted += decipher.final("utf8")

			return decrypted
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.DECRYPTION_ERROR,
				`Failed to decrypt data: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Generate a secure random key for encryption
	 */
	private async generateEncryptionKey(): Promise<Buffer> {
		const salt = crypto.randomBytes(SecurityManager.SALT_LENGTH)
		const key = crypto.pbkdf2Sync("acp-encryption-key", salt, 100000, SecurityManager.KEY_LENGTH, "sha256")

		// Store salt in secure storage
		await this.context.secrets.store("acp-encryption-salt", salt.toString("hex"))

		return key
	}

	/**
	 * Get or create encryption key
	 */
	private async getOrCreateEncryptionKey(): Promise<Buffer> {
		if (this.encryptionKey) {
			return this.encryptionKey
		}

		try {
			const saltHex = await this.context.secrets.get("acp-encryption-salt")

			if (saltHex) {
				const salt = Buffer.from(saltHex, "hex")
				this.encryptionKey = crypto.pbkdf2Sync(
					"acp-encryption-key",
					salt,
					100000,
					SecurityManager.KEY_LENGTH,
					"sha256",
				)
			} else {
				this.encryptionKey = await this.generateEncryptionKey()
			}

			return this.encryptionKey
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.ENCRYPTION_ERROR,
				`Failed to get encryption key: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}

	/**
	 * Clear encryption key from memory
	 */
	clearEncryptionKey(): void {
		if (this.encryptionKey) {
			this.encryptionKey.fill(0)
			this.encryptionKey = null
		}
	}

	/**
	 * Reset encryption (generate new key)
	 */
	async resetEncryption(): Promise<void> {
		try {
			await this.context.secrets.delete("acp-encryption-salt")
			this.clearEncryptionKey()
			await this.getOrCreateEncryptionKey()
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.ENCRYPTION_ERROR,
				`Failed to reset encryption: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}
}
