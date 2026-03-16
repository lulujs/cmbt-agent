# cmbt-agent_change - new file

# ACP Traffic Logging End-to-End Manual Test Plan

## Overview

This document provides a comprehensive manual testing procedure to verify that traffic logging captures all critical ACP protocol events during end-to-end message flow. This validates **Design Property P7** (Traffic Logging Visibility).

## Prerequisites

- CMBT Agent extension installed in VS Code
- An ACP-compatible agent available (e.g., from `vscode-acp-main` or custom agent)
- Access to VS Code Developer Tools console
- Workspace with a test project open

## Test Environment Setup

### 1. Enable Traffic Logging

Traffic logging can be enabled through the extension's logger configuration:

```typescript
// In ConnectionManager initialization or via extension settings
connectionManager.setTrafficLogging(true)
```

**Alternative: Enable via VS Code Settings**

If the extension exposes a setting for traffic logging:

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`)
2. Search for "ACP Traffic Logging" or "CMBT Agent ACP Debug"
3. Enable the traffic logging option

### 2. Open Developer Console

1. Open VS Code Developer Tools: `Help > Toggle Developer Tools`
2. Navigate to the **Console** tab
3. Filter logs by typing `ACP` or `traffic` in the filter box

### 3. Configure Log Level

Ensure the logger is set to capture INFO and TRACE level messages:

```typescript
// The AcpLogger should be configured with appropriate log level
// Check src/services/acp/AcpLogger.ts configuration
```

## Test Scenarios

### Scenario 1: Agent Selection and Initialization

**Objective**: Verify that agent selection, connection establishment, and initialization handshake are logged.

**Steps**:

1. Open the CMBT Agent chat interface
2. Click "Select ACP Agent" or trigger agent selection
3. Choose an available ACP agent from the list
4. Wait for agent to start and initialize

**Expected Log Entries**:

```
[INFO] Creating ACP connection streams { agentId: "agent-xyz" }
[INFO] ACP connection created { agentId: "agent-xyz" }
[INFO] Initializing ACP connection
[DEBUG] Calling connection.newSession
[DEBUG] newSession response received { sessionId: "session-123" }
[INFO] ACP connection initialized { agentName: "...", agentVersion: "..." }
[INFO] Session created { sessionId: "session-123", agentId: "agent-xyz" }
```

**Verification Checklist**:

- [ ] Connection creation logged with agent ID
- [ ] Initialization request logged
- [ ] Agent info (name, version) logged in response
- [ ] Agent capabilities logged (if present)
- [ ] Session creation logged with session ID

---

### Scenario 2: Sending User Message (Prompt Request)

**Objective**: Verify that user messages sent to the agent are logged with request and response details.

**Steps**:

1. With an active ACP agent session, type a message in the chat: "Hello, can you help me?"
2. Send the message
3. Wait for agent response

**Expected Log Entries**:

```
[INFO] Sending message { sessionId: "session-123", messageLength: 23 }
[DEBUG] Session found { agentId: "agent-xyz", agentName: "..." }
[DEBUG] Sending message to ACP agent { sessionId: "session-123", agentId: "agent-xyz" }
[DEBUG] Message added to session, calling connection.prompt
[INFO] Prompt response received { sessionId: "session-123", stopReason: "endTurn" }
[DEBUG] Message sent successfully { sessionId: "session-123" }
```

**Verification Checklist**:

- [ ] Message send logged with session ID and message length
- [ ] Prompt call logged
- [ ] **Response logged with `stopReason` field** (validates P6)
- [ ] Message success confirmation logged

---

### Scenario 3: Session Update Notifications

**Objective**: Verify that incoming `sessionUpdate` notifications from the agent are logged.

**Steps**:

1. Send a message that triggers agent activity (e.g., "List files in the workspace")
2. Observe agent processing and responses
3. Check for session update notifications

**Expected Log Entries**:

```
[INFO] Received sessionUpdate notification {
  sessionId: "session-123",
  updateType: "message"
}
```

**Verification Checklist**:

- [ ] Session update notifications logged
- [ ] Session ID included in log
- [ ] Update type or content summary included

---

### Scenario 4: Permission Requests

**Objective**: Verify that permission requests from the agent are logged.

**Steps**:

1. Send a message that requires file system access: "Read the contents of README.md"
2. Observe permission request dialog (if auto-approve is disabled)
3. Approve or deny the request

**Expected Log Entries**:

```
[DEBUG] Permission request received { operation: "readTextFile", resource: "README.md" }
[INFO] Permission decision { operation: "readTextFile", allowed: true }
```

**Verification Checklist**:

- [ ] Permission request logged with operation and resource
- [ ] Permission decision logged

---

### Scenario 5: Connection Lifecycle Events

**Objective**: Verify that connection close and reconnection attempts are logged.

**Steps**:

1. With an active agent session, manually terminate the agent process (or simulate connection loss)
2. Observe reconnection attempts (if configured)
3. Check for connection lifecycle logs

**Expected Log Entries**:

```
[TRACE] receive: Connection closed
[WARN] Connection lost { agentId: "agent-xyz" }
[INFO] Reconnection attempt 1/3 { agentId: "agent-xyz", delay: 1000 }
[INFO] Reconnection successful { agentId: "agent-xyz", attempt: 1 }
```

**OR** (if reconnection fails):

```
[TRACE] receive: Connection closed
[WARN] Connection lost { agentId: "agent-xyz" }
[INFO] Reconnection attempt 1/3 { agentId: "agent-xyz", delay: 1000 }
[WARN] Reconnection attempt 1 failed { agentId: "agent-xyz", error: "..." }
[ERROR] Failed to reconnect after 3 attempts { agentId: "agent-xyz" }
```

**Verification Checklist**:

- [ ] Connection close event logged
- [ ] Connection lost warning logged
- [ ] Reconnection attempts logged (if applicable)
- [ ] Reconnection success/failure logged

---

### Scenario 6: Multiple Sessions

**Objective**: Verify that traffic logging correctly distinguishes between multiple concurrent sessions.

**Steps**:

1. Start an ACP agent session (Session A)
2. Send a message in Session A
3. Switch to a different agent or create a new session (Session B)
4. Send a message in Session B
5. Verify logs contain distinct session IDs

**Expected Log Entries**:

```
[INFO] Session created { sessionId: "session-A", agentId: "agent-1" }
[INFO] Sending message { sessionId: "session-A", messageLength: 10 }
[INFO] Prompt response received { sessionId: "session-A", stopReason: "endTurn" }

