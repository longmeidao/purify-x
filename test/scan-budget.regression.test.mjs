import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi as api } from "./helpers/load-script.mjs";

test("扫描队列同时受单帧条数和时间预算约束", () => {
  assert.equal(
    api.scanWorkShouldYield({
      processed: 49,
      elapsedMs: 7.9,
      maxArticles: 50,
      frameBudgetMs: 8,
    }),
    false,
  );
  assert.equal(
    api.scanWorkShouldYield({
      processed: 50,
      elapsedMs: 1,
      maxArticles: 50,
      frameBudgetMs: 8,
    }),
    true,
  );
  assert.equal(
    api.scanWorkShouldYield({
      processed: 1,
      elapsedMs: 8,
      maxArticles: 50,
      frameBudgetMs: 8,
    }),
    true,
  );
});
