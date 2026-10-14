/* ==========================================================================
   人文组 · 拼贴诗工作台
   --------------------------------------------------------------------------
   0. 基础工具              4. 素材：上传图片 → 自动识文 → 抠成碎片
   1. 词库                  5. 导出 PNG
   2. 句法造词引擎          6. 弹窗
   3. 拼贴板                7. 启动与绑定
   无任何外部依赖，可离线运行。
   ========================================================================== */
(function () {
  'use strict';

  /* 自检探针（对正常使用无影响） */
  window.__boot = { iife: true };
  window.addEventListener('error', function (e) {
    (window.__bootErrors = window.__bootErrors || []).push(String((e && e.message) || e));
  });

  /* ========================= 0. 基础工具 ========================= */

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round2 = (v) => Math.round(v * 100) / 100;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hashStr = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const rnd = (seedStr) => mulberry32(hashStr(String(seedStr)));
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 2200);
  }

  function download(blobOrUrl, name) {
    const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { if (typeof blobOrUrl !== 'string') URL.revokeObjectURL(url); }, 5000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制：' + text);
      return;
    } catch (e) { /* 降级 */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制：' + text); }
    catch (e2) { toast('复制失败，请手动选中'); }
    ta.remove();
  }

  /* ========================= 1. 词库 ========================= */
  /* 参与造句的词以「双字」为主，保证组合出来读得顺。
     扩词只需往数组里加，造词引擎会自动用上。 */

  const BANK = {
    noun: [
      /* 自然 */
      '月亮', '月亮', '月亮', '黄昏', '黄昏', '黄昏', '春天', '春天', '夏天', '秋天', '冬天',
      '落日', '朝阳', '晚风', '北风', '季风', '海风', '雪原', '白雪', '大雪', '雨水', '雷声',
      '霜花', '薄雾', '云层', '星群', '星河', '夜空', '潮水', '海浪', '河流', '河岸', '渡口',
      '旷野', '平原', '山谷', '山林', '森林', '荒原', '荒野', '草原', '沙漠', '绿洲', '岛影',
      '花海', '花园', '藤蔓', '树影', '松林', '蝉鸣', '鸟群', '白鸟', '鲸鱼', '蝴蝶', '萤火',
      '火焰', '灰烬', '石头', '沙砾', '尘埃', '影子', '光斑', '光晕', '闪电', '彩虹',
      /* 时间 */
      '清晨', '清晨', '正午', '午后', '傍晚', '深夜', '午夜', '凌晨', '明天', '昨天',
      /* 人造 / 城市 */
      '车站', '站台', '月台', '铁轨', '灯塔', '灯塔', '钟楼', '屋顶', '窗台', '阳台', '走廊',
      '楼梯', '门缝', '抽屉', '书桌', '台灯', '灯芯', '窗帘', '纱窗', '信封', '信纸', '邮票',
      '邮筒', '车票', '船票', '地图', '纸页', '字典', '诗集', '小说', '电影', '唱片', '磁带',
      '收音机', '电视机', '电话', '长街', '小巷', '胡同', '城市', '小镇', '村庄', '公园',
      '操场', '教室', '宿舍', '食堂', '水房', '广场', '商店', '书店', '茶馆',
      /* 抽象 */
      '名字', '声音', '回声', '沉默', '答案', '问题', '秘密', '秘密', '谎言', '真相', '梦境',
      '记忆', '旧梦', '未来', '过去', '青春', '少年', '老人', '妈妈', '父亲', '外婆',
      '故乡', '远方', '思念', '乡愁', '孤独', '心事', '命运', '时间', '宇宙', '人间', '世界',
      '生活', '烟火', '故事', '开头', '结尾', '温柔', '寂寞', '情绪', '伤口',
      '眼泪', '笑容', '拥抱', '告别', '重逢', '原谅', '勇气', '自由', '理想', '现实', '偶然',
      '误会', '时差', '频率', '信号', '旋钮', '胶片', '底片', '像素', '波形', '电流', '光谱'
    ],
    adj: [
      '明亮', '温柔', '沉默', '潮湿', '滚烫', '冰冷', '辽阔', '狭窄', '遥远', '短暂', '漫长',
      '慵懒', '喧闹', '安静', '破碎', '完整', '年轻', '苍老', '透明', '轻盈', '沉重', '空荡',
      '拥挤', '新鲜', '陈旧', '金黄', '雪白', '深蓝', '灰白', '微凉', '柔软', '坚硬', '迟钝',
      '缓慢', '愚蠢', '天真', '倔强', '温和', '荒凉', '干净', '模糊', '清晰', '慌张', '从容',
      '微小', '巨大', '苦涩', '甜美', '辛辣', '迷人', '具体', '抽象', '有限', '无限',
      '无数', '普通', '特别', '陌生', '熟悉', '秘密', '彩色', '黑白', '崭新',
      '发烫', '生锈', '褪色'
    ],
    ni: ['发芽', '开花', '苏醒', '沉睡', '蔓延', '闪烁', '坍塌', '融化', '干涸', '飘落', '燃烧', '熄灭'],
    /* 「满」只能跟在少数动词后面 */
    full: ['写满', '挤满', '塞满', '落满', '堆满', '长满'],
    /* 只能作定语修饰名词的词（放在谓语位置会读不通，单独放） */
    attrib: ['迷路', '失眠', '过期', '失重', '走神', '生锈', '褪色', '发烫', '打烊', '停摆', '流浪', '无主', '倒带'],
    /* 动补结构里的结果补语（跟「得 / 成」搭配才读得通） */
    comp: ['破碎', '干净', '通红', '潮湿', '冰凉', '滚烫', '发白', '凌乱', '稀碎', '渺小', '扁平', '圆满'],
    /* 及物动词：后面能带宾语，用于动宾、把字句 */
    vt: [
      '听见', '看见', '梦见', '记得', '遗忘', '等待', '抵达', '经过', '寻找', '遇见',
      '拥抱', '亲吻', '写信', '寄出', '收到', '拆开', '折叠', '裁剪', '粘贴', '缝补',
      '修补', '打碎', '拼凑', '收藏', '丢失', '点灯', '关灯', '煮茶', '温酒', '数星星',
      '浪费', '占有', '偷走', '归还', '解释', '原谅', '怀疑', '相信', '背叛', '热爱',
      '告别', '重复', '改变', '错过', '阅读', '朗诵', '拍下', '捡起', '放下', '擦掉',
      '画出', '唱起', '吃掉', '买下', '听完', '看完', '穿过', '推开', '翻开', '点亮'
    ],
    /* 少数能构成「V 成 N」的动词 */
    vtVague: ['折叠', '裁剪', '拼凑', '改变', '重复', '遗忘', '记得', '归还', '拆开', '点亮', '错过'],
    /* 不及物动词：不带宾语 */
    vi: [
      /* 人会做的 */
      '出发', '离开', '回来', '停留', '散步', '漫游', '游荡', '奔跑', '逃亡', '呼吸',
      '叹息', '歌唱', '流泪', '微笑', '沉默', '发呆', '失眠', '做梦', '醒来',
      '淋雨', '吹风', '失恋', '坦白', '开始', '结束', '回头', '打盹', '打烊', '停摆',
      /* 事物 / 自然 */
      '燃烧', '熄灭', '漂浮', '下沉', '上升', '坠落', '发芽',
      '开花', '苏醒', '沉睡', '蔓延', '闪烁', '坍塌', '融化', '干涸', '飘落'
    ],
    adv: ['正在', '已经', '将要', '忽然', '悄悄', '曾经', '一起', '慢慢', '总是', '独自', '不再', '刚刚', '轻轻', '依然', '偶尔'],
    neg: ['不', '没有', '别'],
    /* 只能放在主语前面的时间副词（放在名词前会读不通，所以单独一组） */
    timeAdv: ['昨天', '明天', '从前', '后来', '那年', '刚才', '今夜', '来年'],
    time: ['昨天', '明天', '春天', '夏天', '秋天', '冬天', '清晨', '黄昏', '深夜', '午后', '傍晚', '午夜', '从前', '以后', '后来', '那年', '刚才'],
    place: ['在站台', '在屋顶', '在窗边', '在深夜', '在海边', '在旷野', '在梦里', '在远方', '在教室', '在楼下', '在雨里', '在黄昏', '在北方', '在南方'],
    pronoun: ['我', '你', '他', '她', '我们', '你们', '他们', '她们', '它', '谁'],
    demon: ['这', '那', '这些', '那些', '这个', '那个'],
    measure: ['一场', '一个', '一片', '一枚', '一列', '一种', '一封', '一朵', '一段', '一整个', '一只', '一行', '一句', '一夜'],
    color: ['深蓝', '雪白', '金黄', '灰白', '墨绿', '暗红'],
    conj: ['与', '和', '以及', '或'],
    link: ['所以', '因为', '于是', '但是', '如果', '后来', '然后', '只是', '还有', '仿佛', '好像'],
    nphrase: ['一场雨', '一场雪', '一场梦', '一片海', '一片云', '一朵花', '一盏灯', '一封信', '一首诗', '一句晚安'],
    deAdj: ['温柔的', '沉默的', '遥远的', '破碎的', '潮湿的', '年轻的', '孤独的', '干净的', '握不住的', '说不出口的', '见不到的', '褪色的', '发烫的', '空荡的'],
    particle: ['的', '了', '着', '过', '吗', '呢', '吧', '啊']
  };

  const BANK_SIZE = Object.values(BANK).reduce((n, arr) => n + arr.length, 0);

  /* 「一场」只能配事件类名词，否则读起来别扭 */
  const EVENT_NOUN = ['雨', '雪', '梦', '告别', '重逢', '误会', '失眠', '发烧', '大雨', '暴雨', '春梦', '噩梦', '相遇', '旅行', '散步', '电影', '演出', '考试', '失恋', '恋爱', '逃亡', '远行', '感冒', '台风', '大雨', '雪', '雨夹雪', '空欢喜', '大雾', '雨声', '梦游'];
  /* 只有人才能做的动作：主语是人时才用，避免「谁轻轻发芽」 */
  const PERSON_V = ['散步', '漫游', '游荡', '奔跑', '逃亡', '呼吸', '叹息', '歌唱', '跳舞', '流泪',
    '微笑', '沉默', '发呆', '失眠', '做梦', '醒来', '淋雨', '吹风', '失恋', '坦白', '出发',
    '离开', '回来', '停留', '回头', '开始', '结束', '打盹', '写信', '读诗', '写诗'];
  /* 动补结构的补语槽位 */
  function compSlot(rng) { return pick(rng, BANK.comp); }

  /* 量词接名词：没把握的名词一律用「一个」，避免「一封少年」这种搭配 */
  const MEASURE_FOR = {
    一场: new Set(['雨', '雪', '梦', '告别', '重逢', '误会', '失眠', '雨夹雪', '大雾', '大雨', '暴雨', '台风', '电影', '演出', '考试', '恋爱', '失恋', '逃亡', '远行', '感冒', '旅行', '散步']),
    一枚: new Set(['邮票', '信封', '月亮', '硬币', '纸页', '书签', '戒指', '琥珀']),
    一朵: new Set(['花', '云', '花海', '云层', '浪', '海浪', '影子', '烟花', '晚霞']),
    一片: new Set(['海', '云', '花海', '雪原', '荒原', '森林', '草原', '沙漠', '平原', '沙滩', '星空', '夜空', '月光', '雾', '光斑']),
    一只: new Set(['鸟', '白鸟', '蝴蝶', '猫', '狗', '船', '鲸鱼', '萤火虫', '手套', '耳朵', '眼睛']),
    一封: new Set(['信', '信纸', '情书', '邮件', '电报']),
    一列: new Set(['火车', '列车', '车厢', '地铁', '队伍', '数字']),
    一段: new Set(['路', '记忆', '旋律', '时间', '故事', '距离', '往事', '情话', '时光']),
    一行: new Set(['字', '诗句', '名字', '脚印', '泪', '诗', '雁']),
    一句: new Set(['话', '诗', '晚安', '问候', '歌词', '誓言', '诗行']),
    一夜: new Set(['雨', '雪', '风', '梦', '失眠', '守候', '大雪', '暴雨']),
    一种: new Set(['感觉', '情绪', '病', '颜色', '声音', '气味', '可能', '温柔', '寂寞', '孤独', '乡愁', '思念', '理想', '自由', '勇气', '缘分']),
    一整个: new Set(['夏天', '冬天', '春天', '秋天', '青春', '时代', '夜晚', '白天', '宇宙', '人间', '世界', '星空'])
  };
  /* 量词后面允许接的「的」字结构里的名词，宽松一些 */
  const MEASURE_LOOSE = new Set(['一场', '一个', '一段', '一种', '一夜', '一整个']);

  function measureMatch(rng, noun) {
    for (const k in MEASURE_FOR) if (MEASURE_FOR[k].has(noun)) return k;
    return '一个';
  }

  /* 意象加权：让「月亮 / 黄昏 / 远方」这类词更容易被抽到 */
  const WEIGHT = {
    月亮: 6, 黄昏: 6, 春天: 5, 夏天: 3, 秋天: 4, 冬天: 3, 海风: 3, 潮水: 3, 海浪: 3, 星河: 3,
    灯塔: 4, 车站: 3, 站台: 3, 信封: 3, 信纸: 3, 记忆: 4, 孤独: 3, 远方: 5, 时间: 3,
    影子: 3, 名字: 4, 声音: 3, 秘密: 4, 温柔: 5, 青春: 4, 少年: 3, 故乡: 3, 萤火: 3,
    鲸鱼: 3, 蝴蝶: 3, 深夜: 4, 清晨: 4, 午后: 3, 窗台: 3, 屋顶: 3, 铁轨: 3,
    渡口: 3, 荒野: 3, 荒原: 3, 尘埃: 3, 灰烬: 3, 火焰: 3, 梦境: 4, 思念: 4, 心事: 3, 告别: 3
  };

  function weightedPick(rng, arr) {
    let total = 0;
    for (const w of arr) total += (WEIGHT[w] || 1);
    let r = rng() * total;
    for (const w of arr) {
      r -= (WEIGHT[w] || 1);
      if (r <= 0) return w;
    }
    return arr[arr.length - 1];
  }

  /* ========================= 2. 句法造词引擎 ========================= */
  /* 每个短语结构 = 槽位模板 + 词类映射；同一结构挂多套映射，随机抽一套。 */

  const pick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
  const maybe = (rng, p, v) => (rng() < p ? v : '');
  /* 作定语的形容词：普通形容词 + 只能作定语的词 */
  const modAdj = (rng) => (rng() < 0.26 ? pick(rng, BANK.attrib) : pick(rng, BANK.adj));
  /* 按语法位置取动词：带宾语用及物、人做主语用 vi、事物主语用 ni */
  const vIntr = (rng) => pick(rng, rng() < 0.5 ? BANK.vi : BANK.ni);
  const vPer = (rng) => pick(rng, PERSON_V);
  const vNat = (rng) => pick(rng, BANK.ni);
  const vTrans = (rng) => pick(rng, BANK.vt);
  const hasDe = (tks) => tks.some((t) => (t.t === 'lit' && t.v === '的') || t.suffix === '的' || t.t === 'deAdj');
  /* 时间词已经占据了时间信息，就别再挑时间类名词，否则「午后的黄昏」很怪 */
  const TIME_NOUN = new Set(['春天', '夏天', '秋天', '冬天', '清晨', '黄昏', '深夜', '午后', '傍晚', '午夜', '明天', '昨天', '未来', '过去', '刚才', '正午', '凌晨', '今夜']);
  /* 模板里取时间词：优先取能作定语的季节/时段词 */
  const pickTime = (rng) => pick(rng, BANK.time.filter((w) => w !== '刚才'));

  /* 整句装配：15% 概率绕开模板，直接按句法组合，避免满屏「X的Y」 */
  function makeAssembly(rng, kind) {
    const P = pick(rng, BANK.pronoun);
    const T = {
      subject: [
        () => P + pick(rng, BANK.adv) + vPer(rng),
        () => P + pick(rng, BANK.timeAdv) + vPer(rng),
        () => P + vPer(rng) + maybe(rng, 0.5, pick(rng, BANK.particle)),
        () => P + pick(rng, BANK.neg) + vPer(rng),
        () => P + pick(rng, BANK.adv) + vTrans(rng) + weightedPick(rng, BANK.noun)
      ],
      modifier: [
        () => modAdj(rng) + '的' + weightedPick(rng, BANK.noun),
        () => weightedPick(rng, BANK.noun) + '的' + weightedPick(rng, BANK.noun)
      ],
      vo: [
        () => vTrans(rng) + pick(rng, BANK.measure) + weightedPick(rng, BANK.noun),
        () => vTrans(rng) + pick(rng, BANK.demon) + weightedPick(rng, BANK.noun),
        () => vTrans(rng) + pick(rng, BANK.nphrase)
      ],
      coord: [
        () => weightedPick(rng, BANK.noun) + pick(rng, BANK.conj) + weightedPick(rng, BANK.noun),
        () => pick(rng, BANK.adj) + pick(rng, BANK.conj) + pick(rng, BANK.adj)
      ],
      comp: [
        () => vIntr(rng) + '得' + compSlot(rng),
        () => vTrans(rng) + '成' + weightedPick(rng, BANK.noun)
      ],
      de: [
        () => pick(rng, BANK.deAdj) + weightedPick(rng, BANK.noun),
        () => (rng() < 0.65 ? pick(rng, BANK.deAdj) : vPer(rng) + '的') + weightedPick(rng, BANK.noun)
      ],
      num: [() => pick(rng, BANK.measure) + modAdj(rng) + '的' + weightedPick(rng, BANK.noun)],
      pivot: [
        () => P + pick(rng, BANK.adv) + vPer(rng),
        () => P + pick(rng, BANK.place) + vPer(rng)
      ],
      time: [
        () => pickTime(rng) + '的' + weightedPick(rng, BANK.noun),
        () => pickTime(rng) + pick(rng, BANK.pronoun) + vPer(rng),
        () => pickTime(rng) + '的' + modAdj(rng) + weightedPick(rng, BANK.noun)
      ],
      link: [
        () => pick(rng, BANK.link) + P + vPer(rng),
        () => pick(rng, BANK.link) + P + pick(rng, BANK.neg) + vPer(rng)
      ]
    };
    const set = T[kind] || T.subject;
    return pick(rng, set)();
  }

  const STRUCTS = [
    {
      key: 'modifier', name: '偏正短语', hint: '青草池塘处处蛙',
      desc: '修饰语 + 中心语。拼贴诗的主视觉词，适合做最大号的碎片。',
      templates: ['形容词+的+名词', '名词+的+名词', '颜色+的+名词', '代词+的+名词', '指示+量词+名词', '量词+形容词+的+名词']
    },
    {
      key: 'subject', name: '主谓短语', hint: '你一来，春天就来了',
      desc: '主语 + 谓语，自带句子感，适合当标题行。',
      templates: ['代词+副词+动词', '代词+时间+动词', '代词+动词+了', '代词+不+动词', '代词+动词+名词']
    },
    {
      key: 'vo', name: '动宾短语', hint: '我打碎了一个黄昏',
      desc: '动词 + 宾语。意象密度最高的结构，多造几条总有能用的。',
      templates: ['动词+一场+名词', '动词+这个+名词', '动词+代词+的+名词', '动词+时间']
    },
    {
      key: 'coord', name: '联合短语', hint: '月亮与海风',
      desc: '两个同类词并列。适合做长句的连接件。',
      templates: ['形容词+与+形容词', '名词+与+名词', '动词+和+动词', '形容词+形容词', '名词+名词']
    },
    {
      key: 'comp', name: '动补短语', hint: '站成了一棵树',
      desc: '动词 + 补语，让句子有落点。',
      templates: ['动词+得+补语', '动词+成+名词', '动词+满+量词+名词']
    },
    {
      key: 'de', name: '的字短语', hint: '握不住的黄昏',
      desc: '带「的」的定语结构，拼贴诗的灵魂句式。',
      templates: ['形容词+的+名词', '名词+的+名词', 'X的+名词']
    },
    {
      key: 'num', name: '数量短语', hint: '一枚失眠的月亮',
      desc: '量词 + 名词，碎片感强，适合当补白。',
      templates: ['量词+形容词+的+名词', '量词+名词', '名词+的+量词+名词']
    },
    {
      key: 'pivot', name: '把字 / 兼语', hint: '把黄昏折起来',
      desc: '我 + 把 / 让 + 动作，叙事感更强。',
      templates: ['代词+副词+动词', '代词+不+动词', '代词+在站台+动词', '代词+动词+了+名词']
    },
    {
      key: 'time', name: '时间状语结构', hint: '在春天的屋顶上',
      desc: '时间 + 主谓或偏正，给整首诗一个坐标。',
      templates: ['时间+的+名词', '时间+代词+动词', '时间+的+形容词+名词', '这个+时间+的+名词']
    },
    {
      key: 'link', name: '关联结构', hint: '所以我把灯关掉了',
      desc: '用「所以 / 只是 / 仿佛」把两个短句缝起来。',
      templates: ['所以+代词+动词', '只是+代词+不+动词', '如果+时间+代词+动词', '于是+动词+了']
    }
  ];
  const STRUCT_MAP = Object.fromEntries(STRUCTS.map((s) => [s.key, s]));

  /* 收尾打磨：让随机出来的短语更像人话 */
  function polish(t, key, rng) {
    let s = t;
    /* 先收拾连词：连续出现多个并列虚词时只留一个 */
    s = s.replace(/([或与和及])(?:[或与和及]|以)+/g, '$1');
    s = s.replace(/以(?=[、或与和及])/g, '');
    /* 联合结构把连接词换成随机的一个 */
    if (key === 'coord') {
      const i = s.search(/[与和及或、]/);
      if (i > 0) s = s.slice(0, i) + pick(rng, ['与', '和', '以及', '、']) + s.slice(i + 1);
    }
    /* 「这些/那些 + 一整个」这类指示与量词撞车 */
    s = s.replace(/^(这些|那些|这个|那个)(一[场个片枚列种封朵段只行句夜]|一整个)/, (m, a, b) =>
      (a === '这些' || a === '那些' ? '那' : a.slice(0, 1)) + b);
    s = s.replace(/(这|那)(个)?(那年|那天|刚才|从前|以后|后来|明天|昨天)/g, (m, a, b, c) => c);
    s = s.replace(/^那(?=(以后|从前|后来|刚才))/g, '');
    s = s.replace(/^(这|那)(?=(白天|清晨|黄昏|深夜|午后|傍晚|午夜|正午|凌晨))/g, '');
    s = s.replace(/的(?=(白天|清晨|黄昏|深夜|午后|傍晚|午夜|正午|凌晨)$)/g, '');
    /* 叠字与叠助词 */
    s = s.replace(/([的了着过])\1+/g, '$1');
    s = s.replace(/(.)\1{2,}/g, '$1$1');
    /* 一句里最多留两个「的」，否则像绕口令 */
    let seen = 0;
    s = Array.from(s).filter((ch) => (ch === '的' ? ++seen <= 2 : true)).join('');
    /* 形容词最多留一个，堆两个就糊了 */
    const ADJ_WORDS = BANK.adj.concat(BANK.attrib).sort((a, b) => b.length - a.length);
    for (let i = 0; i < 3; i++) {
      let hit = false;
      for (let a = 0; a < ADJ_WORDS.length && !hit; a++) {
        for (let b = 0; b < ADJ_WORDS.length && !hit; b++) {
          const pair = ADJ_WORDS[a] + ADJ_WORDS[b];
          if (s.indexOf(pair) >= 0) { s = s.replace(pair, ADJ_WORDS[b]); hit = true; }
          const pair2 = ADJ_WORDS[a] + '的' + ADJ_WORDS[b];
          if (s.indexOf(pair2) >= 0) { s = s.replace(pair2, ADJ_WORDS[b]); hit = true; }
        }
      }
      if (!hit) break;
    }
    if (s.length > 13) s = Array.from(s).slice(0, 13).join('');
    return s;
  }

  /* 模板里的「词类名」：可能是简称（名词）也可能是全称（形容词），统一归一 */
  const POS_ALIAS = {
    名词: 'noun', 形容词: 'adj', 区别词: 'adj', 动词: 'verb', 副词: 'adv', 代词: 'pronoun',
    指示: 'demon', 量词: 'measure', 时间: 'time', 处所: 'place', 颜色: 'color', 补语: 'comp',
    并列: 'conj', 连接: 'link', 短语: 'nphrase', 的字结构: 'deAdj', 助词: 'particle', 否定: 'neg'
  };
  /* 模板里需要保留原字面的虚词 */
  const LITERAL = new Set(['的', '得', '成', '满', '进', '了', '着', '过', '吗', '呢', '吧', '啊', '把', '被', '在', '就', '又', '也', '还']);

  function tokenize(phrase) {
    const out = [];
    const raw = phrase.split('+');
    for (let i = 0; i < raw.length; i++) {
      const seg = raw[i];
      /* 模板里的「X」是占位符，表示这里是定语位置 */
      if (seg === 'X' || seg === 'X的') { out.push({ t: 'adj', dummy: true, suffix: seg === 'X的' ? '的' : '' }); continue; }
      const key = seg.replace(/的$/, '');
      if (key !== seg) {
        if (POS_ALIAS[key]) { out.push({ t: POS_ALIAS[key], suffix: '的' }); continue; }
        out.push({ t: 'lit', v: seg });
        continue;
      }
      if (seg === '一场' || seg === '这个') { out.push({ t: seg === '一场' ? 'measure' : 'demon', v: seg }); continue; }
      if (seg === '在站台') { out.push({ t: 'place', v: seg }); continue; }
      if (LITERAL.has(seg)) {
        /* 「的」后面的形容词其实在修饰名词，补成「形容词 + 的」 */
        if (seg === '的' && out.length && out[out.length - 1].t === 'adj' && !out[out.length - 1].suffix) {
          out[out.length - 1].suffix = '的';
          continue;
        }
        out.push({ t: 'lit', v: seg });
        continue;
      }
      if (POS_ALIAS[seg]) { out.push({ t: POS_ALIAS[seg] }); continue; }
      if (BANK[seg]) { out.push({ t: seg }); continue; }
      out.push({ t: 'lit', v: seg });
    }
    return out;
  }

  function generatePhrase(typeKey, seedStr) {
    /* 太短的（比如光秃秃一个双字名词）重摇，最多三次 */
    let res = null;
    for (let i = 0; i < 4; i++) {
      res = buildPhrase(typeKey, seedStr + (i ? '#' + i : ''));
      if (Array.from(res.text).length >= 4) break;
    }
    return res;
  }

  function buildPhrase(typeKey, seedStr) {
    const rng = rnd(seedStr);
    const st = STRUCT_MAP[typeKey] || pick(rng, STRUCTS);

    if (rng() < 0.15) {
      const text = polish(makeAssembly(rng, st.key), st.key, rng);
      return { text, type: st.key, typeName: st.name, html: text };
    }

    const tpl = pick(rng, st.templates);
    const tokens = tokenize(tpl);
    /* 判断每个槽位是不是在修饰名词（决定用定语形容词 / 定语名词） */
    const isMod = tokens.map((tok, i) => {
      const next = tokens[i + 1];
      if (!next) return false;
      const nounHasDe = next.t === 'noun' && (next.suffix === '的' || tokens[i + 2] && tokens[i + 2].t === 'lit' && tokens[i + 2].v === '的');
      /* 带「的」的形式：本身就是定语 */
      if (tok.suffix === '的') return true;
      /* 「名词 + 的」也是定语 */
      if (tok.t === 'noun' && next.t === 'lit' && next.v === '的') return true;
      /* 量词 / 指示后面的形容词在修饰名词 */
      if (tok.t === 'adj' && tokens[i - 1] && ['measure', 'demon', 'color'].indexOf(tokens[i - 1].t) >= 0) return true;
      /* 形容词后面直接跟名词，也是定语（模板漏写「的」时补上） */
      if (tok.t === 'adj' && next.t === 'noun') return true;
      /* 名词本身带「的」时，前面的形容词也是定语 */
      if (tok.t === 'adj' && nounHasDe) return true;
      return false;
    });
    /* 量词与名词的搭配：「那些一只」这类指示错位要修掉 */
    const measurePos = tokens.findIndex((t) => t.t === 'measure');
    const demonPos = tokens.findIndex((t) => t.t === 'demon');

    /* 第一遍：先把名词槽位定下来（量词要跟它搭） */
    const explicitMeasure = (tokens.find((t) => t.t === 'measure') || {}).v ||
      (tpl.indexOf('一场') >= 0 ? '一场' : '');
    const nounVals = tokens.map((tok) => {
      if (tok.t !== 'noun') return '';
      /* 明确写了「一场」就优先配事件类名词 */
      if (explicitMeasure === '一场' && rng() < 0.7) return pick(rng, EVENT_NOUN);
      if (demonPos >= 0 || /时间|这个|那|量词/.test(tpl) || (tokens[0] && tokens[0].t === 'time')) {
        /* 指示 / 时间 / 量词结构里配时间名词会读成「这个那年的清晨」 */
        let n = weightedPick(rng, BANK.noun);
        for (let g = 0; g < 8 && TIME_NOUN.has(n); g++) n = weightedPick(rng, BANK.noun);
        return n;
      }
      return weightedPick(rng, BANK.noun);
    });
    /* 第二遍：填所有槽位（量词需要知道它修饰的名词） */
    const parts = tokens.map((tok, idx) => {
      let val;
      if (tok.dummy) val = modAdj(rng);            /* 模板里的 X 泛指一个定语 */
      else if (tok.v) val = tok.v;
      else if (tok.t === 'adj') val = isMod[idx] ? modAdj(rng) : pick(rng, BANK.adj);
      else if (tok.t === 'verb') {
        /* 按后接成分判断用哪一类动词 */
        const nx = tokens[idx + 1];
        const after = tokens[idx + 2];
        if (nx && nx.t === 'lit' && nx.v === '满') val = pick(rng, BANK.full).replace(/满$/, '');
        else if (nx && nx.t === 'lit' && nx.v === '成') val = pick(rng, BANK.vtVague);
        else {
        const takesObj = !!nx && (nx.t === 'noun' || nx.t === 'measure' || nx.t === 'demon' || nx.t === 'nphrase' ||
          nx.t === 'pronoun' || nx.t === 'deAdj' ||
          (nx.t === 'lit' && ['了', '着', '过'].indexOf(nx.v) >= 0) ||
          (nx.t === 'lit' && nx.v === '的' && tokens[idx + 2] && tokens[idx + 2].t === 'noun'));
          if (takesObj) val = vTrans(rng);
          else {
            /* 主语是「我 / 你 / 她」时用人称动词；时间词开头且带「的」的偏正句用事物动词 */
            const personSubj = tokens.slice(0, idx).some((t) => t.t === 'pronoun');
            const timeStart = tokens[0] && tokens[0].t === 'time' && hasDe(tokens);
            val = personSubj ? vPer(rng) : (timeStart ? vNat(rng) : vIntr(rng));
          }
        }
        if (!val) val = vIntr(rng);
      }
      else if (tok.t === 'place') val = pick(rng, BANK.place);
      else if (tok.t === 'time') val = pickTime(rng);
      else if (tok.t === 'noun') val = nounVals[idx];
      else if (tok.t === 'measure') {
        /* 量词要跟后面的名词搭得上：没把握就用「一个」 */
        const head = nounVals.slice(idx + 1).find((n) => n) || '';
        const explicit = tok.v && (head === '' || MEASURE_FOR[tok.v] ? tok.v : '');
        const mw = explicit || (head ? measureMatch(rng, head) : pick(rng, BANK.measure));
        val = (demonPos < 0 && rng() < 0.14) ? pick(rng, ['这', '那']) + mw : mw;
      } else if (tok.t === 'comp') {
        val = compSlot(rng);
      } else val = pick(rng, BANK[tok.t] || BANK.noun);
      /* 量词后面直接跟形容词时补一个「的」，否则读起来别扭；形容词直接修饰名词时也补 */
      let pre = '';
      const prevTok = tokens[idx - 1];
      if (tok.t === 'adj' && prevTok && ['measure', 'demon', 'color'].indexOf(prevTok.t) >= 0) pre = '的';
      let suf = tok.suffix || '';
      if (tok.t === 'adj' && !suf && tokens[idx + 1] && tokens[idx + 1].t === 'noun') suf = '的';
      return { t: tok.t, v: pre + val + suf };
    });

    if (st.key === 'coord' && !tokens.some((t) => t.t === 'conj') && !/[或与和及]/.test(tpl)) {
      parts.splice(1, 0, { t: 'conj', v: pick(rng, BANK.conj) });
    }
    /* 同一个词在一句里出现两次（联合结构、复读）就换掉 */
    const idxs = parts.map((p, i) => (p.t === 'conj' || p.t === 'lit' ? -1 : i)).filter((i) => i >= 0);
    for (let k = 0; k + 1 < idxs.length; k++) {
      const a = parts[idxs[k]], b = parts[idxs[k + 1]];
      const av = a.v.replace(/[的了着过]$/, ''), bv = b.v.replace(/[的了着过]$/, '');
      if (av && av === bv) b.v = b.t === 'adj' ? pick(rng, BANK.adj) : weightedPick(rng, BANK.noun);
    }
    /* 「名词 + 的 + 同一个名词」这种复读也修掉 */
    for (let i = 0; i + 2 < parts.length; i++) {
      if (parts[i].t === 'noun' && parts[i + 1].v === '的' && parts[i + 2].t === 'noun' && parts[i].v === parts[i + 2].v) {
        parts[i + 2].v = weightedPick(rng, BANK.noun);
      }
    }

    const text0 = parts.map((p) => p.v).join('');
    /* 模板里有「的」但名词没带上，补一个，免得出来光秃秃的「暗红黄昏」 */
    let text1 = text0;
    const hasDePart = parts.some((p) => p.t === 'lit' && p.v === '的');
    if (!hasDePart && tokens.some((t) => t.t === 'lit' && t.v === '的')) {
      const lastNoun = parts.map((p, i) => (p.t === 'noun' ? i : -1)).filter((i) => i >= 0).pop();
      if (lastNoun != null) {
        parts[lastNoun].v += '的';
        text1 = parts.map((p) => p.v).join('');
      }
    }
    const text = polish(text1, st.key, rng);
    const strong = new Set(['noun', 'verb', 'adj', 'deAdj', 'nphrase', 'time', 'place', 'color', 'measure']);
    const html = parts.map((p) => (strong.has(p.t) ? '<b>' + p.v + '</b>' : '<i>' + p.v + '</i>')).join('');
    return { text, type: st.key, typeName: st.name, html };
  }

  /* ========================= 3. 拼贴板 ========================= */

  const boardEl = $('#board');
  const boardEmptyEl = $('#boardEmpty');
  const toolsEl = $('#pieceTools');
  const historyListEl = $('#historyList');
  const fragTrayEl = $('#fragTray');
  const imageInput = $('#imageInput');

  const PALETTE = ['#f3ead8', '#ffffff', '#efe0c4', '#e7eeea', '#f6e2e0', '#e6e9f2', '#2a2622'];
  const FONTS = ['serif', 'kai', 'fang', 'hei'];
  const FONT_LABEL = { serif: '宋 / 衬线', kai: '楷体', fang: '圆体', hei: '黑体' };

  const board = {
    tpl: 'plain',            /* 背景模板 key */
    tplSeed: 0,              /* 纹理随机种子（🎲 会换） */
    texScale: 1,             /* 纸纹疏密倍率（背景模板弹窗里可调） */
    pieces: [], selected: null, z: 10, undo: [], redo: []
  };

  /* —— 印刷质感：所有贴纸共用的一套参数 —— */
  const FX_TEX = [
    { key: 'none', name: '光面' },
    { key: 'fiber', name: '纸纹' },
    { key: 'crease', name: '褶皱' },
    { key: 'aged', name: '旧纸' },
    { key: 'news', name: '报纸' },
    { key: 'exam', name: '试卷' },
    { key: 'folded', name: '牛皮' },
    { key: 'carbon', name: '复写' }
  ];
  /* 预设：一键出味道（纸感 + 褶皱 + 墨感 + 纸色） */
  const FX_PRESETS = [
    { name: '干净',   tex: 'none',   fold: 0,  ink: 8,  inkAmt: 25, palette: ['#ffffff', '#fbf7ec', '#f3ead8'] },
    { name: '试卷',   tex: 'exam',   fold: 22, ink: 46, inkAmt: 40, palette: ['#fbf8f0', '#f6f3ea', '#ffffff'] },
    { name: '报纸',   tex: 'news',   fold: 30, ink: 58, inkAmt: 55, palette: ['#efeade', '#e9e4d6', '#f4f0e6'] },
    { name: '旧纸',   tex: 'aged',   fold: 45, ink: 52, inkAmt: 45, palette: ['#f0e4c8', '#efe0c4', '#f2e8d2'] },
    { name: '揉皱了', tex: 'crease', fold: 78, ink: 26, inkAmt: 25, palette: ['#f3ead8', '#efe6d2', '#ffffff'] },
    { name: '牛皮纸', tex: 'folded', fold: 55, ink: 34, inkAmt: 35, palette: ['#e2c79b', '#d8bb8c', '#e8d2ac'] },
    { name: '复写纸', tex: 'carbon', fold: 40, ink: 74, inkAmt: 65, palette: ['#e8ecf1', '#dfe5ec', '#f2f4f7'] },
    { name: '墨迹重', tex: 'fiber',  fold: 18, ink: 88, inkAmt: 80, palette: ['#fbf7ec', '#fffdf8'] },
    { name: '干净纸纹', tex: 'fiber', fold: 12, ink: 14, inkAmt: 20, palette: ['#ffffff', '#fdfaf4'] }
  ];
  function randomFxPreset() {
    return FX_PRESETS[Math.floor(Math.random() * FX_PRESETS.length)];
  }
  const IMG = new Map();          /* imgId -> dataURL */
  const imgCache = new Map();     /* dataURL -> HTMLImageElement */

  function stateJSON() {
    return JSON.stringify({ pieces: board.pieces, z: board.z });
  }
  function snapshot() {
    board.undo.push(stateJSON());
    if (board.undo.length > 60) board.undo.shift();
    board.redo.length = 0;
  }
  function applyState(json) {
    const s = JSON.parse(json);
    board.pieces = s.pieces;
    board.z = s.z;
    board.selected = null;
    renderPieces();
    persist();
  }
  function undo() {
    if (!board.undo.length) return toast('没有可撤销的了');
    board.redo.push(stateJSON());
    applyState(board.undo.pop());
    toast('已撤销');
  }
  function redo() {
    if (!board.redo.length) return toast('没有可重做的了');
    board.undo.push(stateJSON());
    applyState(board.redo.pop());
  }

  /* 剪下的字贴的纸背颜色：偏旧纸，别抢戏 */
  const BACKING = ['#f3ead8', '#efe0c4', '#eadfc8', '#f6ece0', '#e9e2d2'];
  /* 纸片外形：横向圆角 + 纵向纤维状撕口 */
  function paperClip(seedStr) {
    const rng = rnd('clip' + seedStr);
    const left = [];
    const right = [];
    for (let i = 0; i <= 10; i++) {
      const inward = (i === 0 || i === 10) ? 1.2 : 1 + rng() * 3.4;
      left.push(round2(inward) + '% ' + (i * 10) + '%');
      right.push(round2(100 - inward) + '% ' + ((10 - i) * 10) + '%');
    }
    return 'polygon(' + left.concat(right).join(',') + ')';
  }

  /* 带纸背的剪字：四边都是不规则的剪口 */
  function tornRect(seedStr) {
    const rng = rnd('torn' + seedStr);
    const pts = [];
    const N = 7;
    for (let i = 0; i <= N; i++) pts.push(round2(rng() * 3.2) + '% ' + round2((i / N) * 100) + '%');
    for (let i = 1; i <= N; i++) pts.push(round2(100 - rng() * 3.2) + '% ' + round2(100 - (i / N) * 100) + '%');
    return 'polygon(' + pts.join(',') + ')';
  }

  function fontFamilyOf(key) {
    const map = { serif: 'var(--font-serif)', kai: 'var(--font-kai)', fang: 'var(--font-fang)', hei: 'var(--font-hei)' };
    return map[key] || map.serif;
  }

  /* 文字尺寸估算：按最宽行字符数折算 */
  function textMetrics(text, fontPx) {
    const chars = Array.from(text);
    const n = chars.length;
    const w = Math.round(clamp(fontPx * Math.max(n, n / 1.9 + 1.2) + fontPx * 0.85 + 16, 56, 430));
    const h = Math.round(clamp(fontPx * 1.55 + 16, 38, 128));
    return { w, h };
  }

  /* —— 质感面板 —— */
  function buildTexRow() {
    const row = $('#texRow');
    if (!row) return;
    row.innerHTML = '';
    FX_TEX.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.name;
      b.dataset.tex = t.key;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const p = board.selected && pieceById(board.selected);
        if (!p || p.kind !== 'text') return;
        snapshot();
        p.tex = t.key;
        refreshFx(p);
        $$('#texRow button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tex === t.key)));
        persist();
      });
      row.appendChild(b);
    });
    row.dataset.built = '1';
  }

  function bindFx() {
    const fr = $('#foldRange');
    if (fr) {
      fr.addEventListener('input', () => {
        const p = board.selected && pieceById(board.selected);
        if (!p || p.kind !== 'text') return;
        p.fold = Number(fr.value);
        const v = $('#foldVal');
        if (v) v.textContent = fr.value;
        refreshFx(p);
      });
      fr.addEventListener('change', () => persist());
    }
    const ir = $('#inkRange');
    if (ir) {
      ir.addEventListener('input', () => {
        const p = board.selected && pieceById(board.selected);
        if (!p || p.kind !== 'text') return;
        p.ink = Number(ir.value);
        const v = $('#inkVal');
        if (v) v.textContent = ir.value;
        refreshFx(p);
      });
      ir.addEventListener('change', () => persist());
    }
    const iar = $('#inkAmtRange');
    if (iar) {
      iar.addEventListener('input', () => {
        const p = board.selected && pieceById(board.selected);
        if (!p || p.kind !== 'text') return;
        p.inkAmt = Number(iar.value);
        const v = $('#inkAmtVal');
        if (v) v.textContent = iar.value;
        refreshFx(p);
      });
      iar.addEventListener('change', () => persist());
    }

    const fxRow = $('#fxRow');
    if (fxRow) {
      fxRow.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const p = board.selected && pieceById(board.selected);
        if (!p || p.kind !== 'text') return;
        const act = btn.dataset.act;
        if (act === 'dice') {
          snapshot();
          const pre = randomFxPreset();
          p.tex = pre.tex;
          p.fold = pre.fold;
          p.ink = pre.ink;
          if (pre.inkAmt != null) p.inkAmt = pre.inkAmt;
          p.palette = pick(rnd(uid()), pre.palette);
          p.fg = p.palette === '#2a2622' ? '#f6efe3' : '#241f1a';
          renderPieces();
          select(p.id);
          persist();
          toast('质感：' + pre.name);
        } else if (act === 'applyAll') {
          snapshot();
          let n = 0;
          for (const q of board.pieces) {
            if (q.kind !== 'text' || q.id === p.id) continue;
            q.tex = p.tex; q.fold = p.fold; q.ink = p.ink; q.inkAmt = p.inkAmt;
            if (p.palette !== '#2a2622') q.palette = p.palette;
            n++;
          }
          renderPieces();
          select(p.id);
          persist();
          toast('已应用到另外 ' + n + ' 片');
        }
      });
    }
  }

  /* —— 印刷质感的默认值：按预设随机取一套 —— */
  function defaultFx(rng) {
    const pre = FX_PRESETS[Math.floor(rng() * FX_PRESETS.length)];
    return {
      tex: pre.tex,
      fold: pre.fold,
      ink: pre.ink,
      palette: pick(rng, pre.palette)
    };
  }
  /* 老草稿没有质感字段时，按它的纸色反推一套，保证观感一致 */
  function fxFromPalette(pal) {
    if (pal === '#2a2622') return { tex: 'crease', fold: 30, ink: 20, palette: pal };
    if (pal === '#ffffff' || pal === '#fffdf8') return { tex: 'none', fold: 0, ink: 8, palette: pal };
    if (pal === '#efe0c4' || pal === '#f3ead8') return { tex: 'aged', fold: 40, ink: 40, palette: pal };
    return { tex: 'fiber', fold: 20, ink: 24, palette: pal };
  }

  function addTextPiece(text, opts) {
    if (!text) return null;
    opts = opts || {};
    const seed = uid();
    const rng = rnd(seed);
    const fx = opts.fx || defaultFx(rng);
    const palette = opts.palette || fx.palette || pick(rng, PALETTE);
    const dark = palette === '#2a2622';
    const fontPx = opts.fontPx || 17 + Math.floor(rng() * 16);
    const m = textMetrics(text, fontPx);
    const p = {
      id: seed,
      kind: 'text',
      text: String(text),
      x: opts.x != null ? opts.x : round2(6 + rng() * 62),
      y: opts.y != null ? opts.y : round2(8 + rng() * 58),
      rot: opts.rot != null ? opts.rot : round2((rng() * 2 - 1) * 9),
      w: m.w, h: m.h, baseW: m.w, baseH: m.h,
      scale: 1,
      z: ++board.z,
      palette,
      fg: dark ? '#f6efe3' : '#241f1a',
      font: opts.font || pick(rng, ['serif', 'serif', 'kai', 'fang', 'hei']),
      fontPx,
      tex: fx.tex || 'none',
      fold: fx.fold == null ? 20 : fx.fold,
      ink: fx.ink == null ? 20 : fx.ink,
      inkAmt: fx.inkAmt == null ? 45 : fx.inkAmt,
      tape: opts.tape != null ? opts.tape : rng() < 0.3,
      tapePos: opts.tapePos || pick(rng, ['tl', 'tr', 'bl', 'br']),
      flat: false
    };
    board.pieces.push(p);
    return p;
  }

  function addImagePiece(frag, opts) {
    opts = opts || {};
    if (frag.dataUrl && frag.imgId) IMG.set(frag.imgId, frag.dataUrl);
    const seed = uid();
    const rng = rnd(seed);
    const h = opts.h || clamp(Math.round(44), 30, 76);
    const w = Math.round(clamp(h * (frag.ratio || 3), 60, 320));
    const palette = opts.palette || pick(rng, BACKING);
    const p = {
      id: seed,
      kind: 'image',
      imgId: frag.imgId,
      x: opts.x != null ? opts.x : round2(8 + rng() * 60),
      y: opts.y != null ? opts.y : round2(10 + rng() * 56),
      rot: opts.rot != null ? opts.rot : round2((rng() * 2 - 1) * 8),
      w, h, baseW: w, baseH: h,
      scale: 1,
      z: ++board.z,
      palette,
      backing: true,
      tape: false,
      tapePos: pick(rng, ['tl', 'tr', 'bl', 'br']),
      flat: true,
      clipSeed: seed
    };
    board.pieces.push(p);
    return p;
  }

  /* —— 渲染 —— */
  function renderPieces() {
    boardEl.querySelectorAll('.piece').forEach((n) => n.remove());
    for (const p of board.pieces) boardEl.appendChild(buildPieceEl(p));
    boardEmptyEl.style.display = board.pieces.length ? 'none' : 'grid';
    renderTools();
  }

  function buildPieceEl(p) {
    const el = document.createElement('div');
    el.className = 'piece';
    el.dataset.id = p.id;
    el.style.width = p.baseW + 'px';
    el.style.height = p.baseH + 'px';
    el.style.zIndex = String(p.z);
    applyTransform(el, p);

    const face = document.createElement('div');
    face.className = 'piece__face';

    if (p.kind === 'text') {
      face.style.background = p.palette;
      face.style.clipPath = paperClip(p.flat ? 'flat' + p.id : p.id);
      /* ① 纸纹：跟底色 multiply 混在一起 */
      if (p.tex && p.tex !== 'none' && window.PaperLab) {
        face.style.backgroundImage = 'url(' + PaperLab.textureUrl(p.tex, { seed: 0 }) + ')';
        face.style.backgroundSize = (p.tex === 'crease' || p.tex === 'folded' || p.tex === 'aged' || p.tex === 'carbon') ? '190px' : '120px';
        face.style.backgroundBlendMode = 'multiply';
        face.style.backgroundRepeat = 'repeat';
      } else {
        face.style.backgroundImage = 'none';
      }

      const t = document.createElement('div');
      t.className = 'piece__text';
      t.textContent = p.text;
      t.style.fontSize = p.fontPx + 'px';
      t.style.color = p.fg;
      t.style.fontFamily = fontFamilyOf(p.font);
      t.style.lineHeight = '1.24';
      t.style.whiteSpace = 'pre-wrap';
      t.style.wordBreak = 'break-word';
      face.appendChild(t);

      const g = document.createElement('div');
      g.className = 'piece__grain';
      face.appendChild(g);
      if (!p.flat) {
        const te = document.createElement('div'); te.className = 'piece__tear'; face.appendChild(te);
      }
      /* 纸纹与墨迹交给同一套函数处理，保证和导出、和调参时完全一致 */
      applyPieceTex(face, p);
      applyPieceGrain(face, p);
      applyPieceInk(face, t, p);
    } else {
      const src = IMG.get(p.imgId);
      const img = document.createElement('img');
      img.className = 'piece__img';
      img.alt = '';
      img.draggable = false;
      if (src) img.src = src;
      /* 剪下来的字贴在一小片纸上（纸背），深色底板上才看得清 */
      face.style.background = p.backing === false ? 'transparent' : (p.palette || '#f3ead8');
      face.style.clipPath = p.backing === false
        ? paperClip(p.clipSeed || p.id)
        : tornRect(p.clipSeed || p.id);
      face.style.filter = p.backing === false
        ? 'drop-shadow(0 1px 1px rgba(0,0,0,.6)) drop-shadow(0 3px 5px rgba(0,0,0,.35))'
        : 'drop-shadow(0 3px 5px rgba(0,0,0,.4))';
      if (p.backing !== false) {
        const g = document.createElement('div');
        g.className = 'piece__grain';
        face.appendChild(g);
      }
      face.appendChild(img);
    }

    if (p.tape) {
      const tp = document.createElement('span');
      tp.className = 'tape tape--' + (p.tapePos || 'tl');
      face.appendChild(tp);
    }

    const frame = document.createElement('div');
    frame.className = 'piece__frame';
    frame.innerHTML = '<i></i>';
    face.appendChild(frame);

    el.appendChild(face);
    if (board.selected === p.id) el.classList.add('is-selected');
    return el;
  }

  function applyTransform(el, p) {
    el.style.transform = 'translate(-50%, -50%) rotate(' + p.rot + 'deg) scale(' + p.scale + ')';
    el.style.left = p.x + '%';
    el.style.top = p.y + '%';
  }

  const pieceEl = (id) => boardEl.querySelector('.piece[data-id="' + id + '"]');
  const pieceById = (id) => board.pieces.find((p) => p.id === id);

  function refreshPiece(p) {
    const el = pieceEl(p.id);
    if (!el) return;
    el.style.width = p.baseW + 'px';
    el.style.height = p.baseH + 'px';
    applyTransform(el, p);
    const face = el.querySelector('.piece__face');
    if (face && p.kind === 'text') face.style.background = p.palette;
    const t = el.querySelector('.piece__text');
    if (t && p.kind === 'text') {
      t.textContent = p.text;
      t.style.fontSize = p.fontPx + 'px';
      t.style.fontFamily = fontFamilyOf(p.font);
      t.style.color = p.fg;
      const hi = el.querySelector('.piece__ink-hi');
      if (hi) hi.textContent = p.text;
    }
  }

  /* 重画一块贴纸的质感层（纸纹 / 墨迹 / 褶皱），参数变了就调它 */
  function refreshFx(p) {
    const el = pieceEl(p.id);
    if (!el || p.kind !== 'text') return;
    const face = el.querySelector('.piece__face');
    if (!face) return;
    const t = el.querySelector('.piece__text');

    face.style.background = p.palette;
    applyPieceTex(face, p);
    applyPieceInk(face, t, p);
    applyPieceGrain(face, p);
  }

  /* 纸纹层：底色 + 纹理 multiply。
     贴纸上的纸纹基准 150px（≈贴纸自身大小），背景的基准由模板的 texSize 给。 */
  function applyPieceTex(face, p) {
    if (p.tex && p.tex !== 'none' && window.PaperLab) {
      face.style.backgroundImage = 'url(' + PaperLab.textureUrl(p.tex, { seed: 0 }) + ')';
      face.style.backgroundSize = Math.round(clamp(150 * (board.texScale || 1), 60, 600)) + 'px';
      face.style.backgroundBlendMode = 'multiply';
      face.style.backgroundRepeat = 'repeat';
    } else {
      face.style.backgroundImage = 'none';
    }
  }

  /* 褶皱层：纤维（颗粒）+ 两层交叉折线（一层转 90°，叠出真正的揉皱感）。
     只靠颗粒看不出来，必须有成片的折痕光照。 */
  function applyPieceGrain(face, p) {
    const g = face.querySelector('.piece__grain');
    if (!g || !window.PaperLab) return;
    const v = clamp((p.fold || 0) / 100, 0, 1);
    if (v <= 0.001) {
      g.style.backgroundImage = 'none';
      g.style.opacity = '0';
      g.style.transform = 'none';
      return;
    }
    const foldA = PaperLab.textureUrl('kiev', { seed: 0 });
    const foldB = PaperLab.textureUrl('kiev', { seed: 3 });
    const fiber = PaperLab.textureUrl('fiber', { seed: 0 });
    const foldPx = Math.round(620 - v * 260);
    g.style.backgroundImage = 'url(' + foldA + '), url(' + foldB + '), url(' + fiber + ')';
    g.style.backgroundSize = foldPx + 'px, ' + Math.round(foldPx * 1.35) + 'px, 170px';
    g.style.backgroundRepeat = 'repeat, repeat, repeat';
    g.style.backgroundPosition = '0 0, 37px 61px, 0 0';
    g.style.opacity = String(0.34 + v * 0.46);
    /* 褶皱够强时把整层转 90°，让两组折痕交叉（CSS 的 background 不能单独旋转） */
    g.style.transformOrigin = 'center';
    g.style.transform = v > 0.35 ? 'rotate(90deg) scale(1.42)' : 'none';
  }

  /* 墨迹层：高光（字下面、很淡）+ 颗粒啃边（字上面） */
  function applyPieceInk(face, t, p) {
    if (!t) return;
    let hi = face.querySelector('.piece__ink-hi');
    let wear = face.querySelector('.piece__ink-wear');
    if (p.ink > 0) {
      const off = (0.25 + (p.ink / 100) * 0.95).toFixed(2);
      if (!hi) {
        hi = document.createElement('div');
        hi.className = 'piece__ink-hi';
        face.insertBefore(hi, t);
      }
      hi.textContent = p.text;
      hi.style.fontSize = t.style.fontSize;
      hi.style.fontFamily = t.style.fontFamily;
      hi.style.lineHeight = t.style.lineHeight;
      hi.style.whiteSpace = t.style.whiteSpace;
      hi.style.wordBreak = t.style.wordBreak;
      hi.style.setProperty('--ink-off', off + 'px');
      hi.style.opacity = String(clamp(0.14 + p.ink / 420, 0.14, 0.4));

      if (!wear) {
        wear = document.createElement('div');
        wear.className = 'piece__ink-wear';
        face.appendChild(wear);
      }
      if (window.PaperLab) {
        /* 用「缺墨」蒙版：中灰底 + 细密亮点，只会啃掉字的边缘，不会把整块字洗白
           （之前用纤维纹当蒙版就是"洗白"那个问题）。浓淡由「用量」单独控制。 */
        wear.style.backgroundImage = 'url(' + PaperLab.textureUrl('worn', { seed: 0 }) + ')';
      }
      const amt = clamp((p.inkAmt == null ? 45 : p.inkAmt) / 100, 0, 1);
      wear.style.opacity = String(clamp(amt * 0.62, 0, 0.62));
    } else {
      if (hi) hi.remove();
      if (wear) wear.remove();
    }
    /* 字身永远保持纯色，不做混合 —— 这样才不会发灰 */
    t.style.mixBlendMode = '';
    t.style.opacity = '';
  }

  /* —— 选中 / 工具条 —— */
  function select(id) {
    board.selected = id;
    boardEl.querySelectorAll('.piece').forEach((el) => el.classList.toggle('is-selected', el.dataset.id === id));
    renderTools();
  }
  function deselect() {
    board.selected = null;
    boardEl.querySelectorAll('.piece').forEach((el) => el.classList.remove('is-selected'));
    toolsEl.classList.remove('is-open');
  }

  function renderTools() {
    const p = board.selected && pieceById(board.selected);
    if (!p) { toolsEl.classList.remove('is-open'); return; }
    toolsEl.classList.add('is-open');
    const tb = toolsEl.querySelector('[data-act="tape"]');
    if (tb) tb.setAttribute('aria-pressed', String(!!p.tape));
    const fb = toolsEl.querySelector('[data-act="flat"]');
    if (fb) fb.setAttribute('aria-pressed', String(!!p.flat));
    const bb = toolsEl.querySelector('[data-act="backing"]');
    if (bb) {
      const on = p.backing !== false;
      bb.setAttribute('aria-pressed', String(on));
      bb.style.display = p.kind === 'image' ? 'grid' : 'none';
    }
    /* 质感面板：参数跟着当前碎片走 */
    const fxRow = $('#fxRow');
    if (fxRow) {
      const isText = p.kind === 'text';
      fxRow.hidden = !isText;
      if (isText) {
        const tRow = $('#texRow');
        if (tRow) {
          if (!tRow.dataset.built) buildTexRow();
          $$('#texRow button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tex === (p.tex || 'none'))));
        }
        const fr = $('#foldRange');
        if (fr && document.activeElement !== fr) fr.value = String(p.fold || 0);
        const fv = $('#foldVal');
        if (fv) fv.textContent = String(p.fold || 0);
        const ir = $('#inkRange');
        if (ir && document.activeElement !== ir) ir.value = String(p.ink || 0);
        const iv = $('#inkVal');
        if (iv) iv.textContent = String(p.ink || 0);
        const iar = $('#inkAmtRange');
        if (iar && document.activeElement !== iar) iar.value = String(p.inkAmt == null ? 45 : p.inkAmt);
        const iav = $('#inkAmtVal');
        if (iav) iav.textContent = String(p.inkAmt == null ? 45 : p.inkAmt);
      }
    }
    const fxb = toolsEl.querySelector('[data-act="fx"]');
    if (fxb) {
      fxb.setAttribute('aria-pressed', String(!fxRow.hidden));
      fxb.style.display = p.kind === 'text' ? 'grid' : 'none';
    }
    const zr = toolsEl.querySelector('#zoomRange');
    if (zr) zr.value = String(Math.round(p.scale * 100));
    const zv = toolsEl.querySelector('#zoomVal');
    if (zv) zv.textContent = Math.round(p.scale * 100) + '%';

    layoutTools();
  }

  /* 浮动工具条定位
     统一在「视口坐标系」里算：拿到碎片和板子的实际矩形，再换算成定位元素内部的像素值，
     这样不管定位祖先是哪一个、也不管板子有没有内边距，结果都一样。 */
  function layoutTools() {
    const p = board.selected && pieceById(board.selected);
    const el = p && pieceEl(p.id);
    if (!p || !el) { toolsEl.classList.remove('is-open'); return; }

    const boardRect = boardEl.getBoundingClientRect();
    const pr = el.getBoundingClientRect();
    const T = toolsEl.offsetWidth, TT = toolsEl.offsetHeight;
    const GAP = 10;                      /* 工具条与碎片之间的间距 */
    const EDGE = 8;                      /* 与板子边缘至少留这么多 */

    /* 碎片中心（夹进板内，防止碎片被拖到板外后工具条贴不住） */
    const cx = clamp(pr.left + pr.width / 2, boardRect.left + 4, boardRect.right - 4);
    const cy = clamp(pr.top + pr.height / 2, boardRect.top + 4, boardRect.bottom - 4);

    /* 竖直：默认放碎片上方，塞不下就挪到下方 */
    let top = cy - pr.height / 2 - TT - GAP;
    let below = false;
    if (top < boardRect.top + EDGE) {
      top = cy + pr.height / 2 + GAP;
      below = true;
    }
    top = clamp(top, boardRect.top + EDGE, boardRect.bottom - TT - EDGE);

    /* 水平：跟碎片中心对齐；贴边时夹回板内，小尖角改由 --arrow-x 指过去 */
    const left = clamp(cx - T / 2, boardRect.left + EDGE, boardRect.right - T - EDGE);
    const arrowX = clamp(cx - left, 14, Math.max(14, T - 14));

    /* 视口坐标 → 相对定位祖先的坐标 */
    const parent = toolsEl.offsetParent;
    const base = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
    const sx = parent ? parent.scrollLeft : window.scrollX;
    const sy = parent ? parent.scrollTop : window.scrollY;
    toolsEl.style.left = Math.round(left - base.left + sx) + 'px';
    toolsEl.style.top = Math.round(top - base.top + sy) + 'px';
    toolsEl.style.setProperty('--arrow-x', Math.round(arrowX) + 'px');
    toolsEl.dataset.below = below ? '1' : '0';
  }

  /* —— 拖拽 / 缩放 —— */
  let drag = null;

  boardEl.addEventListener('pointerdown', (e) => {
    if (e.target.isContentEditable) return;
    const el = e.target.closest('.piece');
    if (!el) { deselect(); return; }
    const p = pieceById(el.dataset.id);
    if (!p) return;

    const frame = e.target.closest('.piece__frame');
    const mode = frame && e.target.tagName === 'I' ? 'scale' : 'move';

    select(p.id);
    p.z = ++board.z;
    el.style.zIndex = String(p.z);

    drag = {
      id: p.id, mode,
      startX: e.clientX, startY: e.clientY,
      px: p.x, py: p.y, scale: p.scale,
      w: p.baseW, h: p.baseH,
      rect: boardEl.getBoundingClientRect(),
      started: false,
      pointerId: e.pointerId
    };
    el.classList.add('is-dragging');
    renderTools();
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pieceById(drag.id);
    if (!p) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.started) {
      if (Math.abs(dx) + Math.abs(dy) <= 3) return;   /* 还当是点击 */
      drag.started = true;
      snapshot();                                      /* 整段拖拽只记一次撤销 */
    }

    if (drag.mode === 'move') {
      p.x = round2(clamp(drag.px + (dx / drag.rect.width) * 100, -6, 106));
      p.y = round2(clamp(drag.py + (dy / drag.rect.height) * 100, -6, 106));
    } else {
      const rad = (p.rot * Math.PI) / 180;
      const rx = dx * Math.cos(rad) + dy * Math.sin(rad);
      const ry = -dx * Math.sin(rad) + dy * Math.cos(rad);
      const base = Math.max(drag.w, drag.h);
      p.scale = round2(clamp(drag.scale * (1 + (rx + ry) / (base * 1.1)), 0.28, 3.6));
    }
    const el = pieceEl(p.id);
    if (el) applyTransform(el, p);
    renderTools();
  });

  function endDrag() {
    if (!drag) return;
    const el = pieceEl(drag.id);
    if (el) el.classList.remove('is-dragging');
    try { boardEl.releasePointerCapture(drag.pointerId); } catch (err) { /* ignore */ }
    drag = null;
    persist();
    renderTools();
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  /* —— 双击改字 —— */
  boardEl.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.piece');
    if (!el) return;
    const p = pieceById(el.dataset.id);
    if (!p || p.kind !== 'text') return;
    const t = el.querySelector('.piece__text');
    t.contentEditable = 'true';
    t.focus();
    const range = document.createRange();
    range.selectNodeContents(t);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finish = () => {
      t.contentEditable = 'false';
      const txt = (t.innerText || '').replace(/\s+/g, ' ').trim();
      if (txt && txt !== p.text) {
        snapshot();
        p.text = txt;
        const m = textMetrics(txt, p.fontPx);
        p.baseW = m.w; p.baseH = m.h;
        refreshPiece(p);
      } else {
        t.textContent = p.text;
      }
      persist();
    };
    t.addEventListener('blur', finish, { once: true });
    t.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); t.blur(); }
      if (ev.key === 'Escape') { t.textContent = p.text; t.blur(); }
    });
  });

  /* —— 工具条动作 —— */
  toolsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    const p = board.selected && pieceById(board.selected);
    if (!p) return;
    switch (act) {
      case 'rot-l': snapshot(); p.rot = round2(p.rot - 3); refreshPiece(p); renderTools(); break;
      case 'rot-r': snapshot(); p.rot = round2(p.rot + 3); refreshPiece(p); renderTools(); break;
      case 'bigger': snapshot(); p.scale = round2(clamp(p.scale * 1.12, 0.28, 3.6)); refreshPiece(p); renderTools(); break;
      case 'smaller': snapshot(); p.scale = round2(clamp(p.scale / 1.12, 0.28, 3.6)); refreshPiece(p); renderTools(); break;
      case 'tape': snapshot(); p.tape = !p.tape; renderPieces(); select(p.id); break;
      case 'flat': snapshot(); p.flat = !p.flat; renderPieces(); select(p.id); break;
      case 'fx': {
        const row = $('#fxRow');
        if (!row) break;
        row.hidden = !row.hidden;
        const b = toolsEl.querySelector('[data-act="fx"]');
        if (b) b.setAttribute('aria-pressed', String(!row.hidden));
        renderTools();
        break;
      }
      case 'backing': snapshot(); p.backing = p.backing === false; renderPieces(); select(p.id); break;
      case 'font': snapshot(); p.font = FONTS[(FONTS.indexOf(p.font) + 1) % FONTS.length]; refreshPiece(p); toast('字体：' + FONT_LABEL[p.font]); break;
      case 'ink': {
        snapshot();
        p.palette = PALETTE[(PALETTE.indexOf(p.palette) + 1) % PALETTE.length];
        if (p.kind === 'image') { renderPieces(); select(p.id); break; }
        p.fg = p.palette === '#2a2622' ? '#f6efe3' : '#241f1a';
        refreshPiece(p);
        break;
      }
      case 'front': snapshot(); p.z = ++board.z; renderPieces(); select(p.id); break;
      case 'dup': {
        snapshot();
        const copy = JSON.parse(JSON.stringify(p));
        copy.id = uid();
        copy.x = round2(clamp(p.x + 5, 0, 100));
        copy.y = round2(clamp(p.y + 5, 0, 100));
        copy.z = ++board.z;
        copy.rot = round2(p.rot + (Math.random() * 8 - 4));
        board.pieces.push(copy);
        renderPieces();
        select(copy.id);
        break;
      }
      case 'del': snapshot(); board.pieces = board.pieces.filter((x) => x.id !== p.id); renderPieces(); deselect(); break;
      case 'done': deselect(); return;
    }
    persist();
  });

  toolsEl.addEventListener('input', (e) => {
    if (e.target.id !== 'zoomRange') return;
    const p = board.selected && pieceById(board.selected);
    if (!p) return;
    p.scale = round2(clamp(Number(e.target.value) / 100, 0.28, 3.6));
    const v = toolsEl.querySelector('#zoomVal');
    if (v) v.textContent = Math.round(p.scale * 100) + '%';
    refreshPiece(p);
  });
  toolsEl.addEventListener('change', () => persist());

  /* —— 键盘 —— */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($$('.modal.is-open').length) { closeModals(); return; }
      if (!e.target.isContentEditable) deselect();
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ($('#modalCrop').classList.contains('is-open')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }

    const p = board.selected && pieceById(board.selected);
    if (!p) { if (e.key === 'r' || e.key === 'R') generate(); return; }
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      snapshot();
      board.pieces = board.pieces.filter((x) => x.id !== p.id);
      renderPieces(); deselect(); persist();
    } else if (e.key === 'ArrowLeft') { p.x = round2(clamp(p.x - step, -6, 106)); refreshPiece(p); renderTools(); persist(); }
    else if (e.key === 'ArrowRight') { p.x = round2(clamp(p.x + step, -6, 106)); refreshPiece(p); renderTools(); persist(); }
    else if (e.key === 'ArrowUp') { p.y = round2(clamp(p.y - step, -6, 106)); refreshPiece(p); renderTools(); persist(); }
    else if (e.key === 'ArrowDown') { p.y = round2(clamp(p.y + step, -6, 106)); refreshPiece(p); renderTools(); persist(); }
    else if (e.key === '[') { p.rot = round2(p.rot - 4); refreshPiece(p); renderTools(); persist(); }
    else if (e.key === ']') { p.rot = round2(p.rot + 4); refreshPiece(p); renderTools(); persist(); }
    else if (e.key === 'd' || e.key === 'D') { const b = toolsEl.querySelector('[data-act="dup"]'); if (b) b.click(); }
  });

  /* —— 草稿 —— */
  const LS_KEY = 'thu-hum-collage-v1';
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        pieces: board.pieces, z: board.z, tpl: board.tpl, tplSeed: board.tplSeed,
        texScale: board.texScale, savedAt: Date.now()
      }));
    } catch (e) { /* 配额满就放弃 */ }
  }
  function restoreDraft() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !s.pieces || !s.pieces.length) return false;
      board.pieces = s.pieces;
      board.z = s.z || 10;
      board.tplSeed = s.tplSeed || 0;
      board.texScale = s.texScale || 1;
      /* 老草稿存的是 tone，映射到新模板 */
      const legacy = { charcoal: 'plain', kraft: 'kraft', ivory: 'ivory', grid: 'grid' };
      setTemplate(s.tpl || legacy[s.tone] || 'plain', false);
      return true;
    } catch (e) { return false; }
  }

  /* ========================= 3a. 背景模板 ========================= */

  const paperEl = $('#boardPaper');
  const texEl = $('#boardTex');
  const linesEl = $('#boardLines');

  function currentTpl() {
    return (window.PaperLab && PaperLab.TPL_MAP[board.tpl]) || null;
  }

  /* 把当前模板画到板子上（底色 / 纸纹 / 线条） */
  /* 纸纹显示尺寸：模板各给一个基准（有些纸的纹路要更细/更粗），再乘用户的整体倍率 */
  function texScale(t) {
    const base = (t && t.texSize) || 420;
    return clamp(base * (board.texScale || 1), 90, 1400);
  }

  let paperPending = false;
  function renderPaper() {
    const t = currentTpl();
    if (!t) return;
    boardEl.dataset.tone = t.key;
    boardEl.dataset.dark = t.dark ? '1' : '0';
    paperEl.style.background = t.paper || '#211d1c';

    /* 纸纹：固定像素平铺。纸纹本身是可无缝平铺的，用固定尺寸才能保证
       换模板 / 换窗口大小时"纸的感觉"不变（用 cover 会随框子比例缩放）。 */
    const texKind = (t.textures && t.textures[0]) || null;
    if (texKind && window.PaperLab) {
      texEl.style.backgroundImage = 'url(' + PaperLab.textureUrl(texKind, { seed: board.tplSeed }) + ')';
      texEl.style.backgroundSize = Math.round(texScale(t)) + 'px';
      texEl.style.opacity = t.dark ? '' : (t.texOpacity == null ? 1 : t.texOpacity);
    } else {
      texEl.style.backgroundImage = 'none';
    }

    /* 线条：按板子的实际像素画，保证不模糊。
       刚切到工作台时板子可能还量不到宽高，下一帧再画一次。 */
    const W = boardEl.clientWidth, H = boardEl.clientHeight;
    if (!W || !H) {
      linesEl.width = 0; linesEl.height = 0;
      if (!paperPending) {
        paperPending = true;
        requestAnimationFrame(() => { paperPending = false; renderPaper(); });
      }
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    linesEl.width = Math.round(W * dpr);
    linesEl.height = Math.round(H * dpr);
    const ctx = linesEl.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, linesEl.width, linesEl.height);
    if (t.line && window.PaperLab) PaperLab.drawLines(ctx, t.line, W, H, dpr);
  }

  function setTemplate(key, doPersist) {
    if (!window.PaperLab || !PaperLab.TPL_MAP[key]) key = 'plain';
    board.tpl = key;
    renderPaper();
    $$('#tplGrid .tpl-card').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tpl === key)));
    if (doPersist !== false) persist();
  }

  /* 随机换一套纸（模板 + 纹理种子一起随） */
  function randomTemplate() {
    if (!window.PaperLab) return;
    const list = PaperLab.BG_TEMPLATES;
    const t = list[Math.floor(Math.random() * list.length)];
    board.tplSeed = Math.floor(Math.random() * 900) + 1;
    setTemplate(t.key);
    toast('随机背景：' + t.name);
  }

  /* ========================= 3b. 造词页 ========================= */

  let history = [];
  let paperRO = null;

  /* —— 造词结果渲染（所有列表共用） —— */
  function renderResults(box, items, opts) {
    opts = opts || {};
    const allLine = items.map((x) => x.text).join('，');
    box.innerHTML = '';
    items.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'pill';
      row.style.animationDelay = (i * 45) + 'ms';
      const body = p.html
        ? '<div class="pill__txt">' + p.html + '</div>'
        : '<div class="pill__txt">' + escapeHtml(p.text) + '</div>';
      const src = p.source ? '<span class="pill__src">—— ' + escapeHtml(p.source) + '</span>' : '';
      row.innerHTML =
        body + src +
        '<div class="pill__acts">' +
        '<button class="icon-btn" data-act="copy" title="复制文字（粘到别处用）">⧉</button>' +
        '<button class="icon-btn" data-act="stick" title="贴到拼贴板上">↘</button>' +
        (p.source ? '<button class="icon-btn" data-act="quote" title="连出处一起贴">❞</button>' : '') +
        '<button class="icon-btn" data-act="all" title="本页一起复制">≡</button>' +
        '</div>';

      row.querySelector('[data-act="copy"]').addEventListener('click', () => copyText(p.text));
      row.querySelector('[data-act="all"]').addEventListener('click', () => copyText(allLine));
      row.querySelector('[data-act="stick"]').addEventListener('click', () => stickText(p.text));
      const qb = row.querySelector('[data-act="quote"]');
      if (qb) qb.addEventListener('click', () => stickText(p.text + '\n—— ' + p.source, { small: true }));

      box.appendChild(row);
      pushHistory(p.text, p.source);
    });
    if (opts.scroll !== false) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* 把一句话贴到板上 */
  function stickText(text, opt) {
    snapshot();
    const piece = addTextPiece(text);
    renderPieces();
    select(piece.id);
    persist();
    switchView('studio');
    toast('已贴上：' + String(text).split('\n')[0]);
  }

  /* 兼容入口：空按 R 键时用「短语」列表造一次 */
  function generate() {
    wmGenerate('phrase');
  }

  /* ========================= 3c. 造词机：四个同构列表 =========================
     短语 / 句子 / 词汇 / 自定义
     每个列表：一批子分类（点击勾选）+ 一个造词按钮 + 一块结果区。
     语料池由 Corpus.POOLS 提供，按 group 归到对应列表；短语列表用句法结构做子分类。 */

  const CUSTOM_KEY = 'thu-hum-custom-v1';
  let customItems = [];
  let poolState = {};       /* 池子 id -> 是否勾选（默认全选） */
  let phraseState = {};     /* 句法结构 key -> 是否勾选 */
  let customSplit = false;  /* 自定义列表：造词时是否按空格/标点拆成短词 */
  let sampleSalt = 0;       /* 生成型池子的取样盐，保证每次都不重样 */

  function loadCustom() {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (raw) customItems = JSON.parse(raw) || [];
    } catch (e) { customItems = []; }
  }
  function saveCustom() {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customItems.slice(0, 300))); }
    catch (e) { /* 满就算了 */ }
  }

  /* —— 四个列表的定义 —— */
  function wmGroups() {
    const pools = window.Corpus ? Corpus.POOLS : [];
    const byGroup = (g) => pools.filter((p) => (p.group || 'extras') === g);

    return [
      {
        key: 'phrase', title: '短语',
        meta: STRUCTS.length + ' 种句法 · ' + BANK_SIZE + ' 个词',
        intro: '选句法结构，随机组合出短语。',
        kind: 'struct',
        sub: STRUCTS.map((s) => ({ id: s.key, name: s.name, hint: s.hint, count: 0 })),
        get: (id) => phraseState[id] !== false,
        set: (id, on) => { phraseState[id] = on; }
      },
      {
        key: 'sentence', title: '句子',
        meta: '名句 · 论述整句 · 见闻 · 抽象长句',
        intro: '要的是「熟悉又莫名」的整句感。',
        kind: 'pool', pools: byGroup('sentence').concat(byGroup('extras').filter((p) => p.id === 'quotes' || p.id === 'essay'))
      },
      {
        key: 'vocab', title: '词汇',
        meta: '术语 · 定语 · 副词 · 意象词',
        intro: '零散词汇，拼贴时的骨架与血肉。',
        kind: 'pool', pools: byGroup('vocab').concat(byGroup('extras').filter((p) => p.id === 'essayTerms' || p.id === 'essayFrames'))
      },
      {
        key: 'custom', title: '自定义输入',
        meta: () => (customItems.length ? '已存 ' + customItems.length + ' 条' : '还没有内容'),
        intro: '自己写词、写句，存进浏览器，随时取用。',
        kind: 'custom'
      }
    ];
  }

  /* 一个池子能出多少条（用于角标） */
  function poolCountText(p) {
    if (p.kind === 'gen') return '每次 ' + (p.count || 24) + ' 句';
    return ((p.items || []).length) + ' 条';
  }

  function samplePool(p, n) {
    const out = [];
    if (!p) return out;
    if (p.kind === 'gen') {
      for (let i = 0; i < n; i++) {
        const t = p.make(uid() + '|' + i + '|' + (sampleSalt++));
        if (t) out.push({ text: t, source: '' });
      }
    } else {
      const items = p.items || [];
      if (!items.length) return out;
      const used = new Set();
      for (let i = 0; i < n && used.size < items.length; i++) {
        let k = Math.floor(Math.random() * items.length);
        let guard = 0;
        while (used.has(k) && guard++ < 30) k = Math.floor(Math.random() * items.length);
        used.add(k);
        const it = items[k];
        out.push({ text: typeof it === 'string' ? it : it.t, source: (it && it.s) || '' });
      }
    }
    return out;
  }

  /* —— 渲染 —— */
  function renderWm() {
    const box = $('#wmPanels');
    if (!box) return;
    box.innerHTML = '';
    wmGroups().forEach((g, gi) => {
      const d = document.createElement('details');
      d.className = 'acc wm';
      d.dataset.group = g.key;
      if (gi === 0) d.open = true;

      const sum = document.createElement('summary');
      const title = document.createElement('span');
      title.className = 'acc__title';
      title.textContent = g.title;
      const meta = document.createElement('span');
      meta.className = 'acc__meta';
      meta.textContent = (typeof g.meta === 'function' ? g.meta() : g.meta) || '';
      sum.appendChild(title);
      sum.appendChild(meta);
      d.appendChild(sum);

      const body = document.createElement('div');
      body.className = 'acc__body';

      const intro = document.createElement('p');
      intro.className = 'wm__intro';
      intro.textContent = g.intro;
      body.appendChild(intro);

      if (g.kind === 'custom') {
        body.appendChild(buildCustomPanel());
      } else {
        const chips = document.createElement('div');
        chips.className = 'wm__chips';
        (g.pools || g.sub).forEach((item) => {
          const isPool = g.kind === 'pool';
          const on = isPool ? (poolState[item.id] !== false) : (phraseState[item.id] !== false);
          if (isPool) poolState[item.id] = on; else phraseState[item.id] = on;
          const b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-pressed', String(on));
          b.dataset.sub = item.id;
          b.title = item.hint || '';
          b.innerHTML = escapeHtml(item.name) +
            '<i>' + escapeHtml(isPool ? poolCountText(item) : (item.hint || '')) + '</i>';
          b.addEventListener('click', () => {
            const next = !(b.getAttribute('aria-pressed') === 'true');
            b.setAttribute('aria-pressed', String(next));
            if (isPool) poolState[item.id] = next; else phraseState[item.id] = next;
          });
          chips.appendChild(b);
        });
        body.appendChild(chips);

        const row = document.createElement('div');
        row.className = 'wm__actions';
        const gen = document.createElement('button');
        gen.type = 'button';
        gen.className = 'btn btn--sm btn--primary wm__gen';
        gen.dataset.gen = g.key;
        gen.textContent = '造词';
        const all = document.createElement('button');
        all.type = 'button';
        all.className = 'btn btn--sm';
        all.dataset.all = g.key;
        all.textContent = '全选';
        const none = document.createElement('button');
        none.type = 'button';
        none.className = 'btn btn--sm btn--ghost';
        none.dataset.none = g.key;
        none.textContent = '全不选';
        row.appendChild(gen); row.appendChild(all); row.appendChild(none);
        body.appendChild(row);
      }

      const res = document.createElement('div');
      res.className = 'result-box';
      res.dataset.res = g.key;
      body.appendChild(res);

      d.appendChild(body);
      box.appendChild(d);
    });

    /* 同类里只留一个展开 */
    $$('#wmPanels .acc').forEach((d) => {
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        $$('#wmPanels .acc').forEach((o) => { if (o !== d) o.open = false; });
      });
    });
  }

  /* 自定义列表：输入框 + 开关 + 操作 */
  function buildCustomPanel() {
    const wrap = document.createElement('div');
    wrap.className = 'wm__custom';

    const ta = document.createElement('textarea');
    ta.id = 'customInput';
    ta.className = 'custom-input';
    ta.rows = 4;
    ta.placeholder = '一行一条。例：\n凌晨三点的宿舍楼\n我把台灯关了\n信号与系统 理想 现实 遗忘';
    wrap.appendChild(ta);

    const row = document.createElement('div');
    row.className = 'wm__actions';
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'btn btn--sm btn--primary'; add.id = 'btnCustomAdd';
    add.textContent = '加入语料库';
    const gen = document.createElement('button');
    gen.type = 'button'; gen.className = 'btn btn--sm wm__gen'; gen.dataset.gen = 'custom';
    gen.textContent = '造词';
    const stick = document.createElement('button');
    stick.type = 'button'; stick.className = 'btn btn--sm'; stick.id = 'btnCustomStickAll';
    stick.textContent = '全部贴到板上';
    row.appendChild(add); row.appendChild(gen); row.appendChild(stick);
    wrap.appendChild(row);

    const opt = document.createElement('div');
    opt.className = 'wm__actions';
    const cb = document.createElement('label');
    cb.className = 'switch';
    const cbi = document.createElement('input');
    cbi.type = 'checkbox'; cbi.id = 'customSplit'; cbi.checked = customSplit;
    cbi.addEventListener('change', () => { customSplit = cbi.checked; });
    cb.appendChild(cbi);
    cb.appendChild(document.createTextNode('造词时按空格 / 标点拆成短词'));
    opt.appendChild(cb);
    const cnt = document.createElement('span');
    cnt.className = 'acc__meta';
    cnt.id = 'customCount';
    cnt.textContent = '已存 ' + customItems.length + ' 条';
    opt.appendChild(cnt);
    wrap.appendChild(opt);

    return wrap;
  }

  /* 自定义条目的分词（勾了「按空格/标点拆」才拆） */
  function customSample(n) {
    if (!customItems.length) return [];
    const pool = [];
    customItems.forEach((t) => {
      if (customSplit) {
        t.split(/[\s,，、;；·]+/).filter(Boolean).forEach((w) => pool.push(w));
      } else {
        pool.push(t);
      }
    });
    const out = [];
    const used = new Set();
    for (let i = 0; i < n && used.size < pool.length; i++) {
      let k = Math.floor(Math.random() * pool.length);
      let guard = 0;
      while (used.has(k) && guard++ < 30) k = Math.floor(Math.random() * pool.length);
      used.add(k);
      out.push({ text: pool[k], source: '' });
    }
    return out;
  }

  /* —— 造词（每个列表一个入口） —— */
  function wmGenerate(key, n) {
    n = n || 5;
    const box = $('#wmPanels .result-box[data-res="' + key + '"]');
    if (key === 'struct') key = 'phrase';
    const group = wmGroups().filter((g) => g.key === key)[0];
    if (!group || !box) return;

    let out = [];
    if (group.kind === 'struct') {
      const active = STRUCTS.filter((s) => phraseState[s.key] !== false);
      if (!active.length) { toast('至少勾一种句法'); return; }
      const seen = new Set();
      let guard = 0;
      while (out.length < n && guard++ < 90) {
        const st = active[Math.floor(Math.random() * active.length)];
        const p = generatePhrase(st.key, uid() + '|' + guard);
        if (!p || seen.has(p.text)) continue;
        seen.add(p.text);
        out.push({ text: p.text, html: p.html, source: '' });
      }
    } else if (group.kind === 'pool') {
      const active = group.pools.filter((p) => poolState[p.id] !== false &&
        ((p.items && p.items.length) || p.kind === 'gen'));
      if (!active.length) { toast('至少勾一个分类'); return; }
      const seen = new Set();
      let guard = 0;
      let tries = 0;
      while (out.length < n && tries++ < 300) {
        const p = active[Math.floor(Math.random() * active.length)];
        const one = samplePool(p, 1)[0];
        if (!one || !one.text) continue;
        const k = one.text + '|' + one.source;
        /* 前 60 次只收没出现过的，之后放宽，保证一定能凑满 5 条 */
        if (seen.has(k) && guard < 60) { guard++; continue; }
        seen.add(k);
        out.push(one);
      }
    } else {
      if (!customItems.length) { toast('先在下面写几条'); return; }
      out = customSample(n);
    }

    if (!out.length) { toast('没抽到内容，换个分类试试'); return; }
    renderResults(box, out);
  }

  /* 全选 / 全不选 */
  function wmSetAll(key, on) {
    const group = wmGroups().filter((g) => g.key === key)[0];
    if (!group || group.kind === 'custom') return;
    if (group.kind === 'struct') {
      STRUCTS.forEach((s) => { phraseState[s.key] = on; });
    } else {
      group.pools.forEach((p) => { poolState[p.id] = on; });
    }
    /* 只重画那一组，避免整块重建 */
    $$('#wmPanels .acc[data-group="' + key + '"] .wm__chips button').forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
    });
  }

  /* —— 自定义：加入 / 全部贴板 —— */
  function addCustomFromInput() {
    const ta = $('#customInput');
    if (!ta) return;
    const raw = ta.value || '';
    const parts = raw.split(/[\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) { toast('先写点什么'); return; }
    let added = 0;
    for (const t of parts) {
      if (t.length > 60) continue;
      if (customItems.indexOf(t) >= 0) continue;
      customItems.unshift(t);
      added++;
    }
    customItems = customItems.slice(0, 300);
    saveCustom();
    ta.value = '';
    const cnt = $('#customCount');
    if (cnt) cnt.textContent = '已存 ' + customItems.length + ' 条';
    const meta = $('#wmPanels .acc[data-group="custom"] .acc__meta');
    if (meta) meta.textContent = customItems.length ? '已存 ' + customItems.length + ' 条' : '还没有内容';
    toast(added ? '已加入 ' + added + ' 条' : '这些都已经在里面了');
  }

  function stickAllCustom() {
    if (!customItems.length) { toast('还没有自定义内容'); return; }
    snapshot();
    const n = Math.min(customItems.length, 12);
    const bw = boardEl.clientWidth || 700;
    const bh = boardEl.clientHeight || 520;
    for (let i = 0; i < n; i++) {
      const cols = 2, rows = Math.ceil(n / cols);
      const cx = (bw * ((i % cols) + 0.5)) / cols;
      const cy = (bh * (Math.floor(i / cols) + 0.5)) / rows;
      addTextPiece(customItems[i], {
        x: round2(clamp((cx / bw) * 100, 6, 94)),
        y: round2(clamp((cy / bh) * 100, 8, 92)),
        rot: (Math.random() * 2 - 1) * 9
      });
    }
    renderPieces();
    resolveOverlaps(14);
    renderPieces();
    persist();
    switchView('studio');
    toast('已贴上 ' + n + ' 条');
  }

  function pushHistory(text, source) {
    history.unshift({ t: text, s: source || '' });
    history = history.slice(0, 24);
    renderHistory();
  }

  function renderHistory() {
    if (!historyListEl) return;
    historyListEl.innerHTML = '';
    if (!history.length) {
      historyListEl.innerHTML = '<span class="type-note">这里会存下你刚才造过的词句。先去上面任意一个列表点「造词」。</span>';
      return;
    }
    const seen = new Set();
    for (const h of history) {
      const item = typeof h === 'string' ? { t: h, s: '' } : h;
      const key = item.t + '|' + item.s;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.t;
      b.title = item.s ? ('出处：' + item.s + '（点击贴到拼贴板）') : '点击贴到拼贴板';
      b.addEventListener('click', () => stickText(item.t));
      historyListEl.appendChild(b);
    }
  }

  /* ========================= 4. 素材：图片识文 ========================= */

  const frags = [];
  let cropState = null;

  function fragKey(d) {
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 997) { h ^= d[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + '_' + d.length;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('读取失败'));
      fr.readAsDataURL(file);
    });
  }
  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = dataUrl;
    });
  }

  /* 核心：灰度 → Otsu 阈值 → 行投影 → 行内横向膨胀 → 连通域 → 合并成词组 */
  function analyzeSource(dataUrl, opt) {
    opt = opt || {};
    return loadImage(dataUrl).then((img) => {
      const work = opt.work || 1024;
      const scale = Math.min(1, work / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.max(1, Math.round(img.naturalWidth * scale));
      const H = Math.max(1, Math.round(img.naturalHeight * scale));

      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      const N = W * H;
      const gray = new Uint8ClampedArray(N);
      const hist = new Uint32Array(256);
      for (let i = 0, p = 0; i < N; i++, p += 4) {
        const g = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
        gray[i] = g;
        hist[g]++;
      }
      /* Otsu */
      let sumAll = 0;
      for (let i = 0; i < 256; i++) sumAll += i * hist[i];
      let sumB = 0, wB = 0, best = -1, thr = 128;
      for (let i = 0; i < 256; i++) {
        wB += hist[i];
        if (!wB) continue;
        const wF = N - wB;
        if (!wF) break;
        sumB += i * hist[i];
        const mB = sumB / wB, mF = (sumAll - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) { best = between; thr = i; }
      }
      thr = clamp(Math.round(thr + (opt.bias || 0)), 16, 240);

      /* 判断深底浅字还是浅底深字 */
      let sum = 0;
      for (let i = 0; i < N; i++) sum += gray[i];
      const mean = sum / N;
      let mode = opt.mode || 'auto';
      if (mode === 'auto') mode = mean < 110 ? 'light' : 'dark';

      const ink = new Uint8Array(N);
      let inkCount = 0;
      if (mode === 'dark') {
        for (let i = 0; i < N; i++) if (gray[i] < thr) { ink[i] = 1; inkCount++; }
        if (inkCount < N * 0.002 && !opt.mode) {
          for (let i = 0; i < N; i++) ink[i] = gray[i] > thr ? 1 : 0;
        }
      } else {
        for (let i = 0; i < N; i++) if (gray[i] > thr) ink[i] = 1;
      }

      /* 行投影 */
      const rowMin = Math.max(1, Math.round(W / 260));
      const rowActive = new Uint8Array(H);
      for (let y = 0; y < H; y++) {
        let s = 0;
        const off = y * W;
        for (let x = 0; x < W; x++) s += ink[off + x];
        rowActive[y] = s >= rowMin ? 1 : 0;
      }
      const rowGroups = [];
      {
        let s = -1;
        for (let y = 0; y <= H; y++) {
          const a = y < H ? rowActive[y] : 0;
          if (a && s < 0) s = y;
          else if (!a && s >= 0) { if (y - s >= 5) rowGroups.push([s, y - 1]); s = -1; }
        }
      }

      const r = Math.max(1, Math.round(Math.min(W, H) / 320));
      const boxes = [];

      for (const g of rowGroups) {
        const y0 = g[0], y1 = g[1], h = y1 - y0 + 1;
        const m = new Uint8Array(W * h);
        for (let y = y0; y <= y1; y++) {
          const src = y * W, dst = (y - y0) * W;
          for (let x = 0; x < W; x++) if (ink[src + x]) m[dst + x] = 1;
        }
        /* 只在行内做横向膨胀：把同一个字的笔画连起来 */
        const dil = new Uint8Array(W * h);
        for (let y = 0; y < h; y++) {
          const off = y * W;
          for (let x = 0; x < W; x++) {
            if (!m[off + x]) continue;
            const xa = Math.max(0, x - r), xb = Math.min(W - 1, x + r);
            for (let k = xa; k <= xb; k++) dil[off + k] = 1;
          }
        }
        /* 连通域 */
        const lab = new Int32Array(W * h).fill(-1);
        const regions = [];
        const stack = [];
        for (let s0 = 0; s0 < dil.length; s0++) {
          if (!dil[s0] || lab[s0] >= 0) continue;
          const id = regions.length;
          const reg = { x0: W, x1: -1, y0: h, y1: -1, n: 0 };
          stack.length = 0;
          stack.push(s0);
          lab[s0] = id;
          while (stack.length) {
            const p = stack.pop();
            const px = p % W, py = (p - px) / W;
            if (px < reg.x0) reg.x0 = px;
            if (px > reg.x1) reg.x1 = px;
            if (py < reg.y0) reg.y0 = py;
            if (py > reg.y1) reg.y1 = py;
            reg.n++;
            for (let dy = -1; dy <= 1; dy++) {
              const ny = py + dy;
              if (ny < 0 || ny >= h) continue;
              const rowOff = ny * W;
              for (let dx = -1; dx <= 1; dx++) {
                const nx = px + dx;
                if (nx < 0 || nx >= W) continue;
                const q = rowOff + nx;
                if (dil[q] && lab[q] < 0) { lab[q] = id; stack.push(q); }
              }
            }
          }
          if (reg.n >= 3) regions.push(reg);
        }
        /* 合并相邻块成词组 */
        regions.sort((a, b) => a.x0 - b.x0);
        const gap = Math.max(3, Math.round(h * 0.36));
        const merged = [];
        for (const reg of regions) {
          const last = merged[merged.length - 1];
          if (last) {
            const rgap = reg.x0 - last.x1;
            const oh = Math.min(last.y1, reg.y1) - Math.max(last.y0, reg.y0) + 1;
            const hh = Math.min(last.y1 - last.y0 + 1, reg.y1 - reg.y0 + 1);
            if (rgap <= gap && oh > hh * 0.45) {
              last.x1 = Math.max(last.x1, reg.x1);
              last.y0 = Math.min(last.y0, reg.y0);
              last.y1 = Math.max(last.y1, reg.y1);
              continue;
            }
          }
          merged.push({ x0: reg.x0, x1: reg.x1, y0: reg.y0, y1: reg.y1 });
        }
        for (const b of merged) {
          const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
          if (bw < 12 || bh < 10) continue;
          if (bw > W * 0.985 && bh > H * 0.6) continue;
          boxes.push({
            x0: Math.max(0, b.x0 - r - 1),
            x1: Math.min(W - 1, b.x1 + r + 1),
            y0: Math.max(0, b.y0 + y0 - r - 1),
            y1: Math.min(H - 1, b.y1 + y0 + r + 1)
          });
        }
      }

      boxes.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
      return { cv, img, boxes: boxes.slice(0, 40), scale, W, H, thr, mode };
    });
  }

  function cutBox(cv, box, scale) {
    const sw = box.x1 - box.x0 + 1, sh = box.y1 - box.y0 + 1;
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, box.x0, box.y0, sw, sh, 0, 0, sw, sh);

    /* 抠字：把纸底（大片背景色）变成透明，只留墨迹。
       做法：从四边采样估计底色，按颜色距离算 alpha。 */
    const img = ctx.getImageData(0, 0, sw, sh);
    const d = img.data;
    const bg = estimateBg(d, sw, sh);
    const cut = ctx.createImageData(sw, sh);
    const cd = cut.data;
    for (let p = 0; p < d.length; p += 4) {
      const dr = d[p] - bg[0], dg = d[p + 1] - bg[1], db = d[p + 2] - bg[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      cd[p] = d[p];
      cd[p + 1] = d[p + 1];
      cd[p + 2] = d[p + 2];
      cd[p + 3] = clamp((dist - 26) * 7, 0, 255);
    }
    ctx.putImageData(cut, 0, 0);

    /* 记录抠字前的样子，方便对比 */
    const orig = document.createElement('canvas');
    orig.width = sw; orig.height = sh;
    orig.getContext('2d').drawImage(cv, box.x0, box.y0, sw, sh, 0, 0, sw, sh);

    return {
      imgId: uid(),
      dataUrl: out.toDataURL('image/png'),
      rawUrl: orig.toDataURL('image/png'),
      key: fragKey(d),
      ratio: sw / sh,
      srcW: sw, srcH: sh
    };
  }

  /* 采样边框像素估算纸张底色 */
  function estimateBg(d, w, h) {
    const rs = [], gs = [], bs = [];
    const push = (x, y) => {
      const p = (y * w + x) * 4;
      rs.push(d[p]); gs.push(d[p + 1]); bs.push(d[p + 2]);
    };
    const step = Math.max(1, Math.round(w / 26));
    for (let x = 0; x < w; x += step) { push(x, 0); push(x, h - 1); }
    const stepY = Math.max(1, Math.round(h / 18));
    for (let y = 0; y < h; y += stepY) { push(0, y); push(w - 1, y); }
    const med = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    return [med(rs), med(gs), med(bs)];
  }

  function openCropModal(dataUrl, fileName) {
    const bias = Number($('#thrBias').value);
    const mode = $('#cropMode').value;
    toast('正在识别文字…');
    analyzeSource(dataUrl, { work: 1024, bias, mode }).then((res) => {
      cropState = { dataUrl, fileName: fileName || 'image', mode, bias, res, picked: res.boxes.map(() => true) };
      drawCropStage();
      openModal('#modalCrop');
    }).catch((e) => toast(e.message || '识别失败'));
  }

  function drawCropStage() {
    const stage = $('#cropStage');
    const { res } = cropState;
    stage.innerHTML = '';
    stage.appendChild(res.cv);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + res.W + ' ' + res.H);
    svg.setAttribute('preserveAspectRatio', 'none');
    res.boxes.forEach((b, i) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', b.x0);
      rect.setAttribute('y', b.y0);
      rect.setAttribute('width', b.x1 - b.x0 + 1);
      rect.setAttribute('height', b.y1 - b.y0 + 1);
      rect.dataset.i = String(i);
      rect.style.cursor = 'pointer';
      rect.addEventListener('click', () => {
        cropState.picked[i] = !cropState.picked[i];
        syncCropSVG();
      });
      svg.appendChild(rect);
    });
    stage.appendChild(svg);
    syncCropSVG();
  }

  function syncCropSVG() {
    $$('#cropStage svg rect').forEach((rect) => {
      const on = cropState.picked[Number(rect.dataset.i)];
      rect.style.fill = on ? 'rgba(224,168,60,.18)' : 'rgba(0,0,0,.55)';
      rect.style.stroke = on ? '#e0a83c' : '#8b8b8b';
    });
    const n = cropState.picked.filter(Boolean).length;
    $('#cropCount').textContent = '识别到 ' + cropState.res.boxes.length + ' 处文字，已选 ' + n +
      '　（阈值 ' + cropState.res.thr + '，' + (cropState.res.mode === 'dark' ? '深字浅底' : '浅字深底') + '）';
  }

  function addFragsToTray(items) {
    const existing = new Set(frags.map((f) => f.key));
    let added = 0;
    for (const f of items) {
      if (existing.has(f.key)) continue;
      existing.add(f.key);
      f.rot = round2(Math.random() * 6 - 3);
      frags.push(f);
      added++;
    }
    renderFrags();
    return added;
  }

  function renderFrags() {
    fragTrayEl.innerHTML = '';
    if (!frags.length) {
      fragTrayEl.innerHTML = '<div class="frag-tray__empty">还没有碎片。左边传一张带字的图，或点「用内置样张试试」。</div>';
      return;
    }
    for (const f of frags) {
      const d = document.createElement('div');
      d.className = 'frag';
      d.style.setProperty('--rot', f.rot + 'deg');
      const i = document.createElement('img');
      i.src = f.dataUrl;
      i.alt = '文字碎片';
      d.appendChild(i);
      const x = document.createElement('button');
      x.className = 'frag__x';
      x.type = 'button';
      x.textContent = '×';
      x.title = '删掉这片';
      x.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const k = frags.indexOf(f);
        if (k >= 0) frags.splice(k, 1);
        renderFrags();
      });
      d.appendChild(x);
      d.title = '点击贴到拼贴板';
      d.addEventListener('click', () => {
        snapshot();
        const p = addImagePiece(f, { x: round2(10 + Math.random() * 60), y: round2(12 + Math.random() * 56) });
        renderPieces();
        select(p.id);
        persist();
        toast('贴上了，拖一拖');
      });
      fragTrayEl.appendChild(d);
    }
  }

  /* —— 内置样张：程序生成，用来演示「从图上剪字」 —— */
  function makeSampleDataUrl() {
    const W = 900, H = 620;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#efe6d2');
    g.addColorStop(.5, '#e4d8bd');
    g.addColorStop(1, '#f3ecdc');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = Math.random() * 26 + 4;
      c.globalAlpha = 0.02 + Math.random() * 0.05;
      c.fillStyle = Math.random() < .5 ? '#b49b74' : '#fffaf0';
      c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;
    const vg = c.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .95);
    vg.addColorStop(0, 'rgba(120,96,60,0)');
    vg.addColorStop(1, 'rgba(120,96,60,.22)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    const lines = [
      { t: '把黄昏折起来', x: 78, y: 140, size: 62, font: '"Source Han Serif SC","Noto Serif SC","Songti SC",STSong,SimSun,serif', color: '#2b231c', rot: -1.2 },
      { t: '寄给春天', x: 96, y: 272, size: 54, font: '"PingFang SC","Microsoft YaHei",sans-serif', color: '#7a2e26', rot: 0.8 },
      { t: '月亮失眠了', x: 150, y: 400, size: 58, font: '"Kaiti SC",KaiTi,STKaiti,serif', color: '#243b52', rot: -0.6 },
      { t: 'POST', x: 600, y: 470, size: 44, font: 'Georgia,"Times New Roman",serif', color: '#4a4a4a', letter: 8, rot: 1.4 },
      { t: '我们在此处', x: 400, y: 556, size: 46, font: '"Yuanti SC","Hiragino Maru Gothic ProN","PingFang SC",sans-serif', color: '#3a4a2c', rot: -1 }
    ];

    for (const L of lines) {
      c.save();
      c.translate(L.x, L.y);
      c.rotate((L.rot * Math.PI) / 180);
      c.fillStyle = L.color;
      c.font = '700 ' + L.size + 'px ' + L.font;
      if (L.letter) {
        let x = 0;
        for (const ch of L.t) { c.fillText(ch, x, 0); x += c.measureText(ch).width + L.letter; }
      } else {
        c.fillText(L.t, 0, 0);
      }
      c.restore();
    }

    c.save();
    c.globalAlpha = .3;
    c.strokeStyle = '#8a7250';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(78, 172); c.lineTo(430, 168); c.stroke();
    c.beginPath(); c.moveTo(96, 304); c.lineTo(330, 300); c.stroke();
    c.restore();

    return cv.toDataURL('image/png');
  }

  let sampleUrl = null;
  function useSampleSheet() {
    if (!sampleUrl) sampleUrl = makeSampleDataUrl();
    openCropModal(sampleUrl, 'sample');
  }

  /* —— 上传入口 —— */
  async function handleFiles(files) {
    const list = Array.from(files || []).filter((f) => /^image\//.test(f.type));
    if (!list.length) { toast('请选择图片文件'); return; }
    try {
      if (list.length === 1) {
        const dataUrl = await fileToDataUrl(list[0]);
        openCropModal(dataUrl, list[0].name);
        return;
      }
      /* 多张：全部直接识别，碎片一次进篮 */
      let total = 0;
      for (const f of list) {
        const dataUrl = await fileToDataUrl(f);
        const res = await analyzeSource(dataUrl, { work: 1024, bias: Number($('#thrBias').value), mode: $('#cropMode').value });
        total += addFragsToTray(res.boxes.map((b) => cutBox(res.cv, b, res.scale)));
      }
      toast(total ? '共剪下 ' + total + ' 片' : '没找到文字，试试调识别阈值');
    } catch (e) {
      toast(e.message || '处理失败');
    }
  }

  /* ========================= 5. 导出 PNG ========================= */

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function getLoadedImage(dataUrl) {
    let im = imgCache.get(dataUrl);
    if (!im) {
      im = new Image();
      im.src = dataUrl;
      imgCache.set(dataUrl, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  }

  function wrapText(ctx, chars, maxW) {
    const lines = [];
    let cur = '';
    for (const ch of chars) {
      const test = cur + ch;
      if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = ch; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawFiber(ctx, x, y, w, h, r, seedStr) {
    const rng = rnd('fiber' + seedStr);
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.globalAlpha = .12;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 80; i++) ctx.fillRect(x + rng() * w, y + rng() * h, 1, 1 + rng() * 2);
    ctx.globalAlpha = .06;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(0, r - 1.5));
    ctx.stroke();
    ctx.restore();
  }

  function drawTape(ctx, w, h, pos) {
    const tw = Math.max(34, w * 0.16);
    const th = Math.max(16, h * 0.42);
    const cx = (pos === 'tl' || pos === 'bl') ? -w / 2 + tw * 0.42 : w / 2 - tw * 0.42;
    const cy = (pos === 'tl' || pos === 'tr') ? -h / 2 + th * 0.42 : h / 2 - th * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((pos === 'tl' || pos === 'br') ? -42 : 42) * Math.PI / 180);
    ctx.globalAlpha = .8;
    const g = ctx.createLinearGradient(-tw / 2, -th / 2, tw / 2, th / 2);
    g.addColorStop(0, 'rgba(255,255,255,.62)');
    g.addColorStop(1, 'rgba(222,208,178,.62)');
    ctx.fillStyle = g;
    ctx.fillRect(-tw / 2, -th / 2, tw, th);
    ctx.globalAlpha = .3;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-tw / 2 + 1, -th / 2); ctx.lineTo(-tw / 2 + 1, th / 2);
    ctx.moveTo(tw / 2 - 1, -th / 2); ctx.lineTo(tw / 2 - 1, th / 2);
    ctx.stroke();
    ctx.restore();
  }

  /* 缺墨蒙版：用噪声做出一块块没印上墨的地方（导出时用，只生成一次） */
  let wornMaskCache = null;
  function makeWornMask(size, seed, strength) {
    if (wornMaskCache && wornMaskCache.width === size) return wornMaskCache;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const n = window.PaperLab ? PaperLab.makeNoise(seed) : null;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v;
        if (n) v = PaperLab.fbm(n, (x / size) * 16, (y / size) * 16, 3);
        else v = Math.random() - 0.5;
        const a = clamp(0.5 + v * strength, 0, 1) * 255;
        const p = (y * size + x) * 4;
        d[p] = d[p + 1] = d[p + 2] = 0;
        d[p + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    wornMaskCache = cv;
    return cv;
  }

  function renderBoardToCanvas(opt) {
    const o = Object.assign({ scale: 2, tone: true, transparent: false, title: '', watermark: true }, opt || {});
    const W = boardEl.clientWidth, H = boardEl.clientHeight;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * o.scale);
    cv.height = Math.round(H * o.scale);
    const ctx = cv.getContext('2d');
    ctx.setTransform(o.scale, 0, 0, o.scale, 0, 0);

    if (!o.transparent) {
      const t = currentTpl();
      const paper = (t && t.paper) || '#211d1c';
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, W, H);
      /* 中心柔光，避免大平面死板 */
      const gr = ctx.createRadialGradient(W / 2, -H * .2, 10, W / 2, H * .3, H * 1.1);
      gr.addColorStop(0, t && t.dark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.13)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      /* 纸纹（与屏幕上同一张纹理，multiply 叠上去） */
      if (t && t.textures && t.textures[0] && window.PaperLab) {
        const kind = t.textures[0];
        if (t.dark) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = .4;
          PaperLab.paintTexture(ctx, kind, 0, 0, W, H, .4, { seed: board.tplSeed });
          ctx.restore();
        } else {
          PaperLab.paintTexture(ctx, kind, 0, 0, W, H, 1, { seed: board.tplSeed });
        }
      }
      /* 线条（与屏幕同一套绘制函数） */
      if (t && t.line) PaperLab.drawLines(ctx, t.line, W, H, 1);
    }

    const sorted = board.pieces.slice().sort((a, b) => a.z - b.z);
    for (const p of sorted) {
      const el = pieceEl(p.id);
      ctx.save();
      ctx.translate((p.x / 100) * W, (p.y / 100) * H);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.scale(p.scale, p.scale);
      const w = p.baseW, h = p.baseH;

      if (p.kind === 'text') {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.42)';
        ctx.shadowBlur = 9;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = p.palette;
        roundRectPath(ctx, -w / 2, -h / 2, w, h, p.flat ? 2 : 13);
        ctx.fill();
        ctx.restore();

        /* 纸纹：与屏幕上同一张纹理、同一个尺寸，multiply 叠上去 */
        if (p.tex && p.tex !== 'none' && window.PaperLab) {
          const tcv = PaperLab.makeTexture(p.tex, { seed: 0 });   /* 内部有缓存 */
          const texPx = clamp(150 * (board.texScale || 1), 60, 600);
          if (tcv) {
            ctx.save();
            ctx.beginPath();
            roundRectPath(ctx, -w / 2, -h / 2, w, h, p.flat ? 2 : 13);
            ctx.clip();
            /* 把纹理按 texPx 缩放后平铺；paintTexture 内部用 createPattern + multiply */
            ctx.translate(-w / 2, -h / 2);
            ctx.scale(texPx / tcv.width, texPx / tcv.height);
            PaperLab.paintTexture(ctx, p.tex, 0, 0, (w / texPx) * tcv.width, (h / texPx) * tcv.height, 1, { seed: 0 });
            ctx.restore();
          }
        }

        let fontPx = p.fontPx, family = 'serif', weight = '400';
        if (el) {
          const tEl = el.querySelector('.piece__text');
          if (tEl) {
            const cs = getComputedStyle(tEl);
            family = cs.fontFamily;
            weight = cs.fontWeight || '400';
            const m = /([\d.]+)px/.exec(cs.fontSize);
            if (m) fontPx = parseFloat(m[1]);
          }
        }
        ctx.font = weight + ' ' + fontPx + 'px ' + family;
        const pad = fontPx * 0.42;
        const lines = wrapText(ctx, Array.from(p.text), w - pad * 2);
        const lh = fontPx * 1.24;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const startY = -((lines.length - 1) * lh) / 2;

        /* 墨迹高光：浅色错位一层（在字下面），很淡，与屏幕同一套参数 */
        if (p.ink > 0) {
          const off = 0.25 + (p.ink / 100) * 0.95;
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = clamp(0.14 + p.ink / 420, 0.14, 0.4);
          ctx.fillStyle = '#fffdf7';
          lines.forEach((ln, i) => ctx.fillText(ln, -off, startY + i * lh - off));
          ctx.restore();
        }
        /* 字身：纯色，不做混合也不降透明度 */
        ctx.fillStyle = p.fg;
        lines.forEach((ln, i) => ctx.fillText(ln, 0, startY + i * lh));
        ctx.globalAlpha = 1;
        /* 缺墨：用「缺墨」蒙版啃掉一点字的边缘（screen 混合，模拟没吃上墨） */
        if (p.ink > 0 && window.PaperLab) {
          const worn = PaperLab.makeTexture('worn', { seed: 0 });
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = clamp(clamp((p.inkAmt == null ? 45 : p.inkAmt) / 100, 0, 1) * 0.62, 0, 0.62);
          const pat = ctx.createPattern(worn, 'repeat');
          if (pat) { ctx.fillStyle = pat; ctx.fillRect(-w / 2, -h / 2, w, h); }
          ctx.restore();
        }
        /* 褶皱：纤维 + 两层交叉折线，与屏幕同一套函数、同一套强度 */
        if ((p.fold || 0) > 0.001 && window.PaperLab) {
          const v = clamp(p.fold / 100, 0, 1);
          const foldTex = PaperLab.makeTexture('kiev', { seed: 0 });
          const fiberTex = PaperLab.makeTexture('fiber', { seed: 0 });
          const foldPx = 620 - v * 260;
          ctx.save();
          ctx.beginPath();
          roundRectPath(ctx, -w / 2, -h / 2, w, h, p.flat ? 2 : 13);
          ctx.clip();
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.34 + v * 0.46;
          /* A 层：折痕 */
          if (foldTex) {
            ctx.save();
            ctx.translate(-w / 2, -h / 2);
            ctx.scale(foldPx / foldTex.width, foldPx / foldTex.height);
            const p1 = ctx.createPattern(foldTex, 'repeat');
            if (p1) { ctx.fillStyle = p1; ctx.fillRect(0, 0, (w / foldPx) * foldTex.width, (h / foldPx) * foldTex.height); }
            ctx.restore();
          }
          /* B 层：折痕旋转 90°，与 A 层交叉 */
          if (foldTex && v > 0.35) {
            ctx.save();
            ctx.translate(0, 0);
            ctx.rotate(Math.PI / 2);
            ctx.scale((foldPx * 1.35) / foldTex.width, (foldPx * 1.35) / foldTex.height);
            const p2 = ctx.createPattern(foldTex, 'repeat');
            const spanW = (Math.max(w, h) / (foldPx * 1.35)) * foldTex.width;
            if (p2) { ctx.fillStyle = p2; ctx.fillRect(-spanW / 2, -spanW / 2, spanW, spanW); }
            ctx.restore();
          }
          /* 纤维颗粒 */
          if (fiberTex) {
            const p3 = ctx.createPattern(fiberTex, 'repeat');
            if (p3) { ctx.fillStyle = p3; ctx.fillRect(-w / 2, -h / 2, w, h); }
          }
          ctx.restore();
        }
        if (!p.flat) drawFiber(ctx, -w / 2, -h / 2, w, h, 13, p.id);
      } else {
        const src = IMG.get(p.imgId);
        /* 纸背 */
        if (p.backing !== false) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,.4)';
          ctx.shadowBlur = 7;
          ctx.shadowOffsetY = 4;
          ctx.fillStyle = p.palette || '#f3ead8';
          roundRectPath(ctx, -w / 2, -h / 2, w, h, 3);
          ctx.fill();
          ctx.restore();
        }
        if (src) {
          const im = getLoadedImage(src);
          if (im) ctx.drawImage(im, -w / 2, -h / 2, w, h);
        }
      }

      if (p.tape) drawTape(ctx, w, h, p.tapePos || 'tl');
      ctx.restore();
    }

    if (o.tone) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const tmp = document.createElement('canvas');
      tmp.width = cv.width; tmp.height = cv.height;
      const tc = tmp.getContext('2d');
      tc.drawImage(cv, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      try { ctx.filter = 'sepia(.14) saturate(.92) contrast(1.03)'; } catch (e) { /* 不支持就算了 */ }
      ctx.drawImage(tmp, 0, 0);
      try { ctx.filter = 'none'; } catch (e) { /* ignore */ }
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(246,236,214,.15)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.setTransform(o.scale, 0, 0, o.scale, 0, 0);
    const curT = currentTpl();
    const dark = !!(curT && curT.dark) || board.tpl === 'carbon';
    if (o.title) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,.92)' : 'rgba(34,29,25,.85)';
      ctx.font = '600 20px "Source Han Serif SC","Noto Serif SC","Songti SC",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(o.title, W / 2, 16);
    }
    if (o.watermark) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,.5)' : 'rgba(34,29,25,.42)';
      ctx.font = '500 12px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('清华电子系团委人文组 · 拼贴诗', W - 12, H - 10);
    }
    return cv;
  }

  async function exportPNG() {
    if (!board.pieces.length) { toast('板子还是空的，先造几个词贴上去'); return; }
    const btn = $('#expDo');
    btn.disabled = true;
    btn.textContent = '正在输出…';

    const scale = Number($('#expScale').value) || 2;
    /* 等所有素材图片就绪 */
    const urls = new Set();
    for (const p of board.pieces) if (p.kind === 'image') { const u = IMG.get(p.imgId); if (u) urls.add(u); }
    await Promise.all(Array.from(urls).map((u) => new Promise((res) => {
      if (getLoadedImage(u)) return res();
      const im = new Image();
      im.onload = im.onerror = () => res();
      im.src = u;
      imgCache.set(u, im);
      setTimeout(res, 3000);
    })));
    await new Promise((r) => requestAnimationFrame(r));

    const cv = renderBoardToCanvas({
      scale,
      transparent: $('#expTransparent').checked,
      tone: $('#expTone').checked,
      title: $('#expTitle').value.trim(),
      watermark: $('#expMark').checked
    });
    const name = ($('#expName').value.trim() || '拼贴诗') + '.png';
    cv.toBlob((blob) => {
      if (blob) download(blob, name);
      else download(cv.toDataURL('image/png'), name);
      btn.disabled = false;
      btn.textContent = '导出 PNG';
      toast('已导出：' + name);
    }, 'image/png');
  }

  /* ========================= 6. 弹窗 ========================= */

  function openModal(sel) {
    const m = $(sel);
    if (m) m.classList.add('is-open');
  }
  function closeModals() {
    $$('.modal.is-open').forEach((m) => m.classList.remove('is-open'));
  }

  /* ========================= 7. 启动与绑定 ========================= */

  function switchView(tab) {
    const t = $('.tab[data-tab="' + tab + '"]');
    if (t) t.click();
  }

  function bindTabs() {
    $$('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        $$('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
        $$('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== t.dataset.tab; });
        if (t.dataset.tab === 'studio' || t.dataset.tab === 'assets') requestAnimationFrame(renderTools);
        try { history.replaceState(null, '', '#' + t.dataset.tab); } catch (e) { /* 忽略 */ }
      });
    });
    /* 支持用 #studio / #assets / #help 直接打开对应板块（BBS 链接很方便） */
    const want = (location.hash || '').replace('#', '');
    if (want && $('.tab[data-tab="' + want + '"]')) $('.tab[data-tab="' + want + '"]').click();
  }

  /* 一键随机：按当前结构造 4~7 条，自动排版成一屏 */
  function scatterRandomPoem() {
    if (board.pieces.length && !window.confirm('会在现有拼贴上继续添加，确定吗？')) return;
    const bw = boardEl.clientWidth || 700;
    const bh = boardEl.clientHeight || 520;
    snapshot();
    const rng = rnd(uid());
    const n = 4 + Math.floor(rng() * 4);
    const seedBase = uid();
    const cols = 2;
    const rows = Math.ceil(n / cols);

    /* 从四个列表里都能取：短语 / 句子 / 词汇 / 自定义，取到什么贴什么 */
    const pickers = [];
    const activeStructs = STRUCTS.filter((s) => phraseState[s.key] !== false);
    if (activeStructs.length) {
      pickers.push(() => generatePhrase(pick(rng, activeStructs).key, seedBase + '|s' + Math.random()).text);
    }
    const sentPool = wmGroups().filter((g) => g.key === 'sentence')[0];
    const vocPool = wmGroups().filter((g) => g.key === 'vocab')[0];
    [sentPool, vocPool].forEach((g) => {
      if (!g) return;
      const act = g.pools.filter((p) => poolState[p.id] !== false && ((p.items && p.items.length) || p.kind === 'gen'));
      if (!act.length) return;
      pickers.push(() => {
        const one = samplePool(pick(rng, act), 1)[0];
        return one ? one.text : '';
      });
    });
    if (customItems.length) pickers.push(() => customSample(1)[0].text);
    if (!pickers.length) pickers.push(() => generatePhrase(pick(rng, STRUCTS).key, seedBase + '|' + Math.random()).text);

    for (let i = 0; i < n; i++) {
      let txt = '';
      let guard = 0;
      while (!txt && guard++ < 8) txt = pickers[Math.floor(rng() * pickers.length)]();
      if (!txt) continue;
      const fontPx = 17 + Math.floor(rng() * 12);
      const c = i % cols, r = Math.floor(i / cols);
      /* 排版：两列网格 + 抖动，再收敛到板内 */
      const cx = (bw * (c + 0.5)) / cols + (rng() * 2 - 1) * bw * 0.06;
      const cy = (bh * (r + 0.5)) / rows + (rng() * 2 - 1) * bh * 0.05;
      addTextPiece(txt, {
        x: round2(clamp((cx / bw) * 100, 4, 96)),
        y: round2(clamp((cy / bh) * 100, 6, 94)),
        rot: (rng() * 2 - 1) * 11,
        fontPx
      });
    }
    renderPieces();
    constrainPieces();
    resolveOverlaps(20);
    renderPieces();
    persist();
    toast('随机拼了一首，拖一拖更好看');
  }

  /* 把超出板面的碎片收回来（按旋转后的包围盒算，留 2% 边距） */
  function constrainPieces() {
    const bw = boardEl.clientWidth, bh = boardEl.clientHeight;
    if (!bw || !bh) return;
    for (const p of board.pieces) {
      const rad = (p.rot * Math.PI) / 180;
      const bboxW = Math.abs(p.baseW * p.scale * Math.cos(rad)) + Math.abs(p.baseH * p.scale * Math.sin(rad));
      const bboxH = Math.abs(p.baseH * p.scale * Math.cos(rad)) + Math.abs(p.baseW * p.scale * Math.sin(rad));
      const halfX = ((bboxW / 2) / bw) * 100;
      const halfY = ((bboxH / 2) / bh) * 100;
      p.x = round2(clamp(p.x, Math.min(50, halfX * 0.96), Math.max(50, 100 - halfX * 0.96)));
      p.y = round2(clamp(p.y, Math.min(50, halfY * 0.96), Math.max(50, 100 - halfY * 0.96)));
    }
  }

  /* 自动排版时把互相压住的碎片轻轻推开（手动摆放不动） */
  function resolveOverlaps(iterations) {
    const bw = boardEl.clientWidth, bh = boardEl.clientHeight;
    if (!bw || !bh) return 0;
    const box = (p) => {
      const rad = (p.rot * Math.PI) / 180;
      const w = Math.abs(p.baseW * p.scale * Math.cos(rad)) + Math.abs(p.baseH * p.scale * Math.sin(rad));
      const h = Math.abs(p.baseH * p.scale * Math.cos(rad)) + Math.abs(p.baseW * p.scale * Math.sin(rad));
      return { x: (p.x / 100) * bw, y: (p.y / 100) * bh, hw: w / 2, hh: h / 2 };
    };
    let moved = 0;
    for (let it = 0; it < iterations; it++) {
      let any = false;
      for (let i = 0; i < board.pieces.length; i++) {
        for (let j = i + 1; j < board.pieces.length; j++) {
          const A = box(board.pieces[i]), B = box(board.pieces[j]);
          const ox = (A.hw + B.hw) * 0.93 - Math.abs(B.x - A.x);
          const oy = (A.hh + B.hh) * 0.93 - Math.abs(B.y - A.y);
          if (ox <= 0 || oy <= 0) continue;
          any = true;
          moved++;
          /* 沿重叠较小的方向推开，向上更优先（像真的在贴纸） */
          if (oy <= ox) {
            const dir = (B.y >= A.y) ? 1 : -1;
            const d = (oy / 2 + 1) / bh * 100 * dir;
            board.pieces[i].y = round2(clamp(board.pieces[i].y - d, 2, 98));
            board.pieces[j].y = round2(clamp(board.pieces[j].y + d, 2, 98));
          } else {
            const dir = (B.x >= A.x) ? 1 : -1;
            const d = (ox / 2 + 1) / bw * 100 * dir;
            board.pieces[i].x = round2(clamp(board.pieces[i].x - d, 2, 98));
            board.pieces[j].x = round2(clamp(board.pieces[j].x + d, 2, 98));
          }
        }
      }
      if (!any) break;
    }
    constrainPieces();
    return moved;
  }

  /* 把碎片篮里的图片碎片按网格摆到板上 */
  function placeFragsOnBoard(list) {
    const items = list.slice(0, 12);
    if (!items.length) return 0;
    const bw = boardEl.clientWidth || 700;
    const bh = boardEl.clientHeight || 520;
    const cols = 3;
    const rows = Math.ceil(items.length / cols);
    items.forEach((f, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const m = { ratio: f.ratio || 3 };
      const ph = 46;
      const pw = Math.max(60, Math.min(300, ph * m.ratio));
      const cx = (bw * (c + 0.5)) / cols + (Math.random() * 2 - 1) * bw * 0.04;
      const cy = (bh * (r + 0.5)) / rows + (Math.random() * 2 - 1) * bh * 0.04;
      addImagePiece(f, {
        x: round2(clamp((cx / bw) * 100, (pw / 2 / bw) * 100 + 1, 100 - (pw / 2 / bw) * 100 - 1)),
        y: round2(clamp((cy / bh) * 100, (ph / 2 / bh) * 100 + 1, 100 - (ph / 2 / bh) * 100 - 1)),
        rot: Math.random() * 12 - 6
      });
    });
    renderPieces();
    resolveOverlaps(16);
    renderPieces();
    return items.length;
  }

  /* —— 背景模板弹窗：缩略图就是用导出同一套绘制函数画的 —— */
  function buildTemplateGrid() {
    const grid = $('#tplGrid');
    if (!grid || !window.PaperLab) return;
    grid.innerHTML = '';
    PaperLab.BG_TEMPLATES.forEach((t) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'tpl-card';
      card.dataset.tpl = t.key;
      card.setAttribute('aria-pressed', String(t.key === board.tpl));
      card.title = t.desc;

      const th = document.createElement('div');
      th.className = 'tpl-card__thumb';
      th.style.background = t.paper || '#211d1c';

      const texKind = (t.textures && t.textures[0]) || null;
      if (texKind) {
        const tex = document.createElement('i');
        tex.style.backgroundImage = 'url(' + PaperLab.textureUrl(texKind, { seed: board.tplSeed }) + ')';
        tex.style.backgroundSize = t.key === 'kraft' ? '160px' : '230px';
        if (t.dark) tex.style.mixBlendMode = 'screen';
        th.appendChild(tex);
      }
      if (t.line) {
        const cv = document.createElement('canvas');
        cv.width = 300; cv.height = 225;
        PaperLab.drawLines(cv.getContext('2d'), t.line, 300, 225, 1);
        th.appendChild(cv);
      }
      card.appendChild(th);

      const name = document.createElement('b');
      name.textContent = t.name;
      const desc = document.createElement('span');
      desc.textContent = t.desc;
      card.appendChild(name);
      card.appendChild(desc);

      card.addEventListener('click', () => { setTemplate(t.key); });
      grid.appendChild(card);
    });
  }

  function bindBoard() {
    const bt = $('#btnTemplate');
    if (bt) bt.addEventListener('click', () => {
      buildTemplateGrid();
      const ts = $('#texScaleRange');
      if (ts) {
        ts.value = String(Math.round((board.texScale || 1) * 100));
        const tv = $('#texScaleVal');
        if (tv) tv.textContent = ts.value + '%';
      }
      openModal('#modalTemplate');
    });
    /* 纸纹粗细：底板与贴纸一起变 */
    const tsr = $('#texScaleRange');
    if (tsr) {
      tsr.addEventListener('input', () => {
        board.texScale = Number(tsr.value) / 100;
        const tv = $('#texScaleVal');
        if (tv) tv.textContent = tsr.value + '%';
        renderPaper();
        board.pieces.forEach((p) => { if (p.kind === 'text') refreshFx(p); });
      });
      tsr.addEventListener('change', () => persist());
    }
    const tsreset = $('#texScaleReset');
    if (tsreset) tsreset.addEventListener('click', () => {
      board.texScale = 1;
      if (tsr) tsr.value = '100';
      const tv = $('#texScaleVal');
      if (tv) tv.textContent = '100%';
      renderPaper();
      board.pieces.forEach((p) => { if (p.kind === 'text') refreshFx(p); });
      persist();
    });
    const br = $('#btnRandomTpl');
    if (br) br.addEventListener('click', randomTemplate);
    const tr = $('#tplRandom');
    if (tr) tr.addEventListener('click', randomTemplate);
    $('#btnClear').addEventListener('click', () => {
      if (!board.pieces.length) { toast('板子本来就是空的'); return; }
      snapshot();
      board.pieces = [];
      renderPieces();
      persist();
      toast('已清空（Ctrl+Z 可撤销）');
    });
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#btnRandom').addEventListener('click', scatterRandomPoem);
    $('#btnExport').addEventListener('click', () => {
      if (!board.pieces.length) { toast('板子还是空的，先造几个词贴上去'); return; }
      openModal('#modalExport');
    });
    window.addEventListener('resize', () => { renderPaper(); renderTools(); });
    window.addEventListener('scroll', layoutTools, { passive: true });
  }

  function bindStudio() {
    loadCustom();
    renderWm();

    /* 造词 / 全选 / 全不选：事件委托，面板重建也不用重绑 */
    const wrap = $('#wmPanels');
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.gen) wmGenerate(btn.dataset.gen);
      else if (btn.dataset.all) wmSetAll(btn.dataset.all, true);
      else if (btn.dataset.none) wmSetAll(btn.dataset.none, false);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.target.id !== 'customInput') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addCustomFromInput(); }
    });
    /* 自定义面板的两个按钮是动态生成的，用委托接 */
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('#btnCustomAdd');
      if (b) addCustomFromInput();
    });

    renderHistory();
  }

  function bindAssets() {
    const drop = $('#drop');
    drop.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => { handleFiles(imageInput.files); imageInput.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files;
      if (f && f.length) handleFiles(f);
    });
    $('#btnSample').addEventListener('click', useSampleSheet);
    $('#btnAddAll').addEventListener('click', () => {
      if (!frags.length) { toast('碎片篮是空的'); return; }
      snapshot();
      const n = placeFragsOnBoard(frags);
      persist();
      toast('已贴上 ' + n + ' 片');
    });
    $('#btnClearFrags').addEventListener('click', () => { frags.length = 0; renderFrags(); });

    /* 阈值 / 识别模式：改了要重新分析 */
    const re = () => {
      if (cropState) openCropModal(cropState.dataUrl, cropState.fileName);
    };
    let reTimer = 0;
    $('#thrBias').addEventListener('input', () => {
      $('#thrVal').textContent = $('#thrBias').value;
      clearTimeout(reTimer);
      reTimer = setTimeout(re, 260);
    });
    $('#cropMode').addEventListener('change', re);

    $('#cropAll').addEventListener('click', () => { cropState.picked = cropState.picked.map(() => true); syncCropSVG(); });
    $('#cropNone').addEventListener('click', () => { cropState.picked = cropState.picked.map(() => false); syncCropSVG(); });
    $('#cropAdd').addEventListener('click', () => {
      if (!cropState) return;
      let items = [];
      try {
        items = cropState.res.boxes.filter((b, i) => cropState.picked[i]).map((b) => cutBox(cropState.res.cv, b, cropState.res.scale));
      } catch (err) {
        (window.__errs = window.__errs || []).push('cutBox: ' + (err && err.message));
        toast('剪字失败：' + (err && err.message));
        return;
      }
      if (!items.length) { toast('一片都没选'); return; }
      const n = addFragsToTray(items);
      closeModals();
      switchView('assets');
      toast(n ? '剪下 ' + n + ' 片，点碎片就能贴上板' : '这些都是重复碎片');
    });

    /* 直接粘贴图片 */
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && /^image\//.test(it.type)) {
          const f = it.getAsFile();
          if (f) { handleFiles([f]); toast('已读入剪贴板图片'); }
          break;
        }
      }
    });
  }

  function bindModals() {
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
    $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
    $('#expDo').addEventListener('click', exportPNG);
  }

  function init() {
    window.__boot.init = true;
    /* ?reset=1 忽略本地草稿，从空板开始 */
    const restored = /[?&]reset=1/.test(location.search) ? false : restoreDraft();
    bindTabs();
    bindBoard();
    bindStudio();
    bindAssets();
    bindModals();
    bindFx();
    /* ?tpl=grid 直接指定背景模板（方便分享链接） */
    const tplQ = (location.search.match(/[?&]tpl=([a-z]+)/) || [])[1];
    if (tplQ && window.PaperLab && PaperLab.TPL_MAP[tplQ]) board.tpl = tplQ;
    setTemplate(board.tpl, false);
    /* 工作台默认是隐藏的，板子量不到宽高；切过去之后再画一次线条 */
    if (window.ResizeObserver) {
      paperRO = new ResizeObserver(() => { renderPaper(); renderTools(); });
      paperRO.observe(boardEl);
    }
    requestAnimationFrame(renderPaper);
    renderPieces();
    renderFrags();
    generate();
    if (restored) toast('已恢复上次的拼贴草稿');

    /* ?demo=1 ：装一份示例（随机一首诗 + 用内置样张剪下的字），用来演示 / 截图 */
    if (/[?&]demo=1/.test(location.search)) {
      switchView('studio');
      if (!board.pieces.length) {
        scatterRandomPoem();
        /* 板上尺寸要等切到工作台之后才量得准 */
        requestAnimationFrame(() => { constrainPieces(); resolveOverlaps(14); renderPieces(); });
        const keepOpen = /[?&]crop=1/.test(location.search);
        const sheetUrl = makeSampleDataUrl();
        window.__boot.demo = 'start';
        analyzeSource(sheetUrl, { work: 1024, bias: 0, mode: 'auto' }).then((res) => {
          window.__boot.demo = 'analyzed:' + res.boxes.length;
          const items = res.boxes.map((b) => cutBox(res.cv, b, res.scale));
          addFragsToTray(items);
          window.__boot.demo = 'tray:' + frags.length;
          if (keepOpen) {
            cropState = { dataUrl: sheetUrl, fileName: 'sample', bias: 0, mode: 'auto', res, picked: res.boxes.map(() => true) };
            drawCropStage();
            openModal('#modalCrop');
          } else {
            placeFragsOnBoard(frags);
            persist();
          }
        }).catch(() => { toast('示例装载失败'); });
      }
    }

    if (window.ResizeObserver && !paperRO) {
      paperRO = new ResizeObserver(() => { renderPaper(); renderTools(); });
      paperRO.observe(boardEl);
    }
    window.__boot.done = true;
    window.__boot.pieces = board.pieces.length;
    window.__boot.pills = document.querySelectorAll('#resultBox .pill').length;
    window.__boot.board = boardEl.clientWidth + 'x' + boardEl.clientHeight;
  }

  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  } catch (err) {
    window.__boot.error = String((err && err.stack) || err);
    throw err;
  }
})();
