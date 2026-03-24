---
title: "General"
description: "General questions about Test Agent"
---

# General

This section contains general questions about Test Agent.

## How does Test Agent work?

Test Agent uses large language models (LLMs) to understand your requests and translate them into actions. It can:

- Read, write, and delete files in your project.
- Execute commands in your VS Code terminal.
- Perform web browsing (if enabled).
- Use external tools via the Model Context Protocol (MCP).

You interact with Test Agent through a chat interface, where you provide instructions and review/approve its proposed actions, or you can use the inline autocomplete feature which helps you as you type.

## Is Test Agent free to use?

The Test Agent extension itself is free and open-source. In order for Test Agent to be useful, you need an AI model to respond to your queries. Models are hosted by providers and most charge for access.

There are some [models](https://kilo.ai/leaderboard#all-models) available for free. The set of free models is constantly changing based on provider pricing decisions.

You can also use Test Agent with a [local model](/docs/automate/extending/local-models) or ["Bring Your Own API Key"](/docs/getting-started/byok).
