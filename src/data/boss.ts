// Boss 同結局（PLAN.md 第 6.6、7.6、7.7 節）
export const BOSS = {
  name: '墮落院長 瓦隆',
  level: 14,
  phase2: 0.7,
  phase3: 0.35,
  phaseStagger: 1.6,
  summonEvery: 9,
  summons: 2,
  runeEvery: 4.5,
  runeCount: 3,
  runeDelay: 1,
  runeRadius: 2,
  runeMult: 0.9,
  chargeEvery: 8,
  chargeSpeed: 11,
  chargeTime: 1,
  chargeMult: 1,
  bellEvery: 7,
  bellSpeed: 8,
  bellRange: 26,
  bellMult: 1.6,
  phase3Scale: 1.22,
  phase3Tint: 0x3a0606,
  lines: {
    open: '你父親當年都企喺你而家嘅位置……佢明白，有啲交易係必要嘅。',
    phase2: '三十年！我為呢個鎮守咗三十年！',
    phase3: '……鐘……要……響……',
    death: '無聲者……唔止……一個……',
  },
  lineTime: 4.5,
  drops: { legends: 1, rares: 2, goldPerLevel: 40 },
};

export const ENDING = {
  ge: ['……鐘聲停咗。今晚，全鎮第一次瞓得著。', '呢頁係由院長日記最後撕落嚟嘅。我一直唔敢睇。', '「谷外仲有六口鐘。」'],
  lines: ['鐘聲停止。', '荒鐘鎮第一次迎來冇鐘聲嘅子夜。', '但灰燼谷嘅盡頭，仲有六口鐘。'],
  title: '第一章 完',
  after: {
    ge: '三十年嘅夜，總算守完。谷外嘅鐘，就交俾你。',
    dala: '院長嘅血都係紅色㗎。你把刀，我幫你留意住。',
    herb: '聽到冇？今晚個鐘冇響。冇人要送行喇。',
  },
};
