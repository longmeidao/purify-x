# Purify X

Purify X 是一个本地运行的 X/Twitter userscript，用于过滤回复区和可选时间线中的
引流、诈骗、批量垃圾与高置信推广内容。

## 安装

1. 安装 Violentmonkey（推荐）或 Tampermonkey。
2. 打开 [purify-x.user.js](https://raw.githubusercontent.com/longmeidao/purify-x/main/purify-x.user.js)。
3. 在 userscript 管理器中确认安装。

安装后会从同一 GitHub raw 地址自动检查更新；只有脚本的 `@version` 提升时才覆盖。

## 主要功能

- 自动过滤色情引流、诈骗话术、批量模板、垃圾账号名单及行为集群。
- 识别“限制回复 + 外部链接 + 推广话术”的高置信推广组合。
- 详情页主贴保持可见；回复区始终过滤，主要时间线可单独开启。
- 当前账号、关系未知账号和永久放行名单优先保护。
- 每次隐藏保留评分与原因，支持恢复单条及永久放行。
- 自动同步 MXGA、Twitter Block Porn 与 TweetGuard 公开来源。

## 隐私

判定在浏览器本地完成。脚本不会自动举报、拉黑或上传浏览记录；只会下载启用的公开
名单和用户主动添加的订阅。可选 AI 判断默认关闭。

## 开发

要求当前 Node.js LTS，无第三方运行时依赖。

```sh
npm test
```

完整配置与已知限制见 [安装说明](docs/Purify-X-安装说明.md)。

## License

[MIT](LICENSE)
