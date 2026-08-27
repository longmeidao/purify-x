  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(DEFAULT_IGNORABLE_RE, "")
      .replace(/[𝕏Ｘ]/g, "x")
      .replace(/[瑟澀]/g, "涩")
      .replace(/[艹操]/g, "骚")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeHandle(value) {
    return String(value || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
  }

  function externalLinkSignals(rawValues) {
    const values = Array.isArray(rawValues) ? rawValues : [rawValues];
    let hasExternalLink = false;
    let telegramLink = false;

    for (const rawValue of values) {
      const normalized = normalize(rawValue);
      const compact = normalized.replace(/\s+/g, "");
      if (!compact) continue;
      if (
        /(?:^|https?:\/\/|\b)(?:www\.)?(?:t\.me|telegram\.me|telegram\.org)(?:[\/:]|$)/i.test(compact) ||
        /(?:^|https?:\/\/|\b)(?:www\.)?(?:t\.me|telegram\.me|telegram\.org)(?=[\/:\s]|$)/i.test(normalized)
      ) {
        telegramLink = true;
        hasExternalLink = true;
      }
      if (!/^https?:\/\//i.test(compact)) continue;
      try {
        const hostname = new URL(compact).hostname.toLowerCase();
        if (
          hostname &&
          hostname !== "x.com" &&
          !hostname.endsWith(".x.com") &&
          hostname !== "twitter.com" &&
          !hostname.endsWith(".twitter.com")
        ) {
          hasExternalLink = true;
        }
      } catch {
        // 可见文本可能把协议和域名换行；Telegram 已在上面按紧凑文本识别。
      }
    }

    return { hasExternalLink, telegramLink };
  }

  function promotionCopySignal(rawText) {
    return PROMOTION_COPY_RE.test(normalize(rawText));
  }

  function promotionPattern(rawText, options = {}) {
    const repliesRestricted = options.repliesRestricted === true;
    const telegramLink = options.telegramLink === true;
    const hasExternalLink = telegramLink || options.hasExternalLink === true;
    const promotionCopy = promotionCopySignal(rawText);
    const restrictedExternalPromotion =
      repliesRestricted && hasExternalLink && promotionCopy;
    const telegramPromotion = telegramLink && promotionCopy;
    const restrictedTelegramPromotion = repliesRestricted && telegramLink;
    return {
      repliesRestricted,
      hasExternalLink,
      telegramLink,
      promotionCopy,
      highConfidence:
        restrictedExternalPromotion ||
        telegramPromotion ||
        restrictedTelegramPromotion,
    };
  }

  function shouldProtectAuthor({
    following = null,
    isSelf = false,
    highConfidencePromotion = false,
  } = {}) {
    return Boolean(
      isSelf ||
        following === null ||
        (following === true && !highConfidencePromotion),
    );
  }

  function normalizeKeywordText(value) {
    return normalize(value)
      .normalize("NFKD")
      .replace(/\p{M}/gu, "");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compiledKeywordMatcher(rawKeyword) {
    const keyword = normalizeKeywordText(rawKeyword);
    if (keywordMatcherCache.has(keyword)) {
      return keywordMatcherCache.get(keyword);
    }

    let kind = "literal";
    let regex = null;
    if (!keyword) {
      kind = "invalid";
    } else if (keyword.startsWith("domain:")) {
      const domain = keyword.slice(7).replace(/^www\./, "");
      if (/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(domain)) {
        kind = "regex";
        regex = new RegExp(
          `(?:^|[^a-z0-9-])(?:www\\.)?${escapeRegExp(domain)}(?=[:/\\s]|$)`,
          "i",
        );
      } else {
        kind = "invalid";
      }
    } else if (/^[@#][a-z0-9_]{1,64}$/i.test(keyword)) {
      const marker = keyword[0];
      const value = keyword.slice(1);
      kind = "regex";
      regex = new RegExp(
        `(?:^|[^a-z0-9_])${escapeRegExp(marker)}${escapeRegExp(value)}(?=$|[^a-z0-9_])`,
        "i",
      );
    } else if (/^[a-z0-9_]+$/i.test(keyword)) {
      kind = "regex";
      regex = new RegExp(
        `(?:^|[^a-z0-9_])${escapeRegExp(keyword)}(?=$|[^a-z0-9_])`,
        "i",
      );
    }

    const matcher = Object.freeze({ keyword, kind, regex });
    if (keywordMatcherCache.size >= 50_000) keywordMatcherCache.clear();
    keywordMatcherCache.set(keyword, matcher);
    return matcher;
  }

  function keywordMatcherTest(normalizedText, matcher) {
    if (!normalizedText || !matcher || matcher.kind === "invalid") {
      return false;
    }
    return matcher.kind === "literal"
      ? normalizedText.includes(matcher.keyword)
      : matcher.regex.test(normalizedText);
  }

  function literalTriePattern(words) {
    const root = { terminal: false, children: new Map() };
    for (const word of words) {
      let node = root;
      for (const char of word) {
        if (!node.children.has(char)) {
          node.children.set(char, { terminal: false, children: new Map() });
        }
        node = node.children.get(char);
      }
      node.terminal = true;
    }

    const stringify = (node) => {
      const branches = [...node.children.entries()].map(
        ([char, child]) => `${escapeRegExp(char)}${stringify(child)}`,
      );
      if (branches.length === 0) return "";
      const branch =
        branches.length === 1 ? branches[0] : `(?:${branches.join("|")})`;
      return node.terminal ? `(?:${branch})?` : branch;
    };
    return stringify(root);
  }

  function keywordCollectionIndex(keywords) {
    const collection =
      keywords && typeof keywords === "object" ? keywords : [];
    const cached = keywordCollectionCache.get(collection);
    if (cached?.generation === keywordMatcherGeneration) return cached;

    const rules = [];
    const literalKeywords = [];
    for (const rawKeyword of collection) {
      const matcher = compiledKeywordMatcher(rawKeyword);
      rules.push({ rawKeyword, matcher });
      if (matcher.kind === "literal") literalKeywords.push(matcher.keyword);
    }

    const literalGates = [];
    for (
      let index = 0;
      index < literalKeywords.length;
      index += KEYWORD_TRIE_CHUNK_SIZE
    ) {
      const pattern = literalTriePattern(
        literalKeywords.slice(index, index + KEYWORD_TRIE_CHUNK_SIZE),
      );
      if (pattern) literalGates.push(new RegExp(pattern, "u"));
    }

    const compiled = Object.freeze({
      generation: keywordMatcherGeneration,
      rules,
      literalGates,
    });
    if (collection && typeof collection === "object") {
      keywordCollectionCache.set(collection, compiled);
    }
    return compiled;
  }

  function keywordMatches(rawText, rawKeyword) {
    const text = normalizeKeywordText(rawText);
    return keywordMatcherTest(text, compiledKeywordMatcher(rawKeyword));
  }
