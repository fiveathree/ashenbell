// 主線進度（純邏輯）
import { GE_TALK, QUEST_TEXT } from '../data/story';

export class Story {
  stage = 0;
  relic = false;
  pages = [false, false, false];
  seenOpening = false;

  get questText() { return QUEST_TEXT[this.stage]; }
  get pagesFound() { return this.pages.filter(Boolean).length; }

  /** 同老葛傾：回傳對白，符合條件先推進 */
  talkGe() {
    const t = GE_TALK[this.stage];
    if (t.advance) this.stage++;
    return t.lines;
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
