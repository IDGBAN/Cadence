import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches everything for an empty query', () => {
    expect(fuzzyMatch('', 'Anything')).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch('   ', 'Anything')).toEqual({ score: 0, indices: [] });
  });

  it('is case and accent insensitive', () => {
    expect(fuzzyMatch('cafe', 'Café time')?.indices).toEqual([0, 1, 2, 3]);
    expect(fuzzyMatch('GYM', 'Go to the gym')).not.toBeNull();
  });

  it('returns null when characters are not in order', () => {
    expect(fuzzyMatch('xyz', 'Drink water')).toBeNull();
    expect(fuzzyMatch('retaw', 'water')).toBeNull();
  });

  it('highlights contiguous substrings, preferring word starts', () => {
    expect(fuzzyMatch('water', 'Drink water')?.indices).toEqual([6, 7, 8, 9, 10]);
    expect(fuzzyMatch('in', 'Drink insights')?.indices).toEqual([6, 7]);
  });

  it('ranks prefix > word start > mid-word substring > subsequence', () => {
    const prefix = fuzzyMatch('stu', 'Study')!.score;
    const wordStart = fuzzyMatch('stu', 'Deep study')!.score;
    const midWord = fuzzyMatch('tud', 'Study')!.score;
    const subsequence = fuzzyMatch('sdy', 'Study')!.score;
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(midWord);
    expect(midWord).toBeGreaterThan(subsequence);
  });

  it('prefers word-start characters for subsequence matches (acronyms)', () => {
    const m = fuzzyMatch('vd', 'Take vitamin D');
    expect(m?.indices).toEqual([5, 13]);
    const tv = fuzzyMatch('tvd', 'Take vitamin D');
    expect(tv?.indices).toEqual([0, 5, 13]);
  });

  it('ignores spaces in the query for subsequence matching', () => {
    expect(fuzzyMatch('go gym', 'Go to the gym')?.indices).toEqual([0, 1, 10, 11, 12]);
  });

  it('supports contiguous-only matching', () => {
    expect(fuzzyMatch('gym', 'Go to your gym', { contiguous: true })?.indices).toEqual([11, 12, 13]);
    expect(fuzzyMatch('gtg', 'Go to the gym', { contiguous: true })).toBeNull();
    expect(fuzzyMatch('gtg', 'Go to the gym')).not.toBeNull();
  });

  it('exact match scores highest', () => {
    expect(fuzzyMatch('brush', 'Brush')!.score).toBeGreaterThan(fuzzyMatch('brush', 'Brush teeth')!.score);
  });
});
