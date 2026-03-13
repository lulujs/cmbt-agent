// cmbt-agent_change - new file
import * as vscode from "vscode"
import { promises as fs } from "fs"
import * as path from "path"
import { AcpLogger } from "../../services/acp/AcpLogger"

export interface IFileSystemHandler {
	handleReadFile(params: { path: string }): Promise<{ content: string }>
	handleWriteFile(params: { path: string; content: string }): Promise<{ success: boolean }>
	validatePath(filePath: string): boolean
}

export class FileSystemHandler implements IFileSystemHandler {
	constructor(private logger: AcpLogger) {}

	async handleReadFile(params: { path: string }): Promise<{ content: string }> {
		this.logger.debug("Reading file", { path: params.path })

		if (!this.validatePath(params.path)) {
			const error = `Path is outside workspace: ${params.path}`
			this.logger.error(error)
			throw new Error(error)
		}

		try {
			const content = await fs.readFile(params.path, "utf-8")
			this.logger.debug("File read successfully", { path: params.path, size: content.length })
			return { content }
		} catch (error) {
			const message = `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
			this.logger.error(message, error instanceof Error ? error : undefined, { path: params.path })
			throw new Error(message)
		}
	}

	async handleWriteFile(params: { path: string; content: string }): Promise<{ success: boolean }> {
		this.logger.debug("Writing file", { path: params.path, size: params.content.length })

		if (!this.validatePath(params.path)) {
			const error = `Path is outside workspace: ${params.path}`
			this.logger.error(error)
			throw new Error(error)
		}

		try {
			await fs.writeFile(params.path, params.content, "utf-8")
			this.logger.debug("File written successfully", { path: params.path })
			return { success: true }
		} catch (error) {
			const message = `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
			this.logger.error(message, error instanceof Error ? error : undefined, { path: params.path })
			throw new Error(message)
		}
	}

	validatePath(filePath: string): boolean {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			this.logger.warn("No workspace folders found")
			return false
		}

		const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
		const normalizedPath = path.normalize(absolutePath)

		for (const folder of workspaceFolders) {
			const workspaceRoot = folder.uri.fsPath
			const normalizedRoot = path.normalize(workspaceRoot)

			if (normalizedPath.startsWith(normalizedRoot + path.sep) || normalizedPath === normalizedRoot) {
				return true
			}
		}

		this.logger.warn("Path validation failed", { path: filePath })
		return false
	}
}
