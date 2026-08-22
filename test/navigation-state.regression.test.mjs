import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  identityTestApi as api,
  SCRIPT_PATH,
} from "./helpers/load-script.mjs";

test("只把同源推文详情识别为可返回的导航", () => {
  const source = "https://x.com/home";

  assert.equal(
    api.detailNavigationStatusId(
      source,
      "https://x.com/longmeidao/status/2090000000000000001",
    ),
    "2090000000000000001",
  );
  assert.equal(
    api.detailNavigationStatusId(
      source,
      "https://x.com/longmeidao/status/2090000000000000001/photo/1",
    ),
    "",
  );
  assert.equal(
    api.detailNavigationStatusId(
      source,
      "https://example.com/longmeidao/status/2090000000000000001",
    ),
    "",
  );
});

test("返回锚点只在原 URL 和有效时间窗口内生效", () => {
  const snapshot = {
    sourceHref: "https://x.com/home",
    capturedAt: 1_000,
  };

  assert.equal(
    api.timelineReturnSnapshotIsCurrent(
      snapshot,
      "https://x.com/home",
      10_000,
    ),
    true,
  );
  assert.equal(
    api.timelineReturnSnapshotIsCurrent(
      snapshot,
      "https://x.com/search?q=purify",
      10_000,
    ),
    false,
  );
  assert.equal(
    api.timelineReturnSnapshotIsCurrent(
      snapshot,
      "https://x.com/home",
      31 * 60 * 1000,
    ),
    false,
  );
});

test("返回时优先恢复原推文的视口位置", () => {
  assert.equal(
    api.timelineReturnScrollDelta({
      savedScrollY: 8_000,
      currentScrollY: 2_000,
      savedAnchorTop: 180,
      currentAnchorTop: 430,
    }),
    250,
  );
  assert.equal(
    api.timelineReturnScrollDelta({
      savedScrollY: 8_000,
      currentScrollY: 2_000,
      savedAnchorTop: 180,
      currentAnchorTop: null,
    }),
    6_000,
  );
});

test("导航钩子保留按页面隔离的隐藏缓存并允许用户取消纠偏", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const hook = source.match(
    /function installNavigationHook\(\) \{([\s\S]*?)\n  const publicApi/,
  )?.[1];

  assert.ok(hook, "没找到导航钩子");
  assert.match(hook, /captureTimelineReturnSnapshot/);
  assert.match(hook, /event\?\.type === "popstate"/);
  assert.match(source, /const interactionEvents = \["wheel", "touchstart", "pointerdown", "keydown"\]/);
  assert.doesNotMatch(hook, /hiddenStatusCache\.clear\(\)/);
});
