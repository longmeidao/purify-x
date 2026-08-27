  function statusIdFromLocation() {
    const match = location.pathname.match(/\/status\/(\d+)/);
    return match ? match[1] : "";
  }

  // 详情页 URL 自带主贴作者 handle（/handle/status/id），比 DOM 抽取更可靠；
  // 即使正文卡片的 statusId 提取异常，也能用它兜底识别主贴作者的身份。
  function authorHandleFromStatusPath(pathname = location.pathname) {
    const match = String(pathname || "").match(
      /^\/([a-z0-9_]{1,15})\/status\/\d+(?:\/|$)/i,
    );
    const candidate = normalizeHandle(match?.[1]);
    return candidate && !RESERVED_PROFILE_PATHS.has(candidate)
      ? candidate
      : "";
  }

  function detailNavigationStatusId(sourceHref, targetHref) {
    try {
      const source = new URL(sourceHref);
      const target = new URL(targetHref, source);
      if (target.origin !== source.origin) return "";
      const match = target.pathname.match(/\/status\/(\d+)\/?$/);
      return match ? match[1] : "";
    } catch {
      return "";
    }
  }

  function timelineReturnSnapshotIsCurrent(
    snapshot,
    currentHref,
    now = Date.now(),
  ) {
    const age = Number(now) - Number(snapshot?.capturedAt);
    return Boolean(
      snapshot?.sourceHref === currentHref &&
        Number.isFinite(age) &&
        age >= 0 &&
        age <= CONFIG.timelineReturnMaxAgeMs,
    );
  }

  function timelineReturnScrollDelta({
    savedScrollY = 0,
    currentScrollY = 0,
    savedAnchorTop = null,
    currentAnchorTop = null,
  } = {}) {
    if (
      Number.isFinite(savedAnchorTop) &&
      Number.isFinite(currentAnchorTop)
    ) {
      return currentAnchorTop - savedAnchorTop;
    }
    const delta = Number(savedScrollY) - Number(currentScrollY);
    return Number.isFinite(delta) ? delta : 0;
  }

  function isFilterableTimeline() {
    return (
      /^\/(?:bookmarks|explore|home|notifications|search)(?:\/|$)/i.test(
        location.pathname,
      ) ||
      /^\/i\/(?:communities|lists)\//i.test(location.pathname)
    );
  }

  function isProfilePostTimeline(pathname = location.pathname) {
    const parts = String(pathname || "")
      .split("/")
      .filter(Boolean)
      .map((part) => part.toLowerCase());
    if (
      (parts.length !== 1 &&
        !(parts.length === 2 && parts[1] === "with_replies")) ||
      !HANDLE_RE.test(parts[0] || "") ||
      RESERVED_PROFILE_PATHS.has(parts[0])
    ) {
      return false;
    }
    return true;
  }

  function articleFilteringSurfaceEnabled({
    threadId = "",
    filterableTimeline = false,
    profilePostTimeline = false,
  } = {}) {
    return Boolean(threadId || filterableTimeline || profilePostTimeline);
  }

  function isProfileMediaPath(pathname = "") {
    const parts = String(pathname || "")
      .split("/")
      .filter(Boolean)
      .map((part) => part.toLowerCase());
    return Boolean(
      parts.length === 2 &&
        parts[1] === "media" &&
        HANDLE_RE.test(parts[0]) &&
        !RESERVED_PROFILE_PATHS.has(parts[0]),
    );
  }

  function mediaSubtabKind(rawLabel) {
    const label = normalize(rawLabel).replace(/\s+/g, " ");
    if (/^(photos?|照片|相片|图片|圖片|写真)$/.test(label)) {
      return "photos";
    }
    if (/^(videos?|视频|影片|短片|動画)$/.test(label)) {
      return "videos";
    }
    return "";
  }

  function mediaPhotosDefaultAction({
    pathname = "",
    photosSelected = false,
    hasPhotosOption = false,
    hasVideosTrigger = false,
    menuRequested = false,
  } = {}) {
    if (!isProfileMediaPath(pathname)) return "none";
    if (photosSelected) return "done";
    if (hasPhotosOption) return "select-photos";
    if (hasVideosTrigger && !menuRequested) return "open-videos-menu";
    return "wait";
  }

  // 用户进入详情页就是为了阅读主贴，因此主贴始终保留；主贴作者在本会话里的
  // 自续写回复同样放行（用户主动点进该账号的帖子，即有意阅读其内容），只有
  // 其他账号的回复运行完整内容与行为规则。时间线的账号名单和高置信推广分别由
  // 独立开关控制。身份判定优先比 statusId，DOM 提取异常时回落到作者 handle。
  function articleFilterScope({
    mainStatusId = "",
    currentStatusId = "",
    mainAuthorHandle = "",
    currentAuthorHandle = "",
    timelineEligible = false,
    filterTimeline = false,
    filterTimelinePromotions = false,
  } = {}) {
    if (mainStatusId) {
      const isFocusOrThreadAuthor =
        currentStatusId === mainStatusId ||
        (mainAuthorHandle && currentAuthorHandle === mainAuthorHandle);
      return isFocusOrThreadAuthor ? "none" : "thread-reply";
    }
    return timelineEligible && (filterTimeline || filterTimelinePromotions)
      ? "timeline"
      : "none";
  }

  function shouldForgetCachedHiddenForSurface({
    mainStatusId = "",
    currentStatusId = "",
    mainAuthorHandle = "",
    currentAuthorHandle = "",
  } = {}) {
    return Boolean(
      mainStatusId &&
        articleFilterScope({
          mainStatusId,
          currentStatusId,
          mainAuthorHandle,
          currentAuthorHandle,
        }) === "none",
    );
  }

  function contentPolicyForSurface({
    scope = "none",
    primaryAccountListed = false,
    relatedAccountListed = false,
    highConfidencePromotion = false,
    filterTimelineAccounts = false,
    filterTimelinePromotions = false,
    accountTimelineEligible = true,
    promotionTimelineEligible = true,
  } = {}) {
    if (scope === "thread-reply") return "full";
    if (scope === "timeline") {
      if (
        promotionTimelineEligible &&
        filterTimelinePromotions &&
        highConfidencePromotion
      ) {
        return "promotion-candidate";
      }
      if (
        accountTimelineEligible &&
        filterTimelineAccounts &&
        (primaryAccountListed || relatedAccountListed)
      ) {
        return "account-candidate";
      }
    }
    return "none";
  }

  function timelineResultEnabled(
    result,
    rawPreferences,
    {
      accountTimelineEligible = true,
      promotionTimelineEligible = true,
    } = {},
  ) {
    return Boolean(
      (promotionTimelineEligible &&
        rawPreferences?.filterTimelinePromotions === true &&
        result?.timelinePromotionCandidate === true) ||
        (accountTimelineEligible &&
          rawPreferences?.filterTimeline === true &&
          result?.timelineAccountCandidate === true),
    );
  }

  function articleStatusId(article) {
    const time = article.querySelector("time");
    const href = time?.closest("a[href*='/status/']")?.getAttribute("href") || "";
    const match = href.match(/\/status\/(\d+)/);
    return match ? match[1] : "";
  }

  // X 把转推渲染成一张普通推文卡片，卡片作者是**原推作者**，转推者只出现在
  // 顶部的 socialContext 行里（「XXX 已转推」）。同一个 socialContext 还用于
  // 置顶、点赞和推荐，因此必须同时满足转推动词和指向账号主页的链接，才认定
  // 这是一条转推；任何一步不成立都返回空串，回到按原作者判定的既有行为。
  const REPOST_CONTEXT_RE =
    /(reposted|retweeted|已[转轉][推帖发發]|[转轉][推帖发發]了|リポスト|재게시)/i;

  function repostHandleFromContext(rawText, hrefs) {
    const text = normalize(rawText);
    if (!REPOST_CONTEXT_RE.test(text)) return "";
    for (const href of hrefs || []) {
      const path = String(href || "")
        .split(/[?#]/, 1)[0]
        .replace(/^\/+|\/+$/g, "");
      if (!path.includes("/") && HANDLE_RE.test(path)) {
        return normalizeHandle(path);
      }
    }
    const match = text.match(/@([a-z0-9_]{1,15})\b/i);
    return match ? normalizeHandle(match[1]) : "";
  }

  function articleRepostHandle(article) {
    const context = article.querySelector(SELECTOR.socialContext);
    if (!context) return "";
    const hrefs = [];
    const wrapper = context.closest('a[href^="/"]');
    if (wrapper) hrefs.push(wrapper.getAttribute("href"));
    for (const link of context.querySelectorAll('a[href^="/"]')) {
      hrefs.push(link.getAttribute("href"));
    }
    return repostHandleFromContext(visibleText(context), hrefs);
  }

  function articleHandle(article) {
    const userName = article.querySelector(SELECTOR.userName);
    if (!userName) return "";

    for (const link of userName.querySelectorAll('a[href^="/"]')) {
      const path = (link.getAttribute("href") || "")
        .split(/[?#]/, 1)[0]
        .replace(/^\/+|\/+$/g, "");
      if (!path.includes("/") && HANDLE_RE.test(path)) {
        return normalizeHandle(path);
      }
    }

    const match = visibleText(userName).match(/@([a-z0-9_]{1,15})\b/i);
    return match ? normalizeHandle(match[1]) : "";
  }

  const TWITTER_SNOWFLAKE_EPOCH_MS = 1_288_834_974_657n;
  const USER_ID_CREATED_AT_TOLERANCE_MS = 2 * 86_400_000;

  function normalizeUserId(value) {
    if (typeof value === "number" && Number.isSafeInteger(value)) {
      return String(value);
    }
    return typeof value === "string" && /^\d{1,32}$/.test(value)
      ? value
      : "";
  }

  function snapshotRelationship(rawIdentity, active = true) {
    const identity =
      rawIdentity && typeof rawIdentity === "object" ? rawIdentity : {};
    if (!active) {
      return {
        handle: "",
        userId: "",
        following: null,
        idConflict: false,
      };
    }
    const idConflict = identity.idConflict === true;
    return {
      handle: normalizeHandle(identity.handle),
      userId: idConflict ? "" : normalizeUserId(identity.userId),
      following:
        identity.following === true
          ? true
          : identity.following === false
            ? false
            : null,
      idConflict,
    };
  }

  // TweetSnapshot 是 DOM/React 核心证据与规则引擎之间的数据边界。
  // 它只保留标量和普通对象，既不持有 X 的节点/fiber，也不提前改变正文，
  // 后续可安全写入回归样本，或由其他数据源提供同一结构。
  function normalizeTweetSnapshot(rawSnapshot = {}) {
    const raw =
      rawSnapshot && typeof rawSnapshot === "object" ? rawSnapshot : {};
    const promotionSignals =
      raw.promotionSignals && typeof raw.promotionSignals === "object"
        ? raw.promotionSignals
        : {};
    const behavior =
      raw.behavior && typeof raw.behavior === "object" ? raw.behavior : {};
    const repostActive = raw.repost?.isRepost === true;
    const quoteActive = raw.quote?.isQuote === true;

    return {
      schemaVersion: 1,
      statusId: normalizeUserId(raw.statusId),
      text: String(raw.text || ""),
      name: String(raw.name || ""),
      author: snapshotRelationship(raw.author),
      promotionSignals: {
        repliesRestricted: promotionSignals.repliesRestricted === true,
        hasExternalLink: promotionSignals.hasExternalLink === true,
        telegramLink: promotionSignals.telegramLink === true,
        policy: String(promotionSignals.policy || ""),
      },
      repost: {
        isRepost: repostActive,
        ...snapshotRelationship(raw.repost, repostActive),
      },
      quote: {
        isQuote: quoteActive,
        ...snapshotRelationship(raw.quote, quoteActive),
      },
      behavior: {
        coordinatedBurst: behavior.coordinatedBurst === true,
        repeatedLowInfo: behavior.repeatedLowInfo === true,
        duplicateTemplate: behavior.duplicateTemplate === true,
      },
    };
  }

  function conversationReplyRestrictionFromReactObjects(
    roots,
    expectedStatusId = "",
  ) {
    const targetStatusId = normalizeUserId(expectedStatusId);
    const queue = (Array.isArray(roots) ? roots : []).map((value) => ({
      value,
      depth: 0,
    }));
    const seen = new Set();
    let inspected = 0;
    let cursor = 0;

    while (cursor < queue.length && inspected < 5000) {
      const current = queue[cursor];
      cursor += 1;
      const value = current?.value;
      const depth = current?.depth || 0;
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      if (depth > 6) continue;
      try {
        if (
          (typeof Node !== "undefined" && value instanceof Node) ||
          (typeof Window !== "undefined" && value instanceof Window)
        ) {
          continue;
        }
      } catch {
        continue;
      }

      seen.add(value);
      inspected += 1;
      try {
        const legacy =
          value.legacy && typeof value.legacy === "object"
            ? value.legacy
            : value;
        const statusId = normalizeUserId(
          legacy.id_str || value.rest_id || value.id_str,
        );
        if (!targetStatusId || statusId === targetStatusId) {
          const control =
            legacy.conversation_control || value.conversation_control;
          const policy = normalize(control?.policy).replace(/[\s-]+/g, "_");
          if (policy) {
            return {
              repliesRestricted: policy !== "everyone",
              policy,
            };
          }
          const limitedActions =
            legacy.limited_action_results || value.limited_action_results;
          if (
            Array.isArray(limitedActions) &&
            limitedActions.some(
              (item) => normalize(item?.action) === "reply",
            )
          ) {
            return { repliesRestricted: true, policy: "limited_reply" };
          }
        }

        if (depth < 6) {
          for (const key of Object.keys(value)) {
            let child;
            try {
              child = value[key];
            } catch {
              continue;
            }
            if (
              child &&
              typeof child === "object" &&
              queue.length < 8000
            ) {
              queue.push({ value: child, depth: depth + 1 });
            }
          }
        }
      } catch {
        // X 的 React 数据可能包含抛错 getter；跳过该分支。
      }
    }

    return { repliesRestricted: false, policy: "" };
  }

  function snowflakeTimeMs(userId) {
    if (userId.length < 16) return NaN;
    try {
      return Number((BigInt(userId) >> 22n) + TWITTER_SNOWFLAKE_EPOCH_MS);
    } catch {
      return NaN;
    }
  }

  function userIdFromReactUser(value, expectedHandle) {
    if (!value || typeof value !== "object") {
      return { userId: "", conflict: false };
    }
    const legacy =
      value.legacy && typeof value.legacy === "object"
        ? value.legacy
        : value;
    const handle = normalizeHandle(
      legacy.screen_name || value.screen_name,
    );
    if (!handle || handle !== normalizeHandle(expectedHandle)) {
      return { userId: "", conflict: false };
    }
    const legacyId = normalizeUserId(legacy.id_str);
    const restId = normalizeUserId(value.rest_id);
    if (legacyId && restId && legacyId !== restId) {
      return { userId: "", conflict: true };
    }
    const userId = legacyId || restId;
    if (!userId) return { userId: "", conflict: false };

    const avatarId = normalizeUserId(
      String(legacy.profile_image_url_https || "").match(
        /profile_images\/(\d+)\//,
      )?.[1],
    );
    const createdAt = Date.parse(String(legacy.created_at || ""));
    const inferredAt = snowflakeTimeMs(userId);
    if (
      avatarId === userId &&
      Number.isFinite(createdAt) &&
      Number.isFinite(inferredAt) &&
      Math.abs(inferredAt - createdAt) > USER_ID_CREATED_AT_TOLERANCE_MS
    ) {
      return { userId: "", conflict: true };
    }
    return { userId, conflict: false };
  }

  function actionIdentityFromMetadata(testId, label, expectedHandle) {
    const match = String(testId || "").match(
      /^(\d{1,32})-(follow|unfollow|subscribe)$/,
    );
    if (!match) return { userId: "", following: null };
    const handle = normalizeHandle(expectedHandle);
    if (
      handle &&
      !normalize(label).includes(`@${handle}`)
    ) {
      return { userId: "", following: null };
    }
    return {
      userId: match[1],
      following: match[2] === "unfollow" ? true : match[2] === "follow" ? false : null,
    };
  }

  function profileJsonLdUserId(expectedHandle, scripts = null) {
    const rows = scripts || [
      ...document.querySelectorAll('script[type="application/ld+json"]'),
    ].map((script) => script.textContent || "");
    const expected = normalizeHandle(expectedHandle);
    for (const raw of rows) {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        for (const page of Array.isArray(parsed) ? parsed : [parsed]) {
          if (!page || page["@type"] !== "ProfilePage") continue;
          const person = page.mainEntity;
          if (!person || person["@type"] !== "Person") continue;
          const handle = normalizeHandle(
            person.additionalName ||
              String(person.url || "").match(/\/([^/?#]+)(?:[?#].*)?$/)?.[1],
          );
          if (expected && handle !== expected) continue;
          const userId = normalizeUserId(person.identifier);
          if (userId) return userId;
        }
      } catch {
        // 无关或损坏的 JSON-LD 不影响页面处理。
      }
    }
    return "";
  }

  function cachedProfileUserId(handle) {
    const normalizedHandle = normalizeHandle(handle);
    if (!normalizedHandle) return "";
    const cached = profileUserIdCache.get(normalizedHandle);
    if (cached) return cached;
    const userId = profileJsonLdUserId(normalizedHandle);
    // JSON-LD 可能晚于页面骨架出现；只缓存成功结果，空结果允许后续扫描重试。
    if (userId) profileUserIdCache.set(normalizedHandle, userId);
    return userId;
  }

  function viewerHandle() {
    if (knownViewerHandle) return knownViewerHandle;
    const profileHref = document
      .querySelector('[data-testid="AppTabBar_Profile_Link"]')
      ?.getAttribute("href");
    const fromLink = profileHref?.match(/^\/([a-z0-9_]{1,15})(?:[/?#]|$)/i);
    if (fromLink) {
      knownViewerHandle = normalizeHandle(fromLink[1]);
      return knownViewerHandle;
    }

    const switcher = document.querySelector(
      '[data-testid="SideNav_AccountSwitcher_Button"]',
    );
    const fromText = visibleText(switcher).match(/@([a-z0-9_]{1,15})\b/i);
    if (fromText) knownViewerHandle = normalizeHandle(fromText[1]);
    return knownViewerHandle;
  }

  function visibleRelationshipIdentity(article, handle) {
    const mention = `@${handle}`;
    for (const button of article.querySelectorAll(
      '[data-testid$="-follow"], [data-testid$="-unfollow"], [data-testid$="-subscribe"]',
    )) {
      const label = normalize(
        `${button.getAttribute("aria-label") || ""} ${visibleText(button)}`,
      );
      if (!label.includes(mention)) continue;
      const testId = button.getAttribute("data-testid") || "";
      const identity = actionIdentityFromMetadata(testId, label, handle);
      if (identity.userId || identity.following !== null) return identity;
    }
    return { userId: "", following: null };
  }

  function relationshipFromReactObjects(roots, expectedHandle) {
    const queue = roots.map((value) => ({ value, depth: 0 }));
    const seen = new Set();
    let sawExplicitNotFollowing = false;
    let sawFollowing = false;
    let userId = "";
    let idConflict = false;
    let inspected = 0;
    let cursor = 0;

    while (cursor < queue.length && inspected < 5000) {
      const current = queue[cursor];
      cursor += 1;
      const value = current?.value;
      const depth = current?.depth || 0;
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      if (depth > 6) continue;
      try {
        if (
          (typeof Node !== "undefined" && value instanceof Node) ||
          (typeof Window !== "undefined" && value instanceof Window)
        ) {
          continue;
        }
      } catch {
        continue;
      }

      seen.add(value);
      inspected += 1;

      try {
        const legacy =
          value.legacy && typeof value.legacy === "object"
            ? value.legacy
            : value;
        const screenName = normalizeHandle(
          legacy.screen_name || value.screen_name,
        );
        if (screenName === expectedHandle) {
          const identity = userIdFromReactUser(value, expectedHandle);
          if (identity.conflict) {
            idConflict = true;
            userId = "";
          } else if (
            !idConflict &&
            identity.userId &&
            userId &&
            identity.userId !== userId
          ) {
            idConflict = true;
            userId = "";
          } else if (!idConflict && identity.userId) {
            userId = identity.userId;
          }
          const perspective =
            value.relationship_perspectives &&
            typeof value.relationship_perspectives === "object"
              ? value.relationship_perspectives
              : null;
          if (
            legacy.following === true ||
            legacy.follow_request_sent === true ||
            perspective?.following === true
          ) {
            sawFollowing = true;
          }
          if (
            legacy.following === false ||
            perspective?.following === false
          ) {
            sawExplicitNotFollowing = true;
          }
        }

        if (depth < 6) {
          for (const key of Object.keys(value)) {
            let child;
            try {
              child = value[key];
            } catch {
              continue;
            }
            if (
              child &&
              typeof child === "object" &&
              queue.length < 8000
            ) {
              queue.push({ value: child, depth: depth + 1 });
            }
          }
        }
      } catch {
        // X 的 React 数据可能包含抛错 getter；跳过该分支。
      }
    }

    return {
      following: sawFollowing
        ? true
        : sawExplicitNotFollowing
          ? false
          : null,
      userId: idConflict ? "" : userId,
      idConflict,
    };
  }

  function reactRootsFromArticle(article) {
    const cached = scanReactRootsCache.get(article);
    if (cached) return cached;
    const roots = [];
    const elements = [
      article,
      article.querySelector(SELECTOR.userName),
      article.querySelector(SELECTOR.tweetText),
    ].filter(Boolean);

    for (const element of elements) {
      const candidates = [element];
      try {
        if (element.wrappedJSObject) candidates.push(element.wrappedJSObject);
      } catch {
        // Firefox 以外的浏览器没有 wrappedJSObject。
      }

      for (const candidate of candidates) {
        let keys = [];
        try {
          keys = Object.keys(candidate);
        } catch {
          continue;
        }
        for (const key of keys) {
          if (key.startsWith("__reactProps$")) {
            try {
              roots.push(candidate[key]);
            } catch {
              // 忽略无法读取的 React 属性。
            }
          }
          if (!key.startsWith("__reactFiber$")) continue;
          let fiber;
          try {
            fiber = candidate[key];
          } catch {
            continue;
          }
          for (let level = 0; fiber && level < 20; level += 1) {
            roots.push(
              fiber.memoizedProps,
              fiber.pendingProps,
              fiber.memoizedState,
            );
            fiber = fiber.return;
          }
        }
      }
    }

    const result = roots.filter(Boolean);
    scanReactRootsCache.set(article, result);
    return result;
  }

  function articleExternalLinkValues(article) {
    const tweetText = article.querySelector(SELECTOR.tweetText);
    const links = new Set(tweetText?.querySelectorAll("a[href]") || []);
    // X 把正文 URL 渲染成预览卡片时，卡片是 tweetText 的兄弟节点；只补读
    // card.wrapper，不遍历整张 article，避免把引用推文或账号链接当成外层证据。
    for (const link of article.querySelectorAll(
      `${SELECTOR.cardWrapper} a[href], a${SELECTOR.cardWrapper}[href]`,
    )) {
      links.add(link);
    }
    const linkValues = [];
    for (const link of links) {
      linkValues.push(
        link.getAttribute("href") || "",
        link.getAttribute("title") || "",
        visibleText(link),
      );
    }
    return linkValues;
  }

  function articlePromotionSignals(article, statusId = "", rawText = "") {
    const links = externalLinkSignals(articleExternalLinkValues(article));
    // React 树遍历只留给已经同时出现外链与推广话术的少数候选帖；普通时间线
    // 不为读取 conversation_control 付额外成本。
    const promotionCopy = promotionCopySignal(rawText);
    if (
      !links.hasExternalLink ||
      (!links.telegramLink && !promotionCopy)
    ) {
      return { ...links, repliesRestricted: false, policy: "" };
    }
    const restriction = conversationReplyRestrictionFromReactObjects(
      reactRootsFromArticle(article),
      statusId,
    );
    return { ...links, ...restriction };
  }

  function reactRelationshipIdentity(article, handle) {
    return relationshipFromReactObjects(reactRootsFromArticle(article), handle);
  }

  function reactTweetUser(tweet) {
    return (
      tweet?.core?.user_results?.result ||
      tweet?.user_results?.result ||
      tweet?.user ||
      null
    );
  }

  function reactTweetHandle(tweet) {
    const user = reactTweetUser(tweet);
    return normalizeHandle(user?.legacy?.screen_name || user?.screen_name);
  }

  function repostIdentityFromReactObjects(
    roots,
    expectedAuthorHandle,
    expectedStatusId = "",
  ) {
    const fallback = {
      isRepost: false,
      handle: "",
      userId: "",
      following: null,
      idConflict: false,
    };
    const authorHandle = normalizeHandle(expectedAuthorHandle);
    const statusId = normalizeUserId(expectedStatusId);
    const queue = (roots || []).map((value) => ({ value, depth: 0 }));
    const seen = new Set();
    let cursor = 0;
    let inspected = 0;

    while (cursor < queue.length && inspected < 5000) {
      const { value, depth } = queue[cursor] || {};
      cursor += 1;
      if (!value || typeof value !== "object" || seen.has(value) || depth > 7) {
        continue;
      }
      seen.add(value);
      inspected += 1;

      try {
        const retweeted =
          value?.legacy?.retweeted_status_result?.result ||
          value?.retweeted_status_result?.result;
        if (retweeted && typeof retweeted === "object") {
          const originalHandle = reactTweetHandle(retweeted);
          const originalStatusId = normalizeUserId(retweeted.rest_id);
          if (
            (!authorHandle || originalHandle === authorHandle) &&
            (!statusId || !originalStatusId || originalStatusId === statusId)
          ) {
            const repostUser = reactTweetUser(value);
            const repostHandle = normalizeHandle(
              repostUser?.legacy?.screen_name || repostUser?.screen_name,
            );
            if (repostHandle && repostHandle !== originalHandle) {
              const relationship = relationshipFromReactObjects(
                [repostUser],
                repostHandle,
              );
              return {
                isRepost: true,
                handle: repostHandle,
                userId: relationship.userId,
                following: relationship.following,
                idConflict: relationship.idConflict,
              };
            }
          }
        }

        if (depth < 7) {
          for (const key of Object.keys(value)) {
            const child = value[key];
            if (child && typeof child === "object" && queue.length < 8000) {
              queue.push({ value: child, depth: depth + 1 });
            }
          }
        }
      } catch {
        // React 对象可能有抛错 getter；忽略该分支。
      }
    }
    return fallback;
  }

  function articleRepostIdentity(article, authorHandle, statusId = "") {
    const contextHandle = articleRepostHandle(article);
    const react = repostIdentityFromReactObjects(
      reactRootsFromArticle(article),
      authorHandle,
      statusId,
    );
    if (react.isRepost) {
      if (contextHandle && contextHandle !== react.handle) {
        // DOM 和 React 对转推者身份意见不一致时仍确认它是转推，但不采用任一账号；
        // 后续按 unknown 放行，避免错误折叠关注账号的转推。
        return { ...react, handle: "", userId: "", following: null, idConflict: true };
      }
      return react;
    }
    return contextHandle
      ? {
          isRepost: true,
          handle: contextHandle,
          userId: "",
          following: null,
          idConflict: false,
        }
      : react;
  }

  function quotedIdentityFromReactObjects(
    roots,
    expectedAuthorHandle,
    expectedStatusId = "",
  ) {
    const fallback = {
      isQuote: false,
      handle: "",
      userId: "",
      following: null,
      idConflict: false,
    };
    const authorHandle = normalizeHandle(expectedAuthorHandle);
    const statusId = normalizeUserId(expectedStatusId);
    const queue = (roots || []).map((value) => ({ value, depth: 0 }));
    const seen = new Set();
    let cursor = 0;
    let inspected = 0;

    while (cursor < queue.length && inspected < 5000) {
      const { value, depth } = queue[cursor] || {};
      cursor += 1;
      if (!value || typeof value !== "object" || seen.has(value) || depth > 7) {
        continue;
      }
      seen.add(value);
      inspected += 1;

      try {
        const rawQuoted =
          value?.legacy?.quoted_status_result?.result ||
          value?.quoted_status_result?.result;
        const quoted = rawQuoted?.tweet || rawQuoted;
        if (quoted && typeof quoted === "object") {
          const outerHandle = reactTweetHandle(value);
          const outerStatusId = normalizeUserId(value.rest_id);
          if (
            (!authorHandle || outerHandle === authorHandle) &&
            (!statusId || !outerStatusId || outerStatusId === statusId)
          ) {
            const quotedHandle = reactTweetHandle(quoted);
            const quotedUser = reactTweetUser(quoted);
            if (quotedHandle && quotedHandle !== outerHandle && quotedUser) {
              const relationship = relationshipFromReactObjects(
                [quotedUser],
                quotedHandle,
              );
              return {
                isQuote: true,
                handle: quotedHandle,
                userId: relationship.userId,
                following: relationship.following,
                idConflict: relationship.idConflict,
              };
            }
          }
        }

        if (depth < 7) {
          for (const key of Object.keys(value)) {
            const child = value[key];
            if (child && typeof child === "object" && queue.length < 8000) {
              queue.push({ value: child, depth: depth + 1 });
            }
          }
        }
      } catch {
        // React 对象可能有抛错 getter；忽略该分支。
      }
    }
    return fallback;
  }

  function articleQuotedIdentity(article, authorHandle, statusId = "") {
    const cached = quotedIdentityCache.get(article);
    if (
      cached?.authorHandle === authorHandle &&
      cached?.statusId === statusId
    ) {
      return cached.result;
    }
    const result = quotedIdentityFromReactObjects(
      reactRootsFromArticle(article),
      authorHandle,
      statusId,
    );
    quotedIdentityCache.set(article, {
      authorHandle,
      statusId,
      result,
    });
    return result;
  }

  function articleRelationshipIdentity(article, handle) {
    if (!handle) return { following: null, userId: "", idConflict: false };
    const self = viewerHandle();
    if (self && self === handle) {
      return { following: true, userId: "", idConflict: false };
    }
    const cached = relationshipArticleCache.get(article);
    if (
      cached?.handle === handle &&
      Date.now() - cached.checkedAt < 30_000
    ) {
      return cached;
    }

    const visible = visibleRelationshipIdentity(article, handle);
    const react = visible.userId
      ? { following: null, userId: "", idConflict: false }
      : reactRelationshipIdentity(article, handle);
    const idConflict = Boolean(
      react.idConflict ||
        (visible.userId && react.userId && visible.userId !== react.userId),
    );
    const result = {
      handle,
      following:
        visible.following === null ? react.following : visible.following,
      userId: idConflict ? "" : visible.userId || react.userId,
      idConflict,
      checkedAt: Date.now(),
    };
    if (result.following !== null) {
      relationshipHandleCache.set(handle, result.following);
    }
    if (result.following !== null || result.userId || result.idConflict) {
      relationshipArticleCache.set(article, result);
      return result;
    }
    // X 会回收回复 DOM，React 关系数据也会短暂缺失。沿用同一账号在本页
    // 已经确认过的关系，避免 unknown/false 来回切换造成回复反复闪烁。
    return {
      ...result,
      following: relationshipHandleCache.has(handle)
        ? relationshipHandleCache.get(handle)
        : null,
    };
  }

  function articleTweetSnapshot(
    article,
    { statusId = "", handle = "", behavior = {} } = {},
  ) {
    const resolvedStatusId = normalizeUserId(
      statusId || articleStatusId(article),
    );
    const resolvedHandle = normalizeHandle(handle || articleHandle(article));
    const text = visibleText(article.querySelector(SELECTOR.tweetText));
    const name = visibleText(article.querySelector(SELECTOR.userName));
    const promotionSignals = articlePromotionSignals(
      article,
      resolvedStatusId,
      text,
    );

    return normalizeTweetSnapshot({
      statusId: resolvedStatusId,
      text,
      name,
      author: {
        handle: resolvedHandle,
        ...articleRelationshipIdentity(article, resolvedHandle),
      },
      promotionSignals,
      repost: articleRepostIdentity(
        article,
        resolvedHandle,
        resolvedStatusId,
      ),
      quote: articleQuotedIdentity(
        article,
        resolvedHandle,
        resolvedStatusId,
      ),
      behavior,
    });
  }

  function viewerFollowingState(article, handle) {
    return articleRelationshipIdentity(article, handle).following;
  }

  // 转推者的关系状态单独缓存：articleRelationshipIdentity 的缓存按
  // article 存一个 handle，用它查转推者会把作者的结果顶掉，导致每轮扫描
  // 都要重跑两次 fiber 遍历。
  function repostFollowingState(article, repostHandle) {
    if (!repostHandle) return null;
    if (relationshipHandleCache.has(repostHandle)) {
      return relationshipHandleCache.get(repostHandle);
    }
    const cached = repostRelationshipCache.get(article);
    if (
      cached?.handle === repostHandle &&
      Date.now() - cached.checkedAt < 30_000
    ) {
      return cached.following;
    }

    const visible = visibleRelationshipIdentity(article, repostHandle);
    const following =
      visible.following === null
        ? reactRelationshipIdentity(article, repostHandle).following
        : visible.following;
    if (following !== null) {
      relationshipHandleCache.set(repostHandle, following);
    }
    repostRelationshipCache.set(article, {
      handle: repostHandle,
      following,
      checkedAt: Date.now(),
    });
    return following;
  }

  // 一条转推出现在你的时间线或回复区，前提是有人转了它。转推者已关注、
  // 是你自己或在放行名单时直接放行；关系暂时读不到时同样放行，与项目对
  // 账号本身「无法确认关系就不隐藏」的硬规则保持一致。只有转推者被明确
  // 判定为未关注，或被你自己拉黑，才回到按原推作者判定。
  function repostProtectionState(article, repostIdentity, authorHandle) {
    if (!repostIdentity?.isRepost) return "";
    const repostHandle = normalizeHandle(repostIdentity.handle);
    if (!repostHandle) return "protected-repost-unknown";
    if (repostHandle === authorHandle) return "";
    if (accountIsLocallyAllowed(repostHandle)) return "protected-repost-allow";
    const self = viewerHandle();
    if (self && self === repostHandle) return "protected-repost-self";
    if (
      localBlockedHandles.has(repostHandle) ||
      subscribedBlockedHandles.has(repostHandle)
    ) {
      return "";
    }
    const following =
      repostIdentity.following === null
        ? repostFollowingState(article, repostHandle)
        : repostIdentity.following;
    if (following === false) return "";
    return following === true
      ? "protected-repost-following"
      : "protected-repost-unknown";
  }

  function retryUnknownFollowingState(article, handle) {
    const previous = unknownFollowingChecks.get(article);
    const count = previous?.handle === handle ? previous.count + 1 : 1;
    unknownFollowingChecks.set(article, { handle, count });
    if (count > 3 || followingRetryTimer) return;
    followingRetryTimer = window.setTimeout(() => {
      followingRetryTimer = 0;
      scan(document);
    }, 500);
  }

  function articleShowsTranslation(article) {
    const fullText = visibleText(article);
    return /(translated from|show original|翻译自|翻譯自|显示原文|顯示原文)/i.test(
      fullText,
    );
  }

  function isTopLevelTweetArticle(article) {
    const parentArticle = article.parentElement?.closest(SELECTOR.tweet);
    return !parentArticle;
  }

  function fingerprint(article, text, name) {
    return `${VERSION}|${decisionCacheRevision}|${articleStatusId(article)}|${name.slice(0, 80)}|${text.slice(0, 280)}`;
  }

  function findCell(article) {
    return article.closest(SELECTOR.cell) || article.parentElement;
  }

  function evidenceLine(evidence, limit = 3) {
    const rows = Array.isArray(evidence) ? evidence : [];
    const visible = rows
      .slice(0, limit)
      .map((item) => `${item.sourceLabel}：${item.reason}`);
    if (rows.length > limit) visible.push(`另有 ${rows.length - limit} 项`);
    return visible.join("；");
  }
