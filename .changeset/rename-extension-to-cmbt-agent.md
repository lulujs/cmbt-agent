---
"test-agent": major
---

BREAKING CHANGE: Rename extension from kilo-code to test-agent

The VS Code extension has been renamed from "kilo-code" to "test-agent". This is a breaking change that affects:

- Extension identifier: `kilo-code` → `test-agent`
- All command IDs: `kilo-code.*` → `test-agent.*`
- Configuration keys: `kilo-code.*` → `test-agent.*`
- Context keys: `kilocode.*` → `testagent.*`
- View container IDs: `kilo-code-ActivityBar` → `test-agent-ActivityBar`

Users will need to:

- Uninstall the old "kilo-code" extension
- Install the new "test-agent" extension
- Update any custom keybindings that reference `kilo-code.*` commands
- Update any workspace settings that use `kilo-code.*` configuration keys
