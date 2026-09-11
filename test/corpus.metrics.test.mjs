// 语料级指标回归。
//
// score.regression 逐条卡 minScore / maxScore，能发现「某条样本被顶破」；
// 这里卡整体的 precision、recall 和误报率，用来发现「规则整体放宽」：
// 新增一条宽松规则时，往往每条样本都还在各自的上限里，但误伤面已经变大。
//
// 已知漏判用样本上的 knownLimitation 显式登记：它不算失败，但数量有上限，
// 而且一旦真的能命中，测试会要求把标记去掉，避免长期挂着过期的免责声明。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { scoreReply, threshold } from "./helpers/load-script.mjs";
import { spam, ham } from "./fixtures/replies.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(
  readFileSync(path.join(here, "fixtures", "metrics.json"), "utf8"),
);

function hidden(item) {
  const result = scoreReply(
    item.text,
    item.name,
    item.handle,
    item.options || {},
  );
  return { hide: result.score >= threshold, result };
}

function measure() {
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  const knownLimitations = [];
  const missed = [];
  const falsePositives = [];
  const staleLimitations = [];

  for (const item of spam) {
    const { hide, result } = hidden(item);
    if (item.knownLimitation) {
      knownLimitations.push(item.id);
      if (hide) staleLimitations.push(item.id);
      continue;
    }
    if (hide) {
      tp += 1;
    } else {
      fn += 1;
      missed.push(`${item.id}（${result.score} 分）`);
    }
  }

  for (const item of ham) {
    const { hide, result } = hidden(item);
    if (hide) {
      fp += 1;
      falsePositives.push(
        `${item.id}（${result.score} 分：${result.reasons.join(" / ")}）`,
      );
    } else {
      tn += 1;
    }
  }

  return {
    tp,
    fn,
    fp,
    tn,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    falsePositiveRate: fp + tn === 0 ? 0 : fp / (fp + tn),
    knownLimitations,
    missed,
    falsePositives,
    staleLimitations,
  };
}

test("语料规模只能增长，不能靠删样本让指标变好看", () => {
  assert.ok(
    spam.length >= baseline.min_spam,
    `垃圾样本 ${spam.length} 条少于基线 ${baseline.min_spam} 条`,
  );
  assert.ok(
    ham.length >= baseline.min_ham,
    `正常样本 ${ham.length} 条少于基线 ${baseline.min_ham} 条`,
  );
});

test("语料指标不得低于基线", (t) => {
  const metrics = measure();
  t.diagnostic(
    `tp=${metrics.tp} fp=${metrics.fp} fn=${metrics.fn} tn=${metrics.tn} ` +
      `precision=${metrics.precision.toFixed(3)} ` +
      `recall=${metrics.recall.toFixed(3)} ` +
      `fpr=${metrics.falsePositiveRate.toFixed(3)} ` +
      `known_limitation=${metrics.knownLimitations.length}`,
  );

  assert.ok(
    metrics.precision >= baseline.min_precision,
    `precision ${metrics.precision} 低于基线 ${baseline.min_precision}；误伤：${metrics.falsePositives.join("；") || "无"}`,
  );
  assert.ok(
    metrics.recall >= baseline.min_recall,
    `recall ${metrics.recall} 低于基线 ${baseline.min_recall}；漏判：${metrics.missed.join("；") || "无"}`,
  );
  assert.ok(
    metrics.falsePositiveRate <= baseline.max_false_positive_rate,
    `误报率 ${metrics.falsePositiveRate} 高于基线 ${baseline.max_false_positive_rate}；误伤：${metrics.falsePositives.join("；") || "无"}`,
  );
});

test("已知漏判必须显式登记，且不能超出上限", () => {
  const metrics = measure();
  assert.ok(
    metrics.knownLimitations.length <= baseline.max_known_limitation,
    `已登记的已知漏判 ${metrics.knownLimitations.length} 条超出上限 ${baseline.max_known_limitation}：${metrics.knownLimitations.join("、")}`,
  );
  assert.deepEqual(
    metrics.staleLimitations,
    [],
    `这些样本已经能被隐藏，请去掉 knownLimitation 并补上 minScore：${metrics.staleLimitations.join("、")}`,
  );
});
