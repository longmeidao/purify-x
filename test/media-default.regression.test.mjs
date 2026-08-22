import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  identityTestApi as api,
  SCRIPT_PATH,
} from "./helpers/load-script.mjs";
import {
  mediaSubtabLabels,
  profileMediaRoutes,
} from "./fixtures/surfaces.mjs";

test("只在标准账号 Media 路由准备默认 Photos", () => {
  for (const fixture of profileMediaRoutes) {
    assert.equal(
      api.isProfileMediaPath(fixture.pathname),
      fixture.expected,
      fixture.pathname,
    );
  }
});

test("识别中英文 Photos 和 Videos 子页标签", () => {
  for (const fixture of mediaSubtabLabels) {
    assert.equal(
      api.mediaSubtabKind(fixture.label),
      fixture.expected,
      fixture.label,
    );
  }
});

test("新版 Videos 下拉按两步切换到 Photos", () => {
  assert.equal(
    api.mediaPhotosDefaultAction({
      pathname: "/RZT0571/media",
      hasVideosTrigger: true,
    }),
    "open-videos-menu",
  );
  assert.equal(
    api.mediaPhotosDefaultAction({
      pathname: "/RZT0571/media",
      hasPhotosOption: true,
      menuRequested: true,
    }),
    "select-photos",
  );
  assert.equal(
    api.mediaPhotosDefaultAction({
      pathname: "/RZT0571/media",
      photosSelected: true,
    }),
    "done",
  );
  assert.equal(
    api.mediaPhotosDefaultAction({
      pathname: "/RZT0571/status/1",
      hasVideosTrigger: true,
    }),
    "none",
  );
});

test("默认 Photos 只执行一次，并尊重用户手动选择", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /mediaPhotosDefaultPending/);
  assert.match(source, /event\.isTrusted/);
  assert.match(source, /videosTrigger\.click\(\)/);
  assert.match(source, /photosMenuOption\.click\(\)/);
  assert.match(source, /mediaPhotosMenuRequested/);
});
