// 玩家設定（畫質、音量、滑鼠），獨立於存檔，開新遊戲都唔會冇
export type QualitySetting = 'auto' | 'low' | 'medium' | 'high';
export interface Settings { quality: QualitySetting; volume: number; holdMove: boolean; invertZoom: boolean }

const KEY = 'ashenbell-settings-v1';
const DEFAULT: Settings = { quality: 'auto', volume: 0.7, holdMove: true, invertZoom: false };

export function loadSettings(): Settings {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULT }; }
}
export const saveSettings = (s: Settings) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 私密瀏覽 */ } };

/** 自動畫質：內置顯示卡用低，其他用中 */
export function autoQuality(gpu: string): 'low' | 'medium' {
  return /intel|uhd|iris|swiftshader|llvmpipe|basic render/i.test(gpu) && !/nvidia|radeon|geforce|\barc\b/i.test(gpu) ? 'low' : 'medium';
}
