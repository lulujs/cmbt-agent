# E2E 自动化测试指南

## 快速开始

### 方式 1: 手动运行 E2E 测试

```bash
cd src
pnpm test:e2e
```

### 方式 2: 自动化测试修复循环

```bash
./scripts/test-and-fix-loop.sh
```

这个脚本会：

1. 构建扩展
2. 运行 E2E 测试
3. 如果失败，等待 5 秒后重试
4. 最多重试 5 次

## E2E 测试内容

测试文件：`src/__tests__/e2e/acp-opencode.e2e.spec.ts`

测试场景：

- ✅ 激活扩展
- ✅ 选择 OpenCode 代理
- ✅ 验证代理状态为 "running"
- ✅ 验证连接建立成功

## 当前限制

E2E 测试需要：

- 安装 `@vscode/test-electron` 依赖
- 配置 VS Code 测试环境
- OpenCode 已安装在系统中

## 下一步

如果 E2E 测试失败，查看：

1. VS Code 输出面板的详细错误
2. `src/__tests__/e2e/` 目录下的测试日志
3. 手动测试验证问题

## 替代方案：单元测试

当前已有 33 个单元测试覆盖核心逻辑：

```bash
cd src
pnpm test
```
