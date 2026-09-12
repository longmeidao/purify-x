# Purify X

Purify X 是一个本地运行的 X/Twitter userscript，用于过滤回复区和可选时间线中的
引流、诈骗、批量垃圾与高置信推广内容。

当前版本：**2.9.1** · [更新日志](CHANGELOG.md) · [最新 Release](https://github.com/longmeidao/purify-x/releases/latest) · [历史版本](https://github.com/longmeidao/purify-x/releases)

本次更新：修复作者自回复的推广漏判，新增专属优惠券话术识别；正常续写仍放行。

## 安装

1. 安装 Violentmonkey（推荐）或 Tampermonkey。
2. 打开 [purify-x.user.js](https://raw.githubusercontent.com/longmeidao/purify-x/main/purify-x.user.js)。
3. 在 userscript 管理器中确认安装。

安装后会从同一 GitHub raw 地址自动检查更新；只有脚本的 `@version` 提升时才覆盖。

## 主要功能

- 自动过滤色情引流、诈骗话术、批量模板、垃圾账号名单及行为集群。
- 识别“Telegram 外链 + 推广话术”“限制回复 + 普通外链 + 推广话术”，以及
  “限制回复 + Telegram 外链”的高置信推广组合。
- 识别“批量注册形态账号 + 随机英文单词加 emoji 正文”的机器投放组合。
- 详情页主贴保持可见；作者续写仅在该回复自身命中高置信推广组合时进入过滤，其他回复始终过滤。时间线的可疑账号内容默认不屏蔽，
  高置信推广内容默认屏蔽并覆盖账号主页 Posts/Replies，两项可分别控制。
- 当前账号、关系未知账号和永久放行名单优先保护。
- 每次隐藏保留评分与原因，支持恢复单条及永久放行。
- 自动同步 MXGA、Twitter Block Porn、TweetGuard 与 BlueNoise 公开来源。

## 隐私

判定在浏览器本地完成。脚本不会自动举报、拉黑或上传浏览记录；只会下载启用的公开
名单和用户主动添加的订阅。可选 AI 判断默认关闭。

## 开发

要求当前 Node.js LTS，无第三方运行时依赖。

```sh
npm run build
npm test
```

`src/` 是可维护源码，根目录 `purify-x.user.js` 是生成的安装产物，不应直接修改。
职责边界与演进条件见 [架构与构建](docs/架构与构建.md)。

完整配置与已知限制见 [安装说明](docs/Purify-X-安装说明.md)。

## 发布

发布时同步 `package.json`、userscript 元数据、脚本内 `VERSION`、安装说明和本页版本，
补充 `CHANGELOG.md`，运行 `npm run build` 与 `npm test`。推送代码后，必须在对应提交
创建版本标签和 GitHub Release，发布说明取自该版本 CHANGELOG，并附上该提交生成的脚本。
仅推送 `main` 不会自动创建 Release；历史补录以实际代码快照为准。

## License

[MIT](LICENSE)
