export interface FuzzyMatch {
  score: number;
  indices: number[];
}

const SEPARATOR = /[\s\-_/.,:;()[\]&+·|]/;

function foldChar(ch: string): string {
  const base = ch.normalize('NFD').charAt(0);
  return base.toLowerCase().charAt(0) || ch;
}

// same length as the input so match indices map straight back onto `text`
function foldString(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += foldChar(text[i]);
  return out;
}

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  if (SEPARATOR.test(prev)) return true;
  const cur = text[i];
  return prev === prev.toLowerCase() && prev !== prev.toUpperCase() && cur !== cur.toLowerCase();
}

function isSubsequence(needle: string, haystack: string, from: number): boolean {
  let pos = from;
  for (let i = 0; i < needle.length; i++) {
    pos = haystack.indexOf(needle[i], pos);
    if (pos === -1) return false;
    pos++;
  }
  return true;
}

export interface FuzzyOptions {
  contiguous?: boolean;
}

export function fuzzyMatch(query: string, text: string, options: FuzzyOptions = {}): FuzzyMatch | null {
  const q = foldString(query.trim().replace(/\s+/g, ' '));
  if (!q) return { score: 0, indices: [] };
  const t = foldString(text);

  const sub = t.indexOf(q);
  if (sub !== -1) {
    let start = sub;
    // prefer a later hit at a word start ("in" should match "Insights", not "Drink")
    if (!isWordStart(text, sub)) {
      let next = t.indexOf(q, sub + 1);
      while (next !== -1 && !isWordStart(text, next)) next = t.indexOf(q, next + 1);
      if (next !== -1) start = next;
    }
    let score = 1000 - start * 2 - (t.length - q.length) * 0.5;
    if (isWordStart(text, start)) score += 200;
    if (start === 0) score += 150;
    if (q.length === t.length) score += 300;
    const indices: number[] = [];
    for (let i = start; i < start + q.length; i++) if (q[i - start] !== ' ') indices.push(i);
    return { score, indices };
  }

  if (options.contiguous) return null;

  // no substring hit, fall back to an in-order subsequence
  const chars = q.replace(/ /g, '');
  const indices: number[] = [];
  let from = 0;
  for (let qi = 0; qi < chars.length; qi++) {
    const c = chars[qi];
    let j = t.indexOf(c, from);
    if (j === -1) return null;
    const prev = indices[indices.length - 1];
    const continuesRun = prev !== undefined && j === prev + 1;
    if (!continuesRun && !isWordStart(text, j)) {
      // jump to a later word start if the rest of the query still fits after it
      const rest = chars.slice(qi + 1);
      for (let k = t.indexOf(c, j + 1); k !== -1; k = t.indexOf(c, k + 1)) {
        if (isWordStart(text, k) && isSubsequence(rest, t, k + 1)) {
          j = k;
          break;
        }
      }
    }
    indices.push(j);
    from = j + 1;
  }

  let score = 0;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    score += 10;
    if (isWordStart(text, idx)) score += 20;
    if (i > 0) {
      const gap = idx - indices[i - 1] - 1;
      if (gap === 0) score += 15;
      else score -= Math.min(gap, 8);
    }
  }
  score -= Math.min(indices[0], 12);
  score -= (t.length - chars.length) * 0.25;
  return { score, indices };
}
