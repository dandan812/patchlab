# PatchLab

自托管、可验证的前端 Bug 修复工作台。针对两个经过审核的 Vue 3 示例应用，从缺陷描述到浏览器调查、受限代码修改、干净环境独立验收，保存补丁、前后截图、Trace、测试报告和执行记录。

**不是通用代码执行平台，不接任意仓库，不提供万能 Shell，不自动提交 PR。**

[代码阅读指南](docs/READING_GUIDE.md)按两条主链对应到具体函数；
[本轮精简记录](docs/CODE_CLEANUP_20261016.md)记录删除依据、验证和恢复位置。
代码上传 GitHub 不代表线上部署。

## 2026-10-16 验收与证据升级

此前交付记录中的部署地址为 `https://patchlab.i-tool-chat.store/`，API 与 Worker 使用同一版本。
以下保留该次验收结果；本轮源码整理未重新部署或核验线上版本。

- 独立验收区分通过、拒绝与未完成；环境启动、执行中断和证据归档异常保留具体阶段与原因。
- 每条失败断言记录视口，并尽力保留截图（每次最多 6 张）；工作台支持只看失败项和截图预览。
- 新产物保存 SHA-256，读取或下载时校验大小与哈希；旧产物继续支持大小校验。
- 21 项单元与集成测试、10 项浏览器工作流通过；正确补丁与受控错误补丁已在服务器 Docker 隔离环境核验。
  这些验证不属于真实模型修复效果评测。

维护者可使用独立数据目录运行 `scripts/engineering-qa.ts`，检查正确补丁、
隐藏按钮的错误补丁和无法构建的候选版本。必须使用本地沙箱且不配置数据库连接，
不要指向线上数据。部署备份位于 `/opt/patchlab/backups/engineering-20261016`。

## 先运行

需要 Node.js >=22.12。依赖锁定在 `package-lock.json`。

```sh
npm ci
npm run browser:install
npm run dev
```

工作台：`http://127.0.0.1:5173`；API 默认端口为 `4310`。本地管理员密码首次启动生成在 `data/local-password.txt`，不通过 HTTP 暴露。登录后选择一个案例，运行 **脚本回放**，即可查看真实工具操作与独立验收产物。默认新任务不公开；勾选公开后才允许访客查看其描述和全部证据。

已有服务器占用端口时，调整 `.env` 的 `PATCHLAB_PORT`；工作台代理会自动读取该设置。Vite 自己会选择空闲端口，以启动日志中的地址为准。

## 两种模式，不能混淆

| 模式 | 做什么 | 能证明什么 |
| --- | --- | --- |
| `replay` 脚本回放 | 监督程序使用维护者参考修改，但通过真实文件工具、构建、Chromium 和干净验收 | 系统链路和测试有效性；**不能证明模型会修复** |
| `model` 真实 AI | AI SDK 调用你配置的模型，由模型选择工具和源码修改 | 该模型、预算与自建任务集上的实际表现；必须配置密钥与 Docker |

没有模型配置时不会悄悄切换到回放，也不会把未计量成本显示为 0。回放固定对应选中的案例，不根据追加描述生成新修复。真实模式的追加描述也不能扩大隐藏验收的覆盖范围。

## 真实模型与自托管

复制 `.env.example` 为 `.env` 后填写 `MODEL_API_KEY`、`MODEL_ID`，可填写支持 OpenAI Chat Completions 和工具调用的 `MODEL_BASE_URL`。配置密钥是运行时设置，不应写进代码。默认未配置任何供应商、额度或漂亮的实验数字。

**真实模型代码仅允许 Docker 执行。** 本地 JSON 存储与非隔离进程仅适用于已审核参考代码的开发回放。完整 Linux Docker Compose / PostgreSQL 配置、网络与权限边界见 [部署说明](docs/DEPLOYMENT.md)。当前交付不代表已经部署到你的服务器。

生产构建与预览：

```sh
npm run build
npm run start
# 另一个终端启动持久 Worker
npm run worker
```

## 验证与评测

```sh
npm run typecheck
npm test
npm run format       # 源码、测试和配置使用统一格式
npm run check        # 格式、严格类型、全部测试与生产构建
npm run fixtures:verify
npm run qa
# 实际回放执行：保存报告，并生成公开案例
npm run eval -- --mode=replay --case=products-pagination --split=dev
# 收费模型实验：请先配置密钥和 Docker，再主动执行
npm run eval -- --mode=model --split=holdout --strategy=all --repeats=3
```

20 个案例按 12 个开发、8 个保留场景组织。`fixtures:verify` 对每个案例分别测试缺陷和人工正确版本：缺陷必须触发真实浏览器断言失败，参考版本必须全部通过，编译失败不能冒充缺陷复现。保留集的模型效果没有预填。最后一条命令总计 72 次模型运行，会产生费用，不在安装或启动时自动执行。

评测记录输出到 `data/evaluations`，含冻结提示词/依赖哈希、每次 task ID、失败、耗时、用量和成本。未取得用量或价格时标为未知。当前核验与限制见 [验证报告](docs/VERIFICATION.md)。

早期本地交付记录为 12 项测试、20 个缺陷/参考案例验证和 10 项浏览器检查。历史本地录像 `data/qa/video/workbench-replay-demo.webm` 展示的是明确标注的脚本回放与受控错误补丁拒绝，**不是 AI 修复效果证明**。

上述数字属于早期交付记录，本轮结果见精简记录。私有 `data/` 不上传 GitHub，
历史录像需要原有本地归档。两个项目的 TypeScript / Vue 统一采用两空格、单引号、
无分号、100 列和 LF。冻结样例源码排除自动格式化，避免破坏 catalog 的精确缺陷替换。
TypeScript 检查未使用变量与参数；Git 与 Docker 同时排除运行数据、密码、环境文件和日志。

## 结构

```text
apps/web         Vue 3 工作台
apps/api         登录、任务、SSE、产物与公开案例接口
apps/worker      单 Worker，独立于 HTTP 生命周期
packages/agent   AI SDK 模型循环和冻结提示词
packages/tools   有边界的源码、补丁、浏览器、检查工具
packages/sandbox 进程 / Docker 环境及 Chromium 生命周期
packages/evaluator 私有验收代码，不进入 Agent 源码目录
packages/shared  数据契约、持久化与产物索引
fixtures         两个示例应用与缺陷变体目录
evaluations      A/B/C 实验驱动
infra            固定依赖镜像和 Linux Compose
docs             架构、开源来源、部署、复盘与验证说明
```

## 设计与贡献

实际阅读、参考和复用范围、源码 commit 与许可证见 [开源参考账本](docs/OPEN_SOURCE.md)。AI SDK / Playwright 提供模型循环和浏览器能力；PatchLab 的独立工作是边界、任务生命周期、证据组织、补丁保护和干净验收，不能把框架能力重新包装成自研。

- [架构与信任边界](docs/ARCHITECTURE.md)
- [实验口径](docs/EVALUATION.md)
- [错误补丁与成本复盘](docs/FAILURE_CASES.md)
- [部署与回滚](docs/DEPLOYMENT.md)

MIT；第三方依赖仍遵守其自身许可证。不要把参考回放通过率用于简历中的“AI 修复成功率”。
