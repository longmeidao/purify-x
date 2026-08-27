  function startCustomSubscriptionUpdates() {
    if (customSubscriptionUrls.length > 0) {
      void syncCustomSubscriptions(false);
    }
    window.setInterval(() => {
      if (customSubscriptionUrls.length > 0) {
        void syncCustomSubscriptions(false);
      }
    }, CONFIG.remoteUpdateMs);
  }

  function sanitizeEtag(value) {
    const etag = typeof value === "string" ? value.trim() : "";
    return etag && etag.length <= 512 && !/[\r\n]/.test(etag) ? etag : "";
  }

  function responseHeaderValue(rawHeaders, targetName) {
    const expected = String(targetName || "").toLowerCase();
    for (const line of String(rawHeaders || "").split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator <= 0) continue;
      if (line.slice(0, separator).trim().toLowerCase() === expected) {
        return line.slice(separator + 1).trim();
      }
    }
    return "";
  }

  function requestTextResource(
    url,
    maxChars,
    accept = "application/json, text/plain",
    { etag = "" } = {},
  ) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("当前 userscript 管理器不支持跨域名单同步"));
        return;
      }

      const safeEtag = sanitizeEtag(etag);
      const headers = {
        Accept: accept,
        "Cache-Control": "no-cache",
      };
      if (safeEtag) headers["If-None-Match"] = safeEtag;

      GM_xmlhttpRequest({
        method: "GET",
        url,
        anonymous: true,
        timeout: 30_000,
        headers,
        onload(response) {
          const responseEtag = sanitizeEtag(
            responseHeaderValue(response.responseHeaders, "etag"),
          );
          if (response.status === 304) {
            resolve({
              notModified: true,
              text: "",
              etag: responseEtag || safeEtag,
            });
            return;
          }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status}`));
            return;
          }
          const text = String(response.responseText || "");
          const byteLength = new TextEncoder().encode(text).byteLength;
          if (text.length > maxChars || byteLength > maxChars) {
            reject(new Error("响应超过安全大小限制"));
            return;
          }
          resolve({ notModified: false, text, etag: responseEtag });
        },
        onerror() {
          reject(new Error("网络请求失败"));
        },
        ontimeout() {
          reject(new Error("网络请求超时"));
        },
      });
    });
  }

  async function requestText(
    url,
    maxChars,
    accept = "application/json, text/plain",
  ) {
    return (await requestTextResource(url, maxChars, accept)).text;
  }

  async function requestJsonResource(url, maxChars, options = {}) {
    const response = await requestTextResource(
      url,
      maxChars,
      "application/json",
      options,
    );
    if (response.notModified) return { ...response, value: null };
    try {
      return { ...response, value: JSON.parse(response.text) };
    } catch {
      throw new Error("响应不是有效 JSON");
    }
  }

  async function requestJson(url, maxChars) {
    return (await requestJsonResource(url, maxChars)).value;
  }

  function validateCustomSubscription(raw, requireSchema = false) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("自定义订阅必须是 Purify X JSON 对象");
    }
    if (requireSchema && raw.schema !== LOCAL_LISTS.schema) {
      throw new Error(`自定义订阅 schema 必须为 ${LOCAL_LISTS.schema}`);
    }
    const safe = sanitizeLocalLists(raw);
    if (
      safe.block.length === 0 &&
      safe.allow.length === 0 &&
      safe.keywords.length === 0
    ) {
      throw new Error("订阅不含 block、allow 或 keywords 条目");
    }
    return {
      block: safe.block,
      allow: safe.allow,
      keywords: safe.keywords,
      format: "Purify X JSON v1",
    };
  }

  function sanitizeCustomSubscriptionCache(raw) {
    const safe = {
      schema: LOCAL_LISTS.schema,
      lastAttemptAt: Number(raw?.lastAttemptAt) || 0,
      lastCheckedAt: Number(raw?.lastCheckedAt) || 0,
      sources: {},
    };
    if (!raw?.sources || typeof raw.sources !== "object") return safe;
    for (const [rawUrl, source] of Object.entries(raw.sources)) {
      const url = sanitizeSubscriptionUrl(rawUrl);
      if (!url || !source || typeof source !== "object") continue;
      safe.sources[url] = {
        ...validateCustomSubscription(source),
        format: String(source.format || "缓存 JSON").slice(0, 80),
        updatedAt: Number(source.updatedAt) || 0,
        checkedAt: Number(source.checkedAt) || 0,
        etag: sanitizeEtag(source.etag),
        lastError: String(source.lastError || ""),
      };
    }
    return safe;
  }

  function applyCustomSubscriptionCache(cache) {
    subscribedBlockedHandles.clear();
    subscribedAllowedHandles.clear();
    subscribedStrongKeywords.clear();
    for (const url of customSubscriptionUrls) {
      const source = cache.sources[url];
      if (!source) continue;
      for (const handle of source.allow) subscribedAllowedHandles.add(handle);
      for (const handle of source.block) subscribedBlockedHandles.add(handle);
      for (const keyword of source.keywords) {
        subscribedStrongKeywords.add(keyword);
      }
    }
    for (const handle of subscribedAllowedHandles) {
      subscribedBlockedHandles.delete(handle);
    }
    invalidateDecisionCache();
  }

  async function syncCustomSubscriptions(force = false) {
    const now = Date.now();
    if (
      !force &&
      customSubscriptionCache.lastCheckedAt &&
      now - customSubscriptionCache.lastCheckedAt < CONFIG.remoteUpdateMs
    ) {
      return { skipped: true, reason: "fresh-cache" };
    }

    customSubscriptionCache.lastAttemptAt = now;
    let successCount = 0;
    const nextSources = {};
    const results = await Promise.allSettled(
      customSubscriptionUrls.map(async (url) => {
        const previous = customSubscriptionCache.sources[url];
        const response = await requestJsonResource(
          url,
          LOCAL_LISTS.maxSubscriptionChars,
          { etag: previous?.etag },
        );
        if (response.notModified) {
          if (!previous) throw new Error("服务器返回 304，但本地没有有效缓存");
          return {
            url,
            ...previous,
            checkedAt: Date.now(),
            etag: response.etag || previous.etag,
            lastError: "",
            changed: false,
          };
        }
        const data = validateCustomSubscription(
          response.value,
          true,
        );
        return {
          url,
          ...data,
          checkedAt: Date.now(),
          updatedAt: Date.now(),
          etag: response.etag,
          lastError: "",
          changed: true,
        };
      }),
    );
    let contentChanged = false;
    results.forEach((result, index) => {
      const url = customSubscriptionUrls[index];
      if (result.status === "fulfilled") {
        const { changed, ...source } = result.value;
        nextSources[url] = source;
        contentChanged ||= changed;
        successCount += 1;
        return;
      }
      const previous = customSubscriptionCache.sources[url];
      if (previous) {
        nextSources[url] = {
          ...previous,
          checkedAt: Date.now(),
          lastError: errorMessage(result.reason),
        };
      }
    });
    customSubscriptionCache.sources = nextSources;
    if (successCount > 0 || customSubscriptionUrls.length === 0) {
      customSubscriptionCache.lastCheckedAt = Date.now();
    }
    customSubscriptionCache = sanitizeCustomSubscriptionCache(
      customSubscriptionCache,
    );
    await gmSetValue(
      LOCAL_LISTS.subscriptionCacheKey,
      customSubscriptionCache,
    );
    applyCustomSubscriptionCache(customSubscriptionCache);
    if (contentChanged) refreshAfterLocalListChange();
    return {
      skipped: false,
      successCount,
      total: customSubscriptionUrls.length,
    };
  }

  function validateMxgaMeta(raw) {
    if (!raw || typeof raw !== "object") throw new Error("MXGA meta 格式错误");
    const version = raw.version;
    const path = raw.artifacts?.lite;
    if (
      version !== undefined &&
      (typeof version !== "string" ||
        version.length < 1 ||
        version.length > 128 ||
        !/^[A-Za-z0-9._-]+$/.test(version))
    ) {
      throw new Error("MXGA meta 版本号无效");
    }
    if (typeof path !== "string" || !MXGA_ARTIFACT_PATH_RE.test(path)) {
      throw new Error("MXGA lite 路径无效");
    }
    return { version, path };
  }

  // 把 MXGA 条目编码（label + category + tier）压进来源位图。
  function mxgaCodeFlags(code) {
    if (typeof code !== "string" || !code) return 0;
    let flags = 0;
    if (code[0] === "p") flags |= MXGA_FLAG.porn;
    const categoryIndex = MXGA_CATEGORY_CODES.indexOf(code[1]);
    if (categoryIndex >= 0) {
      flags |= (categoryIndex + 1) << MXGA_FLAG.categoryShift;
    }
    // 缺 tier 位的旧缓存按人工确认处理，避免升级瞬间大面积漏判。
    if (code[2] === "a") flags |= MXGA_FLAG.autoTier;
    return flags;
  }

  function mxgaCategoryName(sourceBits) {
    const index =
      ((sourceBits & MXGA_FLAG.categoryMask) >> MXGA_FLAG.categoryShift) - 1;
    const code = MXGA_CATEGORY_CODES[index];
    return code ? MXGA_CATEGORY_LABEL[code] : "";
  }

  function validateMxgaLite(raw) {
    if (
      !raw ||
      typeof raw !== "object" ||
      raw.schema !== 2 ||
      !Array.isArray(raw.entries)
    ) {
      throw new Error("MXGA lite schema 不兼容");
    }

    const notices = [];
    let entries = raw.entries;
    if (entries.length > REMOTE.maxEntries) {
      // 名单还在快速增长，截断保留前 maxEntries 条，好过整份拒绝后停更。
      notices.push(
        `名单 ${entries.length} 条超出上限，仅保留前 ${REMOTE.maxEntries} 条`,
      );
      entries = entries.slice(0, REMOTE.maxEntries);
    }
    if (
      raw.count !== undefined &&
      (!Number.isSafeInteger(raw.count) || raw.count !== raw.entries.length)
    ) {
      throw new Error(
        `MXGA 声明条数 ${raw.count} 与实际 ${raw.entries.length} 不一致`,
      );
    }

    // 单条坏数据只丢这一条；坏行占比过高才判定整份响应不可信。
    const entryByHandle = new Map();
    let invalidCount = 0;
    for (const row of entries) {
      if (
        !Array.isArray(row) ||
        row.length !== 3 ||
        typeof row[0] !== "string" ||
        (row[0] !== "" && !/^\d{1,32}$/.test(row[0])) ||
        typeof row[1] !== "string" ||
        !HANDLE_RE.test(row[1]) ||
        typeof row[2] !== "string" ||
        !MXGA_ENTRY_CODE_RE.test(row[2])
      ) {
        invalidCount += 1;
        continue;
      }
      const handle = normalizeHandle(row[1]);
      const existing = entryByHandle.get(handle);
      const userId = row[0];
      // 同一账号重复出现时保留人工确认那条。
      if (!existing) {
        entryByHandle.set(handle, { userId, code: row[2], idConflict: false });
      } else {
        if (existing.userId && userId && existing.userId !== userId) {
          // 同一 handle 对应多个数字 ID 时不能任选一个；保留 handle
          // 回退能力，但丢弃有冲突的 ID。
          existing.userId = "";
          existing.idConflict = true;
        } else if (!existing.idConflict && !existing.userId && userId) {
          existing.userId = userId;
        }
        if (existing.code[2] === "a" && row[2][2] !== "a") {
          existing.code = row[2];
        }
      }
    }

    if (invalidCount > 0) {
      notices.push(`丢弃 ${invalidCount} 条无效账号`);
    }
    if (invalidCount > entries.length * REMOTE.maxInvalidRatio) {
      throw new Error(
        `MXGA 名单无效条目过多（${invalidCount}/${entries.length}）`,
      );
    }
    if (entryByHandle.size < REMOTE.minEntries) {
      throw new Error(`MXGA 名单数量异常（${entryByHandle.size}）`);
    }

    const rules = [];
    let invalidRules = 0;
    if (raw.rules !== undefined) {
      if (!Array.isArray(raw.rules) || raw.rules.length > REMOTE.maxRules) {
        throw new Error("MXGA 规则集合无效");
      }
      for (const row of raw.rules) {
        if (
          !Array.isArray(row) ||
          row.length !== 3 ||
          typeof row[0] !== "string" ||
          row[0].trim().length < 1 ||
          row[0].length > 200 ||
          typeof row[1] !== "string" ||
          !MXGA_RULE_FIELD_RE.test(row[1]) ||
          typeof row[2] !== "string" ||
          !MXGA_RULE_CODE_RE.test(row[2])
        ) {
          invalidRules += 1;
          continue;
        }
        rules.push([row[0], row[1], row[2]]);
      }
    }
    if (invalidRules > 0) notices.push(`丢弃 ${invalidRules} 条无效规则`);

    return {
      version:
        typeof raw.version === "string" && raw.version
          ? raw.version
          : undefined,
      handles: [...entryByHandle.keys()],
      userIds: [...entryByHandle.values()].map((entry) => entry.userId),
      codes: [...entryByHandle.values()].map((entry) => entry.code),
      rules,
      notice: notices.join("；"),
    };
  }

  function validateMxgaWhitelist(raw, previous = { handles: [], userIds: [] }) {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.list)
        ? raw.list
        : null;
    if (!list) throw new Error("MXGA 白名单格式错误");
    if (list.length > REMOTE.maxEntries) {
      throw new Error("MXGA 白名单条目过多");
    }

    // 白名单是误杀保护：坏行只丢自己，不能因为一条脏数据整份作废。
    const identities = new Map();
    for (const row of list) {
      const handle =
        row && typeof row === "object"
          ? normalizeHandle(row.handle || row.screen_name)
          : "";
      const uid = row?.x_user_id == null ? "" : row.x_user_id;
      if (
        typeof uid !== "string" ||
        (uid !== "" && !/^\d{1,32}$/.test(uid)) ||
        !HANDLE_RE.test(handle)
      ) {
        continue;
      }
      const existing = identities.get(handle);
      if (!existing) {
        identities.set(handle, { userId: uid, conflict: false });
      } else if (
        existing.userId &&
        uid &&
        existing.userId !== uid
      ) {
        existing.userId = "";
        existing.conflict = true;
      } else if (!existing.conflict && !existing.userId && uid) {
        existing.userId = uid;
      }
    }

    // 服务端异常返回空数组时同样不能清空已有缓存。
    if (identities.size === 0 && previous.handles.length > 0) return previous;
    return {
      handles: [...identities.keys()],
      userIds: [...identities.values()].map((entry) => entry.userId),
    };
  }

  // GitHub 镜像（data/blacklist、data/whitelist）字段随上游演进，
  // 这里按最小契约取 handle，认不出的行直接跳过。
  function validateMxgaMirror(raw, { minEntries = 1, previous = [] } = {}) {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.list)
        ? raw.list
        : Array.isArray(raw?.accounts)
          ? raw.accounts
          : Array.isArray(raw?.data)
            ? raw.data
            : null;
    if (!list) throw new Error("MXGA 镜像格式错误");
    if (list.length > REMOTE.maxEntries) {
      throw new Error("MXGA 镜像条目过多");
    }

    const handles = [];
    for (const row of list) {
      const handle =
        typeof row === "string"
          ? normalizeHandle(row)
          : row && typeof row === "object"
            ? normalizeHandle(row.handle || row.screen_name || row.username)
            : "";
      if (HANDLE_RE.test(handle)) handles.push(handle);
    }

    const unique = [...new Set(handles)];
    if (unique.length < minEntries) {
      if (previous.length > 0) return previous;
      throw new Error(`MXGA 镜像数量异常（${unique.length}）`);
    }
    return unique;
  }

  function validateTwitterBlockPorn(raw) {
    if (!Array.isArray(raw) || raw.length > REMOTE.maxEntries) {
      throw new Error("Twitter Block Porn 名单格式错误");
    }

    const handles = [];
    let invalidCount = 0;
    for (const row of raw) {
      const handle =
        row && typeof row === "object"
          ? normalizeHandle(row.screen_name)
          : "";
      if (!HANDLE_RE.test(handle)) {
        invalidCount += 1;
        continue;
      }
      handles.push(handle);
    }
    if (invalidCount > raw.length * REMOTE.maxInvalidRatio) {
      throw new Error(
        `Twitter Block Porn 无效条目过多（${invalidCount}/${raw.length}）`,
      );
    }
    const unique = [...new Set(handles)];
    if (unique.length < 100) {
      throw new Error(`Twitter Block Porn 名单数量异常（${unique.length}）`);
    }
    return unique;
  }

  function validateTweetGuardRules(raw) {
    if (
      !raw ||
      raw.format !== "tweetguard-rules-v1" ||
      !Array.isArray(raw.rules) ||
      raw.rules.length < 10 ||
      raw.rules.length > REMOTE.maxRules
    ) {
      throw new Error("TweetGuard 社区规则格式或数量异常");
    }
    const keywords = sanitizeKeywordArray(
      raw.rules
        .filter(
          (rule) =>
            rule &&
            rule.kind === "tweet_keyword" &&
            typeof rule.value === "string",
        )
        .map((rule) => rule.value),
    );
    if (keywords.length < 10) {
      throw new Error("TweetGuard 社区规则缺少有效关键词");
    }
    return {
      version: String(raw.updatedAt || `n${keywords.length}`),
      keywords,
    };
  }

  function validateBlueNoiseKeywords(raw) {
    if (typeof raw !== "string") {
      throw new Error("BlueNoise 关键词响应不是纯文本");
    }
    const lines = raw.split(/\r?\n/);
    if (lines.length > REMOTE.maxRules) {
      throw new Error(`BlueNoise 关键词数量异常（${lines.length}）`);
    }

    let skippedRegexCount = 0;
    const plainKeywords = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      // BlueNoise 支持 /pattern/flags；Purify X 不执行外部任意正则，
      // 只采用可进入现有字面量/token 匹配器的纯文本项。
      if (/^\/.+\/[a-z]*$/i.test(line)) {
        skippedRegexCount += 1;
        continue;
      }
      plainKeywords.push(line);
    }
    const keywords = sanitizeKeywordArray(plainKeywords);
    if (keywords.length < 100) {
      throw new Error(`BlueNoise 缺少足够的纯文本关键词（${keywords.length}）`);
    }
    return {
      version: `n${keywords.length}-${stableHash(raw)}`,
      keywords,
      skippedRegexCount,
    };
  }

  function sanitizeStringArray(raw, limit = REMOTE.maxEntries) {
    if (!Array.isArray(raw) || raw.length > limit) return [];
    const result = [];
    for (const value of raw) {
      const handle = normalizeHandle(value);
      if (HANDLE_RE.test(handle)) result.push(handle);
    }
    return [...new Set(result)];
  }

  function sanitizeAlignedUserIds(raw, expectedLength) {
    if (!Array.isArray(raw) || raw.length !== expectedLength) return [];
    return raw.every(
      (value) => typeof value === "string" && (value === "" || /^\d{1,32}$/.test(value)),
    )
      ? raw.slice()
      : [];
  }

  function sanitizeStoredRules(raw) {
    if (!Array.isArray(raw) || raw.length > REMOTE.maxRules) return [];
    return raw.filter(
      (row) =>
        Array.isArray(row) &&
        row.length === 3 &&
        typeof row[0] === "string" &&
        row[0].trim().length > 0 &&
        row[0].length <= 200 &&
        MXGA_RULE_FIELD_RE.test(row[1]) &&
        MXGA_RULE_CODE_RE.test(row[2]),
    );
  }

  function sanitizeRemoteCache(raw) {
    const safe = {
      schema: REMOTE.schema,
      lastAttemptAt: Number(raw?.lastAttemptAt) || 0,
      lastCheckedAt: Number(raw?.lastCheckedAt) || 0,
      sources: {},
    };
    const mxga = raw?.sources?.mxga;
    if (mxga && typeof mxga === "object") {
      safe.sources.mxga = {
        version: String(mxga.version || ""),
        updatedAt: Number(mxga.updatedAt) || 0,
        checkedAt: Number(mxga.checkedAt) || 0,
        handles: sanitizeStringArray(mxga.handles),
        whitelist: sanitizeStringArray(mxga.whitelist),
        rules: sanitizeStoredRules(mxga.rules),
        lastError: String(mxga.lastError || ""),
        notice: String(mxga.notice || ""),
      };
      safe.sources.mxga.userIds = sanitizeAlignedUserIds(
        mxga.userIds,
        safe.sources.mxga.handles.length,
      );
      safe.sources.mxga.whitelistUserIds = sanitizeAlignedUserIds(
        mxga.whitelistUserIds,
        safe.sources.mxga.whitelist.length,
      );
      // codes 与 handles 一一对应；长度对不上（旧缓存或写坏了）就整体
      // 按未知 tier 处理，宁可少一层降权也不要错配到别的账号头上。
      const codes = Array.isArray(mxga.codes) ? mxga.codes : [];
      safe.sources.mxga.codes =
        codes.length === safe.sources.mxga.handles.length &&
        codes.every((code) => MXGA_ENTRY_CODE_RE.test(code))
          ? codes.slice()
          : [];
    }
    const tbp = raw?.sources?.twitterBlockPorn;
    if (tbp && typeof tbp === "object") {
      safe.sources.twitterBlockPorn = {
        updatedAt: Number(tbp.updatedAt) || 0,
        checkedAt: Number(tbp.checkedAt) || 0,
        etag: sanitizeEtag(tbp.etag),
        handles: sanitizeStringArray(tbp.handles),
        lastError: String(tbp.lastError || ""),
      };
    }
    const tweetGuard = raw?.sources?.tweetGuard;
    if (tweetGuard && typeof tweetGuard === "object") {
      safe.sources.tweetGuard = {
        version: String(tweetGuard.version || ""),
        updatedAt: Number(tweetGuard.updatedAt) || 0,
        checkedAt: Number(tweetGuard.checkedAt) || 0,
        etag: sanitizeEtag(tweetGuard.etag),
        keywords: sanitizeKeywordArray(tweetGuard.keywords),
        lastError: String(tweetGuard.lastError || ""),
      };
    }
    const blueNoise = raw?.sources?.blueNoise;
    if (blueNoise && typeof blueNoise === "object") {
      safe.sources.blueNoise = {
        version: String(blueNoise.version || ""),
        updatedAt: Number(blueNoise.updatedAt) || 0,
        checkedAt: Number(blueNoise.checkedAt) || 0,
        etag: sanitizeEtag(blueNoise.etag),
        keywords: sanitizeKeywordArray(blueNoise.keywords),
        skippedRegexCount: Math.max(
          0,
          Number(blueNoise.skippedRegexCount) || 0,
        ),
        lastError: String(blueNoise.lastError || ""),
      };
    }
    return safe;
  }

  function addRemoteHandle(handle, sourceBit, flags = 0) {
    if (!HANDLE_RE.test(handle)) return;
    const sources = remoteHandleSources.get(handle) || 0;
    remoteHandleSources.set(handle, sources | sourceBit | flags);
  }

  function addRemoteUserId(userId, sourceBit, flags = 0) {
    if (!/^\d{1,32}$/.test(userId)) return;
    const sources = remoteUserIdSources.get(userId) || 0;
    remoteUserIdSources.set(userId, sources | sourceBit | flags);
  }

  function reconcileIdentitySourceBits({
    userId = "",
    idBits = 0,
    handleBits = 0,
    listedUserId = "",
    whitelisted = false,
  }) {
    if (whitelisted) {
      return { sourceBits: 0, whitelisted: true, idConflict: false };
    }
    if (!userId) {
      return { sourceBits: handleBits, whitelisted: false, idConflict: false };
    }
    const idConflict = Boolean(listedUserId && listedUserId !== userId);
    return {
      sourceBits:
        idBits |
        (idConflict
          ? handleBits & ~MXGA_SOURCE_AND_FLAGS_MASK
          : handleBits),
      whitelisted: false,
      idConflict,
    };
  }

  function identitySourceBits(rawUserId, rawHandle) {
    const userId = /^\d{1,32}$/.test(String(rawUserId || ""))
      ? String(rawUserId)
      : "";
    const handle = normalizeHandle(rawHandle);
    const whitelisted = Boolean(
      (userId && remoteWhitelistUserIds.has(userId)) ||
      (handle && remoteWhitelist.has(handle))
    );

    const idBits = userId ? remoteUserIdSources.get(userId) || 0 : 0;
    const handleBits = handle ? remoteHandleSources.get(handle) || 0 : 0;
    const listedUserId = handle ? remoteHandleUserIds.get(handle) || "" : "";
    // Twitter Block Porn 只有 handle；即使 MXGA 的 handle 已被另一个 ID
    // 复用，也只剥掉 MXGA 及其 flags，不影响另一个独立来源。
    return reconcileIdentitySourceBits({
      userId,
      idBits,
      handleBits,
      listedUserId,
      whitelisted,
    });
  }

  function applyRemoteCache(cache, { rescan = true } = {}) {
    remoteHandleSources.clear();
    remoteUserIdSources.clear();
    remoteHandleUserIds.clear();
    remoteWhitelist.clear();
    remoteWhitelistUserIds.clear();
    remoteRules = [];
    tweetGuardCommunityKeywords.clear();
    blueNoiseCommunityKeywords.clear();

    const mxga = cache.sources.mxga;
    if (mxga && enabledBuiltInSources.has(BUILTIN_SOURCE.mxga)) {
      const codes = Array.isArray(mxga.codes) ? mxga.codes : [];
      const aligned = codes.length === mxga.handles.length;
      const userIds = Array.isArray(mxga.userIds) ? mxga.userIds : [];
      const idsAligned = userIds.length === mxga.handles.length;
      mxga.handles.forEach((handle, index) => {
        const flags = aligned ? mxgaCodeFlags(codes[index]) : 0;
        addRemoteHandle(
          handle,
          REMOTE_SOURCE.mxga,
          flags,
        );
        const userId = idsAligned ? userIds[index] : "";
        if (userId) {
          addRemoteUserId(userId, REMOTE_SOURCE.mxga, flags);
          remoteHandleUserIds.set(handle, userId);
        }
      });
      const whitelistUserIds = Array.isArray(mxga.whitelistUserIds)
        ? mxga.whitelistUserIds
        : [];
      const whitelistIdsAligned =
        whitelistUserIds.length === mxga.whitelist.length;
      mxga.whitelist.forEach((handle, index) => {
        remoteWhitelist.add(handle);
        const userId = whitelistIdsAligned ? whitelistUserIds[index] : "";
        if (userId) remoteWhitelistUserIds.add(userId);
      });
      remoteRules = sanitizeStoredRules(mxga.rules)
        .map(([rawPattern, field]) => ({
          field,
          pattern: normalize(rawPattern),
          rawPattern,
        }))
        .filter((rule) => rule.pattern);
    }
    const tbp = cache.sources.twitterBlockPorn;
    if (
      tbp &&
      enabledBuiltInSources.has(BUILTIN_SOURCE.twitterBlockPorn)
    ) {
      for (const handle of tbp.handles) {
        addRemoteHandle(handle, REMOTE_SOURCE.twitterBlockPorn);
      }
    }
    const tweetGuard = cache.sources.tweetGuard;
    if (
      tweetGuard &&
      enabledBuiltInSources.has(BUILTIN_SOURCE.tweetGuard)
    ) {
      for (const keyword of tweetGuard.keywords) {
        tweetGuardCommunityKeywords.add(keyword);
      }
    }
    const blueNoise = cache.sources.blueNoise;
    if (
      blueNoise &&
      enabledBuiltInSources.has(BUILTIN_SOURCE.blueNoise)
    ) {
      for (const keyword of blueNoise.keywords) {
        blueNoiseCommunityKeywords.add(keyword);
      }
    }

    // 白名单只覆盖外部名单/规则；本脚本自己的内容启发式仍会生效。
    for (const handle of remoteWhitelist) remoteHandleSources.delete(handle);
    for (const userId of remoteWhitelistUserIds) remoteUserIdSources.delete(userId);
    const decisionsChanged = invalidateDecisionCache();

    if (rescan && decisionsChanged && typeof document !== "undefined") {
      for (const article of document.querySelectorAll(SELECTOR.tweet)) {
        article.removeAttribute(ATTRIBUTE.fingerprint);
      }
      scan(document);
    }
  }

  async function syncMxga(previous = {}, force = false) {
    const priorWhitelist = sanitizeStringArray(previous.whitelist);
    const priorWhitelistUserIds = sanitizeAlignedUserIds(
      previous.whitelistUserIds,
      priorWhitelist.length,
    );
    const priorHandles = sanitizeStringArray(previous.handles);
    const priorUserIds = sanitizeAlignedUserIds(
      previous.userIds,
      priorHandles.length,
    );
    const priorCodes =
      Array.isArray(previous.codes) &&
      previous.codes.length === priorHandles.length
        ? previous.codes.slice()
        : [];
    const [metaResult, whitelistResult] = await Promise.allSettled([
      requestJson(REMOTE.mxgaMeta, REMOTE.maxMetaChars),
      requestJson(REMOTE.mxgaWhitelist, REMOTE.maxWhitelistChars),
    ]);

    let handles = priorHandles;
    let userIds = priorUserIds;
    let codes = priorCodes;
    let rules = sanitizeStoredRules(previous.rules);
    let version = String(previous.version || "");
    let updatedAt = Number(previous.updatedAt) || 0;
    const notices = [];

    if (metaResult.status === "fulfilled") {
      const meta = validateMxgaMeta(metaResult.value);
      const canReuse =
        !force &&
        handles.length >= REMOTE.minEntries &&
        meta.version &&
        version === meta.version;

      if (!canReuse) {
        const artifact = validateMxgaLite(
          await requestJson(
            `${REMOTE.mxgaBase}${meta.path}`,
            REMOTE.maxMxgaChars,
          ),
        );
        handles = artifact.handles;
        userIds = artifact.userIds;
        codes = artifact.codes;
        rules = artifact.rules;
        version = artifact.version || meta.version || `n${handles.length}`;
        updatedAt = Date.now();
        if (artifact.notice) notices.push(artifact.notice);
      }
    } else {
      // 边缘服务不可用时退回 GitHub 镜像（每 6 小时同步一次，会比
      // artifact 旧一点，但好过整源停摆）。镜像不带 tier，按未知处理。
      const mirror = validateMxgaMirror(
        await requestJson(REMOTE.mxgaMirrorList, REMOTE.maxMirrorChars),
        { minEntries: REMOTE.minEntries, previous: priorHandles },
      );
      if (mirror !== priorHandles) {
        handles = mirror;
        userIds = [];
        codes = [];
        version = `mirror-${mirror.length}`;
        updatedAt = Date.now();
      }
      notices.push(
        `x.zuoluo.tv 不可用（${errorMessage(metaResult.reason)}），已改用 GitHub 镜像`,
      );
    }

    let whitelist = priorWhitelist;
    let whitelistUserIds = priorWhitelistUserIds;
    let whitelistError = "";
    if (whitelistResult.status === "fulfilled") {
      try {
        const validatedWhitelist = validateMxgaWhitelist(
          whitelistResult.value,
          { handles: priorWhitelist, userIds: priorWhitelistUserIds },
        );
        whitelist = validatedWhitelist.handles;
        whitelistUserIds = validatedWhitelist.userIds;
      } catch (error) {
        whitelistError = errorMessage(error);
      }
    } else {
      whitelistError = errorMessage(whitelistResult.reason);
    }

    // 白名单是误杀保护，主接口失败时必须再试一次镜像。
    if (whitelistError) {
      try {
        const mirrorWhitelist = validateMxgaMirror(
          await requestJson(
            REMOTE.mxgaMirrorWhitelist,
            REMOTE.maxWhitelistChars,
          ),
          { previous: priorWhitelist },
        );
        if (mirrorWhitelist !== priorWhitelist) {
          whitelist = mirrorWhitelist;
          whitelistUserIds = [];
        }
        notices.push(`白名单改用 GitHub 镜像（${whitelistError}）`);
        whitelistError = "";
      } catch (error) {
        whitelistError = `${whitelistError}；镜像同样失败：${errorMessage(error)}`;
      }
    }

    return {
      version,
      updatedAt,
      checkedAt: Date.now(),
      handles,
      userIds,
      codes,
      whitelist,
      whitelistUserIds,
      rules,
      lastError: whitelistError ? `白名单：${whitelistError}` : "",
      notice: notices.join("；"),
    };
  }

  async function syncTwitterBlockPorn(previous = {}) {
    const previousHandles = sanitizeStringArray(previous.handles);
    const response = await requestJsonResource(
      REMOTE.twitterBlockPorn,
      REMOTE.maxTwitterBlockPornChars,
      { etag: previousHandles.length >= 100 ? previous.etag : "" },
    );
    const now = Date.now();
    if (response.notModified) {
      return {
        ...previous,
        checkedAt: now,
        etag: response.etag || sanitizeEtag(previous.etag),
        handles: previousHandles,
        lastError: "",
      };
    }
    const handles = validateTwitterBlockPorn(
      response.value,
    );
    return {
      updatedAt: now,
      checkedAt: now,
      etag: response.etag,
      handles,
      lastError: "",
    };
  }

  async function syncTweetGuardRules(previous = {}) {
    const previousKeywords = sanitizeKeywordArray(previous.keywords);
    const response = await requestJsonResource(
      REMOTE.tweetGuardCommunityRules,
      REMOTE.maxTweetGuardChars,
      { etag: previousKeywords.length >= 10 ? previous.etag : "" },
    );
    const now = Date.now();
    if (response.notModified) {
      return {
        ...previous,
        checkedAt: now,
        etag: response.etag || sanitizeEtag(previous.etag),
        keywords: previousKeywords,
        lastError: "",
      };
    }
    const parsed = validateTweetGuardRules(
      response.value,
    );
    return {
      version: parsed.version,
      updatedAt: now,
      checkedAt: now,
      etag: response.etag,
      keywords: parsed.keywords,
      lastError: "",
    };
  }

  async function syncBlueNoiseKeywords(previous = {}) {
    const previousKeywords = sanitizeKeywordArray(previous.keywords);
    const response = await requestTextResource(
      REMOTE.blueNoiseKeywords,
      REMOTE.maxBlueNoiseChars,
      "text/plain",
      { etag: previousKeywords.length >= 100 ? previous.etag : "" },
    );
    const now = Date.now();
    if (response.notModified) {
      return {
        ...previous,
        checkedAt: now,
        etag: response.etag || sanitizeEtag(previous.etag),
        keywords: previousKeywords,
        lastError: "",
      };
    }
    const parsed = validateBlueNoiseKeywords(response.text);
    return {
      version: parsed.version,
      updatedAt: now,
      checkedAt: now,
      etag: response.etag,
      keywords: parsed.keywords,
      skippedRegexCount: parsed.skippedRegexCount,
      lastError: "",
    };
  }

  function withSyncError(previous, error) {
    return {
      ...(previous || {}),
      checkedAt: Date.now(),
      lastError: errorMessage(error),
    };
  }

  async function doSyncRemoteLists(force) {
    const now = Date.now();
    if (!force && now - remoteCache.lastAttemptAt < CONFIG.remoteRetryMs) {
      return { skipped: true, reason: "retry-window" };
    }
    if (
      !force &&
      remoteCache.lastCheckedAt &&
      now - remoteCache.lastCheckedAt < CONFIG.remoteUpdateMs
    ) {
      return { skipped: true, reason: "fresh-cache" };
    }

    remoteCache.lastAttemptAt = now;
    const previousMxga = remoteCache.sources.mxga;
    const previousTbp = remoteCache.sources.twitterBlockPorn;
    const previousTweetGuard = remoteCache.sources.tweetGuard;
    const previousBlueNoise = remoteCache.sources.blueNoise;
    const [mxgaResult, tbpResult, tweetGuardResult, blueNoiseResult] =
      await Promise.allSettled([
        enabledBuiltInSources.has(BUILTIN_SOURCE.mxga)
          ? syncMxga(previousMxga, force)
          : Promise.resolve(null),
        enabledBuiltInSources.has(BUILTIN_SOURCE.twitterBlockPorn)
          ? syncTwitterBlockPorn(previousTbp)
          : Promise.resolve(null),
        enabledBuiltInSources.has(BUILTIN_SOURCE.tweetGuard)
          ? syncTweetGuardRules(previousTweetGuard)
          : Promise.resolve(null),
        enabledBuiltInSources.has(BUILTIN_SOURCE.blueNoise)
          ? syncBlueNoiseKeywords(previousBlueNoise)
          : Promise.resolve(null),
      ]);

    let successCount = 0;
    if (
      enabledBuiltInSources.has(BUILTIN_SOURCE.mxga) &&
      mxgaResult.status === "fulfilled"
    ) {
      remoteCache.sources.mxga = mxgaResult.value;
      successCount += 1;
    } else if (enabledBuiltInSources.has(BUILTIN_SOURCE.mxga)) {
      remoteCache.sources.mxga = withSyncError(
        previousMxga,
        mxgaResult.reason,
      );
    }
    if (
      enabledBuiltInSources.has(BUILTIN_SOURCE.twitterBlockPorn) &&
      tbpResult.status === "fulfilled"
    ) {
      remoteCache.sources.twitterBlockPorn = tbpResult.value;
      successCount += 1;
    } else if (
      enabledBuiltInSources.has(BUILTIN_SOURCE.twitterBlockPorn)
    ) {
      remoteCache.sources.twitterBlockPorn = withSyncError(
        previousTbp,
        tbpResult.reason,
      );
    }
    if (
      enabledBuiltInSources.has(BUILTIN_SOURCE.tweetGuard) &&
      tweetGuardResult.status === "fulfilled"
    ) {
      remoteCache.sources.tweetGuard = tweetGuardResult.value;
      successCount += 1;
    } else if (enabledBuiltInSources.has(BUILTIN_SOURCE.tweetGuard)) {
      remoteCache.sources.tweetGuard = withSyncError(
        previousTweetGuard,
        tweetGuardResult.reason,
      );
    }
    if (
      enabledBuiltInSources.has(BUILTIN_SOURCE.blueNoise) &&
      blueNoiseResult.status === "fulfilled"
    ) {
      remoteCache.sources.blueNoise = blueNoiseResult.value;
      successCount += 1;
    } else if (enabledBuiltInSources.has(BUILTIN_SOURCE.blueNoise)) {
      remoteCache.sources.blueNoise = withSyncError(
        previousBlueNoise,
        blueNoiseResult.reason,
      );
    }
    if (successCount > 0) remoteCache.lastCheckedAt = Date.now();

    remoteCache = sanitizeRemoteCache(remoteCache);
    await gmSetValue(REMOTE.cacheKey, remoteCache);
    applyRemoteCache(remoteCache);
    return {
      skipped: false,
      successCount,
      mxga: enabledBuiltInSources.has(BUILTIN_SOURCE.mxga)
        ? mxgaResult.status
        : "disabled",
      twitterBlockPorn: enabledBuiltInSources.has(
        BUILTIN_SOURCE.twitterBlockPorn,
      )
        ? tbpResult.status
        : "disabled",
      tweetGuard: enabledBuiltInSources.has(BUILTIN_SOURCE.tweetGuard)
        ? tweetGuardResult.status
        : "disabled",
      blueNoise: enabledBuiltInSources.has(BUILTIN_SOURCE.blueNoise)
        ? blueNoiseResult.status
        : "disabled",
    };
  }

  async function syncRemoteLists(force = false) {
    if (remoteSyncPromise) {
      if (!force) return remoteSyncPromise;
      await remoteSyncPromise;
    }
    remoteSyncPromise = doSyncRemoteLists(force).finally(() => {
      remoteSyncPromise = null;
    });
    return remoteSyncPromise;
  }

  function formatTime(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleString() : "尚未成功同步";
  }

  function remoteStatusText() {
    const mxga = remoteCache.sources.mxga;
    const tbp = remoteCache.sources.twitterBlockPorn;
    const tweetGuard = remoteCache.sources.tweetGuard;
    const blueNoise = remoteCache.sources.blueNoise;
    let overlapCount = 0;
    let humanCount = 0;
    let autoCount = 0;
    for (const sourceBits of remoteHandleSources.values()) {
      if ((sourceBits & REMOTE_SOURCE_MASK) === REMOTE_SOURCE_MASK) {
        overlapCount += 1;
      }
      if (sourceBits & REMOTE_SOURCE.mxga) {
        if (sourceBits & MXGA_FLAG.autoTier) autoCount += 1;
        else humanCount += 1;
      }
    }
    const mxgaCapacity = Math.round(
      ((mxga?.handles?.length || 0) / REMOTE.maxEntries) * 100,
    );
    const mxgaIdCount = mxga?.userIds?.filter(Boolean).length || 0;
    const whitelistIdCount =
      mxga?.whitelistUserIds?.filter(Boolean).length || 0;
    return [
      `Purify X v${VERSION}`,
      "",
      `MXGA：${enabledBuiltInSources.has(BUILTIN_SOURCE.mxga) ? "已启用" : "未启用"} · ${mxga?.handles?.length || 0} 个账号，${mxga?.rules?.length || 0} 条规则`,
      `  版本：${mxga?.version || "未知"}`,
      `  更新时间：${formatTime(mxga?.updatedAt)}`,
      `  分级：人工确认 ${humanCount} · AI 自动 ${autoCount}（自动条目按 6 分计，需再有一条特征）`,
      `  身份：${mxgaIdCount} 个数字 ID · 其余按 handle 回退`,
      `  容量：占上限 ${mxgaCapacity}%（${REMOTE.maxEntries} 条）`,
      `  状态：${mxga?.lastError || "正常"}`,
      ...(mxga?.notice ? [`  提示：${mxga.notice}`] : []),
      `MXGA 白名单：${mxga?.whitelist?.length || 0} 个账号（${whitelistIdCount} 个数字 ID）`,
      "",
      `Twitter Block Porn：${enabledBuiltInSources.has(BUILTIN_SOURCE.twitterBlockPorn) ? "已启用" : "未启用"} · ${tbp?.handles?.length || 0} 个账号`,
      `  更新时间：${formatTime(tbp?.updatedAt)}`,
      `  状态：${tbp?.lastError || "正常"}`,
      "",
      `TweetGuard：${enabledBuiltInSources.has(BUILTIN_SOURCE.tweetGuard) ? "已启用" : "未启用"} · ${tweetGuard?.keywords?.length || 0} 条正文规则`,
      `  版本：${tweetGuard?.version || "未知"}`,
      `  更新时间：${formatTime(tweetGuard?.updatedAt)}`,
      `  状态：${tweetGuard?.lastError || "正常"}`,
      "",
      `BlueNoise：${enabledBuiltInSources.has(BUILTIN_SOURCE.blueNoise) ? "已启用" : "未启用"} · ${blueNoise?.keywords?.length || 0} 条纯文本关键词`,
      `  版本：${blueNoise?.version || "未知"}`,
      `  更新时间：${formatTime(blueNoise?.updatedAt)}`,
      `  跳过：${blueNoise?.skippedRegexCount || 0} 条外部正则（不执行）`,
      `  状态：${blueNoise?.lastError || "正常"}`,
      "",
      `合并后唯一账号：${remoteHandleSources.size} 个（两来源重复 ${overlapCount} 个）`,
      `最近检查：${formatTime(remoteCache.lastCheckedAt)}`,
      "只下载公开名单，不上传当前页面、账号或浏览记录。",
    ].join("\n");
  }

  async function initializeRemoteLists() {
    remoteCache = sanitizeRemoteCache(
      await gmGetValue(REMOTE.cacheKey, remoteCache),
    );
    applyRemoteCache(remoteCache, { rescan: false });
  }

  function startRemoteListUpdates() {
    void syncRemoteLists(false);
    window.setInterval(() => {
      void syncRemoteLists(false);
    }, CONFIG.remoteUpdateMs);
  }
