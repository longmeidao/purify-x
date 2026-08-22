import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi as id } from "./helpers/load-script.mjs";

const from = (text, hrefs = []) => id.repostHandleFromContext(text, hrefs);

test("中英文转推文案都能取到转推者 handle", () => {
  assert.equal(from("图拉鼎 已转推", ["/tualatrix"]), "tualatrix");
  assert.equal(from("图拉鼎 已轉推", ["/tualatrix"]), "tualatrix");
  assert.equal(from("图拉鼎 已转帖", ["/tualatrix"]), "tualatrix");
  assert.equal(from("图拉鼎 转发了", ["/tualatrix"]), "tualatrix");
  assert.equal(from("Elon Musk reposted", ["/elonmusk"]), "elonmusk");
  assert.equal(from("Someone retweeted", ["/SomeOne_1"]), "someone_1");
  assert.equal(from("Hinakiさんがリポスト", ["/Hinaki0102"]), "hinaki0102");
  assert.equal(from("Hinaki 님이 재게시함", ["/Hinaki0102"]), "hinaki0102");
});

test("React 转推包装能同时取到转推者和关注关系", () => {
  const identity = id.repostIdentityFromReactObjects(
    [
      {
        rest_id: "2084000000000000000",
        core: {
          user_results: {
            result: {
              rest_id: "1084912345678901234",
              legacy: { screen_name: "Hinaki0102", following: true },
            },
          },
        },
        legacy: {
          retweeted_status_result: {
            result: {
              rest_id: "2083483852950159734",
              core: {
                user_results: {
                  result: {
                    rest_id: "123456789",
                    legacy: { screen_name: "PDBDSAMA", following: false },
                  },
                },
              },
            },
          },
        },
      },
    ],
    "PDBDSAMA",
    "2083483852950159734",
  );
  assert.deepEqual(identity, {
    isRepost: true,
    handle: "hinaki0102",
    userId: "1084912345678901234",
    following: true,
    idConflict: false,
  });
});

test("React 转推包装与卡片原作者不一致时不采用", () => {
  const identity = id.repostIdentityFromReactObjects(
    [
      {
        core: {
          user_results: {
            result: { legacy: { screen_name: "Hinaki0102", following: true } },
          },
        },
        legacy: {
          retweeted_status_result: {
            result: {
              rest_id: "2083483852950159734",
              core: {
                user_results: {
                  result: { legacy: { screen_name: "someone_else" } },
                },
              },
            },
          },
        },
      },
    ],
    "PDBDSAMA",
    "2083483852950159734",
  );
  assert.deepEqual(identity, {
    isRepost: false,
    handle: "",
    userId: "",
    following: null,
    idConflict: false,
  });
});

test("非转推的 socialContext 不返回 handle", () => {
  // 置顶、点赞、推荐都会复用同一个 socialContext 节点。
  assert.equal(from("已置顶", []), "");
  assert.equal(from("Pinned", []), "");
  assert.equal(from("图拉鼎 赞了", ["/tualatrix"]), "");
  assert.equal(from("laixintao 关注了 tualatrix", ["/laixintao"]), "");
  assert.equal(from("你可能感兴趣", ["/someone"]), "");
});

test("只接受指向账号主页的链接", () => {
  // 推文链接、列表链接和话题链接都不是账号主页。
  assert.equal(from("图拉鼎 已转推", ["/tualatrix/status/123"]), "");
  assert.equal(from("图拉鼎 已转推", ["/i/lists/456"]), "");
  assert.equal(
    from("图拉鼎 已转推", ["/tualatrix/status/123", "/tualatrix"]),
    "tualatrix",
  );
  assert.equal(from("图拉鼎 已转推", ["/toolongtobeahandle_x"]), "");
});

test("没有链接时回退到文案中的 @handle", () => {
  assert.equal(from("@tualatrix 已转推", []), "tualatrix");
  // 「你已转推」这类文案既没有链接也没有 @handle，返回空串后回到按原作者判定。
  assert.equal(from("你已转推", []), "");
  assert.equal(from("You reposted", []), "");
});

test("空输入和异常输入不抛错", () => {
  assert.equal(from("", []), "");
  assert.equal(from("图拉鼎 已转推", null), "");
  assert.equal(from(null, [null, undefined, 123]), "");
  assert.equal(from("图拉鼎 已转推", [null, "/tualatrix"]), "tualatrix");
});
