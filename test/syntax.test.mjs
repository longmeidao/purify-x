import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { SCRIPT_PATH } from "./helpers/load-script.mjs";

test("purify-x.user.js 通过 node --check", () => {
  execFileSync(process.execPath, ["--check", SCRIPT_PATH], {
    stdio: "pipe",
  });
});

test("userscript 头部、脚本内 VERSION 和 package.json 版本一致", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const header = source.match(/^\/\/ @version\s+(\S+)$/m);
  const constant = source.match(/^\s*const VERSION = "(\S+)";$/m);
  assert.ok(header, "没找到 @version 头");
  assert.ok(constant, "没找到 VERSION 常量");
  assert.equal(header[1], constant[1]);

  const pkg = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.version, constant[1]);

  const versionedDocs = [
    ["AGENTS.md", new URL("../AGENTS.md", import.meta.url)],
    ["CLAUDE.md", new URL("../CLAUDE.md", import.meta.url)],
    [
      "安装说明",
      new URL("../docs/Purify-X-安装说明.md", import.meta.url),
    ],
  ];
  for (const [label, url] of versionedDocs) {
    const documentHeader = fs
      .readFileSync(url, "utf8")
      .split("\n")
      .slice(0, 20)
      .join("\n");
    assert.ok(
      documentHeader.includes(constant[1]),
      `${label} 开头没有同步当前版本 ${constant[1]}`,
    );
  }
});

test("userscript 自动更新地址固定指向公开 GitHub 主分支", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const rawUrl =
    "https://raw.githubusercontent.com/longmeidao/purify-x/main/purify-x.user.js";
  assert.match(
    source,
    /^\/\/ @homepageURL\s+https:\/\/github\.com\/longmeidao\/purify-x$/m,
  );
  assert.match(
    source,
    /^\/\/ @supportURL\s+https:\/\/github\.com\/longmeidao\/purify-x\/issues$/m,
  );
  assert.match(
    source,
    new RegExp(`^// @updateURL\\s+${rawUrl.replaceAll(".", "\\.")}$`, "m"),
  );
  assert.match(
    source,
    new RegExp(`^// @downloadURL\\s+${rawUrl.replaceAll(".", "\\.")}$`, "m"),
  );
});

test("发布脚本仍是单文件，且不含常见敏感串", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.ok(!/\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})\b/.test(source));
  assert.ok(!/\/Users\/[a-z]/i.test(source), "脚本中不应出现本地路径");
  assert.ok(!/\b(import|export)\s/.test(source), "发布脚本必须保持单文件无模块语法");
});

test("loading 图标使用固定圆心 SVG，不旋转字体字形", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /class="xps-feedback-spinner" viewBox="0 0 20 20"/);
  assert.match(source, /<circle cx="10" cy="10" r="7"/);
  assert.match(source, /\.xps-feedback-spinner\s*\{[\s\S]*?transform-origin: 50% 50%;/);
  assert.doesNotMatch(source, /state === "loading" \? "↻"/);
});

test("设置界面覆盖键盘焦点和减少动态效果", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /#xps-settings-panel button:focus-visible/);
  assert.match(source, /\.xps-source-card:has\(input:focus-visible\)/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(source, /@keyframes xps-check-pop/);
  assert.doesNotMatch(source, /@keyframes xps-success-pulse/);
});

