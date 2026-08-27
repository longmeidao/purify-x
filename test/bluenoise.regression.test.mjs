import test from "node:test";
import assert from "node:assert/strict";
import { scoreReply, threshold, identityTestApi as api } from "./helpers/load-script.mjs";

test("BlueNoise 只导入纯文本关键词，不执行外部正则", () => {
  const plain = Array.from({ length: 120 }, (_, index) => `社区关键词${index}`);
  const parsed = api.validateBlueNoiseKeywords(
    ["# comment", ...plain, "/(?:spam|scam)/gi", "", plain[0]].join("\n"),
  );

  assert.equal(parsed.keywords.length, 120);
  assert.equal(parsed.skippedRegexCount, 1);
  assert.ok(!parsed.keywords.some((keyword) => keyword.startsWith("/")));
});

test("BlueNoise 响应必须保留足够的有效纯文本关键词", () => {
  assert.throws(
    () => api.validateBlueNoiseKeywords("普通词\n/(?:spam)/i"),
    /缺少足够的纯文本关键词/,
  );
});

test("社区关键词保留来源且相同命中不重复列出", () => {
  const evidence = api.communityKeywordEvidence("币安返佣活动", [
    { name: "TweetGuard", keywords: new Set(["币安"]) },
    { name: "BlueNoise", keywords: new Set(["币安", "返佣"]) },
  ]);

  assert.deepEqual(evidence.sourceNames, ["TweetGuard", "BlueNoise"]);
  assert.deepEqual(evidence.hits, ["币安", "返佣"]);
});

test("单个宽泛社区关键词只有组合分，不能独立隐藏普通内容", () => {
  for (const [text, keyword] of [
    ["我今天在币安看市场", "币安"],
    ["周末去万达广场吃饭", "万达广场"],
  ]) {
    const result = scoreReply(text, "普通用户", "normal_user", {
      communityKeywordSources: [
        { name: "BlueNoise", keywords: new Set([keyword]) },
      ],
    });

    assert.equal(result.score, 5);
    assert.ok(result.score < threshold);
    assert.match(result.reasons.join("\n"), /BlueNoise/);
  }
});