[INFO] Session created { sessionId: "session-B", agentId: "agent-2" }
[INFO] Sending message { sessionId: "session-B", messageLength: 15 }
[INFO] Prompt response received { sessionId: "session-B", stopReason: "endTurn" }
```

**Verification Checklist**:

- [ ] Each session has a unique session ID in logs
- [ ] Messages are correctly attributed to their session
- [ ] No cross-contamination of session data in logs

---

## Log Analysis Guide

### Key Log Patterns to Verify

1. **Request-Response Pairing**: Every `connection.prompt()` call should have a corresponding "Prompt response received" log entry
2. **Session Lifecycle**: Session creation → message exchanges → session end (if applicable)
3. **Error Handling**: Errors should be logged with context (session ID, agent ID, error message)
4. **Timing Information**: Timestamps should allow reconstruction of message flow timeline

### Log Level Guidelines

| Level | Purpose                   | Examples                                         |
| ----- | ------------------------- | ------------------------------------------------ |
| TRACE | Low-level protocol events | Connection closed, raw message data              |
| DEBUG | Detailed flow information | Method calls, intermediate states                |
| INFO  | Key protocol events       | Session created, message sent, response received |
| WARN  | Recoverable issues        | Connection lost, reconnection attempts           |
| ERROR | Unrecoverable errors      | Initialization failed, session not found         |

### Common Issues and Troubleshooting

**Issue**: No logs appearing in console

**Solutions**:

- Verify traffic logging is enabled: `connectionManager.setTrafficLogging(true)`
- Check log level configuration in `AcpLogger`
- Ensure Developer Tools console is open and not filtered

**Issue**: Missing `stopReason` in response logs

**Solutions**:

- Verify `AcpClientImpl.sendMessage()` captures the response object
- Check that the log statement includes `stopReason: response.stopReason`
- Confirm the agent is returning a valid response with `stopReason` field

**Issue**: Session update notifications not logged

**Solutions**:

- Verify `sessionUpdate` handler in `createClientHandlers()` includes logging
- Check that the agent is sending `sessionUpdate` notifications
- Confirm the handler is properly registered with the connection

---

## Test Completion Criteria

This manual test is considered **PASSED** when:

1. ✅ All 6 test scenarios execute successfully
2. ✅ All verification checklist items are confirmed
3. ✅ Logs provide sufficient information to:
    - Trace a complete message flow from user input to agent response
    - Diagnose connection issues
    - Understand agent behavior and decision-making
4. ✅ No critical log entries are missing (especially `stopReason` in prompt responses)

## Test Results Documentation

**Tester**: ********\_********  
**Date**: ********\_********  
**Extension Version**: ********\_********  
**Agent Used**: ********\_********

### Scenario Results

| Scenario                | Status        | Notes |
| ----------------------- | ------------- | ----- |
| 1. Agent Selection      | ☐ Pass ☐ Fail |       |
| 2. User Message         | ☐ Pass ☐ Fail |       |
| 3. Session Updates      | ☐ Pass ☐ Fail |       |
| 4. Permission Requests  | ☐ Pass ☐ Fail |       |
| 5. Connection Lifecycle | ☐ Pass ☐ Fail |       |
| 6. Multiple Sessions    | ☐ Pass ☐ Fail |       |

### Overall Assessment

☐ **PASS** - All scenarios passed, traffic logging provides complete visibility  
☐ **FAIL** - One or more scenarios failed, see notes above  
☐ **PARTIAL** - Most scenarios passed, minor issues documented

### Additional Notes

---

---

---

---

## Appendix: Enabling Traffic Logging Programmatically

If you need to enable traffic logging for testing purposes, you can add this to your extension initialization:

```typescript
// In src/services/acp/AgentManager.ts or wherever ConnectionManager is initialized
const connectionManager = new ConnectionManager(logger, reconnectionConfig)
connectionManager.setTrafficLogging(true) // Enable for testing
```

Or expose a command in `package.json`:

```json
{
	"command": "cmbt-agent.toggleAcpTrafficLogging",
	"title": "CMBT Agent: Toggle ACP Traffic Logging"
}
```

And implement in `ClineProvider.ts`:

```typescript
private async handleToggleAcpTrafficLogging(): Promise<void> {
  const currentState = this.acpTrafficLoggingEnabled ?? false
  this.acpTrafficLoggingEnabled = !currentState
  this.acpInstances?.connectionManager.setTrafficLogging(this.acpTrafficLoggingEnabled)

  vscode.window.showInformationMessage(
    `ACP Traffic Logging ${this.acpTrafficLoggingEnabled ? 'enabled' : 'disabled'}`
  )
}
```
