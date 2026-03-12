// cmbt-agent_change - new file
import * as vscode from "vscode"
import { ACPAgentConfig, PreConfiguredAgent } from "../types"
import { PRE_CONFIGURED_AGENTS } from "../constants"
import { ConfigurationStorage } from "../storage/ConfigurationStorage"
import { ACPError, ACPErrorCode } from "../errors"

/**
 * Manager for pre-configured ACP agents
 * Handles initialization, detection, and setup of common ACP agents
 */
export class PreConfiguredAgentManager {
	private storage: ConfigurationStorage
	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		this.storage = new ConfigurationStorage(context)
	}

	/**
	 * Get all pre-configured agent definitions
	 */
	getPreConfiguredAgents(): readonly PreConfiguredAgent[] {
		return PRE_CONFIGURED_AGENTS
	}

	/**
	 * Get a specific pre-configured agent by ID
	 */
	getPreConfiguredAgent(agentId: string): PreConfiguredAgent | undefined {
		return PRE_CONFIGURED_AGENTS.find((agent) => agent.id === agentId)
	}

	/**
	 * Check if an agent ID is a pre-configured agent
	 */
	isPreConfiguredAgent(agentId: string): boolean {
		return PRE_CONFIGURED_AGENTS.some((agent) => agent.id === agentId)
	}

	/**
	 * Initialize pre-configured agents on first startup
	 * Only creates configurations for agents that don't already exist
	 */
	async initializePreConfiguredAgents(): Promise<void> {
		try {
			const existingConfigs = await this.storage.loadAllConfigs()
			const existingIds = new Set(existingConfigs.map((config) => config.id))

			let initializedCount = 0

			for (const preConfigAgent of PRE_CONFIGURED_AGENTS) {
				if (!existingIds.has(preConfigAgent.id)) {
					const config = this.createConfigFromPreConfigured(preConfigAgent)
					await this.storage.saveAgentConfig(config)
					initializedCount++
				}
			}

			if (initializedCount > 0) {
				vscode.window.showInformationMessage(`已初始化 ${initializedCount} 个预配置ACP智能体`)
			}
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.CONFIGURATION_ERROR,
				`初始化预配置智能体失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Auto-detect available pre-configured agents
	 * Checks for required credentials and agent availability
	 */
	async detectAvailableAgents(): Promise<PreConfiguredAgent[]> {
		const availableAgents: PreConfiguredAgent[] = []

		for (const agent of PRE_CONFIGURED_AGENTS) {
			try {
				const isAvailable = await this.checkAgentAvailability(agent)
				if (isAvailable) {
					availableAgents.push(agent)
				}
			} catch (error) {
				// Log but don't throw - continue checking other agents
				console.warn(`Failed to check availability for agent ${agent.id}:`, error)
			}
		}

		return availableAgents
	}

	/**
	 * Setup a pre-configured agent with user credentials
	 */
	async setupPreConfiguredAgent(agentId: string): Promise<ACPAgentConfig> {
		const preConfigAgent = this.getPreConfiguredAgent(agentId)
		if (!preConfigAgent) {
			throw new ACPError(ACPErrorCode.NOT_FOUND, `预配置智能体 ${agentId} 不存在`)
		}

		try {
			// Check if already configured
			const existingConfig = await this.storage.loadAgentConfig(agentId)
			if (existingConfig) {
				const shouldReconfigure = await vscode.window.showWarningMessage(
					`智能体 ${preConfigAgent.displayName} 已配置。是否重新配置？`,
					"重新配置",
					"取消",
				)

				if (shouldReconfigure !== "重新配置") {
					return existingConfig
				}
			}

			// Get credentials from user
			const credentials = await this.promptForCredentials(preConfigAgent)
			if (!credentials) {
				throw new ACPError(ACPErrorCode.VALIDATION_ERROR, "用户取消了凭据配置")
			}

			// Create and save configuration
			const config = this.createConfigFromPreConfigured(preConfigAgent, credentials)
			await this.storage.saveAgentConfig(config)

			vscode.window.showInformationMessage(`智能体 ${preConfigAgent.displayName} 配置成功`)

			return config
		} catch (error) {
			if (error instanceof ACPError) {
				throw error
			}
			throw new ACPError(
				ACPErrorCode.CONFIGURATION_ERROR,
				`配置智能体失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Reset a pre-configured agent to default settings
	 */
	async resetPreConfiguredAgent(agentId: string): Promise<void> {
		const preConfigAgent = this.getPreConfiguredAgent(agentId)
		if (!preConfigAgent) {
			throw new ACPError(ACPErrorCode.NOT_FOUND, `预配置智能体 ${agentId} 不存在`)
		}

		try {
			const config = this.createConfigFromPreConfigured(preConfigAgent)
			await this.storage.saveAgentConfig(config)

			vscode.window.showInformationMessage(`智能体 ${preConfigAgent.displayName} 已重置为默认配置`)
		} catch (error) {
			throw new ACPError(
				ACPErrorCode.CONFIGURATION_ERROR,
				`重置智能体失败: ${error instanceof Error ? error.message : "未知错误"}`,
			)
		}
	}

	/**
	 * Get setup instructions for a pre-configured agent
	 */
	getSetupInstructions(agentId: string): string {
		const agent = this.getPreConfiguredAgent(agentId)
		if (!agent) {
			return "未找到智能体设置说明"
		}

		const instructions = {
			"github-copilot": `
设置 GitHub Copilot:
1. 确保已安装 GitHub Copilot 扩展
2. 在 GitHub 设置中生成个人访问令牌
3. 设置环境变量 GITHUB_TOKEN
4. 重启 VS Code 以应用配置
			`.trim(),
			"claude-code": `
设置 Claude Code:
1. 访问 Anthropic 控制台获取 API 密钥
2. 设置环境变量 ANTHROPIC_API_KEY
3. 确保有足够的 API 配额
4. 重启 VS Code 以应用配置
			`.trim(),
			"gemini-cli": `
设置 Gemini CLI:
1. 访问 Google AI Studio 获取 API 密钥
2. 设置环境变量 GOOGLE_API_KEY
3. 安装 Gemini CLI 工具
4. 重启 VS Code 以应用配置
			`.trim(),
			opencode: `
设置 OpenCode:
1. 访问 OpenAI 平台获取 API 密钥
2. 设置环境变量 OPENAI_API_KEY
3. 确保有足够的 API 配额
4. 重启 VS Code 以应用配置
			`.trim(),
		}

		return instructions[agentId as keyof typeof instructions] || "未找到智能体设置说明"
	}

	/**
	 * Show setup instructions for an agent
	 */
	async showSetupInstructions(agentId: string): Promise<void> {
		const agent = this.getPreConfiguredAgent(agentId)
		if (!agent) {
			vscode.window.showErrorMessage(`未找到智能体 ${agentId}`)
			return
		}

		const instructions = this.getSetupInstructions(agentId)

		const action = await vscode.window.showInformationMessage(
			`${agent.displayName} 设置说明`,
			{
				detail: instructions,
				modal: true,
			},
			"立即配置",
			"稍后配置",
		)

		if (action === "立即配置") {
			await this.setupPreConfiguredAgent(agentId)
		}
	}

	/**
	 * Create ACPAgentConfig from PreConfiguredAgent
	 */
	private createConfigFromPreConfigured(
		preConfigAgent: PreConfiguredAgent,
		credentials?: Record<string, string>,
	): ACPAgentConfig {
		return {
			id: preConfigAgent.id,
			name: preConfigAgent.name,
			displayName: preConfigAgent.displayName,
			description: preConfigAgent.description,
			endpoint: preConfigAgent.endpoint,
			transport: preConfigAgent.transport,
			authentication: {
				...preConfigAgent.authentication,
				credentials: credentials || preConfigAgent.authentication.credentials,
			},
			permissions: preConfigAgent.permissions,
			settings: preConfigAgent.settings,
			metadata: {
				...preConfigAgent.metadata,
				created: new Date(),
			},
		}
	}

	/**
	 * Check if a pre-configured agent is available
	 */
	private async checkAgentAvailability(agent: PreConfiguredAgent): Promise<boolean> {
		try {
			// Check for required credentials
			if (agent.authentication.type === "token" && agent.authentication.credentials) {
				const tokenKey = agent.authentication.credentials.tokenKey
				if (tokenKey && !process.env[tokenKey]) {
					return false
				}
			}

			// For now, assume agent is available if credentials are present
			// In a real implementation, this would ping the agent endpoint
			return true
		} catch (error) {
			return false
		}
	}

	/**
	 * Prompt user for agent credentials
	 */
	private async promptForCredentials(agent: PreConfiguredAgent): Promise<Record<string, string> | undefined> {
		if (agent.authentication.type !== "token" || !agent.authentication.credentials) {
			return {}
		}

		const tokenKey = agent.authentication.credentials.tokenKey
		const tokenType = agent.authentication.credentials.tokenType

		if (!tokenKey) {
			return {}
		}

		const existingToken = process.env[tokenKey]
		const placeholder = existingToken ? "••••••••••••••••" : `输入您的 ${tokenType} API 密钥`

		const token = await vscode.window.showInputBox({
			prompt: `请输入 ${agent.displayName} 的 API 密钥`,
			placeholder,
			password: true,
			ignoreFocusOut: true,
			validateInput: (value) => {
				if (!value && !existingToken) {
					return "API 密钥不能为空"
				}
				return undefined
			},
		})

		if (token === undefined) {
			return undefined
		}

		// If user didn't change the placeholder, use existing token
		const finalToken = token === placeholder ? existingToken : token

		return {
			[tokenKey]: finalToken || "",
		}
	}
}
