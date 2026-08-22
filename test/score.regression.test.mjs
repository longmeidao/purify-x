import test from "node:test";
import assert from "node:assert/strict";
import { scoreReply, threshold } from "./helpers/load-script.mjs";
import { spam, ham } from "./fixtures/replies.mjs";

test("阈值来自脚本本身，测试不硬编码", () => {
  assert.equal(typeof threshold, "number");
  assert.ok(threshold > 0);
});

test("垃圾样本必须被隐藏，且不低于基线分", async (t) => {
  for (const item of spam) {
    await t.test(item.id, () => {
      const result = scoreReply(
        item.text,
        item.name,
        item.handle,
        item.options || {},
      );
      assert.ok(
        result.score >= item.minScore,
        `得分 ${result.score} 低于基线 ${item.minScore}；命中：${result.reasons.join(" / ") || "无"}`,
      );
      assert.ok(
        result.score >= threshold,
        `得分 ${result.score} 未达阈值 ${threshold}；命中：${result.reasons.join(" / ") || "无"}`,
      );
    });
  }
});

test("正常样本必须放行，且不允许悄悄涨分", async (t) => {
  for (const item of ham) {
    await t.test(item.id, () => {
      const result = scoreReply(
        item.text,
        item.name,
        item.handle,
        item.options || {},
      );
      assert.ok(
        result.score < threshold,
        `得分 ${result.score} 达到阈值 ${threshold} 会被误隐藏；命中：${result.reasons.join(" / ")}`,
      );
      assert.ok(
        result.score <= item.maxScore,
        `得分 ${result.score} 高于基线上限 ${item.maxScore}；命中：${result.reasons.join(" / ")}`,
      );
    });
  }
});

test("每条隐藏都必须带可解释的证据", () => {
  for (const item of spam) {
    const result = scoreReply(
      item.text,
      item.name,
      item.handle,
      item.options || {},
    );
    assert.ok(result.reasons.length > 0, `${item.id} 没有原因`);
    assert.equal(
      result.evidence.length,
      result.reasons.length,
      `${item.id} 的 evidence 与 reasons 数量不一致`,
    );
    const total = result.evidence.reduce((sum, item) => sum + item.points, 0);
    assert.equal(total, result.score, `${item.id} 的证据分值合计与总分不一致`);
    for (const evidence of result.evidence) {
      assert.ok(evidence.sourceLabel, `${item.id} 有证据缺少来源标签`);
    }
  }
});

test("永远放行名单之外的空输入不产生分数", () => {
  const result = scoreReply("", "", "");
  assert.equal(result.score, 0);
  assert.deepEqual(result.reasons, []);
});
