  function visibleText(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    for (const badge of clone.querySelectorAll(
      `.${CLASS.accountBadge}, .xps-account-allow`,
    )) {
      badge.remove();
    }
    for (const image of clone.querySelectorAll("img[alt]")) {
      image.replaceWith(image.getAttribute("alt") || "");
    }
    return (clone.textContent || "").slice(0, CONFIG.maxTextLength);
  }

  function countMatches(text, pattern) {
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  function compactForNoiseTest(text) {
    return text
      .replace(EMOJI_RE, "")
      .replace(/[\s\p{P}\p{S}]/gu, "");
  }

  // 批量引流回复的稳定特征之一是在正常语句中间硬插 emoji，用来打断
  // 关键词匹配。这里只认 emoji 两侧都紧贴汉字的情况：跟在标点或空格
  // 后面的 emoji 属于普通用法，不计分。
  function isMidSentenceEmojiInsertion(text) {
    return MID_SENTENCE_EMOJI_RE.test(normalize(text));
  }

  function templateNormalizedBase(text) {
    return normalize(text)
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/[a-z0-9-]+\.(?:com|net|org|cn|tv|io|me|co)\S*/gi, "")
      .replace(/@[a-z0-9_]{1,15}/gi, "")
      .replace(EMOJI_RE, "")
      .replace(DECORATIVE_RE, "")
      .replace(/[\s\p{P}\p{S}]/gu, "");
  }

  // 归一化出用于跨账号模板复用比对的键。
  // 第一个键去掉链接、@提及、emoji、装饰符号、空白和标点；第二个键在此
  // 基础上再去掉拉丁字母和数字，用来抓「插入随机字母」的同族变体。
  function templateKeys(text) {
    const base = templateNormalizedBase(text);
    const keys = [];
    const accept = (value) => {
      if (value.length < CONFIG.templateMinChars) return;
      const unique = new Set(value).size;
      if (unique / value.length < CONFIG.templateMinUniqueRatio) return;
      if (!keys.includes(value)) keys.push(value);
    };
    accept(base);
    accept(base.replace(/[a-z0-9]/gi, ""));
    return keys;
  }

  function templateCjkNgrams(text) {
    const base = templateNormalizedBase(text);
    const cjk = (base.match(CJK_RE) || []).join("");
    if (cjk.length < CONFIG.templateNearMinCjkChars) return null;
    if (new Set(cjk).size / cjk.length < CONFIG.templateMinUniqueRatio) {
      return null;
    }
    const grams = new Set();
    for (
      let index = 0;
      index <= cjk.length - CONFIG.templateNearNgramSize;
      index += 1
    ) {
      grams.add(cjk.slice(index, index + CONFIG.templateNearNgramSize));
    }
    return grams.size ? grams : null;
  }

  function nearDuplicateTemplateIds(entries) {
    const duplicated = new Set();
    const rows = [];
    const postings = new Map();

    for (const entry of entries) {
      if (!entry.nearGrams) continue;
      const candidateCounts = new Map();
      for (const gram of entry.nearGrams) {
        for (const index of postings.get(gram) || []) {
          candidateCounts.set(index, (candidateCounts.get(index) || 0) + 1);
        }
      }
      for (const [index, shared] of candidateCounts) {
        const previous = rows[index];
        if (!previous || previous.handle === entry.handle) continue;
        const union =
          previous.nearGrams.size + entry.nearGrams.size - shared;
        if (union <= 0 || shared / union < CONFIG.templateNearJaccard) continue;
        duplicated.add(previous.id);
        duplicated.add(entry.id);
      }

      const rowIndex = rows.length;
      rows.push(entry);
      for (const gram of entry.nearGrams) {
        const values = postings.get(gram) || [];
        if (values.length < CONFIG.templateNearMaxPosting) {
          values.push(rowIndex);
          postings.set(gram, values);
        }
      }
    }
    return duplicated;
  }

  function mergeBehaviorRecordCache(
    cache,
    records,
    limit = CONFIG.behaviorMaxRecords,
  ) {
    for (const record of records || []) {
      const id = String(record?.id || "");
      const handle = normalizeHandle(record?.handle);
      if (!id || !handle) continue;
      if (cache.has(id)) cache.delete(id);
      cache.set(id, { ...record, id, handle });
    }
    while (cache.size > limit) {
      cache.delete(cache.keys().next().value);
    }
    return cache;
  }

  function isMentionEmojiOnlyReply(text) {
    const body = text
      .replace(/^(?:@[a-z0-9_]{1,15}\s*)+/i, "")
      .trim();
    if (
      !body ||
      body.length > 16 ||
      countMatches(body, EMOJI_RE) === 0
    ) {
      return false;
    }
    return (
      body
        .replace(EMOJI_RE, "")
        .replace(/[\u200D\uFE0E\uFE0F\s\p{P}\p{S}]/gu, "") === ""
    );
  }

  function isNumericSymbolSandwichReply(text) {
    const body = text
      .replace(/^(?:@[a-z0-9_]{1,15}\s*)+/i, "")
      .trim();
    return /^\d{2}\s*[^\p{N}\s]{1,5}\s*\d{2}$/u.test(body);
  }

  function isEmojiSeparatorDisplayName(name) {
    const displayName = name
      .replace(/@[a-z0-9_]{1,15}\b.*$/i, "")
      .trim();
    if (countMatches(displayName, EMOJI_RE) < 2) return false;
    const segments = displayName
      .split(/\p{Extended_Pictographic}+/u)
      .map((segment) =>
        segment
          .replace(/[\u200D\uFE0E\uFE0F\s\p{P}\p{S}]/gu, "")
          .trim(),
      )
      .filter((segment) => /[\p{L}\p{N}]/u.test(segment));
    return segments.length >= 2;
  }

  // 把回复区的 DOM 读成纯数据，行为判定本身放在 computeReplyBehaviorSignals
  // 里，方便脱离浏览器做回归测试。
  function replyBehaviorRecords(articles) {
    const records = [];
    for (const article of articles) {
      if (!isTopLevelTweetArticle(article)) continue;
      records.push({
        id: articleStatusId(article),
        handle: articleHandle(article),
        createdAt: Date.parse(
          article.querySelector("time")?.getAttribute("datetime") || "",
        ),
        text: normalize(
          visibleText(article.querySelector(SELECTOR.tweetText)),
        ),
        name: normalize(
          visibleText(article.querySelector(SELECTOR.userName)),
        ),
      });
    }
    return records;
  }

  function computeReplyBehaviorSignals(records) {
    const entries = [];
    const lowInfoByHandle = new Map();
    // 同一段归一化文本出现在哪些账号和哪些回复下。跨账号复用是批量
    // 投放最稳定的特征，比逐条追关键词变体更难规避。
    const handlesByTemplate = new Map();
    const idsByTemplate = new Map();

    for (const record of records || []) {
      const id = String(record?.id || "");
      const handle = normalizeHandle(record?.handle);
      if (!id || !handle) continue;
      const text = normalize(record?.text);
      const name = normalize(record?.name);
      const createdAt = Number(record?.createdAt);
      const lowInfo =
        isMentionEmojiOnlyReply(text) || isNumericSymbolSandwichReply(text);
      const keys = templateKeys(text);
      const nearGrams = templateCjkNgrams(text);
      entries.push({ id, handle, createdAt, name, lowInfo, keys, nearGrams });

      if (lowInfo) {
        const ids = lowInfoByHandle.get(handle) || [];
        ids.push(id);
        lowInfoByHandle.set(handle, ids);
      }
      for (const key of keys) {
        const handles = handlesByTemplate.get(key) || new Set();
        handles.add(handle);
        handlesByTemplate.set(key, handles);
        const ids = idsByTemplate.get(key) || new Set();
        ids.add(id);
        idsByTemplate.set(key, ids);
      }
    }

    const duplicated = new Set();
    for (const [key, handles] of handlesByTemplate) {
      if (handles.size < CONFIG.templateMinHandles) continue;
      for (const id of idsByTemplate.get(key) || []) duplicated.add(id);
    }
    for (const id of nearDuplicateTemplateIds(entries)) duplicated.add(id);

    const repeated = new Set();
    for (const ids of lowInfoByHandle.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) repeated.add(id);
    }

    // burst 候选原先只收 emoji-only 一类低信息回复，带正文的批量模板
    // 因此逃过了集群检测；跨账号复用同一段文本的回复现在同样计入。
    const candidates = entries
      .filter(
        (entry) =>
          (entry.lowInfo || duplicated.has(entry.id)) &&
          Number.isFinite(entry.createdAt) &&
          countMatches(entry.name, EMOJI_RE) >= 1,
      )
      .map((entry) => ({
        id: entry.id,
        handle: entry.handle,
        createdAt: entry.createdAt,
      }))
      .sort((left, right) => left.createdAt - right.createdAt);

    const coordinated = new Set();
    let first = 0;
    for (let last = 0; last < candidates.length; last += 1) {
      while (
        candidates[last].createdAt - candidates[first].createdAt >
        CONFIG.burstWindowMs
      ) {
        first += 1;
      }
      const window = candidates.slice(first, last + 1);
      if (
        window.length < CONFIG.burstMinReplies ||
        new Set(window.map((item) => item.handle)).size <
          CONFIG.burstMinHandles
      ) {
        continue;
      }
      for (const item of window) coordinated.add(item.id);
    }
    return { coordinated, repeated, duplicated };
  }

  function detectReplyBehaviorSignals(articles) {
    return computeReplyBehaviorSignals(replyBehaviorRecords(articles));
  }

  function isShortEmojiCode(text) {
    const emojiCount = countMatches(text, EMOJI_RE);
    if (emojiCount < 3 || text.length > 45) return false;

    const compact = compactForNoiseTest(text);
    return (
      /^[a-z0-9]{1,7}$/i.test(compact) ||
      (/^[0-9]{1,4}$/.test(compact) && emojiCount >= 3)
    );
  }

  function isEmojiBrokenLatin(text) {
    const emojiCount = countMatches(text, EMOJI_RE);
    const latinCount = countMatches(text, LATIN_RE);
    const cjkCount = countMatches(text, CJK_RE);

    if (emojiCount < 3 || latinCount < 4 || cjkCount > 3 || text.length > 150) {
      return false;
    }

    const emojiBetweenLetters = /[a-z]\s*\p{Extended_Pictographic}+\s*[a-z]/iu.test(
      text,
    );
    const replacementMarker = text.includes("\uFFFD");
    const decorationCount = countMatches(text, DECORATIVE_RE);

    return emojiBetweenLetters || replacementMarker || decorationCount >= 2;
  }

  function isTimestampEmojiWordTemplate(text) {
    if (text.length > 160) return false;

    const timestamp =
      /\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}\s*$/u;
    if (!timestamp.test(text)) return false;

    const emojiCount = countMatches(text, EMOJI_RE);
    const cjkCount = countMatches(text, CJK_RE);
    if (emojiCount < 2 || emojiCount > 6 || cjkCount > 0) return false;

    const wordsOnly = text
      .replace(timestamp, "")
      .replace(EMOJI_RE, " ")
      .replace(/[\d_\p{P}\p{S}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = wordsOnly ? wordsOnly.split(" ") : [];

    return (
      words.length === 2 &&
      words.every((word) => /^[a-z]{2,24}$/i.test(word))
    );
  }

  function remoteRuleHit(
    text,
    name,
    handle,
    tweetsTranslated = false,
    userId = "",
  ) {
    if (!remoteRules.length || identitySourceBits(userId, handle).whitelisted) {
      return null;
    }

    for (const { rawPattern, pattern, field } of remoteRules) {
      const patternHasCjk = CJK_RE.test(pattern);
      CJK_RE.lastIndex = 0;
      const tweetTrusted = !patternHasCjk || !tweetsTranslated;
      const tweetHit = tweetTrusted && text.includes(pattern);
      const hit =
        field === "h"
          ? handle.includes(pattern)
          : field === "d"
            ? name.includes(pattern)
            : field === "b"
              ? false
              : field === "t"
                ? tweetHit
                : handle.includes(pattern) || name.includes(pattern) || tweetHit;
      if (hit) return rawPattern;
    }
    return null;
  }

  function remoteAccountSourceNames(rawHandle, rawUserId = "") {
    const handle = normalizeHandle(rawHandle);
    const identity = identitySourceBits(rawUserId, handle);
    if ((!handle && !rawUserId) || identity.whitelisted) return [];
    const sourceBits = identity.sourceBits;
    const sources = [];
    if (sourceBits & REMOTE_SOURCE.mxga) sources.push("MXGA");
    if (sourceBits & REMOTE_SOURCE.twitterBlockPorn) {
      sources.push("Twitter Block Porn");
    }
    return sources;
  }

  // MXGA 名单里约 84% 是 AI 自动判定、未经人工确认的条目，官方自己的
  // /v1/check 和内置名单都不发这部分。人工确认仍单独定罪，自动条目降到
  // 阈值以下，必须再有一条特征才隐藏。
  function remoteListVerdict(sourceBits) {
    const mask = sourceBits & REMOTE_SOURCE_MASK;
    if (!mask) return null;
    const mxgaOnly = mask === REMOTE_SOURCE.mxga;
    const autoTier = Boolean(sourceBits & MXGA_FLAG.autoTier);
    const category = mxgaCategoryName(sourceBits);
    const points =
      mask === REMOTE_SOURCE_MASK ? 10 : mxgaOnly && autoTier ? 6 : 8;
    let tierNote = "";
    if (mxgaOnly) {
      tierNote = autoTier
        ? `${category ? `${category}·` : ""}AI 自动判定，需结合其他特征`
        : `${category ? `${category}·` : ""}人工确认`;
    }
    return { points, tierNote, autoTier, category };
  }

  // 只对 MXGA 命中的账号给申诉入口；Twitter Block Porn 与本地规则
  // 走不到 MXGA 的复核流程。
  function mxgaAppealUrl(rawHandle, rawUserId = "") {
    const handle = normalizeHandle(rawHandle);
    const identity = identitySourceBits(rawUserId, handle);
    if (!handle || identity.whitelisted) return "";
    const sourceBits = identity.sourceBits;
    if (!(sourceBits & REMOTE_SOURCE.mxga)) return "";
    const params = new URLSearchParams({
      title: `误判申诉：@${handle}`,
      body: [
        `X handle：@${handle}`,
        "",
        "申诉理由：",
        "",
        "（由 Purify X 生成；该账号在 MXGA 公开名单中，请协助复核。）",
      ].join("\n"),
    });
    return `${REMOTE.mxgaAppealBase}?${params.toString()}`;
  }

  function accountIsLocallyAllowed(rawHandle) {
    const handle = normalizeHandle(rawHandle);
    return Boolean(
      handle &&
        (localAllowedHandles.has(handle) ||
          subscribedAllowedHandles.has(handle)),
    );
  }

  function accountSourceNames(rawHandle, rawUserId = "") {
    const handle = normalizeHandle(rawHandle);
    if (!handle || accountIsLocallyAllowed(handle)) return [];
    const sources = [];
    if (localBlockedHandles.has(handle)) sources.push("本地屏蔽");
    if (subscribedBlockedHandles.has(handle)) sources.push("自定义订阅");
    sources.push(...remoteAccountSourceNames(handle, rawUserId));
    return sources;
  }

  function relatedAccountVerdict(identity) {
    const handle = normalizeHandle(identity?.handle);
    const userId = normalizeUserId(identity?.userId);
    if (!handle || accountIsLocallyAllowed(handle)) return null;
    // 引用作者的 React 身份发生 ID 冲突时，不采用公开名单的 handle 回退；
    // 用户自己明确维护的本地/订阅 handle 规则仍可生效。
    const sources = identity?.idConflict
      ? [
          ...(localBlockedHandles.has(handle) ? ["本地屏蔽"] : []),
          ...(subscribedBlockedHandles.has(handle) ? ["自定义订阅"] : []),
        ]
      : accountSourceNames(handle, userId);
    if (sources.length === 0) return null;

    let points = 0;
    let evidenceSource = EVIDENCE_SOURCE.list;
    if (localBlockedHandles.has(handle)) {
      points = 8;
      evidenceSource = EVIDENCE_SOURCE.localList;
    }
    if (subscribedBlockedHandles.has(handle)) {
      points = Math.max(points, 8);
      if (evidenceSource === EVIDENCE_SOURCE.list) {
        evidenceSource = EVIDENCE_SOURCE.subscription;
      }
    }
    const remoteIdentity = identitySourceBits(userId, handle);
    if (!identity?.idConflict && !remoteIdentity.whitelisted) {
      points = Math.max(
        points,
        remoteListVerdict(remoteIdentity.sourceBits)?.points || 0,
      );
    }
    return points > 0
      ? { handle, userId, sources, points, evidenceSource }
      : null;
  }

  function matchedKeywords(text, name, keywords, limit = 3) {
    const normalizedText = normalizeKeywordText(text);
    const normalizedName = normalizeKeywordText(name);
    const index = keywordCollectionIndex(keywords);
    const literalPossible = index.literalGates.some(
      (gate) => gate.test(normalizedText) || gate.test(normalizedName),
    );
    const matches = [];
    for (const { rawKeyword, matcher } of index.rules) {
      if (matcher.kind === "literal" && !literalPossible) continue;
      if (
        keywordMatcherTest(normalizedText, matcher) ||
        keywordMatcherTest(normalizedName, matcher)
      ) {
        matches.push(rawKeyword);
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  function matchedAiLearnedRules(text, limit = 3, now = Date.now()) {
    const normalizedText = normalizeKeywordText(text);
    const matches = [];
    for (const rule of aiState.learnedRules) {
      if (
        rule.enabled === false ||
        (rule.category !== "manual" && Number(rule.expiresAt) <= now)
      ) {
        continue;
      }
      if (
        keywordMatcherTest(
          normalizedText,
          compiledKeywordMatcher(rule.value),
        )
      ) {
        matches.push(rule.value);
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  function communityKeywordEvidence(
    rawText,
    sources = [
      { name: "TweetGuard", keywords: tweetGuardCommunityKeywords },
      { name: "BlueNoise", keywords: blueNoiseCommunityKeywords },
    ],
  ) {
    const hits = [];
    const sourceNames = [];
    for (const source of sources) {
      const sourceHits = matchedKeywords(
        rawText,
        "",
        source?.keywords || [],
      );
      if (sourceHits.length === 0) continue;
      sourceNames.push(String(source?.name || "社区规则"));
      for (const hit of sourceHits) {
        if (!hits.includes(hit)) hits.push(hit);
        if (hits.length >= 3) break;
      }
    }
    return { hits, sourceNames };
  }

  function scoreReply(
    rawText,
    rawName = "",
    rawHandle = "",
    options = {},
  ) {
    const text = normalize(rawText);
    const name = normalize(rawName);
    const handle = normalizeHandle(rawHandle);
    const userId = normalizeUserId(options.userId);
    const reasons = [];
    const evidence = [];
    let score = 0;

    const add = (points, reason, source) => {
      score += points;
      reasons.push(`${reason} +${points}`);
      evidence.push({
        source,
        sourceLabel: EVIDENCE_LABEL[source] || "其他特征",
        points,
        reason,
      });
    };

    if (!text && !name && !handle) {
      return { score: 0, reasons: [], evidence: [], text, name, handle, userId };
    }
    if (accountIsLocallyAllowed(handle)) {
      return {
        score: 0,
        reasons: ["账号在永远放行名单"],
        evidence: [],
        text,
        name,
        handle,
        userId,
        allowed: true,
      };
    }

    const strongName =
      SHARED_STRONG_RE.test(name) ||
      STRONG_NAME_CONTEXT_RE.test(name);
    const profilePromoName = PROFILE_PROMO_NAME_RE.test(name);
    const lowQualityNameToken = LOW_QUALITY_NAME_TOKEN_RE.test(name);
    const strongText =
      SHARED_STRONG_RE.test(text) || STRONG_TEXT_CONTEXT_RE.test(text);
    const weakSexualName = WEAK_SEXUAL_RE.test(name);
    const weakSexualText = WEAK_SEXUAL_RE.test(text);
    const textHasCta = CTA_RE.test(text);
    const textHasContact = CONTACT_RE.test(text);
    const nameHasCta = CTA_RE.test(name);
    const nameHasContact = CONTACT_RE.test(name);
    const networkPromoTemplate = NETWORK_PROMO_TEMPLATE_RE.test(text);
    const coordinatedBurst = Boolean(options.coordinatedBurst);
    const repeatedLowInfo = Boolean(options.repeatedLowInfo);
    const duplicateTemplate = Boolean(options.duplicateTemplate);
    const promotion = promotionPattern(text, options);
    const remoteIdentity = identitySourceBits(userId, handle);
    const aiDecision =
      options.aiDecision && typeof options.aiDecision === "object"
        ? options.aiDecision
        : null;
    const emojiOnlyReply = isMentionEmojiOnlyReply(text);
    const suspiciousHandle = SUSPICIOUS_HANDLE_RE.test(handle);
    const separatorName = isEmojiSeparatorDisplayName(name);
    const localKeywordHits = matchedKeywords(
      text,
      name,
      localStrongKeywords,
    );
    const subscriptionKeywordHits = matchedKeywords(
      text,
      name,
      subscribedStrongKeywords,
    );
    const remoteCommunityEvidence = remoteIdentity.whitelisted
      ? { hits: [], sourceNames: [] }
      : communityKeywordEvidence(
          text,
          options.communityKeywordSources,
        );
    const remoteCommunityKeywordHits = remoteCommunityEvidence.hits;
    const aiLearnedKeywordHits = aiConfig.enabled
      ? matchedAiLearnedRules(text)
      : [];
    const quotedAccount =
      options.quotedAccount && typeof options.quotedAccount === "object"
        ? options.quotedAccount
        : null;

    if (localBlockedHandles.has(handle)) {
      add(
        8,
        "账号命中本地屏蔽名单",
        EVIDENCE_SOURCE.localList,
      );
    }
    if (subscribedBlockedHandles.has(handle)) {
      add(
        8,
        "账号命中自定义订阅",
        EVIDENCE_SOURCE.subscription,
      );
    }

    if ((handle || userId) && !remoteIdentity.whitelisted) {
      const sourceBits = remoteIdentity.sourceBits;
      const verdict = remoteListVerdict(sourceBits);
      if (verdict) {
        const sources = remoteAccountSourceNames(handle, userId);
        // 账号名单优先按不可变数字 ID 命中，拿不到可靠 ID 时再按
        // 精确 @handle 回退；已关注账号和名单白名单在评分前放行。
        add(
          verdict.points,
          `账号命中 ${sources.join("、")}${verdict.tierNote ? `（${verdict.tierNote}）` : ""}`,
          EVIDENCE_SOURCE.list,
        );
      }
      const rule = remoteRuleHit(
        text,
        name,
        handle,
        Boolean(options.tweetsTranslated),
        userId,
      );
      if (rule) {
        const preview = rule.length > 36 ? `${rule.slice(0, 36)}…` : rule;
        add(
          5,
          `命中 MXGA 社区规则“${preview}”（需结合其他特征）`,
          EVIDENCE_SOURCE.community,
        );
      }
    }

    if (
      quotedAccount?.handle &&
      Array.isArray(quotedAccount.sources) &&
      quotedAccount.sources.length > 0 &&
      Number(quotedAccount.points) > 0
    ) {
      const source = Object.values(EVIDENCE_SOURCE).includes(
        quotedAccount.evidenceSource,
      )
        ? quotedAccount.evidenceSource
        : EVIDENCE_SOURCE.list;
      add(
        Number(quotedAccount.points),
        `引用作者 @${normalizeHandle(quotedAccount.handle)} 命中 ${quotedAccount.sources.join("、")}`,
        source,
      );
    }

    if (strongName) {
      add(
        8,
        "昵称含强引流或色情词",
        EVIDENCE_SOURCE.keyword,
      );
    } else if (weakSexualName) {
      add(5, "昵称含色情特征", EVIDENCE_SOURCE.keyword);
    } else if (profilePromoName) {
      add(5, "昵称含附近资源、配对或招募式引流", EVIDENCE_SOURCE.keyword);
    } else if (lowQualityNameToken) {
      add(3, "昵称含免费、无偿、全国等营销标签", EVIDENCE_SOURCE.keyword);
    }

    if (localKeywordHits.length > 0) {
      add(
        8,
        `命中自定义屏蔽词“${localKeywordHits.join("、")}”`,
        EVIDENCE_SOURCE.keyword,
      );
    }
    if (subscriptionKeywordHits.length > 0) {
      add(
        8,
        `命中订阅屏蔽词“${subscriptionKeywordHits.join("、")}”`,
        EVIDENCE_SOURCE.subscription,
      );
    }
    if (remoteCommunityKeywordHits.length > 0) {
      const communityNames = remoteCommunityEvidence.sourceNames.join("、");
      add(
        5,
        `命中 ${communityNames || "社区"} 规则“${remoteCommunityKeywordHits.join("、")}”（需结合其他特征）`,
        EVIDENCE_SOURCE.community,
      );
    }
    if (aiLearnedKeywordHits.length > 0) {
      add(
        8,
        `命中本地 AI 学习规则“${aiLearnedKeywordHits.join("、")}”`,
        EVIDENCE_SOURCE.ai,
      );
    } else if (aiDecision?.isSpam && aiDecision.confidence >= 90) {
      const detail = aiDecision.reasoning
        ? `：${aiDecision.reasoning}`
        : "";
      add(
        8,
        `AI 高置信度判定为垃圾内容（${Math.round(aiDecision.confidence)}%）${detail}`,
        EVIDENCE_SOURCE.ai,
      );
    }

    if (strongText) {
      add(8, "回复含强引流或色情词", EVIDENCE_SOURCE.keyword);
    } else if (weakSexualText) {
      add(4, "回复含色情特征", EVIDENCE_SOURCE.keyword);
    }

    if (textHasCta) {
      add(3, "引导查看主页或私聊", EVIDENCE_SOURCE.keyword);
    }
    if (promotion.repliesRestricted) {
      add(2, "发布者限制了回复权限", EVIDENCE_SOURCE.pattern);
    }
    if (promotion.telegramLink) {
      add(4, "正文包含 Telegram 外部链接", EVIDENCE_SOURCE.pattern);
    } else if (textHasContact) {
      add(3, "包含站外联系方式", EVIDENCE_SOURCE.keyword);
    } else if (promotion.hasExternalLink) {
      add(2, "正文包含外部链接", EVIDENCE_SOURCE.pattern);
    }
    if (promotion.promotionCopy) {
      add(3, "正文含粉丝福利或推广话术", EVIDENCE_SOURCE.keyword);
    }
    if (promotion.highConfidence) {
      add(
        2,
        promotion.repliesRestricted &&
          promotion.telegramLink &&
          !promotion.promotionCopy
          ? "限制回复与 Telegram 外链同时出现"
          : promotion.repliesRestricted
          ? "限制回复、外部链接与推广话术同时出现"
          : "Telegram 外链与推广话术同时出现",
        EVIDENCE_SOURCE.pattern,
      );
    }
    if (nameHasCta) {
      add(2, "昵称引导查看主页或联系", EVIDENCE_SOURCE.keyword);
    }
    if (nameHasContact) {
      add(5, "昵称包含站外联系方式", EVIDENCE_SOURCE.keyword);
    }
    if (networkPromoTemplate) {
      add(
        8,
        "命中随机字母变体的色情推广模板",
        EVIDENCE_SOURCE.pattern,
      );
    } else if (TEMPLATE_RE.test(text)) {
      add(6, "命中常见批量回复模板", EVIDENCE_SOURCE.pattern);
    }
    if (coordinatedBurst) {
      add(
        8,
        "命中同秒批量注册风格的 emoji 回复集群",
        EVIDENCE_SOURCE.pattern,
      );
    }
    if (repeatedLowInfo) {
      add(
        5,
        "同一账号在当前回复区重复发送低信息内容",
        EVIDENCE_SOURCE.pattern,
      );
    }
    // 跨账号模板复用和句内插 emoji 都只是特征分，单独命中都达不到阈值；
    // 两者同时出现才构成「换 emoji 复用同一句」这种批量投放的完整证据。
    if (duplicateTemplate) {
      add(
        5,
        "多个账号在当前回复区复用同一段文本",
        EVIDENCE_SOURCE.pattern,
      );
    }
    if (isMidSentenceEmojiInsertion(text)) {
      add(3, "正文中间插入 emoji 打断语句", EVIDENCE_SOURCE.pattern);
    }
    if (emojiOnlyReply) {
      add(2, "回复仅含提及和 emoji", EVIDENCE_SOURCE.pattern);
    }
    if (separatorName) {
      add(2, "昵称使用多段 emoji 分隔广告位样式", EVIDENCE_SOURCE.pattern);
    }
    if (suspiciousHandle) {
      add(1, "账号 ID 呈批量生成格式", EVIDENCE_SOURCE.pattern);
    }
    if (isShortEmojiCode(text)) {
      add(8, "短数字/字母 emoji 乱码", EVIDENCE_SOURCE.pattern);
    }
    if (isNumericSymbolSandwichReply(text)) {
      add(8, "命中两位数字—符号—两位数字机器模板", EVIDENCE_SOURCE.pattern);
    }
    if (isEmojiBrokenLatin(text)) {
      add(5, "emoji 拆词乱码", EVIDENCE_SOURCE.pattern);
    }
    if (isTimestampEmojiWordTemplate(text)) {
      add(
        8,
        "双英文词、emoji 与秒级时间戳模板",
        EVIDENCE_SOURCE.pattern,
      );
    }

    const shortReply = text.length <= 45;
    const genericReply = GENERIC_REPLY_RE.test(text);
    const sexualName = strongName || weakSexualName;

    if (profilePromoName && emojiOnlyReply) {
      add(
        3,
        "推广式昵称配合仅提及和 emoji 的批量回复",
        EVIDENCE_SOURCE.pattern,
      );
    }

    if (lowQualityNameToken && emojiOnlyReply) {
      add(
        4,
        "营销标签昵称配合仅提及和 emoji 的回复",
        EVIDENCE_SOURCE.pattern,
      );
    }

    if (nameHasContact && emojiOnlyReply) {
      add(
        3,
        "联系方式昵称配合仅提及和 emoji 的回复",
        EVIDENCE_SOURCE.pattern,
      );
    }

    if (sexualName && (shortReply || genericReply)) {
      add(
        2,
        "色情昵称配合低信息量回复",
        EVIDENCE_SOURCE.pattern,
      );
    }

    if (weakSexualText && (textHasCta || textHasContact)) {
      add(
        3,
        "色情内容与引流方式同时出现",
        EVIDENCE_SOURCE.pattern,
      );
    }

    return {
      score,
      reasons,
      evidence,
      text,
      name,
      handle,
      userId,
      highConfidencePromotion: promotion.highConfidence,
      learnedRuleHits: aiLearnedKeywordHits,
    };
  }
