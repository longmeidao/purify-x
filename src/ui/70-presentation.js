  function tweetBadgePlacement(userName, handle) {
    if (!(userName instanceof Element) || !handle) {
      return { host: userName, after: null };
    }
    const profileLinks = [...userName.querySelectorAll('a[href^="/"]')].filter(
      (link) => {
        const path = (link.getAttribute("href") || "")
          .split(/[?#]/, 1)[0]
          .replace(/^\/+|\/+$/g, "");
        return normalizeHandle(path) === handle;
      },
    );
    if (profileLinks.length === 0) {
      return { host: userName, after: null };
    }
    const displayNameLink =
      profileLinks.find(
        (link) => !normalize(visibleText(link)).startsWith(`@${handle}`),
      ) || profileLinks[0];
    return {
      host: displayNameLink.parentElement || userName,
      after: displayNameLink,
    };
  }

  function profileBadgeHost(profileUserName, handle) {
    if (!(profileUserName instanceof Element) || !handle) {
      return profileUserName;
    }
    const nameLine = [...profileUserName.querySelectorAll("[dir]")]
      .reverse()
      .find((element) => {
        const text = normalize(visibleText(element));
        return text && !text.includes(`@${handle}`);
      });
    return nameLine || profileUserName;
  }

  function setAccountBadge(container, {
    context,
    details,
    handle,
    host = container,
    after = null,
    kind,
    label,
  }) {
    if (!(container instanceof Element) || !(host instanceof Element)) return;
    for (const link of container.querySelectorAll(".xps-account-name-link")) {
      if (link !== after) link.classList.remove("xps-account-name-link");
    }
    if (after instanceof Element) {
      after.classList.add("xps-account-name-link");
    }
    let badge = container.querySelector(
      `.${CLASS.accountBadge}[data-xps-context="${context}"]`,
    );
    if (!badge) {
      badge = document.createElement("span");
      badge.className = CLASS.accountBadge;
      badge.dataset.xpsContext = context;
      badge.setAttribute("role", "note");
      badge.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }
    if (badge.parentElement !== host) {
      badge.parentElement?.classList.remove("xps-account-badge-host");
      if (after?.parentElement === host) after.after(badge);
      else host.append(badge);
    } else if (after?.parentElement === host && after.nextElementSibling !== badge) {
      after.after(badge);
    }
    if (host !== container) host.classList.add("xps-account-badge-host");
    badge.dataset.xpsHandle = handle;
    badge.dataset.xpsKind = kind;
    badge.dataset.xpsCompactLabel =
      label === "推广内容" ? "广" : kind === "list" ? "低" : "疑";
    badge.textContent = badge.dataset.xpsCompactLabel;
    badge.title = `Purify X\n@${handle}\n${details}`;
    badge.setAttribute("aria-label", `${label}：${details}`);
    if (!HANDLE_RE.test(handle)) return;
    let allowButton = container.querySelector(
      `.xps-account-allow[data-xps-context="${context}"]`,
    );
    if (!allowButton) {
      allowButton = document.createElement("button");
      allowButton.type = "button";
      allowButton.className = "xps-account-allow";
      allowButton.dataset.xpsContext = context;
      allowButton.textContent = "放";
      allowButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const targetHandle = allowButton.dataset.xpsHandle;
        if (!targetHandle) return;
        allowButton.disabled = true;
        allowButton.textContent = "…";
        const saved = await allowHandleLocally(targetHandle);
        if (!saved) {
          allowButton.disabled = false;
          allowButton.textContent = "放";
          showToast("无法保存该账号", "error");
        }
      });
    }
    allowButton.dataset.xpsHandle = handle;
    allowButton.title = `将 @${handle} 永久加入本地放行名单`;
    allowButton.setAttribute("aria-label", `永久放行账号 @${handle}`);
    if (allowButton.parentElement !== host || badge.nextElementSibling !== allowButton) {
      badge.after(allowButton);
    }
  }

  function removeAccountBadge(container, context, kind = "") {
    if (!(container instanceof Element)) return;
    const badge = container.querySelector(
      `.${CLASS.accountBadge}[data-xps-context="${context}"]`,
    );
    if (badge && (!kind || badge.dataset.xpsKind === kind)) {
      badge.parentElement?.classList.remove("xps-account-badge-host");
      badge.remove();
      container
        .querySelector(
          `.xps-account-allow[data-xps-context="${context}"]`,
        )
        ?.remove();
    }
    for (const host of container.querySelectorAll(".xps-account-badge-host")) {
      if (!host.querySelector(`.${CLASS.accountBadge}`)) {
        host.classList.remove("xps-account-badge-host");
      }
    }
    for (const link of container.querySelectorAll(".xps-account-name-link")) {
      if (!link.parentElement?.querySelector(`.${CLASS.accountBadge}`)) {
        link.classList.remove("xps-account-name-link");
      }
    }
  }
  function annotateTweetListedAccount(
    article,
    knownHandle = "",
    knownUserId = "",
  ) {
    if (!(article instanceof Element)) return;
    const userName = article.querySelector(SELECTOR.userName);
    const handle = knownHandle || articleHandle(article);
    const sources = accountSourceNames(handle, knownUserId);
    if (!userName || !handle || sources.length === 0) {
      removeAccountBadge(userName, "tweet", "list");
      return;
    }
    setAccountBadge(userName, {
      ...tweetBadgePlacement(userName, handle),
      context: "tweet",
      details: `账号名单：${sources.join("、")}`,
      handle,
      kind: "list",
      label: "低质量账号",
    });
  }

  function annotateReplyResult(
    article,
    result,
    knownHandle = "",
    knownUserId = "",
  ) {
    const userName = article.querySelector(SELECTOR.userName);
    const handle = result?.handle || knownHandle || articleHandle(article);
    const userId = result?.userId || knownUserId;
    const sources = accountSourceNames(handle, userId);
    if (sources.length > 0) {
      annotateTweetListedAccount(article, handle, userId);
      return;
    }
    if (result?.score >= CONFIG.threshold) {
      const contentLabel =
        result.itemLabel === "推广内容" ? "推广内容" : "可疑回复";
      setAccountBadge(userName, {
        ...tweetBadgePlacement(userName, handle),
        context: "tweet",
        details: evidenceLine(result.evidence, 4),
        handle,
        kind: "reply",
        label: contentLabel,
      });
      return;
    }
    // 不按 kind 过滤：走到这里说明账号已不在任何名单且未达阈值，
    // 无论此前徽章是 "list" 还是 "reply"，都应清除——否则从名单账号
    // 永久放行后，旧徽章与其上的"永远放行"按钮会卡在禁用态残留。
    removeAccountBadge(userName, "tweet");
  }

  function profileHandleFromLocation() {
    const parts = location.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => part.toLowerCase());
    if (
      parts.length === 0 ||
      parts.length > 2 ||
      RESERVED_PROFILE_PATHS.has(parts[0]) ||
      !HANDLE_RE.test(parts[0])
    ) {
      return "";
    }
    if (parts.length === 2 && !PROFILE_SUBPAGES.has(parts[1])) {
      return "";
    }
    return normalizeHandle(parts[0]);
  }

  function annotateProfileAccount() {
    const handle = profileHandleFromLocation();
    const profileUserName = document.querySelector(SELECTOR.profileUserName);
    for (const stale of document.querySelectorAll(
      `.${CLASS.accountBadge}[data-xps-context="profile"]`,
    )) {
      if (
        !handle ||
        stale.dataset.xpsHandle !== handle ||
        !profileUserName?.contains(stale)
      ) {
        stale.remove();
      }
    }
    if (!handle || !profileUserName) return;

    const userId = cachedProfileUserId(handle);
    const sources = accountSourceNames(handle, userId);
    if (sources.length === 0) {
      removeAccountBadge(profileUserName, "profile");
      return;
    }
    setAccountBadge(profileUserName, {
      context: "profile",
      details: `账号名单：${sources.join("、")}`,
      handle,
      host: profileBadgeHost(profileUserName, handle),
      kind: "list",
      label: "低质量账号",
    });
  }

  function makePlaceholder(cell, result, fp) {
    let placeholder = cell.querySelector(`:scope > .${CLASS.placeholder}`);
    const evidenceSignature = JSON.stringify(result.evidence || []);
    const appealVisibility = preferences.showAppealButton ? "shown" : "hidden";
    // 推广内容是"这条帖子在打广告"的判定，不是"这个账号一直是垃圾"。
    // 同一个账号平时发正常内容、偶尔接一条推广，屏蔽账号会误伤后续内容，
    // 所以这类占位只保留恢复与永久放行。
    const promotionOnly = result.promotionOnly ? "1" : "0";
    if (
      placeholder?.dataset.xpsVersion === VERSION &&
      placeholder.dataset.xpsEvidence === evidenceSignature &&
      placeholder.dataset.xpsAppealVisibility === appealVisibility &&
      placeholder.dataset.xpsPromotionOnly === promotionOnly
    ) {
      return placeholder;
    }
    // Upgrade placeholders left by an older enabled copy of this userscript.
    // Without this takeover, the old copy can win the race and leave every
    // reply as a separate row even though the new grouping code is loaded.
    placeholder?.remove();

    placeholder = document.createElement("div");
    placeholder.className = CLASS.placeholder;
    placeholder.dataset.xpsVersion = VERSION;
    placeholder.dataset.xpsEvidence = evidenceSignature;
    placeholder.dataset.xpsAppealVisibility = appealVisibility;
    placeholder.dataset.xpsPromotionOnly = promotionOnly;
    placeholder.title = result.reasons.join("\n");

    const copy = document.createElement("span");
    copy.className = "xps-placeholder-copy";

    const label = document.createElement("span");
    label.className = "xps-placeholder-label";
    const itemLabel = result.itemLabel || "可疑回复";
    const individualLabel = `已隐藏${itemLabel}（评分 ${result.score}）`;
    label.textContent = individualLabel;
    placeholder.dataset.individualLabel = individualLabel;

    const reason = document.createElement("span");
    reason.className = "xps-placeholder-reason";
    const individualReason =
      evidenceLine(result.evidence) || "原因：未提供规则详情";
    reason.textContent = individualReason;
    placeholder.dataset.individualReason = individualReason;
    copy.append(label, reason);

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "xps-restore";
    restoreButton.textContent = "恢复此条";
    restoreButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      restoredFingerprints.add(fp);
      cell.classList.remove(CLASS.hidden);
      cell.classList.remove(CLASS.groupHead, CLASS.groupTail, CLASS.groupOpen);
      cell.classList.add(CLASS.restored);
      cell.removeAttribute(ATTRIBUTE.group);
      cell.removeAttribute(ATTRIBUTE.score);
      placeholder.remove();
      filteredCells.delete(cell);
      const article = cell.querySelector(SELECTOR.tweet);
      if (article) forgetHiddenStatus(article);
      const disabledRules = recordAiFalsePositiveFeedback(
        result,
        article ? articleStatusId(article) : "",
      );
      article?.setAttribute(ATTRIBUTE.state, "restored");
      refreshGroups();
      updateCounter();
      if (disabledRules.length > 0) {
        showToast(
          `已自动停用误判累计达到 3 次的 AI 学习规则：${disabledRules.join("、")}`,
          "success",
        );
      }
    });

    const actions = document.createElement("span");
    actions.className = "xps-placeholder-actions";
    // 先放高频、可逆的单条恢复；永久放行固定在动作区最右侧并降低强调，
    // 避免它停在屏幕中央成为最容易误点的按钮。
    actions.append(restoreButton);
    if (HANDLE_RE.test(result.handle || "")) {
      const normalizedResultHandle = normalizeHandle(result.handle);
      const allowButton = document.createElement("button");
      allowButton.type = "button";
      allowButton.className = "xps-allow-account";
      allowButton.textContent = "永久放行";
      allowButton.title = `将 @${result.handle} 加入本地永远放行名单`;
      allowButton.setAttribute(
        "aria-label",
        `永久放行账号 @${result.handle}`,
      );
      allowButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        allowButton.disabled = true;
        allowButton.textContent = "正在保存…";
        const saved = await allowHandleLocally(result.handle);
        if (!saved) {
          allowButton.disabled = false;
          allowButton.textContent = "永久放行";
          showToast("无法保存该账号", "error");
        } else {
          const article = cell.querySelector(SELECTOR.tweet);
          const disabledRules = recordAiFalsePositiveFeedback(
            result,
            article ? articleStatusId(article) : "",
          );
          if (disabledRules.length > 0) {
            showToast(
              `账号已放行；同时停用误判 AI 规则：${disabledRules.join("、")}`,
              "success",
            );
          }
        }
      });
      if (
        !result.promotionOnly &&
        !localBlockedHandles.has(normalizedResultHandle)
      ) {
        const blockButton = document.createElement("button");
        blockButton.type = "button";
        blockButton.className = "xps-block-account";
        blockButton.textContent = "加入本地屏蔽";
        blockButton.title =
          `将 @${result.handle} 加入本地屏蔽名单；不会调用 X 拉黑接口`;
        blockButton.setAttribute(
          "aria-label",
          `加入本地屏蔽账号 @${result.handle}`,
        );
        blockButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          blockButton.disabled = true;
          blockButton.textContent = "正在保存…";
          const saved = await blockHandleLocally(result.handle);
          if (!saved) {
            blockButton.disabled = false;
            blockButton.textContent = "加入本地屏蔽";
            showToast("无法保存该账号", "error");
          }
        });
        actions.append(blockButton);
      }
      // 本地放行只影响自己；命中公开名单时再给一个上游申诉入口，
      // 让误判能被 MXGA 维护者复核后从名单里摘掉。
      const appealUrl = mxgaAppealUrl(result.handle, result.userId);
      if (preferences.showAppealButton && appealUrl) {
        const appealLink = document.createElement("a");
        appealLink.className = "xps-appeal-account";
        appealLink.textContent = "向 MXGA 申诉";
        appealLink.title = `@${result.handle} 命中 MXGA 公开名单，可在 GitHub 提交误判申诉`;
        appealLink.setAttribute(
          "aria-label",
          `向 MXGA 申诉：@${result.handle}`,
        );
        appealLink.href = appealUrl;
        appealLink.target = "_blank";
        appealLink.rel = "noopener noreferrer";
        appealLink.addEventListener("click", (event) => {
          event.stopPropagation();
        });
        actions.append(appealLink);
      }
      actions.append(allowButton);
    }

    placeholder.append(copy, actions);
    cell.append(placeholder);
    return placeholder;
  }

  function hideArticle(article, result, fp) {
    const cell = findCell(article);
    if (!cell || restoredFingerprints.has(fp)) return;

    cell.classList.add(CLASS.hidden);
    cell.classList.remove(CLASS.restored);
    cell.setAttribute(ATTRIBUTE.score, String(result.score));
    cell.setAttribute(
      ATTRIBUTE.cellStatus,
      articleStatusId(article),
    );
    makePlaceholder(cell, result, fp);
    filteredCells.add(cell);
    article.setAttribute(ATTRIBUTE.state, "hidden");
    article.setAttribute(ATTRIBUTE.fingerprint, fp);
    rememberHiddenStatus(article, result, fp);

    if (CONFIG.debug) {
      console.debug("[Purify X] hidden", {
        score: result.score,
        reasons: result.reasons,
        name: result.name,
        text: result.text,
      });
    }
  }

  function unhideArticle(article, state = "visible") {
    const cell = findCell(article);
    if (!cell) return;

    forgetHiddenStatus(article);
    const alreadyVisible =
      !cell.classList.contains(CLASS.hidden) &&
      !cell.querySelector(`:scope > .${CLASS.placeholder}`) &&
      !filteredCells.has(cell);
    article.setAttribute(ATTRIBUTE.state, state);
    if (alreadyVisible) return;

    cell.classList.remove(
      CLASS.hidden,
      CLASS.groupHead,
      CLASS.groupTail,
      CLASS.groupOpen,
    );
    cell.removeAttribute(ATTRIBUTE.score);
    cell.removeAttribute(ATTRIBUTE.group);
    cell.removeAttribute(ATTRIBUTE.cellStatus);
    cell.querySelector(`:scope > .${CLASS.placeholder}`)?.remove();
    filteredCells.delete(cell);
  }

  function rehydrateCachedHiddenArticle(article, statusId = "") {
    if (!(article instanceof HTMLElement)) return false;
    const currentStatusId = statusId || articleStatusId(article);
    const cached = cachedHiddenStatus(currentStatusId);
    const currentAuthorHandle =
      articleHandle(article) || normalizeHandle(cached?.result?.handle);
    if (
      shouldForgetCachedHiddenForSurface({
        mainStatusId: statusIdFromLocation(),
        currentStatusId,
        mainAuthorHandle: authorHandleFromStatusPath(),
        currentAuthorHandle,
      })
    ) {
      // 详情页主贴及主贴作者的续写是用户主动阅读的内容。即使身份信息
      // 晚到前曾缓存过隐藏结果，重挂载时也必须丢弃，不能先误隐藏一帧。
      forgetHiddenStatus(currentStatusId);
      return false;
    }
    if (!cached || restoredFingerprints.has(cached.fingerprint)) {
      if (cached && restoredFingerprints.has(cached.fingerprint)) {
        forgetHiddenStatus(currentStatusId);
      }
      return false;
    }

    const accountTimelineEligible = isFilterableTimeline();
    const promotionTimelineEligible =
      accountTimelineEligible || isProfilePostTimeline();
    if (
      !statusIdFromLocation() &&
      (accountTimelineEligible || promotionTimelineEligible) &&
      !timelineResultEnabled(cached.result, preferences, {
        accountTimelineEligible,
        promotionTimelineEligible,
      })
    ) {
      forgetHiddenStatus(currentStatusId);
      return false;
    }

    const handle =
      normalizeHandle(cached.result?.handle) || articleHandle(article);
    if (accountIsLocallyAllowed(handle)) {
      forgetHiddenStatus(currentStatusId);
      return false;
    }
    // 普通缓存只允许在明确未关注时预隐藏；高置信推广可继续处理明确已关注账号，
    // 但当前账号自己和关系未知仍然 fail-open。
    if (
      shouldProtectAuthor({
        following: viewerFollowingState(article, handle),
        isSelf: Boolean(viewerHandle() && viewerHandle() === handle),
        highConfidencePromotion: Boolean(
          promotionTimelineEligible &&
            preferences.filterTimelinePromotions &&
            cached.result?.timelinePromotionCandidate,
        ),
      })
    ) {
      return false;
    }
    // 预隐藏同样不能绕过转推放行，否则关注账号转推的内容会在首屏闪一下。
    const repostIdentity = articleRepostIdentity(
      article,
      handle,
      currentStatusId,
    );
    if (repostProtectionState(article, repostIdentity, handle)) {
      forgetHiddenStatus(currentStatusId);
      return false;
    }

    annotateReplyResult(article, cached.result, handle);
    hideArticle(
      article,
      cached.result,
      cached.fingerprint,
    );
    return true;
  }

  function processArticle(article) {
    if (!(article instanceof HTMLElement) || !isTopLevelTweetArticle(article)) {
      return;
    }

    const mainStatusId = statusIdFromLocation();
    const currentStatusId = articleStatusId(article);
    const accountTimelineEligible = isFilterableTimeline();
    const promotionTimelineEligible =
      accountTimelineEligible || isProfilePostTimeline();
    const handle = articleHandle(article);
    const filterScope = articleFilterScope({
      mainStatusId,
      currentStatusId,
      mainAuthorHandle: authorHandleFromStatusPath(),
      currentAuthorHandle: handle,
      timelineEligible:
        accountTimelineEligible || promotionTimelineEligible,
      filterTimeline: preferences.filterTimeline,
      filterTimelinePromotions: preferences.filterTimelinePromotions,
    });
    const timelineMode = filterScope === "timeline";
    if (filterScope === "none") {
      annotateReplyResult(article, null, handle);
      unhideArticle(article, "visible");
      return;
    }

    const snapshot = articleTweetSnapshot(article, {
      statusId: currentStatusId,
      handle,
      behavior: {
        coordinatedBurst: coordinatedBurstStatusIds.has(currentStatusId),
        repeatedLowInfo: repeatedLowInfoStatusIds.has(currentStatusId),
        duplicateTemplate: duplicateTemplateStatusIds.has(currentStatusId),
      },
    });
    const { text, name, promotionSignals } = snapshot;
    const {
      coordinatedBurst,
      repeatedLowInfo,
      duplicateTemplate,
    } = snapshot.behavior;
    const promotion = promotionPattern(text, promotionSignals);
    const identity = snapshot.author;
    const userId = identity.userId;
    const repostIdentity = snapshot.repost;
    const repostHandle = repostIdentity.handle;
    const quotedIdentity = snapshot.quote;
    const quotedAccount = quotedIdentity.isQuote
      ? relatedAccountVerdict(quotedIdentity)
      : null;
    const primaryAccountListed =
      accountSourceNames(handle, userId).length > 0;
    const contentPolicy = contentPolicyForSurface({
      scope: filterScope,
      primaryAccountListed,
      relatedAccountListed: Boolean(quotedAccount),
      highConfidencePromotion: promotion.highConfidence,
      filterTimelineAccounts: preferences.filterTimeline,
      filterTimelinePromotions: preferences.filterTimelinePromotions,
      accountTimelineEligible,
      promotionTimelineEligible,
    });
    const aiKey = aiDecisionKey(text, name, handle);
    const aiDecision = cachedAiDecision(aiKey);
    const fp = fingerprint(
      article,
      text,
      `${name}|${handle}|uid:${userId}|rt:${repostHandle}|qt:${quotedAccount?.handle || ""}:${quotedAccount?.userId || ""}:${quotedAccount?.points || 0}|burst:${coordinatedBurst ? 1 : 0}|repeat:${repeatedLowInfo ? 1 : 0}|dup:${duplicateTemplate ? 1 : 0}|restricted:${promotion.repliesRestricted ? 1 : 0}|external:${promotion.hasExternalLink ? 1 : 0}|telegram:${promotion.telegramLink ? 1 : 0}|promo:${promotion.promotionCopy ? 1 : 0}|ai:${aiDecision?.isSpam ? 1 : 0}`,
    );

    const cell = findCell(article);
    const previousFp = article.getAttribute(ATTRIBUTE.fingerprint);
    const previousState = article.getAttribute(ATTRIBUTE.state);

    if (accountIsLocallyAllowed(handle)) {
      annotateReplyResult(article, null, handle, userId);
      article.setAttribute(ATTRIBUTE.fingerprint, fp);
      article.setAttribute(ATTRIBUTE.following, "local-allow");
      unhideArticle(article, "protected-local-allow");
      return;
    }

    const self = viewerHandle();
    if (self && self === handle) {
      annotateReplyResult(article, null, handle, userId);
      article.setAttribute(ATTRIBUTE.fingerprint, fp);
      article.setAttribute(ATTRIBUTE.following, "self");
      unhideArticle(article, "protected-self");
      return;
    }

    // 策略层只决定当前页面是否允许进入评分：回复运行完整规则；时间线需要
    // 账号名单证据或「关闭评论 + 外链 + 推广话术」组合。详情页主贴始终放行。
    if (contentPolicy === "none") {
      annotateReplyResult(article, null, handle, userId);
      article.setAttribute(ATTRIBUTE.fingerprint, fp);
      unhideArticle(article, "visible");
      return;
    }

    // 转推判定放在 timeline 快速放行之后：读取转推者关系可能要遍历 React
    // fiber，只有真正可能被隐藏的内容才值得付这个成本。
    const repostState = repostProtectionState(article, repostIdentity, handle);
    if (repostState) {
      annotateReplyResult(article, null, handle, userId);
      article.setAttribute(ATTRIBUTE.fingerprint, fp);
      article.setAttribute(ATTRIBUTE.following, repostState);
      unhideArticle(article, repostState);
      return;
    }

    const followingState = identity.following;
    if (
      shouldProtectAuthor({
        following: followingState,
        highConfidencePromotion:
          contentPolicy === "promotion-candidate",
      })
    ) {
      annotateReplyResult(article, null, handle, userId);
      article.setAttribute(ATTRIBUTE.fingerprint, fp);
      article.setAttribute(
        ATTRIBUTE.following,
        followingState === true ? "true" : "unknown",
      );
      if (
        previousFp !== fp ||
        previousState !== "protected-following" ||
        cell?.classList.contains(CLASS.hidden)
      ) {
        unhideArticle(article, "protected-following");
      }
      if (followingState === null) {
        retryUnknownFollowingState(article, handle);
      } else {
        unknownFollowingChecks.delete(article);
      }
      return;
    }

    article.removeAttribute(ATTRIBUTE.following);
    unknownFollowingChecks.delete(article);
    if (
      previousFp === fp &&
      (previousState === "hidden" ||
        previousState === "visible" ||
        previousState === "restored")
    ) {
      const cached = cachedHiddenStatus(currentStatusId);
      if (previousState === "hidden" && cached?.result) {
        annotateReplyResult(article, cached.result, handle, userId);
      }
      return;
    }
    article.setAttribute(ATTRIBUTE.fingerprint, fp);

    const tweetsTranslated = articleShowsTranslation(article);
    const resultCacheKey = decisionResultKey({
      statusId: currentStatusId,
      text,
      name,
      handle,
      userId,
      coordinatedBurst,
      repeatedLowInfo,
      duplicateTemplate,
      repliesRestricted: promotion.repliesRestricted,
      hasExternalLink: promotion.hasExternalLink,
      telegramLink: promotion.telegramLink,
      tweetsTranslated,
      aiDecision,
      quotedAccount,
    });
    let result = getCachedDecisionResult(resultCacheKey);
    let computedResult = false;
    if (!result) {
      result = scoreReply(text, name, handle, {
        coordinatedBurst,
        repeatedLowInfo,
        duplicateTemplate,
        repliesRestricted: promotion.repliesRestricted,
        hasExternalLink: promotion.hasExternalLink,
        telegramLink: promotion.telegramLink,
        userId,
        aiDecision,
        tweetsTranslated,
        quotedAccount,
      });
      setCachedDecisionResult(resultCacheKey, result);
      computedResult = true;
    }
    if (computedResult && result.learnedRuleHits?.length) {
      recordAiLearnedRuleHits(result.learnedRuleHits, currentStatusId);
    }
    if (timelineMode) {
      result = {
        ...result,
        timelineAccountCandidate: Boolean(
          accountTimelineEligible &&
            (primaryAccountListed || quotedAccount),
        ),
        timelinePromotionCandidate: Boolean(
          promotionTimelineEligible && promotion.highConfidence,
        ),
        promotionOnly: contentPolicy === "promotion-candidate",
        itemLabel: contentPolicy === "promotion-candidate"
          ? "推广内容"
          : "低质量账号内容",
      };
    }
    annotateReplyResult(article, result, handle, userId);
    if (result.score >= CONFIG.threshold && !restoredFingerprints.has(fp)) {
      hideArticle(article, result, fp);
    } else {
      unhideArticle(
        article,
        restoredFingerprints.has(fp) ? "restored" : "visible",
      );
      if (
        !timelineMode &&
        !aiDecision &&
        !restoredFingerprints.has(fp)
      ) {
        maybeScheduleAiEvaluation(article, {
          text,
          name,
          handle,
          score: result.score,
          reasons: result.reasons,
        });
      }
    }
  }
