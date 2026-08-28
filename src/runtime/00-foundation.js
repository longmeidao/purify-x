(() => {
  "use strict";

  const VERSION = "2.8.2";

  const CONFIG = Object.freeze({
    threshold: 7,
    debounceMs: 80,
    // 首批同步处理以尽快隐藏可疑回复；超出条数或时间预算后让出主线程，
    // 后续任务在 requestAnimationFrame 中继续，避免长回复串阻塞滚动。
    scanFrameBudgetMs: 8,
    scanMaxArticlesPerFrame: 50,
    maxTextLength: 1200,
    minGroupSize: 2,
    collapsedTailHeightPx: 1,
    burstWindowMs: 10 * 1000,
    burstMinReplies: 6,
    burstMinHandles: 4,
    // 跨账号模板复用检测：归一化后至少这么长才参与比对，避免把
    // 「确实」「哈哈哈」这类正常复读当成批量模板。
    templateMinChars: 8,
    // 归一化文本里不重复字符的占比下限。叠词祝福（恭喜恭喜恭喜恭喜、
    // 生日快乐生日快乐）占比低，普通长句和垃圾模板占比高。
    templateMinUniqueRatio: 0.6,
    // 同一段文本至少出现在这么多个不同账号下才算模板复用。
    templateMinHandles: 2,
    // CJK 近似模板只比较较长文本的三字片段，避免把同一话题的短回复
    // 聚成一组；倒排索引代替全量两两比较。
    templateNearMinCjkChars: 12,
    templateNearNgramSize: 3,
    templateNearJaccard: 0.65,
    templateNearMaxPosting: 40,
    // 当前详情页只保留最近观察到的有限记录，跨虚拟列表回收延续行为证据。
    behaviorMaxRecords: 500,
    // X 的新多图轮播偶尔会漏掉满宽 class，在 Zen/Firefox 中只剩边框宽度。
    // 只修复明确塌缩且父容器仍有正常宽度的多图节点，避免干预正常布局。
    mediaCollapsedMaxWidthPx: 4,
    mediaParentMinWidthPx: 160,
    // 返回时间线时用点击前的推文作为滚动锚点。只在短时间内、同一 URL
    // 的浏览器回退中纠偏，并给 X 留出恢复虚拟列表的时间。
    timelineReturnMaxAgeMs: 30 * 60 * 1000,
    timelineReturnTolerancePx: 2,
    timelineReturnRestoreDelaysMs: Object.freeze([40, 120, 300, 650, 1200]),
    remoteUpdateMs: 6 * 60 * 60 * 1000,
    remoteRetryMs: 30 * 60 * 1000,
    debug: false,
  });

  const REMOTE = Object.freeze({
    cacheKey: "xps-remote-lists-v1",
    schema: 1,
    mxgaMeta: "https://x.zuoluo.tv/v1/list/meta",
    mxgaBase: "https://x.zuoluo.tv",
    mxgaWhitelist: "https://x.zuoluo.tv/v1/whitelist",
    // MXGA 每 6 小时把 D1 快照镜像到仓库 data/ 目录；边缘服务不可用时
    // 用它兜底，白名单尤其重要——缺了它误杀保护会失效。
    mxgaMirrorList:
      "https://raw.githubusercontent.com/foru17/make-x-great-again/main/data/blacklist/v1.json",
    mxgaMirrorWhitelist:
      "https://raw.githubusercontent.com/foru17/make-x-great-again/main/data/whitelist/v1.json",
    mxgaAppealBase:
      "https://github.com/foru17/make-x-great-again/issues/new",
    twitterBlockPorn:
      "https://raw.githubusercontent.com/daymade/Twitter-Block-Porn/master/lists/all.json",
    tweetGuardCommunityRules:
      "https://raw.githubusercontent.com/viewer12/tweetguard/main/community-rules.json",
    blueNoiseKeywords:
      "https://raw.githubusercontent.com/rokcso/bluenoise/refs/heads/main/data/keywords.txt",
    maxMetaChars: 64 * 1024,
    maxMxgaChars: 40 * 1024 * 1024,
    maxWhitelistChars: 4 * 1024 * 1024,
    maxMirrorChars: 32 * 1024 * 1024,
    maxTwitterBlockPornChars: 2 * 1024 * 1024,
    maxTweetGuardChars: 512 * 1024,
    maxBlueNoiseChars: 512 * 1024,
    // 2026-07 期间 MXGA 名单约每天新增 6.6k 条（7/19 的 14.7 万 → 7/27 的
    // 20.0 万）。上限只用于挡住异常响应，超出时截断降级而不是整份丢弃。
    maxEntries: 500000,
    minEntries: 1000,
    // 单条坏数据不再作废整份名单，但坏行占比过高说明响应本身不可信。
    maxInvalidRatio: 0.1,
    maxRules: 10000,
  });
  const LOCAL_LISTS = Object.freeze({
    cacheKey: "xps-local-lists-v1",
    subscriptionCacheKey: "xps-custom-subscriptions-v1",
    schema: 1,
    maxKeywords: 2000,
    maxSubscriptions: 20,
    maxSubscriptionChars: 2 * 1024 * 1024,
  });
  const PREFERENCES = Object.freeze({
    key: "xps-preferences-v1",
    schema: 1,
  });
  const DEFAULT_PREFERENCES = Object.freeze({
    schema: PREFERENCES.schema,
    filterTimeline: false,
    filterTimelinePromotions: true,
    showAppealButton: true,
    hideSidebarPromos: true,
  });
  const AI = Object.freeze({
    configKey: "xps-ai-config-v1",
    stateKey: "xps-ai-state-v1",
    schema: 1,
    minScore: 2,
    maxScore: 6,
    maxRules: 200,
    maxDecisions: 500,
    normalTtlMs: 30 * 24 * 60 * 60 * 1000,
    spamTtlMs: 180 * 24 * 60 * 60 * 1000,
    learnedRuleTtlMs: 90 * 24 * 60 * 60 * 1000,
    learnedRuleDisableAfterFalsePositives: 3,
    failureCooldownMs: 10 * 60 * 1000,
    timeoutMs: 30_000,
  });
  const DECISION_CACHE = Object.freeze({
    key: "xps-decision-cache-v1",
    schema: 1,
    maxEntries: 2000,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    saveDebounceMs: 1200,
  });
  const DEFAULT_AI_CONFIG = Object.freeze({
    enabled: false,
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "",
    apiKey: "",
    autoLearn: true,
    dailyLimit: 20,
  });
  const BUILTIN_SOURCE = Object.freeze({
    mxga: "mxga",
    twitterBlockPorn: "twitterBlockPorn",
    tweetGuard: "tweetGuard",
    blueNoise: "blueNoise",
  });
  const BUILTIN_SOURCE_CATALOG_VERSION = 3;
  const BUILTIN_SOURCE_IDS = Object.freeze(Object.values(BUILTIN_SOURCE));
  const DEFAULT_BUILTIN_SOURCES = Object.freeze([...BUILTIN_SOURCE_IDS]);
  const SOURCE_CATALOG = Object.freeze([
    {
      id: BUILTIN_SOURCE.mxga,
      name: "Make X Great Again",
      shortName: "MXGA",
      description: "中文圈低质量、诈骗、营销与 spam 账号；含社区规则和误杀白名单。",
      homepage: "https://github.com/foru17/make-x-great-again",
    },
    {
      id: BUILTIN_SOURCE.twitterBlockPorn,
      name: "Twitter Block Porn",
      shortName: "Twitter Block Porn",
      description: "中文回复区黄推和诈骗账号共享名单。",
      homepage: "https://github.com/daymade/Twitter-Block-Porn",
    },
    {
      id: BUILTIN_SOURCE.tweetGuard,
      name: "TweetGuard 社区规则",
      shortName: "TweetGuard",
      description: "近期维护的 X 回复正文模板；低权重参与组合评分，不单独定罪。",
      homepage: "https://github.com/viewer12/tweetguard",
    },
    {
      id: BUILTIN_SOURCE.blueNoise,
      name: "BlueNoise 关键词",
      shortName: "BlueNoise",
      description: "多语种垃圾内容关键词；仅导入纯文本项，命中后直接过滤。",
      homepage: "https://github.com/rokcso/bluenoise",
    },
  ]);

  const HANDLE_RE = /^[a-z0-9_]{1,15}$/i;
  const RESERVED_PROFILE_PATHS = new Set([
    "compose",
    "explore",
    "home",
    "i",
    "jobs",
    "messages",
    "notifications",
    "search",
    "settings",
  ]);
  const PROFILE_SUBPAGES = new Set([
    "articles",
    "highlights",
    "likes",
    "media",
    "with_replies",
  ]);
  const MXGA_ENTRY_CODE_RE = /^[ps][pcgrmo](?:[ha])?$/;
  const MXGA_RULE_FIELD_RE = /^[hdbta]$/;
  const MXGA_RULE_CODE_RE = /^[ps][pcgrmo]$/;
  const MXGA_ARTIFACT_PATH_RE = /^\/v1\/artifacts\/[A-Za-z0-9._-]+$/;
  const REMOTE_SOURCE = Object.freeze({
    mxga: 1,
    twitterBlockPorn: 2,
  });
  const REMOTE_SOURCE_MASK =
    REMOTE_SOURCE.mxga | REMOTE_SOURCE.twitterBlockPorn;
  // MXGA lite 条目编码第三位是 tier：h=人工确认、a=AI 自动。官方
  // /v1/check 只发人工确认条目，扩展内置名单也不含自动条目，因此这里
  // 把两者分开计分。标记与来源位共用一个整数，避免为 20 万条账号再建一张表。
  const MXGA_FLAG = Object.freeze({
    autoTier: 1 << 2,
    porn: 1 << 3,
    categoryShift: 4,
    categoryMask: 0b111 << 4,
  });
  const MXGA_SOURCE_AND_FLAGS_MASK =
    REMOTE_SOURCE.mxga |
    MXGA_FLAG.autoTier |
    MXGA_FLAG.porn |
    MXGA_FLAG.categoryMask;
  const MXGA_CATEGORY_CODES = Object.freeze(["p", "c", "g", "r", "m", "o"]);
  const MXGA_CATEGORY_LABEL = Object.freeze({
    p: "色情",
    c: "加密货币",
    g: "赌博",
    r: "资源引流",
    m: "营销推广",
    o: "其他",
  });
  const SELECTOR = Object.freeze({
    tweet: 'article[data-testid="tweet"]',
    cell: '[data-testid="cellInnerDiv"]',
    tweetText: '[data-testid="tweetText"]',
    userName: '[data-testid="User-Name"]',
    profileUserName: '[data-testid="UserName"]',
    socialContext: '[data-testid="socialContext"]',
    cardWrapper: '[data-testid="card.wrapper"]',
  });

  const MUTATION_OBSERVER_OPTIONS = Object.freeze({
    childList: true,
    characterData: true,
    subtree: true,
  });

  const CLASS = Object.freeze({
    hidden: "xps-hidden",
    placeholder: "xps-placeholder",
    restored: "xps-restored",
    revealAll: "xps-reveal-all",
    groupHead: "xps-group-head",
    groupTail: "xps-group-tail",
    groupOpen: "xps-group-open",
    accountBadge: "xps-account-badge",
    mediaWidthFix: "xps-media-width-fix",
    sidebarPromoHidden: "xps-hide-sidebar-promos",
  });

  const ATTRIBUTE = Object.freeze({
    fingerprint: "data-xps-fingerprint",
    following: "data-xps-following",
    score: "data-xps-score",
    group: "data-xps-group",
    state: "data-xps-state",
    cellStatus: "data-xps-status-id",
    mediaStatus: "data-xps-media-status",
  });

  const EVIDENCE_SOURCE = Object.freeze({
    list: "list",
    localList: "local-list",
    subscription: "subscription",
    community: "community",
    keyword: "keyword",
    pattern: "pattern",
    ai: "ai",
  });

  const EVIDENCE_LABEL = Object.freeze({
    [EVIDENCE_SOURCE.list]: "公开名单",
    [EVIDENCE_SOURCE.localList]: "本地观察名单",
    [EVIDENCE_SOURCE.subscription]: "自定义订阅",
    [EVIDENCE_SOURCE.community]: "社区规则",
    [EVIDENCE_SOURCE.keyword]: "本地关键词",
    [EVIDENCE_SOURCE.pattern]: "异常模板",
    [EVIDENCE_SOURCE.ai]: "AI 判断",
  });

  // 昵称和回复正文共用、歧义较低的强引流词。
  const SHARED_STRONG_RE =
    /(福利姬|楼凤|外围女?|援交|招嫖|成人直播|裸聊)/i;

  const STRONG_NAME_CONTEXT_RE =
    /(同[\s._·-]*城|[上仩丄][\s._·-]*[门門]|[选選][\s._·-]*妃|全国.{0,2}安排|免费.{0,2}(破处|看片)|母狗.{0,3}(找|等).{0,2}主人|主人.{0,3}(领我|调教我)|无偿.{0,2}线下|想找.{0,5}(哥哥|单男|主人)|单男.{0,3}(可约|滴滴|私聊)|m\s*(寻|找|约|求)\s*s|s\s*(寻|找|约|求)\s*m|(?:免费.{0,5})?约[\s._·-]*[p炮啪泡萢]|免费.{0,4}(配对|匹配)|(?:寻|找|约)[\s._·-]*[炮泡萢]|[炮泡萢][\s._·-]*友|(?:点击|点我|查看|看|进).{0,3}主页|(?:私聊|私我|滴我).{0,4}(资源|福利|有|看)|固炮|色播|涩播|黄播)/i;

  // 这些词单独看可能是普通服务，因此只给中等分；若回复正文只剩
  // @提及和 emoji，再作为批量引流账号隐藏。
  const PROFILE_PROMO_NAME_RE =
    /((查询|查看|搜索).{0,4}(附近|同城).{0,5}(资源|对象|女生|妹)|(附近|精准|实时|快速).{0,6}(配对|匹配|速配)|全国.{0,4}(牵线|资源)|资源.{0,4}自取|处男.{0,4}(无偿|免费|约)|(?:找|等).{0,2}主人(?!公|翁|角))/i;

  // 这些词放在正文中很常见，但出现在显示昵称时常被批量营销账号用作标签。
  // 单独命中只加低分，必须再结合低信息回复等行为特征。
  const LOW_QUALITY_NAME_TOKEN_RE = /(免费|无偿|全国|自取|男士)/i;
  const SUSPICIOUS_HANDLE_RE =
    /(^[a-z]{2,12}\d{5,}$|^[a-z][a-z]+\d{4,}[a-z]?$|^[a-z]{6,}_\d{2,}$)/i;

  const STRONG_TEXT_CONTEXT_RE =
    /([选選][\s._·-]*妃|同[\s._·-]*城.{0,12}([选選][\s._·-]*妃|约|安排|空降)|[上仩丄][\s._·-]*[门門].{0,12}([选選][\s._·-]*妃|约|空降)|约.{0,2}(炮|p|啪|泡|萢)|全国.{0,4}(安排|可飞)|免费.{0,4}(看片|看黄|约|空降|破处)|主人.{0,5}(领我|调教我)|母狗.{0,5}(找|等).{0,3}主人|想找.{0,8}(哥哥|单男|主人)|无偿.{0,4}(线下|约)|单男.{0,5}(可约|滴滴|私聊)|成人视频|色情直播|激情视频|黄色视频|福利视频|无码高清|自拍偷拍|私房视频)/i;

  // 这里只保留尚未进入共享强规则或字段上下文强规则的弱特征；
  // 强规则已经足以隐藏，不再在弱规则中重复列词叠加分数。
  const WEAK_SEXUAL_RE =
    /(巨乳|爆乳|人妻|少妇|萝莉|御姐|嫩模|空姐|学生妹|母狗|骚货|高潮|内射|口交|足交|调教|成人片|私房照|私密照|无码AV|国产自拍)/i;

  const CTA_RE =
    /((主页|首页|置顶|简介|签名|资料|头像|动态).{0,10}(看|有|领|取|进|点|加|联系|私聊|链接|资源|福利|惊喜|联系方式)|点击.{0,6}(主页|头像|链接)|进群|加群|私信|私聊|滴滴|扣我|戳我|找我|联系我|来找我)/i;

  const CONTACT_RE =
    /(^|[^a-z])(vx|v信|微\s*信全国q|telegram|tg|电报|line|whats\s*app|飞机号|群号|加\s*v)([^a-z]|$)/i;

  // 推广帖常用「回馈粉丝、私密福利、暗号准入、完整版、限时免费、唯一链接」一类话术。
  // 普通外链仍须结合结构化回复限制；Telegram 引流本身更明确，可与推广话术
  // 组成高置信组合。单独的外链或推广词都不定罪。
  const PROMOTION_COPY_RE =
    /(回馈.{0,8}粉丝|反馈.{0,8}粉丝|福利群|分享给粉丝|粉丝.{0,8}(支持|福利|免费|无门槛)|不对外公开.{0,4}福利|(?:收到|知道|凭).{0,4}(?:暗号|口令).{0,8}(?:进|加入|进入)|私密(?:相册)?电报|私密空间|不用.{0,3}(付费|收费)|今天.{0,4}进[群裙]|限时.{0,8}(免费|无门槛|进入)|免费.{0,5}开放|(?:免费|无门槛).{0,12}(进入|进[群裙]|观看|完整版|互动)|(?:完整|完整版).{0,8}(视频|写真|互动)|(视频|写真).{0,5}完整版|进[群裙].{0,5}入口|线上\s*1v1|唯一链接|私信暗号|私密暗号|进群方式|下载.{0,8}(纸飞机|飞机|telegram)|永久更新|极品推荐|打开即玩|无限制\s*ai)/i;

  const GENERIC_REPLY_RE =
    /^(wow|nice|great|amazing|awesome|beautiful|cute|cool|love it|so true|exactly|interesting|good one|well said|哈哈+|确实|真的|支持|厉害|不错|可以|牛啊|太棒了)[!.。,，！\s\p{Extended_Pictographic}]*$/iu;

  const TEMPLATE_RE =
    /(风暖岁安事事皆顺遂|比她好看的没她骚|她好涩我不行了|哥哥快来|主人快来|点开有惊喜|主页有惊喜|主页看福利)/i;

  // 这一批模板会插入随机双字母、更换推广 @handle 和结尾短码来逃避
  // 精确关键词；完整句式本身高度稳定，单独命中即可隐藏。
  const NETWORK_PROMO_TEMPLATE_RE =
    /(她太涩了[a-z]{0,3}\s*我真顶不住|(?:30\+\s*的?)?(?:sao|骚)货[a-z]{0,3}\s*没人比她(?:sao|骚)|比她好看的.{0,4}没她骚.{0,6}比她骚的.{0,4}没她好看|体制内老师.{0,10}(?:sao|骚)的很|刷了半天.{0,10}(?:的)?x.{0,10}就她(?:的)?主页能打(?:✈️?|飞机)了|30\+\s*果然太涩了.{0,8}我真顶不住|30\+\s*的.{0,6}体制内老师.{0,12}玩的就是返差|是这个吧.{0,12}看了就知道了.{0,24}(?:https?:\/\/)?t\.cn\/[a-z0-9_-]+)/i;

  // \u6C49\u5B57\u2014emoji\u2014\u6C49\u5B57\uFF1Aemoji \u88AB\u786C\u63D2\u5728\u8BED\u53E5\u4E2D\u95F4\uFF0C\u4E24\u4FA7\u6CA1\u6709\u6807\u70B9\u6216\u7A7A\u683C\u3002
  const MID_SENTENCE_EMOJI_RE =
    /\p{Script=Han}[\p{Extended_Pictographic}\uFE0E\uFE0F\u200D]+\p{Script=Han}/u;

  // 统一移除 Unicode 默认可忽略字符，避免变体选择器、软连字符、
  // 不可见运算符和 bidi 控制符被插入关键词或模板中规避判定。
  const DEFAULT_IGNORABLE_RE = /\p{Default_Ignorable_Code_Point}/gu;
  const KEYWORD_TRIE_CHUNK_SIZE = 256;
  const EMOJI_RE = /\p{Extended_Pictographic}/gu;
  const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
  const LATIN_RE = /[a-z]/gi;
  const DECORATIVE_RE =
    /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1-\u05c2\u0610-\u061a\u064b-\u065f\u0f71-\u0fbc\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/gu;

  const restoredFingerprints = new Set();
  const filteredCells = new Set();
  const expandedGroupIds = new Set();
  const remoteHandleSources = new Map();
  const remoteUserIdSources = new Map();
  const remoteHandleUserIds = new Map();
  const remoteWhitelist = new Set();
  const remoteWhitelistUserIds = new Set();
  const localBlockedHandles = new Set();
  const localAllowedHandles = new Set();
  const localStrongKeywords = new Set();
  const subscribedBlockedHandles = new Set();
  const subscribedAllowedHandles = new Set();
  const subscribedStrongKeywords = new Set();
  const tweetGuardCommunityKeywords = new Set();
  const blueNoiseCommunityKeywords = new Set();
  let customSubscriptionUrls = [];
  let enabledBuiltInSources = new Set(DEFAULT_BUILTIN_SOURCES);
  let preferences = { ...DEFAULT_PREFERENCES };
  let customSubscriptionCache = {
    schema: LOCAL_LISTS.schema,
    lastAttemptAt: 0,
    lastCheckedAt: 0,
    sources: {},
  };
  const relationshipArticleCache = new WeakMap();
  const repostRelationshipCache = new WeakMap();
  const quotedIdentityCache = new WeakMap();
  const relationshipHandleCache = new Map();
  let scanReactRootsCache = new WeakMap();
  const profileUserIdCache = new Map();
  const unknownFollowingChecks = new WeakMap();
  let remoteRules = [];
  let remoteCache = {
    schema: REMOTE.schema,
    lastAttemptAt: 0,
    lastCheckedAt: 0,
    sources: {},
  };
  let remoteSyncPromise = null;
  let pendingTimer = 0;
  const pendingScanRoots = new Set();
  const pendingArticleQueue = new Set();
  let pendingGlobalScan = false;
  let pendingArticleFrame = 0;
  let articleQueueActive = false;
  let followingRetryTimer = 0;
  let observer;
  let timelineReturnSnapshot = null;
  let timelineReturnRestoreToken = 0;
  let timelineReturnInteractionCleanup = null;
  let mediaPhotosDefaultPending = false;
  let mediaPhotosMenuRequested = false;
  let hiddenCount = 0;
  let revealAll = false;
  let knownViewerHandle = "";
  let coordinatedBurstStatusIds = new Set();
  let repeatedLowInfoStatusIds = new Set();
  let duplicateTemplateStatusIds = new Set();
  const threadBehaviorRecordCache = new Map();
  let threadBehaviorContextId = "";
  let aiConfig = { ...DEFAULT_AI_CONFIG };
  let aiState = {
    schema: AI.schema,
    learnedRules: [],
    decisions: {},
    usage: { day: "", count: 0 },
  };
  const pendingAiKeys = new Set();
  const aiFailures = new Map();
  const aiQueue = [];
  let activeAiRequests = 0;
  const decisionCache = new Map();
  const keywordMatcherCache = new Map();
  const keywordCollectionCache = new WeakMap();
  let keywordMatcherGeneration = 0;
  // X 的虚拟列表会在滚动时销毁、重建或复用回复容器。持久判定缓存
  // 避免重复评分；这一层会额外记住当前规则版本下已隐藏的 status，
  // 让重新挂载的回复在浏览器绘制前直接恢复隐藏状态。
  const hiddenStatusCache = new Map();
  let decisionCacheRevision = "";
  let decisionCacheReady = false;
  let decisionCacheSaveTimer = 0;
  let aiStateSaveTimer = 0;
  const aiRuleHitStatusKeys = new Map();
  const aiRuleFalsePositiveStatusKeys = new Map();
