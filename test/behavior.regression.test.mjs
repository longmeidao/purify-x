import test from "node:test";
import assert from "node:assert/strict";
import { computeReplyBehaviorSignals } from "./helpers/load-script.mjs";
import { threads } from "./fixtures/threads.mjs";

const sorted = (value) => [...value].sort();

test("回复区行为信号", async (t) => {
  for (const thread of threads) {
    await t.test(thread.id, () => {
      const signals = computeReplyBehaviorSignals(thread.records);
      for (const key of ["duplicated", "repeated", "coordinated"]) {
        assert.deepEqual(
          sorted(signals[key]),
          sorted(thread.expect[key]),
          `${key} 不符：实际 [${sorted(signals[key]).join(",")}]，期望 [${sorted(thread.expect[key]).join(",")}]`,
        );
      }
    });
  }
});

test("空输入返回三个空集合", () => {
  const signals = computeReplyBehaviorSignals([]);
  assert.equal(signals.duplicated.size, 0);
  assert.equal(signals.repeated.size, 0);
  assert.equal(signals.coordinated.size, 0);
});

test("缺少 id 或 handle 的记录被忽略", () => {
  const signals = computeReplyBehaviorSignals([
    { id: "", handle: "a", name: "甜甜🌸", text: "我果然太涩了有人想锐评一下我的福嘛", createdAt: 1 },
    { id: "1", handle: "", name: "若雪🌸", text: "我果然太涩了有人想锐评一下我的福嘛", createdAt: 2 },
  ]);
  assert.equal(signals.duplicated.size, 0);
});
