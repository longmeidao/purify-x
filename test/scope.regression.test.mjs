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

test("普通页面与默认关闭的时间线不进入过滤作用域", () => {
  assert.equal(api.articleFilterScope(), "none");
  assert.equal(
    api.articleFilterScope({ timelineEligible: true, filterTimeline: false }),
    "none",
  );
  assert.equal(
    api.articleFilterScope({ timelineEligible: true, filterTimeline: true }),
    "timeline",
  );
});
