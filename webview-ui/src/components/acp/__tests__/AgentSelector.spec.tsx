// cmbt-agent_change - new file
import { render, screen, fireEvent } from "@testing-library/react"
import { AgentSelector, AcpAgentInfo } from "../AgentSelector"

describe("AgentSelector", () => {
	const agents: AcpAgentInfo[] = [
		{ id: "claude-code", name: "Claude Code" },
		{ id: "copilot", name: "GitHub Copilot" },
		{ id: "opencode", name: "OpenCode" },
	]

	it("should render all configured agents", () => {
		render(<AgentSelector agents={agents} onSelectAgent={vi.fn()} onDisconnectAgent={vi.fn()} />)
		expect(screen.getByText("Claude Code")).toBeDefined()
		expect(screen.getByText("GitHub Copilot")).toBeDefined()
		expect(screen.getByText("OpenCode")).toBeDefined()
	})

	it("should show empty message when no agents", () => {
		render(<AgentSelector agents={[]} onSelectAgent={vi.fn()} onDisconnectAgent={vi.fn()} />)
		expect(screen.getByText("No agents configured")).toBeDefined()
	})

	it("should call onSelectAgent when inactive agent clicked", () => {
		const onSelect = vi.fn()
		render(<AgentSelector agents={agents} onSelectAgent={onSelect} onDisconnectAgent={vi.fn()} />)
		fireEvent.click(screen.getByText("GitHub Copilot"))
		expect(onSelect).toHaveBeenCalledWith("copilot")
	})

	it("should call onDisconnectAgent when active running agent clicked", () => {
		const onDisconnect = vi.fn()
		render(
			<AgentSelector
				agents={agents}
				activeAgentId="copilot"
				activeAgentStatus="running"
				onSelectAgent={vi.fn()}
				onDisconnectAgent={onDisconnect}
			/>,
		)
		fireEvent.click(screen.getByText("GitHub Copilot"))
		expect(onDisconnect).toHaveBeenCalledWith("copilot")
	})

	it("should highlight active agent", () => {
		render(
			<AgentSelector
				agents={agents}
				activeAgentId="copilot"
				onSelectAgent={vi.fn()}
				onDisconnectAgent={vi.fn()}
			/>,
		)
		const activeButton = screen.getByText("GitHub Copilot").closest("button")
		expect(activeButton?.className).toContain("bg-vscode-list-activeSelectionBackground")
	})

	it("should display status indicator for active agent", () => {
		render(
			<AgentSelector
				agents={agents}
				activeAgentId="copilot"
				activeAgentStatus="running"
				onSelectAgent={vi.fn()}
				onDisconnectAgent={vi.fn()}
			/>,
		)
		const statusIndicator = screen.getByText("GitHub Copilot").closest("button")?.querySelector(".bg-green-400")
		expect(statusIndicator).toBeDefined()
	})
})
