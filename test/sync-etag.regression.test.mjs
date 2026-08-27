import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi as api } from "./helpers/load-script.mjs";

test("ETag 只接受无换行的有限长度响应值", () => {
  assert.equal(api.sanitizeEtag('W/"revision-1"'), 'W/"revision-1"');
  assert.equal(api.sanitizeEtag('"bad"\r\nInjected: yes'), "");
  assert.equal(api.sanitizeEtag("x".repeat(513)), "");
});

test("响应头按名称大小写不敏感读取 ETag", () => {
  assert.equal(
    api.responseHeaderValue(
      'content-type: application/json\r\nETag: W/"revision-2"\r\n',
      "etag",
    ),
    'W/"revision-2"',
  );
});

test("远程缓存保留安全 ETag 并丢弃注入值", () => {
  const cache = api.sanitizeRemoteCache({
    sources: {
      twitterBlockPorn: {
        handles: ["spam_handle"],
        etag: 'W/"tbp-1"',
      },
      tweetGuard: {
        keywords: ["规则一"],
        etag: '"bad"\nInjected: yes',
      },
    },
  });
  assert.equal(cache.sources.twitterBlockPorn.etag, 'W/"tbp-1"');
  assert.equal(cache.sources.tweetGuard.etag, "");
});

test("条件请求发送 If-None-Match 并接受 304", async () => {
  const original = globalThis.GM_xmlhttpRequest;
  globalThis.GM_xmlhttpRequest = (options) => {
    assert.equal(options.headers["If-None-Match"], '"revision-3"');
    options.onload({
      status: 304,
      responseText: "",
      responseHeaders: 'etag: "revision-3"\r\n',
    });
  };
  try {
    assert.deepEqual(
      await api.requestTextResource(
        "https://example.com/list.json",
        1024,
        "application/json",
        { etag: '"revision-3"' },
      ),
      { notModified: true, text: "", etag: '"revision-3"' },
    );
  } finally {
    globalThis.GM_xmlhttpRequest = original;
  }
});

test("200 响应继续执行字符与字节大小护栏", async () => {
  const original = globalThis.GM_xmlhttpRequest;
  globalThis.GM_xmlhttpRequest = (options) => {
    options.onload({
      status: 200,
      responseText: "好".repeat(4),
      responseHeaders: 'ETag: "revision-4"\r\n',
    });
  };
  try {
    await assert.rejects(
      api.requestTextResource(
        "https://example.com/list.json",
        8,
        "application/json",
      ),
      /响应超过安全大小限制/,
    );
  } finally {
    globalThis.GM_xmlhttpRequest = original;
  }
});

test("内置来源收到 304 时保留数据更新时间", async () => {
  const original = globalThis.GM_xmlhttpRequest;
  globalThis.GM_xmlhttpRequest = (options) => {
    assert.ok(options.headers["If-None-Match"]);
    options.onload({
      status: 304,
      responseText: "",
      responseHeaders: "",
    });
  };
  const previousTbp = {
    updatedAt: 100,
    checkedAt: 100,
    etag: '"tbp-2"',
    handles: Array.from({ length: 100 }, (_, index) => `spam_${index}`),
    lastError: "旧错误",
  };
  const previousTweetGuard = {
    version: "rules-1",
    updatedAt: 200,
    checkedAt: 200,
    etag: '"tg-2"',
    keywords: Array.from({ length: 10 }, (_, index) => `规则${index}`),
    lastError: "旧错误",
  };
  const previousBlueNoise = {
    version: "keywords-1",
    updatedAt: 300,
    checkedAt: 300,
    etag: '"bn-2"',
    keywords: Array.from({ length: 100 }, (_, index) => `关键词${index}`),
    skippedRegexCount: 12,
    lastError: "旧错误",
  };
  try {
    const tbp = await api.syncTwitterBlockPorn(previousTbp);
    const tweetGuard = await api.syncTweetGuardRules(previousTweetGuard);
    const blueNoise = await api.syncBlueNoiseKeywords(previousBlueNoise);
    assert.equal(tbp.updatedAt, 100);
    assert.equal(tbp.handles.length, 100);
    assert.equal(tbp.lastError, "");
    assert.equal(tweetGuard.updatedAt, 200);
    assert.equal(tweetGuard.version, "rules-1");
    assert.equal(tweetGuard.lastError, "");
    assert.equal(blueNoise.updatedAt, 300);
    assert.equal(blueNoise.version, "keywords-1");
    assert.equal(blueNoise.skippedRegexCount, 12);
    assert.equal(blueNoise.lastError, "");
  } finally {
    globalThis.GM_xmlhttpRequest = original;
  }
});
