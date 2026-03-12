// cmbt-agent_change - new file
/**
 * Tests for ACP types and interfaces
 */

import { describe, test, expect } from "vitest"
import type { ACPMessage, ACPResponse, ACPAgentConfig, ConnectionStatus, ACPErrorType } from "../types"
import {
	ACPError,
	ACPConnectionError,
	ACPProtocolError,
	ACPPermissionError,
	ACPAuthenticationError,
	ACPTimeoutError,
	ACPSystemError,
} from "../errors"
import {
	validateAgentId,
	validateEndpoint,
	sanitizeAgentConfig,
	createACPMessage,
	createACPResponse,
	validateACPMessage,
	validateACPResponse,
} from "../utils"
import { DEFAULT_AGENT_CONFIG, PRE_CONFIGURED_AGENTS } from "../constants"

describe("ACP Types", () => {
	test("ACPMessage should have correct structure", () => {
		const message: ACPMessage = {
			jsonrpc: "2.0",
			id: "test-123",
			method: "test.method",
			params: { test: true },
		}

		expect(message.jsonrpc).toBe("2.0")
		expect(message.id).toBe("test-123")
		expect(message.method).toBe("test.method")
		expect(message.params).toEqual({ test: true })
	})

	test("ACPResponse should have correct structure", () => {
		const response: ACPResponse = {
			jsonrpc: "2.0",
			id: "test-123",
			result: { success: true },
		}

		expect(response.jsonrpc).toBe("2.0")
		expect(response.id).toBe("test-123")
		expect(response.result).toEqual({ success: true })
	})

	test("ConnectionStatus should be valid enum values", () => {
		const statuses: ConnectionStatus[] = ["connecting", "connected", "disconnected", "error"]

		statuses.forEach((status) => {
			expect(typeof status).toBe("string")
			expect(["connecting", "connected", "disconnected", "error"]).toContain(status)
		})
	})
})

describe("ACP Errors", () => {
	test("ACPError should create with correct properties", () => {
		const error = new ACPError({
			type: "connection" as ACPErrorType,
			code: "TEST_ERROR",
			message: "Test error message",
			agentId: "test-agent",
			timestamp: new Date(),
		})

		expect(error.type).toBe("connection")
		expect(error.code).toBe("TEST_ERROR")
		expect(error.message).toBe("Test error message")
		expect(error.agentId).toBe("test-agent")
		expect(error.name).toBe("ACPError")
	})

	test("ACPConnectionError should create network failure error", () => {
		const error = ACPConnectionError.networkFailure("test-agent", "ws://localhost:8080")

		expect(error).toBeInstanceOf(ACPConnectionError)
		expect(error.type).toBe("connection")
		expect(error.agentId).toBe("test-agent")
		expect(error.message).toContain("ws://localhost:8080")
	})

	test("ACPProtocolError should create version mismatch error", () => {
		const error = ACPProtocolError.versionMismatch("test-agent", "2.0", "1.0")

		expect(error).toBeInstanceOf(ACPProtocolError)
		expect(error.type).toBe("protocol")
		expect(error.message).toContain("2.0")
		expect(error.message).toContain("1.0")
	})

	test("ACPPermissionError should create access denied error", () => {
		const error = ACPPermissionError.accessDenied("test-agent", "/test/file", "read")

		expect(error).toBeInstanceOf(ACPPermissionError)
		expect(error.type).toBe("permission")
		expect(error.resource).toBe("/test/file")
	})

	test("Error should provide user-friendly messages", () => {
		const connectionError = new ACPConnectionError("Connection failed", "test-agent")
		const protocolError = new ACPProtocolError("Invalid message", "test-agent")
		const permissionError = new ACPPermissionError("Access denied", "test-agent", "/test")

		expect(connectionError.toUserMessage()).toContain("连接智能体失败")
		expect(protocolError.toUserMessage()).toContain("协议错误")
		expect(permissionError.toUserMessage()).toContain("权限被拒绝")
	})
})

