# Dify 模型选择问题修复总结

## 问题描述

当选择 Dify 提供商时：

1. ~~界面底部显示 `dify:claude-sonnet-4-5` 而不是 `dify:dify-workflow`~~ (已修复)
2. ~~UI 上显示了"模型"选择器，但 Dify 不需要在这里选择模型（模型在 Dify 工作流中配置）~~ (已修复)

## 根本原因

1. **useSelectedModel Hook 问题**：Dify 没有专用的 case 处理，导致它落入 default 分支，使用 `anthropicModels` 和 `apiConfiguration.apiModelId`
2. **Provider 切换逻辑问题**：`validateAndResetModel` 函数对于没有静态模型列表的提供商（如 Dify）直接返回，不会清除旧的 `apiModelId` 值
3. **模型选择器显示问题**：ApiOptions.tsx 中的条件判断没有排除 Dify，导致显示了不必要的模型选择器
4. **配置验证问题**：checkExistApiConfig.ts 中的数组没有包含 Dify，导致配置验证失败

## 修复内容

### 修改 1：useSelectedModel Hook

**文件**：`test-agent/webview-ui/src/components/ui/hooks/useSelectedModel.ts`

**位置**：在 `getSelectedModel` 函数中添加 Dify 的 case

```typescript
case "dify": {
    // Dify doesn't need model selection - models are configured in Dify workflows
    return {
        id: "dify-workflow",
        info: {
            maxTokens: 8192,
            contextWindow: 128000,
            supportsImages: true,
            supportsPromptCache: false,
            inputPrice: 0,
            outputPrice: 0,
            description: "Model configured in Dify workflow",
        },
    }
}
```

**同时修改 default case**：从类型断言中移除 `"dify"`

```typescript
default: {
    provider satisfies "anthropic" | "fake-ai" | "human-relay" | "kilocode" | "apertis"
    // 之前是: ... | "apertis" | "dify"
```

### 修改 2：Provider 切换配置

**文件**：`test-agent/webview-ui/src/components/settings/ApiOptions.tsx`

**位置 1**：在 `PROVIDER_MODEL_CONFIG` 中添加 Dify 配置

```typescript
dify: { field: "apiModelId", default: "dify-workflow" },
```

**位置 2**：修改 `validateAndResetModel` 函数

```typescript
const staticModels = MODELS_BY_PROVIDER[provider]
if (!staticModels) {
	// For providers without static models (like Dify), always reset to default
	// This ensures old model IDs from previous providers are cleared
	if (modelId !== defaultValue) {
		setApiConfigurationField(field, defaultValue, false)
	}
	return
}
```

**关键改进**：对于没有静态模型列表的提供商，如果当前 `modelId` 与默认值不同，则重置为默认值。这确保了从其他提供商切换到 Dify 时，旧的模型 ID 会被清除。

### 修改 3：隐藏模型选择器 ✨

**文件**：`test-agent/webview-ui/src/components/settings/ApiOptions.tsx`

**位置**：第 1028 行左右，模型选择器的显示条件

**修改前**：

```typescript
{/* Skip generic model picker for claude-code/openai-codex since they have their own model pickers */}
{selectedProviderModels.length > 0 &&
    selectedProvider !== "claude-code" &&
    selectedProvider !== "openai-codex" && (
```

**修改后**：

```typescript
{/* Skip generic model picker for claude-code/openai-codex/dify since they have their own model pickers or don't need model selection */}
{selectedProviderModels.length > 0 &&
    selectedProvider !== "claude-code" &&
    selectedProvider !== "openai-codex" &&
    selectedProvider !== "dify" && (
```

**说明**：添加 `selectedProvider !== "dify"` 条件，确保当选择 Dify 供应商时，不显示模型选择器。因为 Dify 的模型是在 Dify 工作流中配置的，不需要在 test-agent 中选择。

### 修改 4：配置验证修复 ✨ NEW

**文件**：`test-agent/src/shared/checkExistApiConfig.ts`

**位置**：`checkExistKey` 函数中的数组

**修改前**：

```typescript
// Special case for human-relay, fake-ai, claude-code, openai-codex, qwen-code, roo and kilocode providers which don't need any configuration.
if (
	config.apiProvider &&
	["human-relay", "fake-ai", "claude-code", "openai-codex", "qwen-code", "roo", "kilocode"].includes(
		config.apiProvider,
	)
) {
	return true
}
```

