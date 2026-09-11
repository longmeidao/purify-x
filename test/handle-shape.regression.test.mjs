// 账号形态锚点与单词沙拉形状的纯函数回归。
//
// 两个判定都不产生分数，只在同时成立时才构成隐藏证据，因此各自的边界
// 必须单独钉住：锚点放宽会波及所有英文账号，形状放宽会波及所有英文短句。
import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi } from "./helpers/load-script.mjs";

const { batchHandleShape, isWordSaladShape } = identityTestApi;

test("乱码批量 handle 需要同时满足稀有字母和长辅音串", () => {
  assert.equal(batchHandleShape("mhmsezruwzxjwl"), "乱码字母串");
  assert.equal(batchHandleShape("zxcvbnmqwjkl"), "乱码字母串");

  // 真人长姓名至多满足其中一条：javierzuniga 有稀有字母但没有长辅音串，
  // schwarzenegger 有长辅音串但稀有字母不足。
  for (const handle of [
    "javierzuniga",
    "juarezvazquez",
    "schwarzenegger",
    "johnsmith",
    "christopherlee",
  ]) {
    assert.equal(batchHandleShape(handle), "", `${handle} 不应被当作乱码账号`);
  }
});

test("数字形态锚点按子信号求和，短尾缀不够门槛", () => {
  assert.equal(batchHandleShape("ab12345678"), "机器数字尾缀");
  assert.equal(batchHandleShape("jenny83922"), "机器数字尾缀");
  assert.equal(batchHandleShape("a1b2c3d4e5"), "机器数字尾缀");

  for (const handle of ["john2024", "mary123", "music_lover2024", "tualatrix2"]) {
    assert.equal(batchHandleShape(handle), "", `${handle} 不应被当作批量账号`);
  }
});

test("handle 锚点对空值和纯字母日常账号保持沉默", () => {
  for (const handle of ["", "  ", "@", "grok", "reader", "dev_person"]) {
    assert.equal(batchHandleShape(handle), "");
  }
});

test("单词沙拉形状只认小写单词加 emoji 的拼接", () => {
  assert.equal(isWordSaladShape("hard fire 💙 lift road"), true);
  assert.equal(isWordSaladShape("make forgive ✅ who happy"), true);
  // 形状本身也会命中正常英文心情贴，所以它永远不单独计分。
  assert.equal(isWordSaladShape("some days feel 🖤 hollow"), true);
});

test("出现大写、标点、数字或中文就不是沙拉形状", () => {
  for (const text of [
    "Some days feel 🖤 hollow",
    "some days feel 🖤 hollow.",
    "some days 2 feel 🖤 hollow",
    "今天天气🌞真好，出门散步了",
    "good morning everyone have a nice day",
    "hard fire lift road wind",
    "",
  ]) {
    assert.equal(isWordSaladShape(text), false, `${text} 不应判为沙拉形状`);
  }
});

test("token 数量超出窗口就不成立", () => {
  assert.equal(isWordSaladShape("hard fire 💙 lift"), false);
  assert.equal(
    isWordSaladShape("hard fire 💙 lift road wind rain snow leaf tree"),
    false,
  );
});
