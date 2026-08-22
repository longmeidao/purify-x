// purify-x.user.js 在没有 document 的环境里会在暴露公开 API 之后直接返回，
// 不启动 bootstrap，因此可以在 node 里加载真实发布文件做纯逻辑回归，
// 不需要复制规则或搭 DOM。
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

export const SCRIPT_PATH = path.join(here, "..", "..", "purify-x.user.js");

require(SCRIPT_PATH);

if (!globalThis.__PURIFY_X__) {
  throw new Error("加载 purify-x.user.js 后未拿到 __PURIFY_X__ 公开 API");
}

export const api = globalThis.__PURIFY_X__;
export const { scoreReply, computeReplyBehaviorSignals, threshold } = api;
export const identityTestApi = api.test;
