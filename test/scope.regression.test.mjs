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
  assert.equal(api.authorHandleFromStatusPath(""), "");
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
