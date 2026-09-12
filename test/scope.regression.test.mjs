import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi as api } from "./helpers/load-script.mjs";
import { surfaceCases } from "./fixtures/surfaces.mjs";

for (const fixture of surfaceCases) {
  test(`${fixture.id}：${fixture.note}`, () => {
    assert.equal(
      api.articleFilterScope(fixture.input),
      fixture.expectedScope,
    );
  });
}

test("两个时间线过滤选项独立决定是否进入时间线作用域", () => {
  assert.equal(api.articleFilterScope(), "none");
  assert.equal(
    api.articleFilterScope({
      timelineEligible: true,
      filterTimeline: false,
      filterTimelinePromotions: false,
    }),
    "none",
  );
  assert.equal(
    api.articleFilterScope({
      timelineEligible: true,
      filterTimeline: true,
      filterTimelinePromotions: false,
    }),
    "timeline",
  );
  assert.equal(
    api.articleFilterScope({
      timelineEligible: true,
      filterTimeline: false,
      filterTimelinePromotions: true,
    }),
    "timeline",
  );
});

test("账号主页是推广过滤范围，但详情页主贴仍不是", () => {
  assert.equal(api.isProfilePostTimeline("/Smeme_Tea"), true);
  assert.equal(api.isProfilePostTimeline("/Smeme_Tea/with_replies"), true);
  assert.equal(api.isProfilePostTimeline("/Smeme_Tea/media"), false);
  assert.equal(
    api.isProfilePostTimeline("/Smeme_Tea/status/2091023938298216512"),
    false,
  );
});

test("详情页 URL 解析出主贴作者 handle，非法路径返回空", () => {
  assert.equal(
    api.authorHandleFromStatusPath(
      "/FortuneCutie00/status/2089971970238750960",
    ),
    "fortunecutie00",
  );
  assert.equal(
    api.authorHandleFromStatusPath(
      "/FortuneCutie00/status/2089971970238750960/photo/1",
    ),
    "fortunecutie00",
  );
  assert.equal(api.authorHandleFromStatusPath("/home"), "");
  assert.equal(api.authorHandleFromStatusPath("/status/123"), "");
  assert.equal(api.authorHandleFromStatusPath("/i/status/123"), "");
  assert.equal(api.authorHandleFromStatusPath("/foo/bar/status/123"), "");
  assert.equal(api.authorHandleFromStatusPath(""), "");
});

test("缓存重挂载沿用详情页主贴及作者续写放行边界", () => {
  assert.equal(
    api.shouldForgetCachedHiddenForSurface({
      mainStatusId: "100",
      currentStatusId: "100",
      mainAuthorHandle: "thread_author",
      currentAuthorHandle: "thread_author",
    }),
    true,
  );
  assert.equal(
    api.shouldForgetCachedHiddenForSurface({
      mainStatusId: "100",
      currentStatusId: "101",
      mainAuthorHandle: "thread_author",
      currentAuthorHandle: "thread_author",
    }),
    true,
  );
  assert.equal(
    api.shouldForgetCachedHiddenForSurface({
      mainStatusId: "100",
      currentStatusId: "102",
      mainAuthorHandle: "thread_author",
      currentAuthorHandle: "other_author",
    }),
    false,
  );
  assert.equal(
    api.shouldForgetCachedHiddenForSurface({
      mainStatusId: "",
      currentStatusId: "102",
      mainAuthorHandle: "",
      currentAuthorHandle: "other_author",
    }),
    false,
  );
});

test("扫描入口不会跳过账号主页帖子列表", () => {
  assert.equal(api.articleFilteringSurfaceEnabled(), false);
  assert.equal(
    api.articleFilteringSurfaceEnabled({ profilePostTimeline: true }),
    true,
  );
  assert.equal(
    api.articleFilteringSurfaceEnabled({ filterableTimeline: true }),
    true,
  );
  assert.equal(
    api.articleFilteringSurfaceEnabled({ threadId: "2091014885954269435" }),
    true,
  );
});

test("作者推广续写使用高置信策略，仍保护未知关系与当前账号", () => {
  assert.equal(api.contentPolicyForSurface({ scope: "thread-promotion", highConfidencePromotion: true }), "promotion-candidate");
  assert.equal(api.contentPolicyForSurface({ scope: "thread-promotion", highConfidencePromotion: false }), "none");
  for (const input of [{ following: null }, { following: false, isSelf: true }]) {
    assert.equal(api.shouldProtectAuthor({ ...input, highConfidencePromotion: true }), true);
  }
  // 重挂载不信任旧广告缓存，先放行，再由当前正文重新判定。
  assert.equal(api.shouldForgetCachedHiddenForSurface({ mainStatusId: "100", currentStatusId: "101", mainAuthorHandle: "sampleauthor", currentAuthorHandle: "sampleauthor" }), true);
});