**修改后**：

```typescript
// Special case for human-relay, fake-ai, claude-code, openai-codex, qwen-code, roo, kilocode and dify providers which don't need any configuration or have their own model selection.
if (
	config.apiProvider &&
	["human-relay", "fake-ai", "claude-code", "openai-codex", "qwen-code", "roo", "kilocode", "dify"].includes(
		config.apiProvider,
	)
) {
	return true
}
```

**说明**：添加 "dify" 到特殊供应商列表中，这些供应商不需要额外的配置验证或有自己的模型选择机制。这是导致模型选择器仍然显示的根本原因。

## 工作原理

### 场景 1：首次选择 Dify

1. 用户选择 Dify 提供商
2. `onProviderChange` 被调用
3. `validateAndResetModel` 检测到 Dify 没有静态模型列表
4. 如果 `apiModelId` 不是 `"dify-workflow"`，则设置为 `"dify-workflow"`
5. `useSelectedModel` 返回 `id: "dify-workflow"`
6. 界面显示 `dify:dify-workflow`

### 场景 2：从其他提供商切换到 Dify

1. 假设之前选择了 Anthropic，`apiModelId` 为 `"claude-sonnet-4-5"`
2. 用户切换到 Dify
3. `onProviderChange` 被调用
4. `validateAndResetModel` 检测到：
    - Dify 没有静态模型列表
    - `modelId` (`"claude-sonnet-4-5"`) ≠ `defaultValue` (`"dify-workflow"`)
5. 调用 `setApiConfigurationField("apiModelId", "dify-workflow", false)`
6. `useSelectedModel` 返回 `id: "dify-workflow"`
7. 界面显示 `dify:dify-workflow`

### 场景 3：已经选择 Dify 的用户

1. 用户配置中 `apiProvider: "dify"`, `apiModelId: "claude-sonnet-4-5"`
2. 扩展加载时，`useSelectedModel` 被调用
3. 匹配到 `case "dify"`，直接返回 `id: "dify-workflow"`
4. `ApiOptions` 的 useEffect 检测到 `selectedModelId` (`"dify-workflow"`) ≠ `apiModelId` (`"claude-sonnet-4-5"`)
5. 自动调用 `setApiConfigurationField("apiModelId", "dify-workflow", false)`
6. 界面显示 `dify:dify-workflow`

## 用户操作指南

### 推荐方法：重新加载窗口

1. 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）
2. 输入 "Developer: Reload Window"
3. 按回车执行

### 备选方法：重新选择提供商

1. 打开设置
2. 选择其他提供商（如 Anthropic）
3. 再选择回 Dify

### 验证修复

界面底部应该显示：`dify:dify-workflow`

## 技术细节

### 为什么需要两处修改？

1. **useSelectedModel 修改**：确保 Dify 返回正确的模型 ID
2. **validateAndResetModel 修改**：确保切换提供商时清除旧的模型 ID

### 为什么不只修改一处？

- 只修改 useSelectedModel：切换提供商时，`apiModelId` 仍然保留旧值，虽然显示正确，但配置不一致
- 只修改 validateAndResetModel：首次加载时，如果配置中已有错误的 `apiModelId`，不会自动修正

### 自动同步机制

`ApiOptions.tsx` 中的 useEffect 会自动同步 `selectedModelId` 到 `apiModelId`：

```typescript
useEffect(() => {
	if (selectedModelId && apiConfiguration.apiModelId !== selectedModelId) {
		setApiConfigurationField("apiModelId", selectedModelId, false)
	}
}, [selectedModelId, setApiConfigurationField, apiConfiguration.apiModelId])
```

这确保了即使用户配置中有错误的值，也会在加载时自动修正。

## 构建状态

✅ 构建成功
✅ 所有修改已应用
✅ VSIX 包已生成：`bin/test-agent-1.0.0.vsix`

## 测试建议

1. 测试首次选择 Dify
2. 测试从 Anthropic 切换到 Dify
3. 测试从 Dify 切换到其他提供商再切换回来
4. 测试已有错误配置的用户升级后的行为
