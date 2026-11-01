// 主線進度（純邏輯）
import { GE_TALK, QUEST_TEXT } from '../data/story';
import { ENDING } from '../data/boss';

export class Story {
  stage = 0;
  relic = false;
  pages = [false, false, false];
  seenOpening = false;
  boss = false;

  get questText() { return QUEST_TEXT[this.stage]; }
  get finished() { return this.stage >= 7; }
  get pagesFound() { return this.pages.filter(Boolean).length; }

  /** 同老葛傾：回傳對白，符合條件先推進 */
  talkGe() {
    if (this.stage === 6) { this.stage = 7; return ENDING.ge; }
    if (this.stage === 7) return [ENDING.after.ge];
    const t = GE_TALK[this.stage];
    if (t.advance) this.stage++;
    // 接任務之前已經搵到：唔使再搵多次
    if (this.stage === 1 && this.relic) this.stage = 2;
    if (this.stage === 3 && this.pagesFound === 3) this.stage = 4;
    if (this.stage === 5 && this.boss) this.stage = 6;
    return t.lines;
  }

  beatBoss() {
    this.boss = true;
    if (this.stage === 5) this.stage = 6;
  }

  foundRelic() {
    if (this.relic) return false;
    this.relic = true;
    if (this.stage === 1) this.stage = 2;
    return true;
  }

  foundPage(i: number) {
    if (this.pages[i]) return false;
    this.pages[i] = true;
    if (this.pagesFound === 3 && this.stage === 3) this.stage = 4;
    return true;
  }
}
