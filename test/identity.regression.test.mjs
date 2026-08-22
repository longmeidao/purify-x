import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi as id } from "./helpers/load-script.mjs";

test("旧版 MXGA 缓存没有 ID 字段时仍可兼容读取", () => {
  const cached = id.sanitizeRemoteCache({
    schema: 1,
    sources: {
      mxga: {
        handles: ["legacyuser"],
        codes: [1],
        whitelist: ["legacysafe"],
      },
    },
  });
  assert.deepEqual(cached.sources.mxga.userIds, []);
  assert.deepEqual(cached.sources.mxga.whitelistUserIds, []);
  assert.deepEqual(cached.sources.mxga.handles, ["legacyuser"]);
});

test("action metadata 只接受与目标 handle 对应的数字 ID", () => {
  assert.deepEqual(
    id.actionIdentityFromMetadata(
      "1725593465-unfollow",
      "正在关注 @tualatrix",
      "tualatrix",
    ),
    { userId: "1725593465", following: true },
  );
  assert.deepEqual(
    id.actionIdentityFromMetadata(
      "1725593465-follow",
      "关注 @someone_else",
      "tualatrix",
    ),
    { userId: "", following: null },
  );
});

test("React user 的 rest_id 与 id_str 冲突时丢弃 ID", () => {
  assert.deepEqual(
    id.userIdFromReactUser(
      {
        rest_id: "222",
        legacy: { id_str: "111", screen_name: "spam" },
      },
      "spam",
    ),
    { userId: "", conflict: true },
  );
});

test("React 遍历同时提取关注状态和一致的 user ID", () => {
  const result = id.relationshipFromReactObjects(
    [
      {
        payload: {
          __typename: "User",
          rest_id: "123456789",
          legacy: {
            id_str: "123456789",
            screen_name: "spam",
            following: false,
          },
        },
      },
    ],
    "spam",
  );
  assert.deepEqual(result, {
    following: false,
    userId: "123456789",
    idConflict: false,
  });
});

test("React 遍历不会采用其他账号的 ID", () => {
  const result = id.relationshipFromReactObjects(
    [
      {
        rest_id: "999",
        legacy: { id_str: "999", screen_name: "other", following: false },
      },
    ],
    "target",
  );
  assert.equal(result.userId, "");
  assert.equal(result.following, null);
});

test("JSON-LD 必须同时匹配 ProfilePage、Person 和 handle", () => {
  const valid = {
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      identifier: "1725593465",
      additionalName: "@tualatrix",
    },
  };
  assert.equal(id.profileJsonLdUserId("tualatrix", [valid]), "1725593465");
  assert.equal(id.profileJsonLdUserId("someone_else", [valid]), "");
});

test("可信 ID 与 handle 绑定冲突时剥离 MXGA，但保留独立 handle 来源", () => {
  // 31 = MXGA(1) + TBP(2) + MXGA flags(4+8+16)
  assert.deepEqual(
    id.reconcileIdentitySourceBits({
      userId: "new-id",
      idBits: 0,
      handleBits: 31,
      listedUserId: "old-id",
    }),
    { sourceBits: 2, whitelisted: false, idConflict: true },
  );
});

test("数字 ID 命中优先于改名后的 handle", () => {
  assert.deepEqual(
    id.reconcileIdentitySourceBits({
      userId: "123",
      idBits: 9,
      handleBits: 0,
      listedUserId: "",
    }),
    { sourceBits: 9, whitelisted: false, idConflict: false },
  );
});

test("白名单无条件覆盖 ID 和 handle 黑名单", () => {
  assert.deepEqual(
    id.reconcileIdentitySourceBits({
      userId: "123",
      idBits: 9,
      handleBits: 31,
      listedUserId: "123",
      whitelisted: true,
    }),
    { sourceBits: 0, whitelisted: true, idConflict: false },
  );
});

test("MXGA lite 保留 userIds 并对冲突 handle 丢弃不可信 ID", () => {
  const entries = Array.from({ length: 1000 }, (_, index) => [
    String(10_000 + index),
    `u${index}`,
    "pph",
  ]);
  entries.push(["20001", "duplicate", "ppa"]);
  entries.push(["20002", "duplicate", "pph"]);
  const parsed = id.validateMxgaLite({
    schema: 2,
    version: "test",
    count: entries.length,
    entries,
  });
  assert.equal(parsed.handles.length, 1001);
  assert.equal(parsed.userIds[parsed.handles.indexOf("u42")], "10042");
  assert.equal(parsed.userIds[parsed.handles.indexOf("duplicate")], "");
  assert.equal(parsed.codes[parsed.handles.indexOf("duplicate")], "pph");
});

test("MXGA 白名单保留对齐的 ID，空响应不覆盖旧缓存", () => {
  const parsed = id.validateMxgaWhitelist({
    list: [{ x_user_id: "123", handle: "SafeUser" }],
  });
  assert.deepEqual(parsed, { handles: ["safeuser"], userIds: ["123"] });

  const previous = { handles: ["old_safe"], userIds: ["456"] };
  assert.equal(id.validateMxgaWhitelist({ list: [] }, previous), previous);
});
