# Dify 模型选择问题调试指南

## 问题描述

当选择 Dify 提供商时，界面底部仍然显示 `dify:claude-sonnet-4-5` 而不是 `dify:dify-workflow`。

## 已完成的修改

### 1. useSelectedModel Hook

文件：`webview-ui/src/components/ui/hooks/useSelectedModel.ts`

添加了 Dify 专用处理：

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

### 2. ApiOptions Provider Change Handler

文件：`webview-ui/src/components/settings/ApiOptions.tsx`

在 `PROVIDER_MODEL_CONFIG` 中添加：

```typescript
dify: { field: "apiModelId", default: "dify-workflow" },
```

## 用户操作步骤

### 方法 1：重新加载窗口（推荐）

1. 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）
2. 输入 "Developer: Reload Window"
3. 按回车执行

### 方法 2：重新选择提供商

1. 打开设置（点击左下角齿轮图标）
2. 在 API Provider 下拉框中：
    - 先选择其他提供商（如 Anthropic）
    - 再选择回 Dify
3. 这会触发 `onProviderChange`，自动设置 `apiModelId` 为 `"dify-workflow"`

### 方法 3：手动清除配置（如果上述方法都不行）

1. 打开 VS Code 设置（JSON）
2. 搜索 `test-agent` 或 `apiModelId`
3. 如果看到 `"apiModelId": "claude-sonnet-4-5"`，删除这一行或改为 `"apiModelId": "dify-workflow"`
4. 保存并重新加载窗口

## 验证修改是否生效

### 检查源代码

```bash
# 在 test-agent 目录下执行
grep -A 15 'case "dify"' webview-ui/src/components/ui/hooks/useSelectedModel.ts
```

应该看到返回 `id: "dify-workflow"` 的代码。

### 检查构建文件

```bash
# 确认最新构建时间
ls -lh src/dist/extension.js
```

### 检查扩展版本

在 VS Code 中：

1. 打开扩展面板
2. 找到 TEST Agent 扩展
3. 确认版本号和最后更新时间

## 预期结果

- 界面底部应显示：`dify:dify-workflow`
- 设置页面不应显示模型选择下拉框（因为 Dify 不在 MODELS_BY_PROVIDER 中）
- 模型信息应显示："Model configured in Dify workflow"

## 如果问题仍然存在

可能的原因：

1. **浏览器缓存**：VS Code 的 webview 可能缓存了旧的 JavaScript 文件
2. **配置持久化**：用户的配置文件中保存了旧的 `apiModelId` 值
3. **扩展未重新加载**：修改后的代码没有被加载

解决方案：

1. 完全关闭 VS Code
2. 删除工作区的 `.vscode` 文件夹（如果存在）
3. 重新打开 VS Code
4. 重新安装扩展（如果必要）
