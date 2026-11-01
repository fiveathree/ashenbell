// 劇本（PLAN.md 第 7 節）。文字只改呢度。
export const OPENING = [
  '荒鐘鎮嘅鐘，已經三十年冇人敲過。',
  '直至上個月，佢每晚子時自己響。',
  '第一晚，三個人失蹤。',
  '第七晚，佢哋由修道院地底爬返嚟——',
  '但已經唔再係人。',
];

export const JOURNAL = [
  '「封印裂咗。我嘅血唔夠。無聲者喺黑暗中同我講嘢。」',
  '「佢唔要我嘅命，佢要嘅係聲音——人臨死嗰一聲。佢答應俾我時間。」',
  '「鐘一響，佢哋就會自己行落嚟。我只係……打開門。」',
];

export const RELIC_TEXT = '骸骨堆入面有失蹤村民嘅遺物，旁邊係修道院嘅縛繩——佢哋係被綁住送落嚟。';

export const QUEST_TEXT = [
  '同守夜人老葛傾偈',
  '任務一：失蹤者 — 入地窖，搵失蹤者去向',
  '任務一：返去話老葛知你見到咩',
  '任務二：沉沒嘅禱告 — 喺淹沒禮拜堂搵院長日記',
  '任務二：將日記交俾老葛',
  '任務三：鐘聲之源 — 落封印之井',
  '返荒鐘鎮，將結果話俾老葛知',
  '第一章完。灰燼谷外仲有六口鐘',
];

export type NpcId = 'ge' | 'dala' | 'herb';

export const NPCS: Record<NpcId, { name: string; title: string; x: number; z: number; tint: number }> = {
  ge: { name: '老葛', title: '守夜人', x: 25, z: 21, tint: 0x6d604c },
  dala: { name: '妲拉', title: '鐵匠', x: 19, z: 33, tint: 0x7a5a42 },
  herb: { name: '草藥婆', title: '草藥師', x: 38, z: 30, tint: 0x4d4a58 },
};

/** 老葛每個階段講咩；advance = 講完推進任務 */
export const GE_TALK: { lines: string[]; advance?: boolean }[] = [
  { lines: ['你終於返嚟……鎮上已經冇幾個人敢出門。修道院地底有嘢醒咗。', '入地窖睇吓失蹤嘅人去咗邊。'], advance: true },
  { lines: ['地窖嘅入口喺修道院大門。小心啲。'] },
  { lines: ['被人「送」落去？……唔會嘅，院長大人用命封印咗嗰隻嘢。', '再落深一層。禮拜堂淹咗水之後，就冇人落過去。'], advance: true },
  { lines: ['禮拜堂有院長留低嘅嘢。搵到就帶返嚟。'] },
  { lines: ['（老葛睇完日記，沉默良久。）', '……我守咗三十年夜，原來守錯咗方向。', '封印之井喺最深處。去啦，獵魔人。'], advance: true },
  { lines: ['封印之井喺最深處。鐘聲就係由嗰度嚟。'] },
];

export const DALA_TALK = '刀鈍咗就拎嚟。地底嗰啲嘢，唔會等你磨好先撲過嚟。';
export const HERB_TALK = '院長走嗰晚，鐘冇響。真正犧牲嘅人，送行時鐘一定會響嘅……你自己諗吓。';

export const DEATH_GOLD_LOSS = 0.1;

export const SHOP = {
  herb: [
    { id: 'hp' as const, name: '生命藥水', price: 25 },
    { id: 'rage' as const, name: '怒氣藥水', price: 40 },
  ],
  smithOffers: 5,
  reforgeBase: 60,
  reforgePerLevel: 14,
  whitePriceMult: 2,
};
