// 存檔（PLAN.md 第 6.13 節）：localStorage 自動存檔 + 匯出／匯入 JSON
import { Hero } from '../items/hero';
import { noteUid, type Item } from '../items/item';
import { Story } from '../story/quests';
import type { EquipSlot } from '../data/items';

const KEY = 'ashenbell-save-v1';
const VERSION = 1;

export interface WorldState {
  seed: number;
  floor: number; // -1 = 小鎮
  waypoints: number[];
  cleared: Record<number, number[]>; // 每層已死怪物 index
  broken: Record<number, number[]>;  // 每層已打破道具 index
  explored: Record<number, string>;  // 小地圖，0/1 字串
}

export interface SaveData {
  v: number;
  hero: Pick<Hero, 'level' | 'xp' | 'str' | 'dex' | 'vit' | 'statPoints' | 'skillPoints' | 'skills' | 'gold' | 'potions' | 'bag' | 'equip'>;
  story: Pick<Story, 'stage' | 'relic' | 'pages' | 'seenOpening'>;
  world: WorldState;
}

export function pack(hero: Hero, story: Story, world: WorldState): SaveData {
  const { level, xp, str, dex, vit, statPoints, skillPoints, skills, gold, potions, bag, equip } = hero;
  const { stage, relic, pages, seenOpening } = story;
  return { v: VERSION, hero: { level, xp, str, dex, vit, statPoints, skillPoints, skills, gold, potions, bag, equip }, story: { stage, relic, pages, seenOpening }, world };
}

/** 檢查格式；錯就回傳 null，唔會整壞現有進度 */
export function parse(text: string): SaveData | null {
  try {
    const d = JSON.parse(text) as SaveData;
    if (d?.v !== VERSION || !d.hero || !d.story || !d.world || typeof d.world.seed !== 'number') return null;
    if (!Array.isArray(d.hero.bag) || typeof d.hero.level !== 'number') return null;
    return d;
  } catch { return null; }
}

export function restore(d: SaveData, hero: Hero, story: Story) {
  Object.assign(hero, structuredClone(d.hero));
  Object.assign(story, structuredClone(d.story));
  const items: Item[] = [...hero.bag.map(p => p.item), ...(Object.values(hero.equip) as Item[])];
  items.forEach(i => noteUid(i.uid));
}

export const saveToDisk = (d: SaveData) => { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; } };
export const loadFromDisk = () => { try { const t = localStorage.getItem(KEY); return t ? parse(t) : null; } catch { return null; } };
export const clearDisk = () => { try { localStorage.removeItem(KEY); } catch { /* 私密瀏覽 */ } };

export function exportFile(d: SaveData) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }));
  a.download = `燼鐘存檔-等級${d.hero.level}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function importFile(): Promise<SaveData | null> {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { const f = inp.files?.[0]; res(f ? parse(await f.text()) : null); };
    inp.click();
  });
}

export type { EquipSlot };
