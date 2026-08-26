import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  identityTestApi as api,
  SCRIPT_PATH,
} from "./helpers/load-script.mjs";

test("观察器监听文本节点原地更新", () => {
  assert.deepEqual(api.mutationObserverOptions, {
    childList: true,
    characterData: true,
    subtree: true,
  });
});

test("外链预览卡片新增节点或原地改字都会补扫所属推文", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const plan = source.match(
    /function mutationScanPlan\(records\) \{([\s\S]*?)\n  function releaseRecycledCells/,
  )?.[1];

  assert.ok(plan, "没找到 mutationScanPlan");
  assert.match(plan, /tweetRelevantSelector[\s\S]*?SELECTOR\.cardWrapper/);
  assert.match(
    plan,
    /target\?\.closest\?\.\([\s\S]*?SELECTOR\.cardWrapper[\s\S]*?\)/,
  );
  assert.match(
    source,
    /observer\.observe\(document\.body, MUTATION_OBSERVER_OPTIONS\)/,
  );
});

test("预览卡片文字原地更新时实际返回外层推文扫描根", () => {
  const previousElement = globalThis.Element;

  class FakeElement {
    constructor(role, article = null, card = null) {
      this.role = role;
      this.article = article || (role === "article" ? this : null);
      this.card = card || (role === "card" ? this : null);
      this.parentElement = null;
    }

    matches(selector) {
      return (
        (this.role === "article" &&
          selector.includes('article[data-testid="tweet"]')) ||
        (this.role === "card" &&
          selector.includes('[data-testid="card.wrapper"]'))
      );
    }

    closest(selector) {
      if (selector.includes(".xps-")) return null;
      if (selector.includes('[data-testid="card.wrapper"]')) return this.card;
      if (selector.includes('article[data-testid="tweet"]')) return this.article;
      return null;
    }

    querySelector() {
      return null;
    }

    querySelectorAll() {
      return [];
    }
  }

  try {
    globalThis.Element = FakeElement;
    const article = new FakeElement("article");
    const card = new FakeElement("card", article);
    const cardText = new FakeElement("text", article, card);
    card.parentElement = article;
    cardText.parentElement = card;

    const result = api.mutationScanPlan([
      {
        target: { parentElement: cardText },
        addedNodes: [],
        removedNodes: [],
      },
    ]);

    assert.equal(result.global, false);
    assert.equal(result.groupingChanged, false);
    assert.deepEqual([...result.roots], [article]);
  } finally {
    if (previousElement === undefined) delete globalThis.Element;
    else globalThis.Element = previousElement;
  }
});
