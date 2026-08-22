import test from "node:test";
import assert from "node:assert/strict";
import {
  computeReplyBehaviorSignals,
  identityTestApi as api,
  scoreReply,
  threshold,
} from "./helpers/load-script.mjs";

test("作用域策略把证据与页面动作分开", () => {
  assert.equal(
    api.contentPolicyForSurface({ scope: "thread-reply" }),
    "full",
  );
  assert.equal(
    api.contentPolicyForSurface({ scope: "thread-main" }),
    "none",
  );
  assert.equal(
    api.contentPolicyForSurface({
      scope: "thread-main",
      relatedAccountListed: true,
    }),
    "none",
  );
  assert.equal(
    api.contentPolicyForSurface({
      scope: "timeline",
      primaryAccountListed: true,
      filterTimelineAccounts: true,
    }),
    "account-candidate",
  );
});

test("React 引用推文提取作者 handle、数字 ID 与关系", () => {
  const quotedUser = {
    rest_id: "222",
    legacy: { screen_name: "quoted_bad", following: false },
  };
  const outer = {
    rest_id: "111",
    core: {
      user_results: {
        result: { rest_id: "1110", legacy: { screen_name: "outer_user" } },
      },
    },
    legacy: {
      quoted_status_result: {
        result: {
          rest_id: "333",
          core: { user_results: { result: quotedUser } },
        },
      },
    },
  };
  assert.deepEqual(
    api.quotedIdentityFromReactObjects([outer], "outer_user", "111"),
    {
      isQuote: true,
      handle: "quoted_bad",
      userId: "222",
      following: false,
      idConflict: false,
    },
  );
  assert.equal(
    api.quotedIdentityFromReactObjects([outer], "someone_else", "111").isQuote,
    false,
  );
});

test("引用作者名单证据能独立达到隐藏阈值并保留原因", () => {
  const result = scoreReply("普通转述内容", "普通作者", "outer_user", {
    quotedAccount: {
      handle: "quoted_bad",
      sources: ["MXGA"],
      points: 8,
      evidenceSource: "list",
    },
  });
  assert.ok(result.score >= threshold);
  assert.match(result.reasons.join("\n"), /引用作者 @quoted_bad 命中 MXGA/);
});

test("AI 自动学习规则会过期，手动规则永久保留", () => {
  const now = 2_000_000_000_000;
  const state = api.sanitizeAiState(
    {
      learnedRules: [
        {
          id: "expired",
          value: "批量垃圾模板",
          category: "spam",
          createdAt: now - 1000,
          expiresAt: now - 1,
        },
        {
          id: "active",
          value: "另一批量垃圾模板",
          category: "spam",
          createdAt: now - 1000,
          expiresAt: now + 1000,
        },
        {
          id: "manual",
          value: "用户手动保留规则",
          category: "manual",
          createdAt: now - 1000,
          expiresAt: 0,
        },
      ],
    },
    now,
  );
  assert.deepEqual(
    state.learnedRules.map((rule) => rule.id),
    ["active", "manual"],
  );
  const legacy = api.sanitizeAiState(
    {
      learnedRules: [
        {
          id: "legacy",
          value: "旧版学习规则仍保留",
          category: "spam",
          createdAt: now - 1000,
        },
      ],
    },
    now,
  );
  assert.equal(legacy.learnedRules.length, 1);
  assert.ok(legacy.learnedRules[0].expiresAt > now);
});

test("AI 学习规则连续三次成为决定性误判后自动停用", () => {
  let rules = [
    {
      id: "ai-rule",
      value: "高特异垃圾片段",
      category: "spam",
      createdAt: 100,
      expiresAt: 10_000,
      enabled: true,
      falsePositiveCount: 0,
    },
  ];
  for (let index = 0; index < 3; index += 1) {
    rules = api.updateAiLearnedRuleFeedback(
      rules,
      ["高特异垃圾片段"],
      "false-positive",
      1000 + index,
    ).rules;
  }
  assert.equal(rules[0].falsePositiveCount, 3);
  assert.equal(rules[0].enabled, false);
});

test("自定义关键词支持 token、提及、hashtag、域名和重音归一", () => {
  assert.equal(api.keywordMatches("party mode", "art"), false);
  assert.equal(api.keywordMatches("art matters", "art"), true);
  assert.equal(api.keywordMatches("hello @spam_bot", "@spam_bot"), true);
  assert.equal(api.keywordMatches("#SpamTag 正在传播", "#spamtag"), true);
  assert.equal(api.keywordMatches("访问 bad.example/path", "domain:bad.example"), true);
  assert.equal(api.keywordMatches("Cafe promotion", "café"), true);
});

test("行为记录缓存跨虚拟列表回收合并并按 LRU 限长", () => {
  const cache = new Map();
  api.mergeBehaviorRecordCache(cache, [
    { id: "1", handle: "one", text: "模板一", name: "一", createdAt: 1 },
    { id: "2", handle: "two", text: "模板二", name: "二", createdAt: 2 },
  ], 2);
  api.mergeBehaviorRecordCache(cache, [
    { id: "3", handle: "three", text: "模板三", name: "三", createdAt: 3 },
  ], 2);
  assert.deepEqual([...cache.keys()], ["2", "3"]);
});

test("前一条被虚拟列表回收后仍可与后一条组成近似模板", () => {
  const cache = new Map();
  api.mergeBehaviorRecordCache(cache, [
    {
      id: "old",
      handle: "old_handle",
      name: "小桃🌸",
      text: "我果然太涩了有人想锐评一下我的福嘛",
      createdAt: 1000,
    },
  ]);
  api.mergeBehaviorRecordCache(cache, [
    {
      id: "new",
      handle: "new_handle",
      name: "小梨🌸",
      text: "我果然真的太涩了有人想锐评一下我的福嘛",
      createdAt: 2000,
    },
  ]);
  const signals = computeReplyBehaviorSignals([...cache.values()]);
  assert.deepEqual([...signals.duplicated].sort(), ["new", "old"]);
});
