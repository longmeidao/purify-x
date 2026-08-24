import test from "node:test";
import assert from "node:assert/strict";
import { api, identityTestApi as id } from "./helpers/load-script.mjs";

test("本地账号处置保存成功时 block/allow 互斥", async () => {
  assert.equal(
    await id.setLocalHandleDisposition(
      "local_test",
      "block",
      async () => true,
    ),
    true,
  );
  assert.deepEqual(api.localSettings().block, ["local_test"]);
  assert.deepEqual(api.localSettings().allow, []);

  assert.equal(
    await id.setLocalHandleDisposition(
      "local_test",
      "allow",
      async () => true,
    ),
    true,
  );
  assert.deepEqual(api.localSettings().block, []);
  assert.deepEqual(api.localSettings().allow, ["local_test"]);
});

test("本地账号处置保存失败时回滚两个集合", async () => {
  const before = api.localSettings();
  assert.equal(
    await id.setLocalHandleDisposition(
      "local_test",
      "block",
      async () => false,
    ),
    false,
  );
  assert.deepEqual(api.localSettings(), before);
});

test("本地账号处置拒绝非法 handle 和未知动作", async () => {
  assert.equal(
    await id.setLocalHandleDisposition("bad handle", "block", async () => true),
    false,
  );
  assert.equal(
    await id.setLocalHandleDisposition("valid_handle", "mute", async () => true),
    false,
  );
});
