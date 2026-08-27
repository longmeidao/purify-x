  function sanitizeKeywordArray(raw) {
    if (!Array.isArray(raw)) return [];
    return [
      ...new Set(
        raw
          .slice(0, LOCAL_LISTS.maxKeywords)
          .map((value) => normalize(value))
          .filter((value) => value.length >= 2 && value.length <= 80),
      ),
    ];
  }

  function sanitizeSubscriptionUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "https:") return "";
      url.username = "";
      url.password = "";
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  function sanitizeSubscriptionUrls(raw) {
    if (!Array.isArray(raw)) return [];
    return [
      ...new Set(
        raw
          .slice(0, LOCAL_LISTS.maxSubscriptions)
          .map(sanitizeSubscriptionUrl)
          .filter(Boolean),
      ),
    ];
  }

  function sanitizeBuiltInSources(raw, catalogVersion = 0) {
    if (!Array.isArray(raw)) return [...DEFAULT_BUILTIN_SOURCES];
    const sources = [
      ...new Set(
        raw.filter((source) => BUILTIN_SOURCE_IDS.includes(source)),
      ),
    ];
    if (catalogVersion < 2 && !sources.includes(BUILTIN_SOURCE.tweetGuard)) {
      sources.push(BUILTIN_SOURCE.tweetGuard);
    }
    if (catalogVersion < 3 && !sources.includes(BUILTIN_SOURCE.blueNoise)) {
      sources.push(BUILTIN_SOURCE.blueNoise);
    }
    return sources;
  }

  function sanitizeLocalLists(raw) {
    const allow = sanitizeStringArray(raw?.allow || raw?.allowed);
    const allowSet = new Set(allow);
    const block = sanitizeStringArray(raw?.block || raw?.blocked).filter(
      (handle) => !allowSet.has(handle),
    );
    return {
      schema: LOCAL_LISTS.schema,
      block,
      allow,
      keywords: sanitizeKeywordArray(
        raw?.keywords || raw?.strong_keywords || raw?.strongKeywords,
      ),
      subscriptions: sanitizeSubscriptionUrls(raw?.subscriptions),
      builtInSources: sanitizeBuiltInSources(
        raw?.builtInSources ?? raw?.builtinSources,
        Number(raw?.builtInSourceCatalogVersion) || 0,
      ),
      builtInSourceCatalogVersion: BUILTIN_SOURCE_CATALOG_VERSION,
    };
  }

  function localListsSnapshot() {
    return {
      schema: LOCAL_LISTS.schema,
      block: [...localBlockedHandles].sort(),
      allow: [...localAllowedHandles].sort(),
      keywords: [...localStrongKeywords].sort(),
      subscriptions: [...customSubscriptionUrls],
      builtInSources: [...enabledBuiltInSources],
      builtInSourceCatalogVersion: BUILTIN_SOURCE_CATALOG_VERSION,
    };
  }

  function applyLocalLists(raw) {
    const safe = sanitizeLocalLists(raw);
    localBlockedHandles.clear();
    localAllowedHandles.clear();
    localStrongKeywords.clear();
    for (const handle of safe.allow) localAllowedHandles.add(handle);
    for (const handle of safe.block) localBlockedHandles.add(handle);
    for (const keyword of safe.keywords) localStrongKeywords.add(keyword);
    customSubscriptionUrls = safe.subscriptions;
    enabledBuiltInSources = new Set(safe.builtInSources);
    invalidateDecisionCache();
    return safe;
  }

  async function saveLocalLists() {
    return gmSetValue(LOCAL_LISTS.cacheKey, localListsSnapshot());
  }

  function refreshAfterLocalListChange() {
    if (typeof document === "undefined") return;
    for (const article of document.querySelectorAll(SELECTOR.tweet)) {
      article.removeAttribute(ATTRIBUTE.fingerprint);
    }
    scan(document);
  }

  async function setLocalHandleDisposition(
    rawHandle,
    disposition,
    persist = saveLocalLists,
  ) {
    const handle = normalizeHandle(rawHandle);
    if (
      !HANDLE_RE.test(handle) ||
      (disposition !== "allow" && disposition !== "block")
    ) {
      return false;
    }
    const wasBlocked = localBlockedHandles.has(handle);
    const wasAllowed = localAllowedHandles.has(handle);
    if (disposition === "allow") {
      localBlockedHandles.delete(handle);
      localAllowedHandles.add(handle);
    } else {
      localAllowedHandles.delete(handle);
      localBlockedHandles.add(handle);
    }
    const saved = await persist();
    if (!saved) {
      if (wasBlocked) localBlockedHandles.add(handle);
      else localBlockedHandles.delete(handle);
      if (wasAllowed) localAllowedHandles.add(handle);
      else localAllowedHandles.delete(handle);
      return false;
    }
    invalidateDecisionCache();
    refreshAfterLocalListChange();
    showToast(
      disposition === "allow"
        ? `已将 @${handle} 加入永远放行名单`
        : `已将 @${handle} 加入本地屏蔽名单`,
      "success",
    );
    return true;
  }

  async function allowHandleLocally(rawHandle) {
    return setLocalHandleDisposition(rawHandle, "allow");
  }

  async function blockHandleLocally(rawHandle) {
    return setLocalHandleDisposition(rawHandle, "block");
  }

  function parseEditableHandleList(value) {
    return sanitizeStringArray(
      String(value || "")
        .split(/[\s,，;；]+/)
        .map((item) => normalizeHandle(item)),
    );
  }

  async function importLocalLists() {
    const input = window.prompt(
      "粘贴本地设置 JSON（支持 block、allow、keywords 与 subscriptions 数组）",
      JSON.stringify(localListsSnapshot(), null, 2),
    );
    if (input === null) return;
    try {
      applyLocalLists(JSON.parse(input));
      await saveLocalLists();
      applyCustomSubscriptionCache(customSubscriptionCache);
      await syncCustomSubscriptions(true);
      showToast("设置导入成功", "success");
      return true;
    } catch (error) {
      window.alert(`本地名单 JSON 无效：${errorMessage(error)}`);
      return false;
    }
  }

  function exportLocalLists() {
    window.prompt(
      "复制以下本地名单 JSON",
      JSON.stringify(localListsSnapshot(), null, 2),
    );
  }

  function settingsStatusText() {
    resetAiUsageDay();
    const failed = customSubscriptionUrls.filter(
      (url) => customSubscriptionCache.sources[url]?.lastError,
    ).length;
    return [
      `内置来源 ${enabledBuiltInSources.size}/${BUILTIN_SOURCE_IDS.length}`,
      `公开账号去重后 ${remoteHandleSources.size}`,
      `本地屏蔽 ${localBlockedHandles.size} · 永远放行 ${localAllowedHandles.size}`,
      `时间线可疑账号 ${preferences.filterTimeline ? "已屏蔽" : "未屏蔽"}`,
      `时间线推广内容 ${preferences.filterTimelinePromotions ? "已屏蔽" : "未屏蔽"}`,
      `MXGA 申诉按钮 ${preferences.showAppealButton ? "已显示" : "已隐藏"}`,
      `右栏 Premium 与热门话题 ${preferences.hideSidebarPromos ? "已隐藏" : "未隐藏"}`,
      `自定义屏蔽词 ${localStrongKeywords.size}`,
      `订阅 ${customSubscriptionUrls.length} · 已载入账号 ${subscribedBlockedHandles.size} · 词 ${subscribedStrongKeywords.size}`,
      `AI ${aiConfig.enabled ? "已启用" : "未启用"} · 今日调用 ${aiState.usage.count}/${aiConfig.dailyLimit} · 学习规则 ${aiState.learnedRules.length} · 判定缓存 ${Object.keys(aiState.decisions).length}`,
      `本地回复判定缓存 ${decisionCache.size}/${DECISION_CACHE.maxEntries} · 有效期 7 天`,
      `近期页面预隐藏缓存 ${hiddenStatusCache.size}/${DECISION_CACHE.maxEntries}`,
      failed ? `有 ${failed} 个订阅最近更新失败，仍保留上次有效数据` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function subscriptionDetailsText() {
    if (customSubscriptionUrls.length === 0) return "尚未添加自定义订阅。";
    return customSubscriptionUrls
      .map((url) => {
        const source = customSubscriptionCache.sources[url];
        if (!source) return `等待首次更新 · ${url}`;
        const state = source.lastError ? `失败：${source.lastError}` : "正常";
        return `${source.format || "未知格式"} · ${source.block.length} 个屏蔽 · ${source.allow.length} 个放行 · ${source.keywords.length} 个词 · ${state}\n${url}`;
      })
      .join("\n\n");
  }

  function feedbackIconMarkup(state) {
    if (state === "loading") {
      return `
        <svg class="xps-feedback-spinner" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" pathLength="100"></circle>
        </svg>
      `;
    }
    return state === "success" ? "✓" : "!";
  }

  function showToast(message, state = "success") {
    if (typeof document === "undefined") return;
    document.getElementById("xps-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "xps-toast";
    toast.dataset.state = state;
    toast.setAttribute("role", "status");
    toast.innerHTML = `
      <span class="xps-feedback-icon" aria-hidden="true">${feedbackIconMarkup(state)}</span>
      <span></span>
    `;
    toast.lastElementChild.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => {
      toast.classList.add("xps-toast-out");
      window.setTimeout(() => toast.remove(), 240);
    }, 2600);
  }

  function closeSettingsPanel() {
    document.getElementById("xps-settings-backdrop")?.remove();
  }

  function setSettingsFeedback(panel, state, message) {
    const feedback = panel?.querySelector("#xps-settings-feedback");
    if (!feedback) return;
    feedback.dataset.state = state;
    feedback.querySelector(".xps-feedback-icon").innerHTML =
      feedbackIconMarkup(state);
    feedback.querySelector(".xps-feedback-message").textContent = message;
    for (const button of panel.querySelectorAll(
      '[data-xps-settings-action="save"], [data-xps-settings-action="update"]',
    )) {
      button.disabled = state === "loading";
    }
  }

  function selectedBuiltInSourcesFromPanel(panel) {
    return [...panel.querySelectorAll("[data-xps-source-id]:checked")]
      .map((input) => input.dataset.xpsSourceId)
      .filter((source) => BUILTIN_SOURCE_IDS.includes(source));
  }

  function aiConfigFromPanel(panel) {
    return sanitizeAiConfig({
      enabled: panel.querySelector("#xps-ai-enabled")?.checked,
      endpoint: panel.querySelector("#xps-ai-endpoint")?.value,
      model: panel.querySelector("#xps-ai-model")?.value,
      apiKey: panel.querySelector("#xps-ai-key")?.value,
      autoLearn: panel.querySelector("#xps-ai-auto-learn")?.checked,
      dailyLimit: panel.querySelector("#xps-ai-daily-limit")?.value,
    });
  }

  function applyEditableAiRules(value) {
    const existingByValue = new Map(
      aiState.learnedRules.map((rule) => [rule.value, rule]),
    );
    const learnedRules = [];
    for (const rawValue of String(value || "").split("\n")) {
      const safeValue = sanitizeAiLearnedValue(rawValue);
      if (
        !safeValue ||
        learnedRules.some((rule) => rule.value === safeValue)
      ) {
        continue;
      }
      learnedRules.push(
        existingByValue.get(safeValue) || {
          id: `manual-${Date.now()}-${stableHash(safeValue)}`,
          value: safeValue,
          category: "manual",
          reasoning: "用户在设置面板中保留或添加",
          sourceHandle: "",
          createdAt: Date.now(),
          expiresAt: 0,
          lastHitAt: Date.now(),
          hitCount: 0,
          falsePositiveCount: 0,
          lastFalsePositiveAt: 0,
          enabled: true,
        },
      );
    }
    aiState.learnedRules = learnedRules.slice(-AI.maxRules);
    applyAiState(aiState);
  }

  async function testAiFromPanel(panel) {
    const config = aiConfigFromPanel(panel);
    setSettingsFeedback(panel, "loading", "正在测试 AI endpoint…");
    try {
      const result = await callAiClassifier(
        {
          text: "这是一次普通的连接测试。",
          name: "连接测试",
          handle: "xps_connection_test",
          score: 0,
          reasons: [],
        },
        config,
      );
      setSettingsFeedback(
        panel,
        "success",
        `AI 连接成功：返回 ${result.confidence}% 置信度的${result.isSpam ? "垃圾" : "正常"}判断。`,
      );
    } catch (error) {
      setSettingsFeedback(
        panel,
        "error",
        `AI 连接失败：${errorMessage(error)}`,
      );
    }
  }

  async function clearAiCache(panel) {
    aiState.decisions = {};
    aiFailures.clear();
    await saveAiState();
    setSettingsFeedback(panel, "success", "AI 判定缓存已清空；学习规则仍保留。");
  }

  async function saveSettingsPanel(panel, { update = false } = {}) {
    const block = parseEditableHandleList(
      panel.querySelector("#xps-settings-block")?.value,
    );
    const allow = parseEditableHandleList(
      panel.querySelector("#xps-settings-allow")?.value,
    );
    const keywords = sanitizeKeywordArray(
      String(panel.querySelector("#xps-settings-keywords")?.value || "")
        .split("\n"),
    );
    const rawUrls = String(
      panel.querySelector("#xps-settings-subscriptions")?.value || "",
    )
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const subscriptions = sanitizeSubscriptionUrls(rawUrls);
    if (subscriptions.length !== new Set(rawUrls).size) {
      setSettingsFeedback(panel, "error", "订阅地址必须是有效的 HTTPS URL。");
      return;
    }
    const nextAiConfig = aiConfigFromPanel(panel);
    const nextPreferences = sanitizePreferences({
      filterTimeline: panel.querySelector("#xps-filter-timeline")?.checked,
      filterTimelinePromotions: panel.querySelector(
        "#xps-filter-timeline-promotions",
      )?.checked,
      showAppealButton: panel.querySelector("#xps-show-appeal-button")
        ?.checked,
      hideSidebarPromos: panel.querySelector("#xps-hide-sidebar-promos")
        ?.checked,
    });
    if (
      nextAiConfig.enabled &&
      (!nextAiConfig.endpoint || !nextAiConfig.model)
    ) {
      setSettingsFeedback(
        panel,
        "error",
        "启用 AI 前必须填写有效 endpoint 和 model。",
      );
      return;
    }

    setSettingsFeedback(
      panel,
      "loading",
      update ? "正在保存并更新全部来源…" : "正在保存设置…",
    );
    const preferenceResult = await persistPreferences(nextPreferences);
    if (!preferenceResult.saved) {
      setSettingsFeedback(panel, "error", "偏好设置保存失败，请重试。");
      return;
    }
    preferences = preferenceResult.value;
    applySidebarPromoVisibility();
    hiddenStatusCache.clear();
    applyLocalLists({
      schema: LOCAL_LISTS.schema,
      block,
      allow,
      keywords,
      subscriptions,
      builtInSources: selectedBuiltInSourcesFromPanel(panel),
      builtInSourceCatalogVersion: BUILTIN_SOURCE_CATALOG_VERSION,
    });
    await saveLocalLists();
    aiConfig = nextAiConfig;
    applyEditableAiRules(
      panel.querySelector("#xps-ai-learned-rules")?.value,
    );
    await Promise.all([
      gmSetValue(AI.configKey, aiConfig),
      saveAiState(),
    ]);
    applyCustomSubscriptionCache(customSubscriptionCache);
    applyRemoteCache(remoteCache);
    if (update) {
      const [customResult, remoteResult] = await Promise.all([
        syncCustomSubscriptions(true),
        syncRemoteLists(true),
      ]);
      const sourceSuccess = Number(remoteResult.mxga === "fulfilled") +
        Number(remoteResult.twitterBlockPorn === "fulfilled") +
        Number(remoteResult.tweetGuard === "fulfilled");
      setSettingsFeedback(
        panel,
        "success",
        `更新完成：内置来源 ${sourceSuccess}/${enabledBuiltInSources.size}，自定义订阅 ${customResult.successCount}/${customResult.total}`,
      );
      showToast("Purify X 名单已更新", "success");
    } else {
      setSettingsFeedback(panel, "success", "设置已保存并立即生效。");
      showToast("Purify X 设置已保存", "success");
    }
    panel.querySelector("#xps-settings-status").textContent =
      `${remoteStatusText()}\n\n${settingsStatusText()}\n\n${subscriptionDetailsText()}`;
    refreshAfterLocalListChange();
  }

  function sourceCatalogHtml() {
    return SOURCE_CATALOG.map((source) => {
      const checked = enabledBuiltInSources.has(source.id) ? "checked" : "";
      return `
        <label class="xps-source-card">
          <input type="checkbox" data-xps-source-id="${source.id}" ${checked}>
          <span class="xps-source-check" aria-hidden="true">✓</span>
          <span class="xps-source-copy">
            <span class="xps-source-title">
              <a href="${source.homepage}" target="_blank" rel="noopener noreferrer">${source.name}</a>
            </span>
            <small>${source.description}</small>
          </span>
        </label>
      `;
    }).join("");
  }

  function openSettingsPanel() {
    closeSettingsPanel();
    const backdrop = document.createElement("div");
    backdrop.id = "xps-settings-backdrop";
    backdrop.innerHTML = `
      <section id="xps-settings-panel" role="dialog" aria-modal="true" aria-labelledby="xps-settings-title">
        <header>
          <div>
            <h2 id="xps-settings-title">Purify X 设置</h2>
            <p>名单、更新、导入导出和个人规则统一在这里管理。</p>
          </div>
          <button type="button" data-xps-settings-action="close" aria-label="关闭">×</button>
        </header>
        <div class="xps-settings-body">
          <section class="xps-settings-section">
            <div class="xps-settings-section-heading">
              <div>
                <h3>过滤与显示</h3>
                <p>回复区始终过滤；时间线的可疑账号与推广内容分开控制。</p>
              </div>
            </div>
            <div class="xps-source-list">
              <label class="xps-source-card">
                <input id="xps-filter-timeline" type="checkbox">
                <span class="xps-source-check" aria-hidden="true">✓</span>
                <span class="xps-source-copy">
                  <span class="xps-source-title">屏蔽时间线中的可疑账号内容</span>
                  <small>默认关闭。开启后仅屏蔽命中账号名单的内容，回复区过滤不受影响。</small>
                </span>
              </label>
              <label class="xps-source-card">
                <input id="xps-filter-timeline-promotions" type="checkbox">
                <span class="xps-source-check" aria-hidden="true">✓</span>
                <span class="xps-source-copy">
                  <span class="xps-source-title">屏蔽时间线中的推广内容</span>
                  <small>默认开启。限制回复与 Telegram 外链同时出现即可命中；普通外链仍须同时命中推广话术。</small>
                </span>
              </label>
              <label class="xps-source-card">
                <input id="xps-show-appeal-button" type="checkbox">
                <span class="xps-source-check" aria-hidden="true">✓</span>
                <span class="xps-source-copy">
                  <span class="xps-source-title">显示 MXGA 申诉按钮</span>
                  <small>默认开启。关闭后只隐藏申诉入口，不影响名单判定、恢复或永久放行。</small>
                </span>
              </label>
              <label class="xps-source-card">
                <input id="xps-hide-sidebar-promos" type="checkbox">
                <span class="xps-source-check" aria-hidden="true">✓</span>
                <span class="xps-source-copy">
                  <span class="xps-source-title">隐藏右栏 Premium 与热门话题</span>
                  <small>默认开启。只隐藏侧栏的 Premium 订阅入口和“What’s happening”模块，探索页与其他模块不受影响。</small>
                </span>
              </label>
            </div>
          </section>
          <section class="xps-settings-section">
            <div class="xps-settings-section-heading">
              <div>
                <h3>公开来源</h3>
                <p>勾选需要自动同步的来源；名称可打开项目主页。</p>
              </div>
            </div>
            <div class="xps-source-list">${sourceCatalogHtml()}</div>
          </section>
          <section class="xps-settings-section">
            <div class="xps-settings-section-heading">
              <div>
                <h3>自定义订阅链接</h3>
                <p>每行一个 HTTPS URL，每 6 小时更新。只接受本脚本的 Purify X JSON v1 格式，不猜测第三方名单结构。</p>
              </div>
            </div>
            <textarea id="xps-settings-subscriptions" class="xps-settings-wide-textarea" spellcheck="false" placeholder="https://example.com/x-blocklist.json"></textarea>
          </section>
          <section class="xps-settings-section">
            <div class="xps-settings-section-heading">
              <div>
                <h3>个人规则</h3>
                <p>只保存在当前 userscript 管理器中，不会自动上传。</p>
              </div>
            </div>
            <div class="xps-settings-grid">
              <label>
                <span>永远放行账号</span>
                <small>每行一个 @handle；优先于全部名单和关键词。</small>
                <textarea id="xps-settings-allow" spellcheck="false"></textarea>
              </label>
              <label>
                <span>本地屏蔽账号</span>
                <small>每行一个 @handle；只在自己的浏览器生效。</small>
                <textarea id="xps-settings-block" spellcheck="false"></textarea>
              </label>
              <label class="xps-settings-grid-wide">
                <span>自定义强屏蔽词</span>
                <small>每行一个规则；支持字面短语、ASCII 单词边界、@handle、#hashtag 和 domain:example.com。</small>
                <textarea id="xps-settings-keywords" spellcheck="false"></textarea>
              </label>
            </div>
          </section>
          <section class="xps-settings-section">
            <div class="xps-settings-section-heading">
              <div>
                <h3>可选 AI 灰区判断</h3>
                <p>默认关闭。只把本地评分 2–6 分的未关注回复发给你配置的 OpenAI 兼容 endpoint；明显正常或已被硬规则确认的内容不会调用 AI。</p>
              </div>
            </div>
            <div class="xps-ai-options">
              <label class="xps-inline-check">
                <input id="xps-ai-enabled" type="checkbox">
                <span>启用 AI 判断</span>
              </label>
              <label class="xps-inline-check">
                <input id="xps-ai-auto-learn" type="checkbox">
                <span>自动保存高置信度正文特征</span>
              </label>
            </div>
            <div class="xps-settings-grid xps-ai-grid">
              <label class="xps-settings-grid-wide">
                <span>OpenAI 兼容 endpoint</span>
                <small>仅允许 HTTPS，或本机 localhost/127.0.0.1 HTTP。</small>
                <input id="xps-ai-endpoint" type="url" spellcheck="false">
              </label>
              <label>
                <span>Model</span>
                <small>填写服务商实际支持的模型 ID。</small>
                <input id="xps-ai-model" type="text" spellcheck="false" placeholder="model-id">
              </label>
              <label>
                <span>API Key</span>
                <small>只保存在 userscript 本地存储，不包含在名单导出中。</small>
                <input id="xps-ai-key" type="password" autocomplete="off" placeholder="sk-…">
              </label>
              <label>
                <span>每日最多调用</span>
                <small>范围 1–200；同一内容会缓存，不重复计费。</small>
                <input id="xps-ai-daily-limit" type="number" min="1" max="200">
              </label>
              <label class="xps-settings-grid-wide">
                <span>本地 AI 学习规则</span>
                <small>每行一个回复正文字面片段；自动规则 90 天未再命中会过期，三次决定性误判会停用；手动添加不自动过期。</small>
                <textarea id="xps-ai-learned-rules" spellcheck="false"></textarea>
              </label>
            </div>
            <div class="xps-ai-actions">
              <button type="button" data-xps-settings-action="test-ai">测试 AI 连接</button>
              <button type="button" data-xps-settings-action="clear-ai-cache">清空 AI 判定缓存</button>
            </div>
          </section>
          <section class="xps-settings-section xps-settings-status-section">
            <h3>同步状态</h3>
            <pre id="xps-settings-status"></pre>
          </section>
        </div>
        <div id="xps-settings-feedback" data-state="idle" role="status">
          <span class="xps-feedback-icon" aria-hidden="true">✓</span>
          <span class="xps-feedback-message">所有修改都会在保存后立即生效。</span>
        </div>
        <footer>
          <button type="button" data-xps-settings-action="import">导入 JSON</button>
          <button type="button" data-xps-settings-action="export">导出 JSON</button>
          <span class="xps-settings-footer-spacer"></span>
          <button type="button" data-xps-settings-action="save">保存设置</button>
          <button type="button" class="xps-settings-primary" data-xps-settings-action="update">保存并更新全部</button>
        </footer>
      </section>
    `;
    const panel = backdrop.querySelector("#xps-settings-panel");
    panel.querySelector("#xps-filter-timeline").checked =
      preferences.filterTimeline;
    panel.querySelector("#xps-filter-timeline-promotions").checked =
      preferences.filterTimelinePromotions;
    panel.querySelector("#xps-show-appeal-button").checked =
      preferences.showAppealButton;
    panel.querySelector("#xps-hide-sidebar-promos").checked =
      preferences.hideSidebarPromos;
    panel.querySelector("#xps-settings-allow").value =
      [...localAllowedHandles].sort().join("\n");
    panel.querySelector("#xps-settings-block").value =
      [...localBlockedHandles].sort().join("\n");
    panel.querySelector("#xps-settings-keywords").value =
      [...localStrongKeywords].sort().join("\n");
    panel.querySelector("#xps-settings-subscriptions").value =
      customSubscriptionUrls.join("\n");
    panel.querySelector("#xps-ai-enabled").checked = aiConfig.enabled;
    panel.querySelector("#xps-ai-auto-learn").checked =
      aiConfig.autoLearn;
    panel.querySelector("#xps-ai-endpoint").value = aiConfig.endpoint;
    panel.querySelector("#xps-ai-model").value = aiConfig.model;
    panel.querySelector("#xps-ai-key").value = aiConfig.apiKey;
    panel.querySelector("#xps-ai-daily-limit").value =
      String(aiConfig.dailyLimit);
    panel.querySelector("#xps-ai-learned-rules").value =
      aiState.learnedRules.map((rule) => rule.value).join("\n");
    panel.querySelector("#xps-settings-status").textContent =
      `${remoteStatusText()}\n\n${settingsStatusText()}\n\n${subscriptionDetailsText()}`;
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeSettingsPanel();
      const action = event.target.closest?.("[data-xps-settings-action]")
        ?.dataset.xpsSettingsAction;
      if (action === "close") closeSettingsPanel();
      if (action === "save") void saveSettingsPanel(panel);
      if (action === "update") {
        void saveSettingsPanel(panel, { update: true });
      }
      if (action === "import") {
        void importLocalLists().then(() => {
          openSettingsPanel();
        });
      }
      if (action === "export") exportLocalLists();
      if (action === "test-ai") void testAiFromPanel(panel);
      if (action === "clear-ai-cache") void clearAiCache(panel);
    });
    for (const link of panel.querySelectorAll(".xps-source-title a")) {
      link.addEventListener("click", (event) => event.stopPropagation());
    }
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSettingsPanel();
    });
    document.body.append(backdrop);
    panel.querySelector('[data-xps-settings-action="close"]')?.focus();
  }

  async function initializeLocalLists() {
    applyLocalLists(
      await gmGetValue(LOCAL_LISTS.cacheKey, {
        schema: LOCAL_LISTS.schema,
        block: [],
        allow: [],
        keywords: [],
        subscriptions: [],
      }),
    );
    try {
      customSubscriptionCache = sanitizeCustomSubscriptionCache(
        await gmGetValue(
          LOCAL_LISTS.subscriptionCacheKey,
          customSubscriptionCache,
        ),
      );
    } catch {
      customSubscriptionCache = {
        schema: LOCAL_LISTS.schema,
        lastAttemptAt: 0,
        lastCheckedAt: 0,
        sources: {},
      };
    }
    applyCustomSubscriptionCache(customSubscriptionCache);
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("打开 Purify X 设置", openSettingsPanel);
  }
