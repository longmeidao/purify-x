import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi as api } from "./helpers/load-script.mjs";

test("旧版本没有新字段时：可疑账号时间线关闭，推广时间线开启", () => {
  assert.deepEqual(api.sanitizePreferences(null), {
    schema: 1,
    filterTimeline: false,
    filterTimelinePromotions: true,
    showAppealButton: true,
  });
  assert.deepEqual(api.sanitizePreferences({ filterTimeline: "true" }), {
    schema: 1,
    filterTimeline: false,
    filterTimelinePromotions: true,
    showAppealButton: true,
  });
  assert.deepEqual(api.sanitizePreferences({ showAppealButton: "false" }), {
    schema: 1,
    filterTimeline: false,
    filterTimelinePromotions: true,
    showAppealButton: true,
  });
});

test("偏好设置只接受约定的布尔值", () => {
  assert.deepEqual(api.sanitizePreferences({
    filterTimeline: true,
    filterTimelinePromotions: false,
    showAppealButton: false,
  }), {
    schema: 1,
    filterTimeline: true,
    filterTimelinePromotions: false,
    showAppealButton: false,
  });
});

test("偏好设置写入成功后返回规范值", async () => {
  let written;
  const result = await api.persistPreferences(
    {
      filterTimeline: true,
      filterTimelinePromotions: false,
      showAppealButton: false,
    },
    async (key, value) => {
      written = { key, value };
      return true;
    },
  );
  assert.equal(result.saved, true);
  assert.deepEqual(result.value, {
    schema: 1,
    filterTimeline: true,
    filterTimelinePromotions: false,
    showAppealButton: false,
  });
  assert.deepEqual(written, {
    key: "xps-preferences-v1",
    value: {
      schema: 1,
      filterTimeline: true,
      filterTimelinePromotions: false,
      showAppealButton: false,
    },
  });
});

test("偏好设置写入失败时明确返回失败", async () => {
  const result = await api.persistPreferences(
    {
      filterTimeline: true,
      filterTimelinePromotions: false,
      showAppealButton: false,
    },
    async () => false,
  );
  assert.equal(result.saved, false);
  assert.deepEqual(result.value, {
    schema: 1,
    filterTimeline: true,
    filterTimelinePromotions: false,
    showAppealButton: false,
  });
});
