import test from "node:test";
import assert from "node:assert/strict";
import { identityTestApi } from "./helpers/load-script.mjs";

const {
  contentPolicyForSurface,
  conversationReplyRestrictionFromReactObjects,
  externalLinkSignals,
  promotionPattern,
  shouldProtectAuthor,
} = identityTestApi;

test("从当前 X 推文数据识别 by_invitation 关闭评论", () => {
  const statusId = "2091017527350436210";
  const result = conversationReplyRestrictionFromReactObjects(
    [
      {
        id_str: statusId,
        conversation_control: {
          conversation_owner: { screen_name: "MixMico3" },
          policy: "by_invitation",
        },
        limited_action_results: [
          {
            action: "Reply",
            prompt: { subtext: { text: "Only some accounts can reply." } },
          },
        ],
      },
    ],
    statusId,
  );

  assert.equal(result.repliesRestricted, true);
  assert.equal(result.policy, "by_invitation");
});

test("不采用其他推文的回复权限，也不把 everyone 当作关闭评论", () => {
  assert.deepEqual(
    conversationReplyRestrictionFromReactObjects(
      [
        {
          id_str: "111",
          conversation_control: { policy: "by_invitation" },
        },
        {
          id_str: "222",
          conversation_control: { policy: "everyone" },
        },
      ],
      "222",
    ),
    { repliesRestricted: false, policy: "everyone" },
  );
});

test("t.co 缩链结合可见文本识别 Telegram 与普通外链", () => {
  assert.deepEqual(
    externalLinkSignals([
      "https://t.co/9inI65ERhw",
      "http://\nt.me/MixMico",
    ]),
    { hasExternalLink: true, telegramLink: true },
  );
  assert.deepEqual(
    externalLinkSignals([
      "https://t.co/Myi06H5b8I",
      "https://\nafengyue.com/d5Rbd",
    ]),
    { hasExternalLink: true, telegramLink: false },
  );
});

test("只有关闭评论、外链、推广话术三者齐全才覆盖已关注保护", () => {
  const text = "回馈粉丝，限时无门槛观看完整版，唯一链接 t.me/example";
  assert.equal(
    promotionPattern(text, {
      repliesRestricted: true,
      hasExternalLink: true,
      telegramLink: true,
    }).highConfidence,
    true,
  );
  assert.equal(
    promotionPattern(text, {
      repliesRestricted: false,
      hasExternalLink: true,
      telegramLink: true,
    }).highConfidence,
    false,
  );
  assert.equal(
    promotionPattern("普通技术文章", {
      repliesRestricted: true,
      hasExternalLink: true,
    }).highConfidence,
    false,
  );
});

test("高置信推广只覆盖明确已关注，自己和关系未知仍放行", () => {
  assert.equal(
    shouldProtectAuthor({ following: true, highConfidencePromotion: true }),
    false,
  );
  assert.equal(
    shouldProtectAuthor({ following: true, highConfidencePromotion: false }),
    true,
  );
  assert.equal(
    shouldProtectAuthor({ following: null, highConfidencePromotion: true }),
    true,
  );
  assert.equal(
    shouldProtectAuthor({
      following: true,
      isSelf: true,
      highConfidencePromotion: true,
    }),
    true,
  );
});

test("时间线开启后高置信推广不依赖账号先进入公开名单", () => {
  assert.equal(
    contentPolicyForSurface({
      scope: "timeline",
      primaryAccountListed: false,
      relatedAccountListed: false,
      highConfidencePromotion: true,
    }),
    "account-candidate",
  );
  assert.equal(
    contentPolicyForSurface({
      scope: "timeline",
      primaryAccountListed: false,
      relatedAccountListed: false,
      highConfidencePromotion: false,
    }),
    "none",
  );
});
