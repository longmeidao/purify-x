import test from "node:test";
import assert from "node:assert/strict";
import {
  computeReplyBehaviorSignals,
  scoreReply,
  threshold,
} from "./helpers/load-script.mjs";
import { threads } from "./fixtures/threads.mjs";

// 把「回复区行为信号 → 单条评分」两步串起来，验证整条判定链在真实回复区
// 组合下的最终隐藏结果，而不是只验证单个信号。
function judgeThread(records) {
  const signals = computeReplyBehaviorSignals(records);
  return records.map((record) => {
    const id = String(record.id);
    const result = scoreReply(record.text, record.name, record.handle, {
      coordinatedBurst: signals.coordinated.has(id),
      repeatedLowInfo: signals.repeated.has(id),
      duplicateTemplate: signals.duplicated.has(id),
    });
    return { id, result, hidden: result.score >= threshold };
  });
}

test("回复区端到端判定", async (t) => {
  for (const thread of threads) {
    await t.test(thread.id, () => {
      const judged = judgeThread(thread.records);
      const hidden = judged
        .filter((item) => item.hidden)
        .map((item) => item.id)
        .sort();
      assert.deepEqual(
        hidden,
        [...thread.expect.hidden].sort(),
        `隐藏结果不符\n${judged
          .map(
            (item) =>
              `  ${item.id} ${item.hidden ? "隐藏" : "放行"} ${item.result.score} 分：${item.result.reasons.join(" / ") || "无命中"}`,
          )
          .join("\n")}`,
      );
      for (const item of judged) {
        if (!item.hidden) continue;
        assert.ok(
          item.result.reasons.length > 0,
          `${thread.id}/${item.id} 被隐藏但没有原因`,
        );
      }
    });
  }
});