test("可疑账号与推广内容使用两个独立时间线选项", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /key: "xps-preferences-v1"/);
  assert.match(
    source,
    /const DEFAULT_PREFERENCES = Object\.freeze\(\{[\s\S]*?filterTimeline: false,/,
  );
  assert.match(
    source,
    /const DEFAULT_PREFERENCES = Object\.freeze\(\{[\s\S]*?filterTimelinePromotions: true,/,
  );
  assert.match(source, /id="xps-filter-timeline" type="checkbox"/);
  assert.match(
    source,
    /id="xps-filter-timeline-promotions" type="checkbox"/,
  );
  assert.match(source, />屏蔽时间线中的可疑账号内容</);
  assert.match(source, />屏蔽时间线中的推广内容</);
  assert.match(
    source,
    /filterTimeline:\s*preferences\.filterTimeline,[\s\S]*?filterTimelinePromotions:\s*preferences\.filterTimelinePromotions/,
  );
  assert.match(source, /const timelineMode = filterScope === "timeline";/);
  assert.match(
    source,
    /currentStatusId === mainStatusId\s*\|\|\s*\(mainAuthorHandle && currentAuthorHandle === mainAuthorHandle\)/,
  );
  assert.match(
    source,
    /mainAuthorHandle:\s*authorHandleFromStatusPath\(\),\s*currentAuthorHandle:\s*handle,/,
  );
  assert.doesNotMatch(source, /threadMainMode/);
  assert.match(
    source,
    /shouldForgetCachedHiddenForSurface\(\{[\s\S]*?mainAuthorHandle:\s*authorHandleFromStatusPath\(\),[\s\S]*?currentAuthorHandle,[\s\S]*?\}\)[\s\S]*?forgetHiddenStatus\(currentStatusId\);[\s\S]*?return false;/,
  );
});

test("MXGA 申诉按钮有默认开启的可见性选项", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(
    source,
    /const DEFAULT_PREFERENCES = Object\.freeze\(\{[\s\S]*?showAppealButton: true,/,
  );
  assert.match(source, /id="xps-show-appeal-button" type="checkbox"/);
  assert.match(source, />显示 MXGA 申诉按钮</);
  assert.match(
    source,
    /showAppealButton:\s*panel\.querySelector\("#xps-show-appeal-button"\)\s*\?\.checked/,
  );
  assert.match(source, /preferences\.showAppealButton;/);
  assert.match(source, /dataset\.xpsAppealVisibility/);
  assert.match(
    source,
    /preferences\.showAppealButton\s*&&\s*appealUrl/,
  );
});

// 图片查看器和分栏视图会把回复区压到 200px 上下。这几条规则共同保证
// 按钮整块换行、左侧文案不被挤成逐字竖排，且任何宽度下都不横向溢出。
test("占位行在窄容器下换行而不是压扁文案", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  // 选择器必须锚定行首，否则会匹配到 `.xps-group-tail > .xps-placeholder`
  // 这类后代规则，断言就落到了错误的规则体上。
  const rule = (selector) => {
    const match = source.match(
      new RegExp(`^[ \\t]*${selector}\\s*\\{([\\s\\S]*?)^[ \\t]*\\}`, "m"),
    );
    assert.ok(match, `没找到 ${selector} 的样式规则`);
    return match[1];
  };

  const placeholder = rule("\\.\\$\\{CLASS\\.placeholder\\}");
  assert.match(placeholder, /flex-wrap: wrap;/);

  const copy = rule("\\.xps-placeholder-copy");
  // flex-basis 同时是换行阈值，不能退回 auto。
  assert.match(copy, /flex: 1 1 \d+px;/);

  const label = rule("\\.xps-placeholder-label");
  assert.match(label, /white-space: nowrap;/);
  assert.match(label, /text-overflow: ellipsis;/);
  assert.match(label, /overflow: hidden;/);

  const actions = rule("\\.xps-placeholder-actions");
  // 必须可收缩，否则内部的 wrap 永远不触发，按钮会撑破容器。
  assert.match(actions, /flex: 1 1 auto;/);
  assert.match(actions, /flex-wrap: wrap;/);
  assert.match(actions, /min-width: 0;/);

  const button = rule("\\.\\$\\{CLASS\\.placeholder\\} button");
  assert.match(button, /white-space: nowrap;/);
  assert.match(button, /flex: 0 0 auto;/);
});

test("永久放行按钮缩短并固定在动作区最右侧", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.doesNotMatch(
    source,
    /allowButton\.textContent = "永远放行账号";/,
  );
  assert.match(source, /allowButton\.textContent = "永久放行";/);

  const restoreIndex = source.indexOf("actions.append(restoreButton);");
  const blockIndex = source.indexOf("actions.append(blockButton);");
  const appealIndex = source.indexOf("actions.append(appealLink);");
  const allowIndex = source.indexOf("actions.append(allowButton);");
  assert.ok(restoreIndex >= 0, "恢复此条未加入动作区");
  assert.ok(blockIndex > restoreIndex, "本地屏蔽应位于恢复此条之后");
  assert.ok(appealIndex > blockIndex, "申诉入口应位于本地屏蔽之后");
  assert.ok(allowIndex > appealIndex, "永久放行应固定在动作区最右侧");
  assert.match(
    source,
    /\.\$\{CLASS\.placeholder\} \.xps-allow-account\s*\{[\s\S]*?border-color: transparent;/,
  );
});

test("高置信推广缓存重挂载时仍遵守自己与关系未知保护", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(
    source,
    /cached\.result\?\.timelinePromotionCandidate/,
  );
  assert.match(source, /preferences\.filterTimelinePromotions/);
  assert.match(
    source,
    /isSelf:\s*Boolean\(viewerHandle\(\) && viewerHandle\(\) === handle\)/,
  );
  assert.match(
    source,
    /shouldProtectAuthor\(\{[\s\S]*?following:\s*viewerFollowingState\(article, handle\)/,
  );
});

test("图片查看器侧栏优先保留原生账号身份信息", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(
    source,
    /after\.classList\.add\("xps-account-name-link"\)/,
  );
  assert.match(
    source,
    /\[aria-modal="true"\] \.xps-account-name-link,[\s\S]*?min-width: 64px !important;/,
  );
  assert.match(
    source,
    /\[aria-modal="true"\] \.xps-account-allow,[\s\S]*?display: none !important;/,
  );
  assert.match(
    source,
    /badge\.dataset\.xpsCompactLabel =\s*label === "推广内容"\s*\? "广"\s*:\s*kind === "list"\s*\? "低"\s*:\s*"疑"/,
  );
  assert.match(source, /badge\.textContent = badge\.dataset\.xpsCompactLabel/);
  assert.match(
    source,
    /\[aria-modal="true"\] \.\$\{CLASS\.accountBadge\},[\s\S]*?flex: 0 0 20px;/,
  );
  assert.match(
    source,
    /content: attr\(data-xps-compact-label\);/,
  );
  assert.match(
    source,
    /link\.classList\.remove\("xps-account-name-link"\)/,
  );
});

test("只压缩 handle 旁标志，回复占位操作保留完整文字", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(
    source,
    /allowButton\.className = "xps-account-allow";[\s\S]*?allowButton\.textContent = "放";/,
  );
  assert.match(source, /appealLink\.textContent = "向 MXGA 申诉"/);
  assert.match(
    source,
    /blockButton\.className = "xps-block-account";[\s\S]*?blockButton\.textContent = "加入本地屏蔽";/,
  );
  assert.match(
    source,
    /allowButton\.className = "xps-allow-account";[\s\S]*?allowButton\.textContent = "永久放行";/,
  );
  assert.match(
    source,
    /appealLink\.setAttribute\(\s*"aria-label",\s*`向 MXGA 申诉：@\$\{result\.handle\}`/,
  );
  assert.match(
    source,
    /badge\.setAttribute\("aria-label", `\$\{label\}：\$\{details\}`\)/,
  );
});

test("塌缩多图兼容层已接入扫描、重挂载和窄范围样式", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /repairCollapsedMultiImageLayouts\(articles\);/);
  assert.match(
    source,
    /'a\[href\*="\/status\/"\]\[href\*="\/photo\/"\]'/,
  );
  assert.match(
    source,
    /\.\$\{CLASS\.mediaWidthFix\}\s*\{[\s\S]*?width: 100% !important;/,
  );
  assert.match(source, /mediaStatus: "data-xps-media-status"/);
});

test("远程 JSON 同时限制字符数和 UTF-8 字节数", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /new TextEncoder\(\)\.encode\(text\)\.byteLength/);
  assert.match(source, /byteLength > maxChars/);
  assert.match(source, /MXGA 声明条数/);
});
