export const surfaceCases = [
  {
    id: "smlnzhi-detail-main-always-visible",
    note: "2026-08-15 实测：详情页主贴即使作者命中 MXGA 也必须保留",
    input: {
      mainStatusId: "2085417452700307608",
      currentStatusId: "2085417452700307608",
      timelineEligible: false,
      filterTimeline: false,
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
    },
    expectedScope: "thread-reply",
  },
];

export const profileMediaRoutes = [
  { pathname: "/SMlnZhi/media", expected: true },
  { pathname: "/longmeidao/media", expected: true },
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
