# 开发约定

先读 `docs/READING_GUIDE.md`；架构边界见 `docs/ARCHITECTURE.md`。

- 使用根目录 Prettier、EditorConfig 和 Git 换行规则：
  TypeScript / Vue / JavaScript 两空格、单引号、无分号、100 列、LF，Python 四空格。
  `npm run format` 统一格式，`npm run check` 验证。
- TypeScript 严格检查包括未使用变量和参数；检查按真实契约选取。
- 按现有目录维护业务，不增加只有一个消费者的框架或转发层。
- `fixtures/products` 和 `fixtures/tasks` 是冻结评测输入，排除自动格式化。
  修改它们必须同步核对 catalog 的精确缺陷替换，并重新验收对应案例。
- 保护源码 allowlist、哈希前置条件、浏览器同源、Docker 隔离、取消与清理。
  不向 Agent 暴露参考补丁、私有断言、模型密钥或任意 Shell。
- 兼容已有任务、事件序列和归档格式。脚本回放不能冒充模型效果。
- `data/`、`.env`、私钥、密码、构建产物和本地日志不提交。
  `.dockerignore` 同样排除私有运行数据；部署使用独立的受保护环境文件。
- 日常检查使用本地回放和假 HTTP 模型；真实模型、线上部署按具体任务授权。
- Git 提交默认采用中文 Conventional Commits。保留用户已有改动，不强制推送。
