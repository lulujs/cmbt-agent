# cmbt-agent_change - new file

# ACP Traffic Logging - Quick Reference Checklist

## Setup (Do Once)

- [ ] Enable traffic logging: `connectionManager.setTrafficLogging(true)`
- [ ] Open VS Code Developer Tools: `Help > Toggle Developer Tools`
- [ ] Navigate to Console tab
- [ ] Filter by "ACP" or "traffic"

## Critical Log Points to Verify

### 1. Connection Establishment

```
✓ [INFO] Creating ACP connection streams
✓ [INFO] ACP connection created
✓ [INFO] Initializing ACP connection
✓ [INFO] ACP connection initialized
```

### 2. Session Creation

```
✓ [DEBUG] Calling connection.newSession
✓ [DEBUG] newSession response received
✓ [INFO] Session created
```

### 3. Message Flow (CRITICAL - validates P6)

```
✓ [INFO] Sending message { sessionId, messageLength }
✓ [DEBUG] Calling connection.prompt
✓ [INFO] Prompt response received { sessionId, stopReason }  ← MUST HAVE stopReason
✓ [DEBUG] Message sent successfully
```

### 4. Incoming Notifications

```
✓ [INFO] Received sessionUpdate notification
```

### 5. Connection Lifecycle

```
✓ [TRACE] receive: Connection closed
✓ [WARN] Connection lost
```

## Quick Test Flow

1. **Start Agent** → Check logs for connection + initialization
2. **Send Message** → Check logs for prompt request + response with `stopReason`
3. **Trigger Agent Action** → Check logs for sessionUpdate notifications
4. **Close Agent** → Check logs for connection close event

## Pass Criteria

✅ All 5 critical log points present  
✅ `stopReason` field logged in every prompt response  
✅ Session IDs consistent across related log entries  
✅ No errors or missing context in logs

## Common Issues

| Issue                | Fix                                                    |
| -------------------- | ------------------------------------------------------ |
| No logs              | Enable traffic logging, check log level                |
| Missing `stopReason` | Verify `AcpClientImpl.sendMessage()` captures response |
| Duplicate logs       | Check for multiple logger instances                    |

## Log Locations

- **Connection**: `src/services/acp/ConnectionManager.ts`
- **Messages**: `src/services/acp/AcpClientImpl.ts`
- **Handlers**: `src/handlers/acp/*.ts`
