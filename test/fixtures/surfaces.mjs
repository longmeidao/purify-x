export const surfaceCases = [
  {
    id: "smlnzhi-detail-main-always-visible",
    note: "2026-08-15 实测：详情页主贴即使作者命中 MXGA 也必须保留",
    input: {
      mainStatusId: "2085417452700307608",
      currentStatusId: "2085417452700307608",
      timelineEligible: false,
      filterTimeline: false,
      filterTimelinePromotions: true,
    },
    expectedScope: "none",
  },
  {
    id: "smlnzhi-detail-reply-still-filtered",
    note: "同一详情页只有下方回复进入完整回复过滤",
    input: {
      mainStatusId: "2085417452700307608",
      currentStatusId: "2085417452700307609",
      timelineEligible: false,
      filterTimeline: false,
      filterTimelinePromotions: true,
    },
    expectedScope: "thread-reply",
  },
  {
    id: "fortunecutie00-detail-main-handle-fallback",
    note: "2026-08-23 实测：主贴 statusId 提取异常时按作者 handle 放行，MXGA 命中也不能隐藏主贴",
    input: {
      mainStatusId: "2089971970238750960",
      currentStatusId: "",
      mainAuthorHandle: "fortunecutie00",
      currentAuthorHandle: "fortunecutie00",
      timelineEligible: false,
      filterTimeline: false,
      filterTimelinePromotions: true,
    },
    expectedScope: "none",
  },
  {
    id: "fortunecutie00-detail-self-reply-visible",
    note: "2026-08-23 需求：详情页里主贴作者自己的续写回复不进入隐藏过滤",
    input: {
      mainStatusId: "2089971970238750960",
      currentStatusId: "2089972000000000000",
      mainAuthorHandle: "fortunecutie00",
      currentAuthorHandle: "fortunecutie00",
      timelineEligible: false,
      filterTimeline: false,
      filterTimelinePromotions: true,
    },
    expectedScope: "none",
  },
  {
    id: "detail-other-author-reply-still-filtered-with-handles",
    note: "同页其他账号的回复仍进入完整回复过滤，handle 不相等才生效",
    input: {
      mainStatusId: "2089971970238750960",
      currentStatusId: "2089972100000000000",
      mainAuthorHandle: "fortunecutie00",
      currentAuthorHandle: "randomreplier",
      timelineEligible: false,
      filterTimeline: false,
      filterTimelinePromotions: true,
    },
    expectedScope: "thread-reply",
  },
  {
    id: "detail-missing-main-handle-keeps-old-behavior",
    note: "URL 里解析不出作者 handle 时回落到纯 statusId 判定",
    input: {
      mainStatusId: "2089971970238750960",
      currentStatusId: "2089972000000000000",
      mainAuthorHandle: "",
      currentAuthorHandle: "fortunecutie00",
      timelineEligible: false,
      filterTimeline: false,
      filterTimelinePromotions: true,
    },
    expectedScope: "thread-reply",
  },
];

export const profileMediaRoutes = [
  { pathname: "/SMlnZhi/media", expected: true },
  { pathname: "/someuser/media", expected: true },
  { pathname: "/SMlnZhi/status/2085417452700307608", expected: false },
  { pathname: "/home/media", expected: false },
  { pathname: "/SMlnZhi/media/videos", expected: false },
];

export const mediaSubtabLabels = [
  { label: "Photos", expected: "photos" },
  { label: "照片", expected: "photos" },
  { label: "相片", expected: "photos" },
  { label: "图片", expected: "photos" },
  { label: "Videos", expected: "videos" },
  { label: "视频", expected: "videos" },
  { label: "影片", expected: "videos" },
  { label: "Media", expected: "" },
];
