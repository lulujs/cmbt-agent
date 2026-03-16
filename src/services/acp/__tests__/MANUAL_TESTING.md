# Manual Testing Guide for ACP Traffic Logging

<!-- cmbt-agent_change - new file -->

This document provides instructions for manually testing the ACP traffic logging functionality to verify end-to-end message flow visibility.

## Overview

Traffic logging in the ACP integration captures protocol-level events at the application layer, including:

- Connection initialization and capabilities exchange
- Prompt requests and responses (including stopReason)
- Session update notifications
- Connection lifecycle events (close, errors)

## Prerequisites

1. Build the extension: `pnpm build`
2. Have an ACP-compatible agent available for testing
3. Access to VS Code Developer Tools console for log inspection

## Test Procedure

### 1. Enable Traffic Logging

Traffic logging can be enabled via the `ConnectionManager.setTrafficLogging(true)` method. This is typically controlled through extension settings or debug configuration.

**To enable for testing:**

- Set a breakpoint in `src/services/acp/ConnectionManager.ts` at the `createConnection` method
- Manually call `connectionManager.setTrafficLogging(true)` in the debug console
- Or add a temporary configuration flag in the extension settings

### 2. Test Scenarios

#### Scenario A: Connection Initialization

**Expected logs:**

- `INFO: Initializing ACP connection`
- `INFO: ACP connection initialized` with agent info and capabilities
- `TRACE: receive` messages if traffic logging is enabled

**Steps:**

1. Select an ACP agent from the agent picker
2. Verify initialization logs appear in the output channel
3. Check that agent capabilities are logged

#### Scenario B: Message Exchange

**Expected logs:**

- `DEBUG: Sending prompt to ACP agent` with sessionId and message preview
- `INFO: Prompt response received` with sessionId and stopReason
- `TRACE: send` and `TRACE: receive` messages for protocol traffic

**Steps:**

1. Send a message to the ACP agent
2. Verify prompt request is logged before sending
3. Verify response is logged after receiving, including stopReason field
4. Check that sessionId matches in both request and response logs

#### Scenario C: Session Updates

**Expected logs:**

- Session update notifications from client handlers
- Status changes and message updates

**Steps:**

1. Monitor logs while agent processes a request
2. Verify sessionUpdate notifications are logged
3. Check that message content and status changes are captured

#### Scenario D: Connection Close

**Expected logs:**

- `TRACE: receive Connection closed` when traffic logging is enabled
- Connection cleanup logs

**Steps:**

1. Close an active ACP session
2. Verify connection close event is logged
3. Check that cleanup completes without errors

### 3. Log Verification Checklist

- [ ] Connection initialization logs appear with agent info
- [ ] Agent capabilities are logged and readable
- [ ] Prompt requests include sessionId and message preview
- [ ] Prompt responses include sessionId and stopReason
- [ ] stopReason values are correct (e.g., "max_tokens", "stop_sequence", "tool_use")
- [ ] Session update notifications are logged
- [ ] Connection close events are captured when traffic logging is enabled
- [ ] No sensitive data (API keys, tokens) appears in logs
- [ ] Log levels are appropriate (INFO for key events, DEBUG for details, TRACE for protocol traffic)

### 4. Traffic Logging Points

The following code locations implement traffic logging:

1. **ConnectionManager.ts**

    - `initialize()`: Logs connection initialization and capabilities
    - `setupTrafficLogging()`: Documents traffic logging approach
    - Connection close handlers: Log connection lifecycle events

2. **AcpClientImpl.ts**

    - `sendMessage()`: Logs prompt requests and responses with stopReason
    - Session management: Logs session creation and updates

3. **Client Handlers**
    - sessionUpdate notifications
    - Error and status change events

### 5. Troubleshooting

**If logs are missing:**

- Verify traffic logging is enabled via `setTrafficLogging(true)`
- Check log level configuration (should be DEBUG or TRACE for detailed logs)
- Ensure output channel is visible in VS Code
- Check that logger instance is properly initialized

**If stopReason is not logged:**

- Verify the ACP agent returns a response with stopReason field
- Check that `connection.prompt()` is awaited and response is captured
- Review AcpClientImpl.sendMessage() implementation

**If connection events are not logged:**

- Verify connection handlers are properly set up
- Check that AbortSignal is connected to connection lifecycle
- Review ConnectionManager.setupConnectionLostHandler() implementation

## Success Criteria

Manual testing is successful when:

1. All log verification checklist items are confirmed
2. Logs provide sufficient visibility into message flow for debugging
3. No errors or warnings appear during normal operation
4. Log output is readable and actionable for troubleshooting

## Notes

- Traffic logging adds overhead and should be used for debugging only
- TRACE-level logs may contain large amounts of data
- Consider log rotation and retention policies for production use
- This is application-level logging; the ACP SDK does not expose message interception hooks
