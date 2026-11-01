// 美術數值（PLAN.md 第 4 節）。調整畫面只改呢度。
export const PALETTE = {
  fog: 0x0b0807,
  shadow: 0x1a0f0a,
  blood: 0x8a1010,
  fire: 0xd9771f,
  bone: 0xc8b89a,
  iron: 0x4a4d52,
  gold: 0xb8953d,
} as const;

export const CAMERA = {
  fov: 35,
  pitchDeg: 50,
  yawDeg: 45,
  distance: 18,
  minDistance: 14,
  maxDistance: 22,
  followLerp: 5,
  zoomLerp: 8,
};

export const LIGHT = {
  hemi: 0.05,
  heroColor: 0xffc48a,
  heroIntensity: 46,
  heroDistance: 8,
  heroHeight: 3.5,
  shadowMap: 2048,
  torchIntensity: 24,
  torchDistance: 6,
  torchFlicker: 0.15,
  candleIntensity: 7,
  candleDistance: 4.5,
  maxTorches: 8,
  fogDensity: 0.045,
};

/** 畫質：Phase 7 先有選單，而家用網址 ?q=low|medium|high 切換 */
export const QUALITY = {
  low: { ao: false, aoHalf: true, shadows: false, ghoulShadows: false, shadowMap: 512, pixelRatio: 0.75, maxTorches: 4 },
  medium: { ao: true, aoHalf: true, shadows: true, ghoulShadows: false, shadowMap: 1024, pixelRatio: 1, maxTorches: 6 },
  high: { ao: true, aoHalf: false, shadows: true, ghoulShadows: true, shadowMap: 2048, pixelRatio: 1.5, maxTorches: 8 },
};
export type QualityName = keyof typeof QUALITY;

export const POST = {
  aoRadius: 1.4,
  aoFalloff: 1,
  aoIntensity: 3.2,
  bloomThreshold: 0.85,
  bloomStrength: 0.6,
  saturation: 0.8,
  shadowTint: 0.5,
  vignette: 0.45,
  grain: 0.04,
};

export const PLAYER = {
  walkSpeed: 2.2,
  runSpeed: 5.2,
  runDistance: 4, // 目標遠過呢個距離就跑
  turnLerp: 12,
  radius: 0.45,
  fade: 0.18,
};

