import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  identityTestApi as api,
  SCRIPT_PATH,
} from "./helpers/load-script.mjs";

test("TweetSnapshot 把页面与 React 证据归一为可序列化纯数据", () => {
  const raw = {
    statusId: "2092484580343460312",
    text: "  原始正文保留空格  ",
    name: "一双人字拖",
    author: {
      handle: "@RZT0571",
      userId: "123456789",
      following: true,
      idConflict: false,
    },
    promotionSignals: {
      repliesRestricted: false,
      hasExternalLink: true,
      telegramLink: true,
      policy: "by_invitation",
    },
    repost: {
      isRepost: true,
      handle: "@Reposter",
      userId: "987654321",
      following: null,
      idConflict: false,
    },
    quote: {
      isQuote: true,
      handle: "@Quoted_User",
      userId: "456789123",
      following: false,
      idConflict: false,
    },
    behavior: {
      coordinatedBurst: true,
      repeatedLowInfo: false,
      duplicateTemplate: true,
    },
  };

  const snapshot = api.normalizeTweetSnapshot(raw);

  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    statusId: "2092484580343460312",
    text: "  原始正文保留空格  ",
    name: "一双人字拖",
    author: {
      handle: "rzt0571",
      userId: "123456789",
      following: true,
      idConflict: false,
    },
    promotionSignals: {
      repliesRestricted: false,
      hasExternalLink: true,
      telegramLink: true,
      policy: "by_invitation",
    },
    repost: {
      isRepost: true,
      handle: "reposter",
      userId: "987654321",
      following: null,
      idConflict: false,
    },
    quote: {
      isQuote: true,
      handle: "quoted_user",
      userId: "456789123",
      following: false,
      idConflict: false,
    },
    behavior: {
      coordinatedBurst: true,
      repeatedLowInfo: false,
      duplicateTemplate: true,
    },
  });
  assert.doesNotThrow(() => JSON.stringify(snapshot));

  raw.author.handle = "changed";
  raw.promotionSignals.telegramLink = false;
  assert.equal(snapshot.author.handle, "rzt0571");
  assert.equal(snapshot.promotionSignals.telegramLink, true);
});

test("TweetSnapshot 对身份冲突和未知关系保持 fail-open 语义", () => {
  const snapshot = api.normalizeTweetSnapshot({
    statusId: "not-a-status-id",
    author: {
      handle: "@Example",
      userId: "123456789",
      following: "true",
      idConflict: true,
    },
    repost: {
      isRepost: false,
      handle: "@Ignored",
      userId: "111",
      following: false,
    },
    quote: {
      isQuote: true,
      handle: "@Quoted",
      userId: "222",
      following: undefined,
      idConflict: true,
    },
  });

  assert.equal(snapshot.statusId, "");
  assert.deepEqual(snapshot.author, {
    handle: "example",
    userId: "",
    following: null,
    idConflict: true,
  });
  assert.deepEqual(snapshot.repost, {
    isRepost: false,
    handle: "",
    userId: "",
    following: null,
    idConflict: false,
  });
  assert.deepEqual(snapshot.quote, {
    isQuote: true,
    handle: "quoted",
    userId: "",
    following: null,
    idConflict: true,
  });
});

test("processArticle 通过 TweetSnapshot 接收核心内容与身份输入", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const processArticle = source.match(
    /function processArticle\(article\) \{([\s\S]*?)\n  function cleanStaleCells/,
  )?.[1];

  assert.ok(processArticle, "没找到 processArticle");
  assert.match(processArticle, /const snapshot = articleTweetSnapshot\(/);
  assert.doesNotMatch(processArticle, /visibleText\(article\.querySelector/);
  assert.doesNotMatch(processArticle, /articlePromotionSignals\(/);
  assert.doesNotMatch(processArticle, /articleRelationshipIdentity\(/);
  assert.doesNotMatch(processArticle, /articleRepostIdentity\(/);
  assert.doesNotMatch(processArticle, /articleQuotedIdentity\(/);
});
