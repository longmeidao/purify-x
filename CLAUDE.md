# x-reply-purifier（X 回复净化器）

油猴脚本，净化 X/Twitter 回复区的引流、诈骗与批量垃圾回复。当前 **v1.14.0**。

> 本项目原本散落在 Codex 临时工作目录，2026-07 迁移到此处成为正式项目。
> 原目录保留未动。
> 历史会话存档在 `history/`（已加入 .gitignore）。

## 结构

| 文件 | 说明 |
|---|---|
| `x-reply-purifier.user.js` | 主脚本，单文件 ~168KB |
| `x-reply-purifier-local-list.example.json` | 本地名单示例 |
| `docs/X-回复净化器-安装说明.md` | 安装与配置文档 |
| `TODO.md` | 待办（rebrand → 重构 → 发布） |
| `AGENTS.md` | Codex 等自动化代理的项目级工作约束 |

## 核心约束

- **单文件 userscript**，不能拆成模块（油猴限制）
- 已关注账号**始终放行**，这是防误封的硬规则
- 自动同步公开名单，来源 `x.zuoluo.tv` 和 `raw.githubusercontent.com`
- 依赖 `GM_getValue` / `GM_setValue` / `GM_xmlhttpRequest` / `GM_registerMenuCommand`

## 改动时注意

- **改任何判定逻辑前，先建立当前行为的回归样本** —— 重构不能改变判定结果
- 每条屏蔽都要保留可解释的原因，不要让评分变成黑箱
- 关键词与正则有重复计分的风险，改规则时审计字段边界
- 性能敏感：减少全页 DOM 查询、MutationObserver 噪声、无效重绘
- **改品牌名时必须保留现有 GM 存储键**，否则用户的个人名单、订阅、AI 设置、
  判定缓存会在升级后丢失

## 发布前检查

仓库中不得包含 API Key、Cookie、本地路径、私人放行名单、浏览记录或未核实的个人数据。

## 待办顺序（见 TODO.md）

1. 确定品牌（`Purify X` 是候选方向，**尚未定名**）
2. 冻结当前功能行为并补测试
3. 重构和性能验证
4. 整理公开文档及演进记录
5. 安全检查后发布 GitHub

## 状态

当前目录已建立 Git 仓库，并以 **v1.14.0** 作为首个代码与文档基线。后续功能、
重构、文档和发布准备应按意图拆分提交；正式发布前仍需完成回归、安全检查、GitHub
仓库创建和版本标签。
