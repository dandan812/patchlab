# 2026-10-16 代码精简与规范统一

目标是让当前业务链更容易阅读和维护。没有增加产品功能、改变存储格式或部署线上。
脚本回放与真实模型、通过与拒绝与未完成仍分别记录。

## 范围与结果

| 阅读范围 | 处理结果 |
| --- | --- |
| 工作台、API、认证 | 评估文件按实际 `string[]` 契约展示，删除猜测对象结构和无对应接口的下载分支 |
| Worker、模型循环、工具 | 工具 Zod 参数集中一份，模型声明和执行验证共用，保留串行工具链与预算 |
| JSON / PostgreSQL 存储、产物 | 删除未使用的构造参数成员；保留原子写入、事务、事件序列、权限与完整性校验 |
| 沙箱、进程回收、独立验收 | 保留本地回放 / Docker、取消清理、封存快照和独立验收边界 |
| fixtures、评测驱动 | 冻结源码保持原字节，catalog 的 20 个精确缺陷替换通过验证 |
| 脚本、部署配置、测试、文档 | 删除失效的历史打包脚本；统一格式、严格类型检查、CI 和阅读入口 |

对修改前源码用同一 Prettier 规则归一化比较，50 个既有文件只有格式变化。
行为与约定变更集中在下列条目。目录职责和两条核心链见 [阅读指南](READING_GUIDE.md)。

## 精简依据

| 条目 | 证据与改动 | 验证 |
| --- | --- | --- |
| 工具参数重复 | `TaskTools.aiTools` 与 `execute` 原有两套 schema；现在共用 `schemas`，避免模型声明与执行预算不一致 | 超长 selector、无效哈希、文件起始行与视口边界同时被声明和执行拒绝；现有回放通过 |
| 评估文件多态兜底 | `/api/evaluations` 实际只返回 JSON / CSV 文件名；删除 `name/path/artifactId` 猜测与不可达下载分支 | 实际 API 与浏览器文件列表检查通过；任务产物下载仍保留 |
| 未使用代码 | 严格编译发现 API logout 参数、Store URL 成员、Edit 类型和两个图标未使用 | 开启 `noUnusedLocals` / `noUnusedParameters` 后全部类型检查通过 |
| 过期打包脚本 | `scripts/package-update.mjs` 固定早期日期，无现有命令或文档消费者，引用不存在的 `infra/update-production.py` | 删除后现有检查和构建通过；当前部署打包及维护者 QA 脚本保留 |
| 模板筛选重置 | 多语句模板事件在无分号格式下无法通过 Vue 生产编译 | 将四个赋值放入 `clearTaskFilters`；构建与实际点击重置检查通过 |

没有合并两个存储适配、两种执行模式、前端认证与选择代次、
Worker 租约、SSE 游标、刷新锁或不同的繁忙状态。它们分别保护实际的持久化、
身份切换、任务切换、执行所有权与重复请求边界。
保留当前部署工具与维护者脚本，不以缺少源码 import 判断运维入口无用。

## 统一规范

- TypeScript / Vue / JavaScript：两空格、单引号、无分号、100 列、LF。
  根目录 Prettier、EditorConfig、Git 换行规则与 LLM 平台一致；Python 四空格。
- 新增唯一开发依赖 `prettier@3.8.1`。锁文件仅根依赖项与该包变化，没有升级运行依赖。
- `npm run format` 格式化；`npm run check` 检查格式、严格类型、测试和生产构建。
  新增 GitHub 验证工作流，不包含部署步骤。
- 冻结的 `fixtures/products`、`fixtures/tasks` 排除自动格式化。
  修改它们会影响 catalog 的精确字符串缺陷替换，必须单独验收。
- Git 和 Docker 排除运行数据、密钥、环境文件、日志与构建输出；
  提供不含凭据的 `.env.example`。

## 验证

本地 Windows、Node.js 24.13.0，2026-10-16：

| 检查 | 结果 |
| --- | --- |
| 修改前基线 | 类型通过，21 项测试通过 |
| 最终 `npm run check` | 格式、严格 TypeScript / Vue、23 项测试、Vite 生产构建通过 |
| 冻结样例比较与 catalog | 相对源码快照没有字节变化；20 个缺陷替换有效 |
| `scripts/engineering-qa.ts` | 正确补丁通过；错误补丁拒绝并保存 4 张失败截图；无法构建的候选标为 `incomplete/startup` |
| `npm run qa` | 10/10 通过：登录、公开与私有任务、SSE/刷新、真实截图、取消清理、导航、手机端与拒绝结果 |
| 定向浏览器检查 | 四项筛选一键重置恢复列表；实际评估 API 字符串文件名正常展示 |
| 截图检查 | 桌面 1440 × 900、手机 390 × 844，无发现的溢出或按钮文字遮挡 |

工程核验任务：

- 通过：`d27577dd-d6f6-4e29-b723-f95de6837818`
- 拒绝：`0f69d67a-0528-48ee-a2d9-0f5fdd07a6d2`
- 未完成：`8d259efb-e378-41cb-8ed6-bb69b76150fa`

浏览器测试使用独立 API、Worker 和本地已审核回放，未调用收费模型。
工程核验覆盖代表性成功与失败链路，没有重跑全部 20 组缺陷/参考版本的 40 次执行，
没有验证 Docker / PostgreSQL 部署或真实模型效果。
CI 的 Linux / Node 24.21.0 与本机环境不同。首次推送的工作流在创建 job 前失败：
`runner.temp` 不允许出现在 job 级 `env`。随后将该设置移入检查步骤的 `env`，
再次推送验证；本地业务检查不受此 CI 配置修正影响。

日志在工作区 `refactor-backups/patchlab-final-check.log`、
`patchlab-engineering-check.log`、`patchlab-browser-check.log`；
定向检查脚本为 `patchlab-cleanup-ui-check.mjs`。
隔离运行数据与截图在 `patchlab-qa-data/cleanup-browser-20261016`。
这些本地证据不上传 GitHub。

## 恢复与上传

修改前源码快照：

`D:\个人文件\桌面\abc\refactor-backups\patchlab-cleanup-20261016`

快照不包含运行数据、环境文件、依赖与构建产物。恢复只需复制相关源码，
删除本轮新增配置，按原锁文件重新安装依赖；本轮不需要数据迁移。

本轮开始时 PatchLab 尚无 Git 仓库。按用户授权，将当前整理后的完整源码
作为私有 GitHub 仓库的初始提交，排除本地数据、凭据、日志和构建输出。
LLM 平台则使用独立整理分支，避免 `main` 上的自动生产部署。
