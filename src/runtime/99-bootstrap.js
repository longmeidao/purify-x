  function installCounter() {
    document.getElementById("xps-counter")?.remove();
    const button = document.createElement("button");
    button.id = "xps-counter";
    button.type = "button";
    button.innerHTML = `
      <svg class="xps-counter-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5 19 5v5.8c0 4.8-2.9 8.9-7 10.7-4.1-1.8-7-5.9-7-10.7V5l7-2.5Zm0 3L8 6.9v3.9c0 3.2 1.6 6.1 4 7.7 2.4-1.6 4-4.5 4-7.7V6.9L12 5.5Zm-2.2 4h4.4v2H9.8v-2Zm1.1 3.3h2.2v2.2h-2.2v-2.2Z"/>
      </svg>
      <span class="xps-counter-count" aria-hidden="true">0</span>
    `;
    button.addEventListener("click", () => {
      revealAll = !revealAll;
      document.body.classList.toggle(CLASS.revealAll, revealAll);
      updateCounter();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openSettingsPanel();
    });
    document.body.append(button);
    updateCounter();
  }

  function captureTimelineReturnSnapshot(event) {
    if (
      statusIdFromLocation() ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const article = target?.closest(SELECTOR.tweet);
    if (!article || !isTopLevelTweetArticle(article)) return;

    const explicitLink = target.closest("a[href]");
    let targetHref = explicitLink?.href || "";
    let targetStatusId = detailNavigationStatusId(location.href, targetHref);
    if (explicitLink && !targetStatusId) return;

    if (!explicitLink) {
      if (
        target.closest(
          'button, [role="button"], input, select, textarea, [contenteditable="true"]',
        )
      ) {
        return;
      }
      targetHref =
        article
          .querySelector("time")
          ?.closest("a[href*='/status/']")?.href || "";
      targetStatusId = detailNavigationStatusId(location.href, targetHref);
    }
    if (!targetStatusId) return;

    const sourceStatusId = articleStatusId(article);
    const anchorTop = article.getBoundingClientRect().top;
    if (!sourceStatusId || !Number.isFinite(anchorTop)) return;

    timelineReturnSnapshot = {
      sourceHref: location.href,
      sourceStatusId,
      targetStatusId,
      scrollY: window.scrollY,
      anchorTop,
      capturedAt: Date.now(),
    };
  }

  function articleForStatusId(statusId) {
    if (!statusId) return null;
    for (const article of document.querySelectorAll(SELECTOR.tweet)) {
      if (
        isTopLevelTweetArticle(article) &&
        articleStatusId(article) === statusId
      ) {
        return article;
      }
    }
    return null;
  }

  function cancelTimelineReturnRestore(forgetSnapshot = false) {
    timelineReturnRestoreToken += 1;
    timelineReturnInteractionCleanup?.();
    timelineReturnInteractionCleanup = null;
    if (forgetSnapshot) timelineReturnSnapshot = null;
  }

  function scheduleTimelineReturnRestore() {
    const snapshot = timelineReturnSnapshot;
    if (
      !timelineReturnSnapshotIsCurrent(snapshot, location.href, Date.now())
    ) {
      return;
    }

    cancelTimelineReturnRestore();
    const token = timelineReturnRestoreToken;
    const cancelOnInteraction = () => {
      if (token === timelineReturnRestoreToken) {
        cancelTimelineReturnRestore(true);
      }
    };
    const interactionEvents = ["wheel", "touchstart", "pointerdown", "keydown"];
    for (const type of interactionEvents) {
      window.addEventListener(type, cancelOnInteraction, {
        capture: true,
        passive: true,
      });
    }
    timelineReturnInteractionCleanup = () => {
      for (const type of interactionEvents) {
        window.removeEventListener(type, cancelOnInteraction, true);
      }
    };

    CONFIG.timelineReturnRestoreDelaysMs.forEach((delay, index, delays) => {
      window.setTimeout(() => {
        if (
          token !== timelineReturnRestoreToken ||
          !timelineReturnSnapshotIsCurrent(snapshot, location.href, Date.now())
        ) {
          return;
        }

        const anchor = articleForStatusId(snapshot.sourceStatusId);
        const delta = timelineReturnScrollDelta({
          savedScrollY: snapshot.scrollY,
          currentScrollY: window.scrollY,
          savedAnchorTop: snapshot.anchorTop,
          currentAnchorTop: anchor?.getBoundingClientRect().top ?? null,
        });
        // 第一轮若还留着详情页的旧 DOM，先等 X 换回列表；后续找不到
        // 锚点时才用绝对位置把虚拟列表带回原渲染窗口。
        if (
          (anchor || index > 0) &&
          Math.abs(delta) > CONFIG.timelineReturnTolerancePx
        ) {
          window.scrollBy(0, delta);
        }

        if (index === delays.length - 1) {
          timelineReturnInteractionCleanup?.();
          timelineReturnInteractionCleanup = null;
        }
      }, delay);
    });
  }

  function installNavigationHook() {
    let previousUrl = location.href;
    mediaPhotosDefaultPending = isProfileMediaPath(location.pathname);
    mediaPhotosMenuRequested = false;
    document.addEventListener("click", captureTimelineReturnSnapshot, true);
    document.addEventListener(
      "click",
      cancelMediaPhotosDefaultOnUserChoice,
      true,
    );

    const checkNavigation = (event) => {
      if (location.href === previousUrl) return;
      const previousPathname = new URL(previousUrl).pathname;
      previousUrl = location.href;
      mediaPhotosDefaultPending =
        !isProfileMediaPath(previousPathname) &&
        isProfileMediaPath(location.pathname);
      mediaPhotosMenuRequested = false;
      const restoreTimelineReturn =
        event?.type === "popstate" &&
        timelineReturnSnapshotIsCurrent(
          timelineReturnSnapshot,
          location.href,
          Date.now(),
        );
      cancelTimelineReturnRestore();
      clearPendingArticleWork();
      revealAll = false;
      restoredFingerprints.clear();
      expandedGroupIds.clear();
      // hiddenStatusCache 的键已经包含 thread/timeline 上下文。保留它才能让
      // 返回列表时在同一 MutationObserver 微任务内恢复原有行高，避免重新
      // 判定后才折叠造成滚动锚点漂移；规则或名单变化仍会统一失效缓存。
      threadBehaviorRecordCache.clear();
      threadBehaviorContextId = "";
      coordinatedBurstStatusIds.clear();
      repeatedLowInfoStatusIds.clear();
      duplicateTemplateStatusIds.clear();
      aiRuleHitStatusKeys.clear();
      aiRuleFalsePositiveStatusKeys.clear();
      profileUserIdCache.clear();
      document.body.classList.remove(CLASS.revealAll);
      scheduleScan();
      if (restoreTimelineReturn) scheduleTimelineReturnRestore();
    };

    window.addEventListener("popstate", checkNavigation);
    window.setInterval(checkNavigation, 1000);
  }

  const publicApi = Object.freeze({
    version: VERSION,
    threshold: CONFIG.threshold,
    scoreReply,
    computeReplyBehaviorSignals,
    accountSources: accountSourceNames,
    scan: () => scan(document),
    openSettings: openSettingsPanel,
    localSettings: localListsSnapshot,
    syncCustomSubscriptions,
    syncRemoteLists,
    remoteStatus: remoteStatusText,
    ...(typeof document === "undefined"
      ? {
          test: Object.freeze({
            actionIdentityFromMetadata,
            articleExternalLinkValues,
            authorHandleFromStatusPath,
            articleFilteringSurfaceEnabled,
            articleFilterScope,
            contentPolicyForSurface,
            communityKeywordEvidence,
            conversationReplyRestrictionFromReactObjects,
            detailNavigationStatusId,
            externalLinkSignals,
            isProfileMediaPath,
            isProfilePostTimeline,
            keywordMatches,
            matchedKeywords,
            mediaPhotosDefaultAction,
            mediaSubtabKind,
            mergeBehaviorRecordCache,
            mutationScanPlan,
            mutationObserverOptions: MUTATION_OBSERVER_OPTIONS,
            normalizeTweetSnapshot,
            profileJsonLdUserId,
            promotionPattern,
            quotedIdentityFromReactObjects,
            reconcileIdentitySourceBits,
            relationshipFromReactObjects,
            repostHandleFromContext,
            repostIdentityFromReactObjects,
            persistPreferences,
            sanitizeAiState,
            sanitizeRemoteCache,
            sanitizePreferences,
            sanitizeEtag,
            setLocalHandleDisposition,
            shouldForgetCachedHiddenForSurface,
            shouldProtectAuthor,
            shouldRepairCollapsedMultiImageLayout,
            timelineReturnScrollDelta,
            timelineResultEnabled,
            timelineReturnSnapshotIsCurrent,
            requestTextResource,
            responseHeaderValue,
            scanWorkShouldYield,
            syncTweetGuardRules,
            syncBlueNoiseKeywords,
            syncTwitterBlockPorn,
            updateAiLearnedRuleFeedback,
            userIdFromReactUser,
            validateMxgaLite,
            validateMxgaWhitelist,
            validateBlueNoiseKeywords,
          }),
        }
      : {}),
  });

  Object.defineProperty(globalThis, "__X_PORN_SPAM_FILTER__", {
    configurable: true,
    value: publicApi,
  });
  Object.defineProperty(globalThis, "__X_REPLY_PURIFIER__", {
    configurable: true,
    value: publicApi,
  });
  Object.defineProperty(globalThis, "__PURIFY_X__", {
    configurable: true,
    value: publicApi,
  });

  if (typeof document === "undefined") return;

  async function bootstrap() {
    installStyles();
    installCounter();
    installNavigationHook();

    // 永远放行、本地屏蔽和自定义订阅缓存必须先于首轮扫描生效。
    // 否则页面会先按内置/公开规则隐藏，再在 GM 存储读完后恢复，造成闪烁。
    try {
      await Promise.all([
        initializeLocalLists(),
        initializePreferences(),
        initializeAi(),
        initializeRemoteLists(),
      ]);
      await initializeDecisionCache();
    } catch (error) {
      console.warn("[Purify X] cached state unavailable", error);
      decisionCacheRevision = computeDecisionCacheRevision();
      decisionCacheReady = true;
    }
    applySidebarPromoVisibility();

    scan(document);
    observer = new MutationObserver((records) => {
      const presentationChanged = releaseRecycledCells(records);
      const scanPlan = mutationScanPlan(records);
      if (presentationChanged || scanPlan.groupingChanged) {
        // 与缓存恢复放在同一轮微任务中完成，浏览器下一帧只会看到
        // 最终的隐藏/合并状态，不再先绘制单条占位再重新折叠。
        refreshGroups();
        updateCounter();
      }
      if (scanPlan.global) scheduleScan(document);
      else if (scanPlan.roots.size > 0) scheduleScan(scanPlan.roots);
    });
    observer.observe(document.body, MUTATION_OBSERVER_OPTIONS);

    startCustomSubscriptionUpdates();
    startRemoteListUpdates();
  }

  void bootstrap();
})();
