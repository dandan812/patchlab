# PatchLab 代码阅读指南

更新：2026-10-16。描述当前源码，代码上传不代表生产部署。

## 目录与职责

| 目录 | 负责什么 |
| --- | --- |
| `apps/web/src` | 工作台、登录、任务选择、事件观察和证据展示 |
| `apps/api/src` | HTTP 输入、会话、入队、SSE 和产物授权 |
| `apps/worker/src` | 单 Worker 认领、执行、取消和清理 |
| `packages/shared/src` | 契约、配置、持久存储与产物归档 |
| `packages/agent/src` | AI SDK 模型循环与用量、费用统计 |
| `packages/tools/src` | 有边界的文件、补丁、浏览器和构建工具 |
| `packages/sandbox/src` | 本地 / Docker 环境、浏览器与进程回收 |
| `packages/evaluator/src` | 干净快照独立验收、结果与失败证据 |
| `fixtures` | 两个冻结示例、20 个缺陷及维护者参考修改 |
| `evaluations`、`scripts` | 显式实验、维护者验证与开发入口 |
| `infra` | 镜像、Compose、资源限制与人工部署工具 |

## 第一条链：创建、执行、恢复查看

| 顺序 | 文件与函数 | 阅读重点 |
| --- | --- | --- |
| 1 | `apps/web/src/components/TaskModal.vue`：`create` | 案例、模式、策略和公开状态 |
| 2 | `apps/web/src/useWorkbench.ts`：`createTask`、`loadSelection` | 提交后选择同一任务 ID |
| 3 | `apps/web/src/api.ts`：`request` | 同源 cookie 与写请求头 |
| 4 | `apps/api/src/index.ts`：`POST /api/tasks` | 认证、输入、模式与队列容量 |
| 5 | `packages/shared/src/store.ts`：`transaction`、`claim` | 事件序号、原子认领与两个适配 |
| 6 | `apps/worker/src/index.ts` | Worker 所有权、重启标记与循环 |
| 7 | `apps/worker/src/execute.ts`：`executeTask` | 准备、调查、修复/检查、验收与终态 |
| 8 | `apps/api/src/index.ts`：任务事件路由 | 按持久化 seq 发送 SSE |
| 9 | `apps/web/src/useWorkbench.ts`：`connect`、`refreshDetail` | 去重、补齐产物、重连与终态关闭 |

API 持久化入队；独立 Worker 执行。SSE 断线或刷新读取同一任务，不重跑模型步骤。
Worker 崩溃将已认领的未完成任务标成 `interrupted`，清理旧工作区；
用户重跑则创建新任务和新快照。

`selectionGeneration` 防止旧任务响应写入新选择，`authGeneration` 防止旧身份列表覆盖
登录状态。刷新锁、SSE 游标和 Worker 租约也分别代表真实边界，不能只因名称相似就合并。
本地 JSON 使用目录锁与原子 rename；PostgreSQL 使用事务和 advisory lock。
本轮没有合并适配或迁移数据。

## 第二条链：补丁、独立验收、证据

```text
materializeFixture → original / candidate 两份快照
  → createSandbox：浏览器与受限执行环境
  → TaskTools：读原文、观察页面、应用有哈希前置条件的补丁
  → submit_patch：封存候选
  → collectPatch：计算变更与候选源码指纹
  → evaluatePatch：另建干净快照，应用同一补丁，执行私有断言
  → saveArtifact：截图、Trace、报告、补丁与完整性信息
  → TaskDetail.vue：展示通过、拒绝、未完成和失败证据
```

先读 `executeTask`，再看 `TaskTools.call` 与 `execute`。
工具 Zod 参数集中在同文件 `schemas`，模型声明和执行共用同一份。
串行链保护补丁与工具状态；allowlist、路径、文件大小、expectedHash 保护输入边界。
策略 A 无执行反馈，B 增加固定检查，C 增加受限浏览器工具。

脚本回放由维护者读取 `getReferenceEdits`，真实模型走 `runAgent`；
Agent 工具无法读取 catalog 或私有验收。两条路径分别保留。

报告的 `passed` 表示全部定义断言通过，`rejected` 表示实际执行后有失败断言，
`incomplete` 表示准备、启动、执行或证据归档没有完成；构建失败不能冒充补丁被拒绝。
封存候选与验收版本需要匹配源码指纹。产物下载先检查任务权限，
再验证 realpath、大小与新产物哈希；旧产物继续支持大小校验。

## 支持模块按问题阅读

| 问题 | 代码 |
| --- | --- |
| 模型循环、未知用量与价格 | `packages/agent/src/index.ts` |
| 密码、签名 cookie 与写请求同源 | `apps/api/src/auth.ts` |
| 文件 allowlist 与越界保护 | `packages/tools/src/files.ts` |
| 浏览器限制与生命周期 | `packages/sandbox/src/index.ts` |
| 进程超时、取消与崩溃清理 | 同目录 `process.ts`、`recovery.ts` |
| 失败断言与截图 | `packages/evaluator/src/index.ts`、`assertions.ts` |
| 评估文件名 | API `/api/evaluations` 返回 `string[]` |
| 20 个缺陷替换仍有效吗 | `fixtures/catalog.ts`：`validateCatalog` |

`npm run check` 运行格式、严格类型、全部测试与构建。`npm run qa` 检查已启动的本地
API / Worker；`scripts/engineering-qa.ts` 用独立数据目录核验正确补丁、错误补丁、
不能构建的候选。维护者脚本不要连接线上队列。

冻结样例源码排除自动格式化，改变它们需重新验证对应缺陷与参考版本。
完整矩阵由 `npm run fixtures:verify` 显式运行。
本轮覆盖、保留理由和验证见 [精简记录](CODE_CLEANUP_20261016.md)。
