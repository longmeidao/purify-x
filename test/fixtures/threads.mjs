// 回复区行为信号回归样本。
//
// 每个场景是一组已经从 DOM 抽取好的回复记录（computeReplyBehaviorSignals 的输入），
// `expect` 给出三类信号应命中的回复 id。未列出的 id 必须不命中。
// 时间戳用固定基准，避免测试依赖当前时间。

const T0 = 1785000000000;
const sec = (n) => T0 + n * 1000;
const min = (n) => T0 + n * 60 * 1000;

export const threads = [
  {
    id: "real-thread-2026-07-30",
    note: "tualatrix 回复区实测：两个不同账号换 emoji 复用同一句长文本",
    records: [
      {
        id: "1",
        handle: "laixintao",
        name: "laixintao",
        text: "垃圾公司，垃圾价值观 v2ex.com/t/1201958#repl… 早日倒闭。",
        createdAt: min(0),
      },
      {
        id: "2",
        handle: "maytomlins54766",
        name: "若烟🌸",
        text: "我果然太涩了🐨🫡有人想锐评一下我的福嘛",
        createdAt: min(25),
      },
      {
        id: "3",
        handle: "lee_noyes45184",
        name: "海莲🌸",
        text: "我果然太涩了🎉🦋有人想锐评一下我的福嘛",
        createdAt: min(50),
      },
    ],
    expect: { duplicated: ["2", "3"], repeated: [], coordinated: [], hidden: ["2", "3"] },
  },
  {
    id: "letter-variant-template",
    note: "插入随机字母的同族模板：剥掉拉丁字母后仍是同一句",
    records: [
      {
        id: "1",
        handle: "aaa11111",
        name: "小美🌸",
        text: "她太涩了ab 我真顶不住",
        createdAt: min(0),
      },
      {
        id: "2",
        handle: "bbb22222",
        name: "小丽🌸",
        text: "她太涩了xy 我真顶不住",
        createdAt: min(3),
      },
    ],
    expect: { duplicated: ["1", "2"], repeated: [], coordinated: [], hidden: ["1", "2"] },
  },
  {
    id: "repeated-blessing-not-template",
    note: "两个正常账号复读叠词祝福，不能算模板复用",
    records: [
      {
        id: "1",
        handle: "userone",
        name: "小明🎉",
        text: "恭喜恭喜恭喜恭喜",
        createdAt: min(0),
      },
      {
        id: "2",
        handle: "usertwo",
        name: "小红🎉",
        text: "恭喜恭喜恭喜恭喜",
        createdAt: min(1),
      },
      {
        id: "3",
        handle: "userthree",
        name: "小刚",
        text: "生日快乐生日快乐",
        createdAt: min(2),
      },
      {
        id: "4",
        handle: "userfour",
        name: "小强",
        text: "生日快乐生日快乐",
        createdAt: min(2),
      },
    ],
    expect: { duplicated: [], repeated: [], coordinated: [], hidden: [] },
  },
  {
    id: "short-agreement-not-template",
    note: "多人回同样的短句属于正常复读，长度不到模板门槛",
    records: [
      {
        id: "1",
        handle: "userone",
        name: "张三",
        text: "确实",
        createdAt: min(0),
      },
      {
        id: "2",
        handle: "usertwo",
        name: "李四",
        text: "确实",
        createdAt: min(1),
      },
      {
        id: "3",
        handle: "userthree",
        name: "王五",
        text: "同意，说得对",
        createdAt: min(2),
      },
      {
        id: "4",
        handle: "userfour",
        name: "赵六",
        text: "同意，说得对",
        createdAt: min(3),
      },
    ],
    expect: { duplicated: [], repeated: [], coordinated: [], hidden: [] },
  },
  {
    id: "same-account-repeated-lowinfo",
    note: "同一账号在回复区重复发 emoji-only 回复",
    records: [
      {
        id: "1",
        handle: "spamone",
        name: "若雪🌸",
        text: "@tualatrix 🌸🌸",
        createdAt: min(0),
      },
      {
        id: "2",
        handle: "spamone",
        name: "若雪🌸",
        text: "@tualatrix 🦋🦋",
        createdAt: min(1),
      },
      {
        id: "3",
        handle: "normaluser",
        name: "张三",
        text: "这个不错",
        createdAt: min(2),
      },
    ],
    expect: {
      duplicated: [],
      repeated: ["1", "2"],
      coordinated: [],
      hidden: ["1", "2"],
    },
  },
  {
    id: "emoji-only-burst",
    note: "10 秒内 6 条、4 个账号的 emoji-only 集群",
    records: [
      { id: "1", handle: "s1", name: "甜甜🌸", text: "@a 🌸🌸", createdAt: sec(0) },
      { id: "2", handle: "s2", name: "若雪🌸", text: "@a 🦋🦋", createdAt: sec(1) },
      { id: "3", handle: "s3", name: "小美🌸", text: "@a 💋💋", createdAt: sec(2) },
      { id: "4", handle: "s4", name: "小丽🌸", text: "@a 🐨🐨", createdAt: sec(3) },
      { id: "5", handle: "s1", name: "甜甜🌸", text: "@a 🎉🎉", createdAt: sec(4) },
      { id: "6", handle: "s2", name: "若雪🌸", text: "@a 🌷🌷", createdAt: sec(5) },
    ],
    expect: {
      duplicated: [],
      repeated: ["1", "2", "5", "6"],
      coordinated: ["1", "2", "3", "4", "5", "6"],
      hidden: ["1", "2", "3", "4", "5", "6"],
    },
  },
  {
    id: "template-burst-with-body",
    note: "带正文的模板集群：放宽后也应进入 burst 候选",
    records: [
      {
        id: "1",
        handle: "s1",
        name: "甜甜🌸",
        text: "我果然太涩了🐨有人想锐评一下我的福嘛",
        createdAt: sec(0),
      },
      {
        id: "2",
        handle: "s2",
        name: "若雪🌸",
        text: "我果然太涩了🦋有人想锐评一下我的福嘛",
        createdAt: sec(1),
      },
      {
        id: "3",
        handle: "s3",
        name: "小美🌸",
        text: "我果然太涩了💋有人想锐评一下我的福嘛",
        createdAt: sec(2),
      },
      {
        id: "4",
        handle: "s4",
        name: "小丽🌸",
        text: "我果然太涩了🎉有人想锐评一下我的福嘛",
        createdAt: sec(3),
      },
      {
        id: "5",
        handle: "s5",
        name: "小芳🌸",
        text: "我果然太涩了🌷有人想锐评一下我的福嘛",
        createdAt: sec(4),
      },
      {
        id: "6",
        handle: "s6",
        name: "小婷🌸",
        text: "我果然太涩了🌸有人想锐评一下我的福嘛",
        createdAt: sec(5),
      },
    ],
    expect: {
      duplicated: ["1", "2", "3", "4", "5", "6"],
      repeated: [],
      coordinated: ["1", "2", "3", "4", "5", "6"],
      hidden: ["1", "2", "3", "4", "5", "6"],
    },
  },
  {
    id: "same-account-duplicate-not-cross-account",
    note: "只有一个账号重复同一段长文本时，不算跨账号模板复用",
    records: [
      {
        id: "1",
        handle: "onlyone",
        name: "某人",
        text: "我果然太涩了有人想锐评一下我的福嘛",
        createdAt: min(0),
      },
      {
        id: "2",
        handle: "onlyone",
        name: "某人",
        text: "我果然太涩了有人想锐评一下我的福嘛",
        createdAt: min(1),
      },
    ],
    expect: { duplicated: [], repeated: [], coordinated: [], hidden: [] },
  },
  {
    id: "cjk-near-duplicate-template",
    note: "不同账号只增删少量汉字的同族模板也应聚成一组",
    records: [
      {
        id: "1",
        handle: "variantone",
        name: "小桃🌸",
        text: "我果然太涩了有人想锐评一下我的福嘛",
        createdAt: min(0),
      },
      {
        id: "2",
        handle: "varianttwo",
        name: "小梨🌸",
        text: "我果然真的太涩了有人想锐评一下我的福嘛",
        createdAt: min(1),
      },
    ],
    expect: { duplicated: ["1", "2"], repeated: [], coordinated: [], hidden: [] },
  },
  {
    id: "cjk-related-topic-not-template",
    note: "讨论同一主题但句式不同的正常回复不能被近似聚类",
    records: [
      {
        id: "1",
        handle: "normalone",
        name: "读者甲",
        text: "这篇文章对虚拟列表的分析很清楚，缓存部分尤其有帮助",
        createdAt: min(0),
      },
      {
        id: "2",
        handle: "normaltwo",
        name: "读者乙",
        text: "我更关心虚拟列表滚动时的锚点问题，缓存只是其中一环",
        createdAt: min(1),
      },
    ],
    expect: { duplicated: [], repeated: [], coordinated: [], hidden: [] },
  },
];
