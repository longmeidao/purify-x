import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi as api } from "./helpers/load-script.mjs";

test("修复 Zen 中缩成边框宽度的多图轮播", () => {
  assert.equal(
    api.shouldRepairCollapsedMultiImageLayout({
      photoCount: 3,
      containerWidth: 2,
      parentWidth: 598,
    }),
    true,
  );
  assert.equal(
    api.shouldRepairCollapsedMultiImageLayout({
      photoCount: 2,
      containerWidth: 0,
      parentWidth: 566,
    }),
    true,
  );
});

test("不改写单图、正常宽度和不可见容器", () => {
  const cases = [
    { photoCount: 1, containerWidth: 2, parentWidth: 598 },
    { photoCount: 3, containerWidth: 566, parentWidth: 598 },
    { photoCount: 3, containerWidth: 0, parentWidth: 0 },
    { photoCount: 3, containerWidth: 4, parentWidth: 120 },
    { photoCount: 3, containerWidth: Number.NaN, parentWidth: 598 },
  ];
  for (const input of cases) {
    assert.equal(api.shouldRepairCollapsedMultiImageLayout(input), false);
  }
});

test("已修复节点保持幂等，新重挂载的塌缩节点仍会修复", () => {
  const observed = {
    photoCount: 3,
    containerWidth: 2,
    parentWidth: 598,
  };
  assert.equal(
    api.shouldRepairCollapsedMultiImageLayout({
      ...observed,
      alreadyRepaired: true,
    }),
    false,
  );
  assert.equal(
    api.shouldRepairCollapsedMultiImageLayout({
      ...observed,
      alreadyRepaired: false,
    }),
    true,
  );
});