describe("ACP Utils", () => {
	test("validateAgentId should validate correct IDs", () => {
		const validIds = ["test-agent", "github-copilot", "claude-code-v2"]

		validIds.forEach((id) => {
			const result = validateAgentId(id)
			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})
	})

	test("validateAgentId should reject invalid IDs", () => {
		const invalidIds = ["", "A", "test_agent", "test agent", "-test", "test-"]

		invalidIds.forEach((id) => {
			const result = validateAgentId(id)
			expect(result.valid).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)
		})
	})

	test("validateEndpoint should validate WebSocket endpoints", () => {
		const validEndpoints = ["ws://localhost:8080", "wss://api.example.com"]

		validEndpoints.forEach((endpoint) => {
			const result = validateEndpoint(endpoint, "websocket")
			expect(result.valid).toBe(true)
		})
	})

	test("validateEndpoint should reject invalid endpoints", () => {
		const invalidEndpoints = ["", "http://localhost", "invalid-url"]

		invalidEndpoints.forEach((endpoint) => {
			const result = validateEndpoint(endpoint, "websocket")
			expect(result.valid).toBe(false)
		})
	})

	test("createACPMessage should create valid message", () => {
		const message = createACPMessage("test.method", { param: "value" })

		expect(message.jsonrpc).toBe("2.0")
		expect(message.method).toBe("test.method")
		expect(message.params).toEqual({ param: "value" })
		expect(message.id).toBeDefined()
	})

	test("createACPResponse should create valid response", () => {
		const response = createACPResponse("test-123", { result: "success" })

		expect(response.jsonrpc).toBe("2.0")
		expect(response.id).toBe("test-123")
		expect(response.result).toEqual({ result: "success" })
		expect(response.error).toBeUndefined()
	})

	test("validateACPMessage should validate message format", () => {
		const validMessage = {
			jsonrpc: "2.0",
			method: "test.method",
			id: "123",
		}

		const result = validateACPMessage(validMessage)
		expect(result.valid).toBe(true)
		expect(result.errors).toHaveLength(0)
	})

	test("validateACPResponse should validate response format", () => {
		const validResponse = {
			jsonrpc: "2.0",
			id: "123",
			result: { success: true },
		}

		const result = validateACPResponse(validResponse)
		expect(result.valid).toBe(true)
		expect(result.errors).toHaveLength(0)
	})

	test("sanitizeAgentConfig should normalize configuration", () => {
		const config: ACPAgentConfig = {
			...DEFAULT_AGENT_CONFIG,
			id: "  TEST-AGENT  ",
			name: "  Test Agent  ",
			displayName: "  Test Agent Display  ",
			endpoint: "  ws://localhost:8080  ",
			settings: {
				...DEFAULT_AGENT_CONFIG.settings,
				idleTimeout: -1000, // Invalid negative timeout
				retryAttempts: -5, // Invalid negative attempts
			},
		}

		const sanitized = sanitizeAgentConfig(config)

		expect(sanitized.id).toBe("test-agent")
		expect(sanitized.name).toBe("Test Agent")
		expect(sanitized.displayName).toBe("Test Agent Display")
		expect(sanitized.endpoint).toBe("ws://localhost:8080")
		expect(sanitized.settings.idleTimeout).toBeGreaterThan(0)
		expect(sanitized.settings.retryAttempts).toBeGreaterThanOrEqual(0)
	})
})

describe("ACP Constants", () => {
	test("PRE_CONFIGURED_AGENTS should have valid configurations", () => {
		expect(PRE_CONFIGURED_AGENTS).toHaveLength(4)

		PRE_CONFIGURED_AGENTS.forEach((agent) => {
			expect(agent.id).toBeDefined()
			expect(agent.name).toBeDefined()
			expect(agent.displayName).toBeDefined()
			expect(agent.endpoint).toBeDefined()
			expect(agent.transport).toBeDefined()
			expect(["websocket", "http", "stdio"]).toContain(agent.transport)
		})
	})

	test("DEFAULT_AGENT_CONFIG should have required fields", () => {
		expect(DEFAULT_AGENT_CONFIG.transport).toBeDefined()
		expect(DEFAULT_AGENT_CONFIG.authentication).toBeDefined()
		expect(DEFAULT_AGENT_CONFIG.permissions).toBeDefined()
		expect(DEFAULT_AGENT_CONFIG.settings).toBeDefined()
		expect(DEFAULT_AGENT_CONFIG.metadata).toBeDefined()
	})
})
