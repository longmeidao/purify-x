  function cleanStaleCells() {
    for (const cell of filteredCells) {
      if (!cell.isConnected) filteredCells.delete(cell);
    }
  }

  function groupIdFor(cell, index) {
    const article = cell.querySelector(SELECTOR.tweet);
    const statusId = article ? articleStatusId(article) : "";
    return `xps-${statusId || index}`;
  }

  function updateGroupPresentation(cell, desired) {
    const placeholder = cell.querySelector(`:scope > .${CLASS.placeholder}`);
    if (!placeholder) return;

    const label = placeholder.querySelector(".xps-placeholder-label");
    const reason = placeholder.querySelector(".xps-placeholder-reason");
    const actions = placeholder.querySelector(".xps-placeholder-actions");
    const existingToggle = placeholder.querySelector(".xps-group-toggle");
    const individualLabel =
      placeholder.dataset.individualLabel || "已隐藏可疑回复";
    const individualReason =
      placeholder.dataset.individualReason || "未提供规则详情";

    if (!desired) {
      cell.classList.remove(CLASS.groupHead, CLASS.groupTail, CLASS.groupOpen);
      cell.removeAttribute(ATTRIBUTE.group);
      existingToggle?.remove();
      if (label && label.textContent !== individualLabel) {
        label.textContent = individualLabel;
      }
      if (reason && reason.textContent !== individualReason) {
        reason.textContent = individualReason;
      }
      return;
    }

    const open = expandedGroupIds.has(desired.id);
    cell.setAttribute(ATTRIBUTE.group, desired.id);
    cell.classList.toggle(CLASS.groupHead, desired.position === "head");
    cell.classList.toggle(CLASS.groupTail, desired.position === "tail");
    cell.classList.toggle(CLASS.groupOpen, open);

    if (desired.position === "tail") {
      existingToggle?.remove();
      if (label && label.textContent !== individualLabel) {
        label.textContent = individualLabel;
      }
      if (reason && reason.textContent !== individualReason) {
        reason.textContent = individualReason;
      }
      return;
    }

    const groupLabel = open
      ? `已展开 ${desired.count} 条连续可疑内容`
      : `已折叠 ${desired.count} 条连续可疑内容`;
    if (label && label.textContent !== groupLabel) label.textContent = groupLabel;
    const groupReason = desired.reasonSummary
      ? `原因概览：${desired.reasonSummary}`
      : "原因概览：展开后可逐条查看";
    if (reason && reason.textContent !== groupReason) {
      reason.textContent = groupReason;
    }

    let toggle = existingToggle;
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "xps-group-toggle";
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = cell.getAttribute(ATTRIBUTE.group);
        if (!id) return;
        if (expandedGroupIds.has(id)) expandedGroupIds.delete(id);
        else expandedGroupIds.add(id);
        refreshGroups();
      });
      actions?.append(toggle);
    }

    const toggleLabel = open ? "收起" : "展开";
    if (toggle.textContent !== toggleLabel) toggle.textContent = toggleLabel;
  }

  function summarizeRunEvidence(cells) {
    const counts = new Map();
    for (const cell of cells) {
      const raw = cell.querySelector(
        `:scope > .${CLASS.placeholder}`,
      )?.dataset.xpsEvidence;
      if (!raw) continue;
      try {
        const sources = new Set(
          JSON.parse(raw)
            .map((item) => item?.source)
            .filter(Boolean),
        );
        for (const source of sources) {
          counts.set(source, (counts.get(source) || 0) + 1);
        }
      } catch {
        // 旧占位行或被其他扩展改写的数据不影响折叠。
      }
    }
    return Object.values(EVIDENCE_SOURCE)
      .filter((source) => counts.has(source))
      .map((source) => `${EVIDENCE_LABEL[source]} ×${counts.get(source)}`)
      .join(" · ");
  }

  function refreshGroups() {
    cleanStaleCells();

    // X inserts virtualizer/cursor/spacing cells between visible tweet rows.
    // Those auxiliary cellInnerDiv nodes must not split an otherwise
    // continuous run of filtered replies. Build the order from top-level
    // tweet articles instead, then map each article back to its owning cell.
    const orderedCells = [];
    const cellOrder = new Map();
    const seenCells = new Set();
    for (const article of document.querySelectorAll(SELECTOR.tweet)) {
      if (!isTopLevelTweetArticle(article)) continue;
      const cell = findCell(article);
      if (!(cell instanceof HTMLElement) || seenCells.has(cell)) continue;
      seenCells.add(cell);
      cellOrder.set(cell, orderedCells.length);
      orderedCells.push(cell);
    }
    const desired = new Map();
    let run = [];

    const commitRun = () => {
      if (run.length >= CONFIG.minGroupSize) {
        const id = groupIdFor(run[0], cellOrder.get(run[0]) || 0);
        const reasonSummary = summarizeRunEvidence(run);
        run.forEach((cell, index) => {
          desired.set(cell, {
            id,
            count: run.length,
            reasonSummary,
            position: index === 0 ? "head" : "tail",
          });
        });
      }
      run = [];
    };

    for (const cell of orderedCells) {
      if (filteredCells.has(cell)) run.push(cell);
      else commitRun();
    }
    commitRun();

    for (const cell of filteredCells) {
      updateGroupPresentation(cell, desired.get(cell));
    }
  }

  function updateCounter() {
    cleanStaleCells();
    hiddenCount = filteredCells.size;
    const button = document.getElementById("xps-counter");
    if (!button) return;

    const count = button.querySelector(".xps-counter-count");
    if (count && count.textContent !== String(hiddenCount)) {
      count.textContent = String(hiddenCount);
    }
    button.dataset.active = hiddenCount ? "true" : "false";
    const bodyColor = getComputedStyle(document.body).backgroundColor;
    const rgb = bodyColor.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    const luminance =
      rgb.length >= 3
        ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
        : 0;
    button.dataset.theme = luminance > 0.55 ? "light" : "dark";
    button.setAttribute(
      "aria-label",
      revealAll
        ? `Purify X：重新隐藏 ${hiddenCount} 条可疑内容`
        : `Purify X：临时显示 ${hiddenCount} 条可疑内容`,
    );
    button.title = revealAll
      ? `Purify X · 点击重新隐藏 ${hiddenCount} 条回复；右键打开设置`
      : `Purify X · 已隐藏 ${hiddenCount} 条；点击临时显示；右键打开设置`;
  }

  function shouldRepairCollapsedMultiImageLayout({
    photoCount,
    containerWidth,
    parentWidth,
    alreadyRepaired = false,
  }) {
    const count = Number(photoCount);
    const width = Number(containerWidth);
    const availableWidth = Number(parentWidth);
    return Boolean(
      !alreadyRepaired &&
        Number.isInteger(count) &&
        count >= 2 &&
        Number.isFinite(width) &&
        width >= 0 &&
        width <= CONFIG.mediaCollapsedMaxWidthPx &&
        Number.isFinite(availableWidth) &&
        availableWidth >= CONFIG.mediaParentMinWidthPx,
    );
  }

  function statusPhotoIdentity(link) {
    if (!(link instanceof Element)) return null;
    const href = link.getAttribute("href") || "";
    const match = href.match(
      /\/status\/(\d+)\/photo\/(\d+)(?:[/?#]|$)/,
    );
    if (!match) return null;
    return { statusId: match[1], photoIndex: match[2] };
  }

  function photoIndexesForStatus(root, statusId) {
    const indexes = new Set();
    for (const link of root.querySelectorAll?.(
      'a[href*="/status/"][href*="/photo/"]',
    ) || []) {
      const identity = statusPhotoIdentity(link);
      if (identity?.statusId === statusId) indexes.add(identity.photoIndex);
    }
    return indexes;
  }

  function repairCollapsedMultiImageLayouts(articles) {
    let repairedCount = 0;
    for (const article of articles) {
      if (!(article instanceof Element)) continue;

      const groups = new Map();
      for (const link of article.querySelectorAll(
        'a[href*="/status/"][href*="/photo/"]',
      )) {
        const identity = statusPhotoIdentity(link);
        if (!identity) continue;
        if (!groups.has(identity.statusId)) {
          groups.set(identity.statusId, new Map());
        }
        groups.get(identity.statusId).set(identity.photoIndex, link);
      }

      // X 的新横向轮播会让每张图片位于独立 slide，因此修复节点本身
      // 可能只包含一张图。虚拟列表复用时同时核对整条推文仍是多图、
      // 该 slide 仍承载原 status，避免把满宽规则带到无关卡片。
      for (const host of article.querySelectorAll(
        `.${CLASS.mediaWidthFix}`,
      )) {
        const statusId = host.getAttribute(ATTRIBUTE.mediaStatus) || "";
        if (
          (groups.get(statusId)?.size || 0) < 2 ||
          photoIndexesForStatus(host, statusId).size < 1
        ) {
          host.classList.remove(CLASS.mediaWidthFix);
          host.removeAttribute(ATTRIBUTE.mediaStatus);
        }
      }

      for (const [statusId, photoLinks] of groups) {
        const links = [...photoLinks.values()];
        if (links.length < 2) continue;

        for (const link of links) {
          if (
            link.closest(`.${CLASS.mediaWidthFix}`)?.getAttribute(
              ATTRIBUTE.mediaStatus,
            ) === statusId
          ) {
            continue;
          }

          let candidate = link;
          while (candidate && candidate !== article) {
            const parent = candidate.parentElement;
            if (!parent || !article.contains(parent)) break;
            if (
              shouldRepairCollapsedMultiImageLayout({
                photoCount: links.length,
                containerWidth: candidate.getBoundingClientRect().width,
                parentWidth: parent.getBoundingClientRect().width,
                alreadyRepaired: candidate.classList.contains(
                  CLASS.mediaWidthFix,
                ),
              })
            ) {
              candidate.classList.add(CLASS.mediaWidthFix);
              candidate.setAttribute(ATTRIBUTE.mediaStatus, statusId);
              repairedCount += 1;
              break;
            }
            candidate = parent;
          }
        }
      }
    }
    return repairedCount;
  }

  function mediaControlLabel(control) {
    return (
      control?.getAttribute?.("aria-label") ||
      control?.textContent ||
      control?.getAttribute?.("title") ||
      ""
    );
  }

  function mediaPhotosOption(root = document) {
    const selectors = [
      '[role="menuitem"]',
      '[role="option"]',
      '[role="menu"] button',
      '[data-testid*="Dropdown"] button',
      '[data-testid*="dropdown"] button',
    ].join(",");
    for (const control of root.querySelectorAll?.(selectors) || []) {
      if (mediaSubtabKind(mediaControlLabel(control)) === "photos") {
        return control;
      }
    }
    return null;
  }

  function mediaProfileTab(root, kind) {
    for (const tablist of root.querySelectorAll?.('[role="tablist"]') || []) {
      for (const control of tablist.querySelectorAll('[role="tab"], button')) {
        if (mediaSubtabKind(mediaControlLabel(control)) === kind) {
          return control;
        }
      }
    }
    return null;
  }

  function applyMediaPhotosDefault() {
    if (!mediaPhotosDefaultPending) return false;
    if (!isProfileMediaPath(location.pathname)) {
      mediaPhotosDefaultPending = false;
      mediaPhotosMenuRequested = false;
      return false;
    }
    const photosTab = mediaProfileTab(document, "photos");
    const photosMenuOption = mediaPhotosOption();
    const videosTrigger = mediaProfileTab(document, "videos");
    const action = mediaPhotosDefaultAction({
      pathname: location.pathname,
      photosSelected: photosTab?.getAttribute("aria-selected") === "true",
      hasPhotosOption: Boolean(photosMenuOption),
      hasVideosTrigger: Boolean(videosTrigger),
      menuRequested: mediaPhotosMenuRequested,
    });

    if (action === "done") {
      mediaPhotosDefaultPending = false;
      mediaPhotosMenuRequested = false;
      return false;
    }
    if (action === "select-photos") {
      mediaPhotosDefaultPending = false;
      mediaPhotosMenuRequested = false;
      photosMenuOption.click();
      return true;
    }
    if (action === "open-videos-menu") {
      mediaPhotosMenuRequested = true;
      videosTrigger.click();
      // 下拉菜单由 portal 异步挂载；即使 X 的菜单节点没有稳定 role，
      // 也在几次短延迟后重查，且不会重复点击 Videos 把菜单关掉。
      for (const delay of [80, 220, 600]) {
        window.setTimeout(() => {
          if (mediaPhotosDefaultPending) scheduleScan();
        }, delay);
      }
      return true;
    }
    return false;
  }

  function cancelMediaPhotosDefaultOnUserChoice(event) {
    if (
      !event.isTrusted ||
      !mediaPhotosDefaultPending ||
      !isProfileMediaPath(location.pathname)
    ) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest('[role="tab"], button');
    if (!control) return;
    const label =
      control.getAttribute("aria-label") ||
      control.textContent ||
      control.getAttribute("title") ||
      "";
    if (mediaSubtabKind(label)) {
      mediaPhotosDefaultPending = false;
      mediaPhotosMenuRequested = false;
    }
  }

  function scanWorkShouldYield({
    processed = 0,
    elapsedMs = 0,
    maxArticles = CONFIG.scanMaxArticlesPerFrame,
    frameBudgetMs = CONFIG.scanFrameBudgetMs,
  } = {}) {
    return processed >= maxArticles || elapsedMs >= frameBudgetMs;
  }

  function clearPendingArticleWork() {
    pendingArticleQueue.clear();
    if (pendingArticleFrame) {
      window.cancelAnimationFrame(pendingArticleFrame);
      pendingArticleFrame = 0;
    }
    articleQueueActive = false;
  }

  function processPendingArticles() {
    pendingArticleFrame = 0;
    // React 对象只在这一小批任务内复用；X 回收 DOM 后下一帧重新读取。
    scanReactRootsCache = new WeakMap();
    const startedAt = performance.now();
    let processed = 0;

    for (const article of pendingArticleQueue) {
      pendingArticleQueue.delete(article);
      processed += 1;
      if (article.isConnected) processArticle(article);
      if (
        scanWorkShouldYield({
          processed,
          elapsedMs: performance.now() - startedAt,
        })
      ) {
        break;
      }
    }

    if (pendingArticleQueue.size > 0) {
      pendingArticleFrame = window.requestAnimationFrame(
        processPendingArticles,
      );
      return;
    }
    articleQueueActive = false;
    refreshGroups();
    updateCounter();
  }

  function enqueueArticles(articles) {
    for (const article of articles) pendingArticleQueue.add(article);
    if (articleQueueActive) return;
    if (pendingArticleQueue.size === 0) {
      refreshGroups();
      updateCounter();
      return;
    }
    articleQueueActive = true;
    // 第一小批同步完成，减少首屏垃圾内容闪现；只有余量进入下一帧。
    processPendingArticles();
  }

  function scan(root = document) {
    applyMediaPhotosDefault();
    annotateProfileAccount();
    const articleSet = new Set();
    const roots = Array.isArray(root) ? root : [root];
    for (const scanRoot of roots) {
      if (scanRoot instanceof Element && scanRoot.matches(SELECTOR.tweet)) {
        articleSet.add(scanRoot);
      }
      for (const article of scanRoot?.querySelectorAll?.(SELECTOR.tweet) || []) {
        articleSet.add(article);
      }
    }
    const articles = [...articleSet];
    repairCollapsedMultiImageLayouts(articles);

    const threadId = statusIdFromLocation();
    if (
      !articleFilteringSurfaceEnabled({
        threadId,
        filterableTimeline: isFilterableTimeline(),
        profilePostTimeline: isProfilePostTimeline(),
      })
    ) {
      clearPendingArticleWork();
      threadBehaviorContextId = "";
      threadBehaviorRecordCache.clear();
      coordinatedBurstStatusIds = new Set();
      repeatedLowInfoStatusIds = new Set();
      duplicateTemplateStatusIds = new Set();
      for (const article of articles) annotateTweetListedAccount(article);
      for (const cell of filteredCells) {
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
      }
      filteredCells.clear();
      expandedGroupIds.clear();
      updateCounter();
      return;
    }

    if (threadId) {
      if (threadBehaviorContextId !== threadId) {
        threadBehaviorContextId = threadId;
        threadBehaviorRecordCache.clear();
        coordinatedBurstStatusIds.clear();
        repeatedLowInfoStatusIds.clear();
        duplicateTemplateStatusIds.clear();
      }
      mergeBehaviorRecordCache(
        threadBehaviorRecordCache,
        replyBehaviorRecords(articles),
      );
      const signals = computeReplyBehaviorSignals([
        ...threadBehaviorRecordCache.values(),
      ]);
      const newlySignaledStatusIds = new Set();
      // X 会在滚动时回收回复 DOM。已经观察到的行为信号在当前详情页内
      // 保持为真，避免某条回复因暂时离开 DOM 而在隐藏/显示之间反复切换。
      for (const id of signals.coordinated) {
        if (!coordinatedBurstStatusIds.has(id)) newlySignaledStatusIds.add(id);
        coordinatedBurstStatusIds.add(id);
      }
      for (const id of signals.repeated) {
        if (!repeatedLowInfoStatusIds.has(id)) newlySignaledStatusIds.add(id);
        repeatedLowInfoStatusIds.add(id);
      }
      for (const id of signals.duplicated) {
        if (!duplicateTemplateStatusIds.has(id)) newlySignaledStatusIds.add(id);
        duplicateTemplateStatusIds.add(id);
      }
      // 新回复可能让此前可见的旧回复首次获得跨账号/集群证据；只补扫这些
      // 受影响的已挂载文章，不因此退回整页 query + 全量评分。
      if (newlySignaledStatusIds.size > 0) {
        for (const article of document.querySelectorAll(SELECTOR.tweet)) {
          if (
            newlySignaledStatusIds.has(articleStatusId(article)) &&
            !articleSet.has(article)
          ) {
            articles.push(article);
            articleSet.add(article);
          }
        }
      }
    } else {
      threadBehaviorContextId = "";
      threadBehaviorRecordCache.clear();
      coordinatedBurstStatusIds = new Set();
      repeatedLowInfoStatusIds = new Set();
      duplicateTemplateStatusIds = new Set();
    }
    enqueueArticles(articles);
  }

  function scheduleScan(target = document) {
    const targets =
      target instanceof Set || Array.isArray(target) ? target : [target];
    for (const scanRoot of targets) {
      if (scanRoot === document) {
        pendingGlobalScan = true;
        pendingScanRoots.clear();
        break;
      }
      if (!pendingGlobalScan && scanRoot instanceof Element) {
        pendingScanRoots.add(scanRoot);
      }
    }
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => {
      const scanTarget =
        pendingGlobalScan || pendingScanRoots.size === 0
          ? document
          : [...pendingScanRoots];
      pendingGlobalScan = false;
      pendingScanRoots.clear();
      scan(scanTarget);
    }, CONFIG.debounceMs);
  }

  function isOwnUiNode(node) {
    const element =
      node instanceof Element ? node : node?.parentElement || null;
    return Boolean(
      element?.matches?.(
        `#xps-counter, #xps-styles, #xps-settings-backdrop, .${CLASS.placeholder}, .${CLASS.accountBadge}`,
      ) ||
        element?.closest?.(
          `#xps-counter, #xps-styles, #xps-settings-backdrop, #xps-toast, .${CLASS.placeholder}, .${CLASS.accountBadge}, .xps-account-allow`,
        ),
    );
  }

  function mutationScanPlan(records) {
    const tweetRelevantSelector = [
      SELECTOR.tweet,
      SELECTOR.cell,
      SELECTOR.tweetText,
      SELECTOR.userName,
      SELECTOR.cardWrapper,
      'a[href*="/status/"][href*="/photo/"]',
      "time",
      '[data-testid$="-follow"]',
      '[data-testid$="-unfollow"]',
    ].join(",");
    const globalSelector = [
      SELECTOR.profileUserName,
      '[role="tablist"]',
      '[role="tab"]',
      '[role="menu"]',
      '[role="menuitem"]',
      '[role="option"]',
    ].join(",");
    const roots = new Set();
    let global = false;
    let groupingChanged = false;

    const elementFrom = (node) => {
      return node instanceof Element ? node : node?.parentElement || null;
    };
    const addTopLevelArticle = (article) => {
      if (!(article instanceof Element)) return;
      let topLevel = article;
      let parent = topLevel.parentElement?.closest(SELECTOR.tweet);
      while (parent) {
        topLevel = parent;
        parent = topLevel.parentElement?.closest(SELECTOR.tweet);
      }
      roots.add(topLevel);
    };
    const addRelevantNode = (node) => {
      const element = elementFrom(node);
      if (!element) return;
      if (
        element.matches(globalSelector) ||
        element.querySelector?.(globalSelector)
      ) {
        global = true;
      }
      if (
        element.matches(tweetRelevantSelector) ||
        element.querySelector?.(tweetRelevantSelector)
      ) {
        addTopLevelArticle(element.closest(SELECTOR.tweet));
        for (const article of element.querySelectorAll?.(SELECTOR.tweet) || []) {
          addTopLevelArticle(article);
        }
      }
    };
    const containsTweetOrCell = (node) => {
      const element =
        node instanceof Element ? node : node?.parentElement || null;
      return Boolean(
        element?.matches?.(`${SELECTOR.tweet}, ${SELECTOR.cell}`) ||
          element?.querySelector?.(`${SELECTOR.tweet}, ${SELECTOR.cell}`),
      );
    };

    for (const record of records) {
      if (isOwnUiNode(record.target)) continue;
      const changed = [...record.addedNodes, ...record.removedNodes];
      if (changed.length > 0 && changed.every(isOwnUiNode)) continue;
      for (const node of record.addedNodes) addRelevantNode(node);
      if ([...record.removedNodes].some(containsTweetOrCell)) {
        groupingChanged = true;
      }

      const target = elementFrom(record.target);
      if (
        target?.closest?.(
          `${SELECTOR.tweetText}, ${SELECTOR.userName}, ${SELECTOR.cardWrapper}`,
        )
      ) {
        addTopLevelArticle(target.closest(SELECTOR.tweet));
      } else if (
        target?.matches?.(globalSelector) ||
        target?.closest?.(globalSelector)
      ) {
        global = true;
      }
    }
    return { global, groupingChanged, roots };
  }

  function releaseRecycledCells(records) {
    const cells = new Set();
    const collectClosestCell = (node) => {
      const element =
        node instanceof Element ? node : node?.parentElement || null;
      if (!element) return;
      if (element.matches(SELECTOR.cell)) cells.add(element);
      const closest = element.closest(SELECTOR.cell);
      if (closest) cells.add(closest);
    };
    const collectAddedSubtree = (node) => {
      const element =
        node instanceof Element ? node : node?.parentElement || null;
      if (!element) return;
      collectClosestCell(element);
      for (const cell of element.querySelectorAll?.(SELECTOR.cell) || []) {
        cells.add(cell);
      }
    };

    for (const record of records) {
      // record.target 只需检查最近的 cell；对整个时间线反复
      // querySelectorAll 会令每次小变动都退化成一次全表扫描。
      collectClosestCell(record.target);
      for (const node of record.addedNodes) collectAddedSubtree(node);
    }

    let presentationChanged = false;
    for (const cell of cells) {
      const previousStatusId = cell.getAttribute(ATTRIBUTE.cellStatus);
      const article = cell.querySelector(SELECTOR.tweet);
      const currentStatusId = article ? articleStatusId(article) : "";
      if (!article || !currentStatusId) continue;

      const alreadyApplied =
        previousStatusId === currentStatusId &&
        cell.classList.contains(CLASS.hidden) &&
        Boolean(
          cell.querySelector(`:scope > .${CLASS.placeholder}`),
        );
      if (alreadyApplied) continue;

      if (previousStatusId && previousStatusId !== currentStatusId) {
        // X 的虚拟列表会复用 cellInnerDiv。同步释放属于旧 status 的
        // DOM 状态，避免把新回复误藏；旧 status 的判定仍保留在缓存中。
        cell.classList.remove(
          CLASS.hidden,
          CLASS.restored,
          CLASS.groupHead,
          CLASS.groupTail,
          CLASS.groupOpen,
        );
        cell.removeAttribute(ATTRIBUTE.score);
        cell.removeAttribute(ATTRIBUTE.group);
        cell.removeAttribute(ATTRIBUTE.cellStatus);
        cell.querySelector(`:scope > .${CLASS.placeholder}`)?.remove();
        filteredCells.delete(cell);
        article.removeAttribute(ATTRIBUTE.fingerprint);
        article.removeAttribute(ATTRIBUTE.following);
        article.removeAttribute(ATTRIBUTE.state);
        presentationChanged = true;
      }

      // 已判定过的垃圾回复重新进入虚拟窗口时，在 MutationObserver
      // 的同一微任务内恢复隐藏，避免先显示 80ms、再隐藏和合并。
      if (rehydrateCachedHiddenArticle(article, currentStatusId)) {
        presentationChanged = true;
      }
    }
    return presentationChanged;
  }

  function applySidebarPromoVisibility() {
    if (typeof document === "undefined") return;
    document.documentElement?.classList.toggle(
      CLASS.sidebarPromoHidden,
      preferences.hideSidebarPromos,
    );
  }
