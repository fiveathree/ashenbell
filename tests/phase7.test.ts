import { rollChest } from '../src/items/item';
import { CHEST } from '../src/data/items';
import { describe, expect, it } from 'vitest';
import { autoQuality } from '../src/core/settings';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('自動畫質', () => {
  it('內置顯示卡用低，獨立顯卡用中', () => {
    expect(autoQuality('ANGLE (Intel, Intel(R) UHD Graphics Direct3D11)')).toBe('low');
    expect(autoQuality('Google SwiftShader')).toBe('low');
    expect(autoQuality('ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 6GB Laptop GPU)')).toBe('medium');
    expect(autoQuality('ANGLE (AMD, AMD Radeon RX 6600)')).toBe('medium');
  });
});

describe('發佈檔案', () => {
  const size = (d: string): number => readdirSync(d, { withFileTypes: true })
    .reduce((s, e) => s + (e.isDirectory() ? size(join(d, e.name)) : statSync(join(d, e.name)).size), 0);

  it('素材總量少過 30MB（規格第 10 節）', () => {
    expect(size('public') / 1048576).toBeLessThan(30);
  });

  it('有 favicon、分享圖、網頁描述', () => {
    const html = readFileSync('index.html', 'utf8');
    for (const f of ['public/favicon.ico', 'public/apple-touch-icon.png', 'public/og-image.png']) expect(statSync(f).size).toBeGreaterThan(100);
    expect(html).toContain('og:image');
    expect(html).toContain('name="description"');
  });

  it('CREDITS 記錄晒所有 Poly Haven 素材', () => {
    const c = readFileSync('docs/CREDITS.md', 'utf8'), s = readFileSync('scripts/fetch-assets.mjs', 'utf8');
    const block = s.slice(s.indexOf('const TEXTURES'), s.indexOf('const HEAVY'));
    const ids = [...block.matchAll(/'([A-Za-z_0-9]+)'/g)].map(m => m[1]);
    for (const id of ids) expect(c).toContain(id);
  });
});

describe('寶箱', () => {
  it('一定有魔法以上裝備同金幣', () => {
    for (let i = 0; i < 200; i++) {
      const l = rollChest(Math.random, 8);
      expect(['magic', 'rare']).toContain(l.item!.rarity);
      expect(l.gold).toBeGreaterThanOrEqual(CHEST.goldPerLevel[0] * 8);
    }
  });
});
