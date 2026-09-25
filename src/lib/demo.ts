import type { AppData, DayKey, Habit, LogEntry, Relapse } from '@/types';
import { createInitialData, RECOMMENDED_TEMPLATES, STARTER_TEMPLATES } from './defaults';
import { addDays, fromDayKey, logicalToday, startOfWeek, weekday } from './dates';
import { dayOverview, makeCtx } from './habitMath';
import { computeXp, evaluateAchievements, levelFromXp } from './rewards';

export interface DemoOptions {
  now?: Date;
  dayStartHour?: number;
  weekStartsOn?: 0 | 1;
}

// FNV-1a
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private readonly source: () => number;

  constructor(seed: number) {
    this.source = mulberry32(seed);
  }

  next(): number {
    return this.source();
  }

  chance(p: number): boolean {
    return this.source() < p;
  }

  // inclusive
  int(min: number, max: number): number {
    return min + Math.floor(this.source() * (max - min + 1));
  }

  // Box-Muller
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.source();
    const v = this.source();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.source() * items.length)];
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rating = (v: number) => clamp(Math.round(v), 1, 10);
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

const GYM_NOTES = ['Leg day 🦵', 'New PR on deadlift!', 'Quick upper-body session', 'Cardio + core', 'Felt strong today', 'Back and biceps'];
const STUDY_NOTES = ['Finished chapter 4', 'Practice exam: 82%', 'Flashcards + summary notes', 'Hard to focus today', 'Great deep-work session', 'Library all afternoon'];
const SLEEP_NOTES = ['Woke up at 3am', 'Slept like a rock', 'Noisy neighbours', 'Vivid dreams', 'Too warm in the room'];
const MOOD_NOTES = ['Great day with friends', 'Stressful meeting', 'Sunny walk after lunch', 'Bit flat today', 'Good news at work'];
const FOOD_NOTES = ['Meal-prepped for the week', 'Pizza night 🍕', 'Big salad for lunch', 'Too many snacks', 'Cooked a proper dinner'];
const READ_NOTES = ["Couldn't put it down", 'Started a new novel', 'A few pages before bed', 'Finished the book!'];
const RELAPSE_NOTES = ['Scrolled until 1am', 'Stressful day, zoned out on my phone', 'Short videos rabbit hole', ''];
const DAY_NOTES = [
  'Felt really productive today.',
  'Rough day. Tired and unmotivated but kept the basics going.',
  'Long walk in the park, cleared my head.',
  'Visited family for dinner.',
  'Tried a new recipe, turned out great.',
  'Busy day at work, study session was short.',
  'Great gym session and a good night of sleep.',
  'Weekend reset: cleaned, planned the week, meal-prepped.',
  'Phone stayed in the other room all evening. Slept so much better.',
  'Exam week is coming. Keeping sleep a priority.',
  'Coffee with an old friend.',
  "Lazy Sunday, and that's okay.",
];

// steady, then a rough patch around 40 days ago, then a climb over the last four weeks. it's kept
// smooth on purpose: the insights engine discounts slow drifts that move every habit at once
function phaseBoost(daysBeforeToday: number): number {
  const dip = -0.22 * Math.exp(-(((daysBeforeToday - 40) / 9) ** 2));
  const climb = daysBeforeToday < 28 ? 0.2 * (1 - daysBeforeToday / 28) : 0;
  return dip + climb;
}

// Sun..Sat, Monday is the favourite
const GYM_BY_WEEKDAY = [0.1, 0.78, 0.22, 0.58, 0.25, 0.48, 0.32];

export function generateDemoData(days = 150, seed = 42, options: DemoOptions = {}): AppData {
  const span = Math.max(1, Math.min(3650, Math.floor(Number.isFinite(days) ? days : 150)));
  const seedText = String(Number.isFinite(seed) ? Math.floor(seed) : 42);
  // one stream per habit, so changing one habit's model doesn't reshuffle the others
  const stream = (key: string) => new Rng(hashSeed(`${seedText}:${key}`));

  const base = createInitialData();
  const now = options.now ? new Date(options.now.getTime()) : new Date();
  const nowMs = now.getTime();
  const requestedHour = options.dayStartHour;
  const dayStartHour = typeof requestedHour === 'number' && Number.isInteger(requestedHour) && requestedHour >= 0 && requestedHour <= 6
    ? requestedHour
    : base.settings.dayStartHour;
  const weekStartsOn: 0 | 1 = options.weekStartsOn === 0 || options.weekStartsOn === 1 ? options.weekStartsOn : base.settings.weekStartsOn;
  const settings = { ...base.settings, dayStartHour, weekStartsOn };

  const today = logicalToday(dayStartHour, now);
  const startDay = addDays(today, -span);
  const n = span + 1; // index 0 = start day, n - 1 = today
  // Vitamin D runs a streak this long up to today, with a gap on the day before it started
  const vitaminDStreak = Math.min(70, n);
  const TODAY = n - 1;
  const dayKeys: DayKey[] = new Array(n);
  const weekdays: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    dayKeys[i] = i === 0 ? startDay : addDays(dayKeys[i - 1], 1);
    weekdays[i] = weekday(dayKeys[i]);
  }
  const boost = (i: number) => phaseBoost(TODAY - i);
  const isWeekend = (i: number) => weekdays[i] === 0 || weekdays[i] === 6;

  const todayStart = fromDayKey(today);
  todayStart.setHours(dayStartHour, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  // always draws the same amount of randomness, so logged values don't depend on when the demo is made
  const stamp = (rng: Rng, i: number, fromHour: number, toHour: number, afterMidnight = false): string => {
    const d = fromDayKey(dayKeys[i]);
    if (afterMidnight) d.setDate(d.getDate() + 1);
    const minutes = Math.floor(fromHour * 60 + rng.next() * (toHour - fromHour) * 60);
    d.setHours(0, minutes, rng.int(0, 59), 0);
    let ms = d.getTime();
    if (ms > nowMs) ms = Math.min(nowMs, Math.max(todayStartMs, nowMs - (1 + (minutes % 29)) * 60_000));
    return new Date(ms).toISOString();
  };

  const createdAtDate = fromDayKey(startDay);
  createdAtDate.setHours(9, 0, 0, 0);
  const createdAt = createdAtDate.toISOString();
  const templates = [...STARTER_TEMPLATES, ...RECOMMENDED_TEMPLATES];
  const habitIds = new Map<string, string>();
  const habits: Habit[] = base.habits.map((habit, index) => {
    const template = templates.find((t) => t.name === habit.name) ?? templates[index];
    const key = template ? template.templateId : `habit-${index}`;
    const id = `h_demo_${key}`;
    habitIds.set(key, id);
    return { ...habit, id, createdAt, startDate: startDay, quitStart: createdAt, archived: false };
  });

  const logs: Record<string, Record<DayKey, LogEntry>> = {};
  const put = (key: string, i: number, entry: LogEntry) => {
    const id = habitIds.get(key);
    if (!id) return;
    (logs[id] ??= {})[dayKeys[i]] = entry;
  };
  const withNote = (entry: LogEntry, rng: Rng, pool: readonly string[], p = 0.07): LogEntry => {
    if (rng.chance(p)) entry.note = rng.pick(pool);
    return entry;
  };

  const sick = new Set<number>();
  if (span >= 30) {
    const s = Math.round(n * 0.27);
    sick.add(s).add(s + 1);
  }
  const travel = new Set<number>();
  if (span >= 45) {
    const t = Math.round(n * 0.58);
    if (t + 2 <= TODAY - 5) travel.add(t).add(t + 1).add(t + 2);
  }
  const away = (i: number) => sick.has(i) || travel.has(i);
  const skippedEntry = (rng: Rng, i: number): LogEntry => ({
    value: 0,
    skipped: true,
    note: sick.has(i) ? 'Sick' : 'Travel',
    updatedAt: stamp(rng, i, 9, 12),
  });

  // spread over the first two thirds, never on adjacent days
  const relapseRng = stream('no-doomscroll');
  const relapseCount = span >= 90 ? 5 : span >= 45 ? 4 : span >= 21 ? 3 : span >= 7 ? 1 : 0;
  const relapseDays = new Set<number>();
  for (let k = 0; k < relapseCount; k++) {
    const fraction = relapseCount === 1 ? 0.4 : 0.1 + (0.56 * k) / (relapseCount - 1);
    let index = clamp(Math.round(fraction * span) + relapseRng.int(-2, 2), 1, Math.max(1, TODAY - 3));
    while ((relapseDays.has(index - 1) || relapseDays.has(index) || relapseDays.has(index + 1)) && index < TODAY - 3) index++;
    if (index >= 1 && index < TODAY && !relapseDays.has(index - 1) && !relapseDays.has(index) && !relapseDays.has(index + 1)) {
      relapseDays.add(index);
    }
  }
  const quitHabitId = habitIds.get('no-doomscroll');
  const relapses: Relapse[] = !quitHabitId
    ? []
    : [...relapseDays]
      .sort((a, b) => a - b)
      .map((index, k) => {
        const at = fromDayKey(dayKeys[index]);
        at.setHours(22, relapseRng.int(0, 100), 0, 0);
        const relapse: Relapse = { id: `rel_demo_${k + 1}`, habitId: quitHabitId, at: at.toISOString() };
        const note = relapseRng.pick(RELAPSE_NOTES);
        if (note) relapse.note = note;
        return relapse;
      });

  // days where everything gets done, so the history has some perfect days
  const greatRng = stream('great-days');
  const great = new Set<number>();
  const pickGreatDays = (count: number, fromDaysBefore: number, toDaysBefore: number) => {
    for (let k = 0, attempts = 0; k < count && attempts < 60; attempts++) {
      const index = TODAY - greatRng.int(fromDaysBefore, toDaysBefore);
      if (index < 1 || index >= TODAY || index === TODAY - vitaminDStreak || great.has(index) || away(index)) continue;
      if (relapseDays.has(index) || relapseDays.has(index - 1)) continue;
      great.add(index);
      k++;
    }
  };
  if (span >= 90) pickGreatDays(2, 55, Math.min(span - 1, 120));
  if (span >= 14) pickGreatDays(4, 1, Math.min(span - 1, 28));

  const sleepRng = stream('sleep-hours');
  const goodSleepRng = stream('good-sleep');
  const sleepMinutes: number[] = new Array(n);
  const goodSleep: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let hours = 7.45 + (isWeekend(i) ? 0.4 : 0) + boost(i) * 1.2 + sleepRng.normal(0, 0.6);
    if (relapseDays.has(i - 1)) hours -= 1.35;
    if (sick.has(i)) hours += 0.7;
    sleepMinutes[i] = roundTo(clamp(hours, 4.5, 10) * 60, 15);
    goodSleep[i] = rating(6.4 + (sleepMinutes[i] / 60 - 7.2) * 1.5 + goodSleepRng.normal(0, 0.85));
    if (great.has(i)) {
      sleepMinutes[i] = Math.max(sleepMinutes[i], 480 + 15 * greatRng.int(0, 4));
      goodSleep[i] = Math.max(goodSleep[i], greatRng.int(7, 9));
    }

    const logged = i === TODAY || great.has(i) || relapseDays.has(i - 1) || sleepRng.chance(0.96);
    if (!logged) continue;
    put('sleep-hours', i, { value: sleepMinutes[i], updatedAt: stamp(sleepRng, i, 7, 9) });
    if (i === TODAY || goodSleepRng.chance(0.98) || great.has(i)) {
      put('good-sleep', i, withNote({ value: goodSleep[i], updatedAt: stamp(goodSleepRng, i, 7, 9) }, goodSleepRng, SLEEP_NOTES, 0.05));
    }
  }

  const energyRng = stream('energy');
  const gymRng = stream('gym');
  const moodRng = stream('mood');
  const gymDone: boolean[] = new Array(n).fill(false);
  const gymWeekCounts = new Map<DayKey, number>();
  let gymMotivation = 0;
  for (let i = 0; i < n; i++) {
    const energy = rating(5.8 + (sleepMinutes[i] / 60 - 7.2) + boost(i) * 2 + (sick.has(i) ? -2 : 0) + energyRng.normal(0, 0.9));
    if (i !== TODAY && energyRng.chance(0.9)) {
      put('energy', i, { value: energy, updatedAt: stamp(energyRng, i, 20, 23) });
    }

    gymMotivation = 0.8 * gymMotivation + gymRng.normal(0, 0.05);
    const week = startOfWeek(dayKeys[i], weekStartsOn);
    const soFar = gymWeekCounts.get(week) ?? 0;
    if (away(i)) {
      if (i !== TODAY) put('gym', i, skippedEntry(gymRng, i));
    } else if (i !== TODAY) {
      const positionInWeek = (weekdays[i] - weekStartsOn + 7) % 7;
      let p = GYM_BY_WEEKDAY[weekdays[i]] + boost(i) * 0.8 + gymMotivation;
      if (positionInWeek >= 5 && soFar < 3) p += 0.25;
      if (gymRng.chance(p)) {
        gymDone[i] = true;
        gymWeekCounts.set(week, soFar + 1);
        put('gym', i, withNote({ value: 1, updatedAt: stamp(gymRng, i, 17, 20) }, gymRng, GYM_NOTES, 0.1));
      }
    }

    const lastNight = i > 0 ? sleepMinutes[i - 1] / 60 : 7.2;
    const mood = rating(
      6 + (gymDone[i] ? 1.3 : 0) + (lastNight - 7.4) * 0.75 + boost(i) * 2.5 + (sick.has(i) ? -1.5 : 0) + moodRng.normal(0, 0.85),
    );
    if (i !== TODAY && moodRng.chance(0.92)) {
      put('mood', i, withNote({ value: mood, updatedAt: stamp(moodRng, i, 20, 23) }, moodRng, MOOD_NOTES, 0.06));
    }
  }

  const studyRng = stream('study');
  const duoRng = stream('duolingo');
  const readRng = stream('read');
  let studyMotivation = 0;
  let duoMotivation = 0;
  for (let i = 0; i < TODAY; i++) {
    studyMotivation = 0.8 * studyMotivation + studyRng.normal(0, 0.05);
    if (away(i)) {
      put('study', i, skippedEntry(studyRng, i));
    } else {
      const studies = studyRng.chance((isWeekend(i) ? 0.55 : 0.88) + boost(i) * 0.8 + studyMotivation);
      let minutes = clamp(roundTo(95 + (goodSleep[i] >= 7 ? 45 : 0) + boost(i) * 100 + studyRng.normal(0, 25), 5), 15, 300);
      const lateNight = dayStartHour >= 1 && studyRng.chance(0.06);
      if (great.has(i)) minutes = Math.max(minutes, 120 + 5 * greatRng.int(0, 8));
      if (studies || great.has(i)) {
        const updatedAt = lateNight ? stamp(studyRng, i, 0.1, 0.9, true) : stamp(studyRng, i, 19, 23);
        put('study', i, withNote({ value: minutes, updatedAt }, studyRng, STUDY_NOTES, 0.08));
      }
    }

    duoMotivation = 0.8 * duoMotivation + duoRng.normal(0, 0.05);
    const duoP = ((isWeekend(i) ? 0.68 : 0.9) + boost(i) * 0.6 + duoMotivation) * (sick.has(i) ? 0.5 : 1);
    if (duoRng.chance(duoP) || great.has(i)) put('duolingo', i, { value: 1, updatedAt: stamp(duoRng, i, 12, 22) });

    const readP = (isWeekend(i) ? 0.62 : 0.45) + boost(i) * 0.5 - (relapseDays.has(i) ? 0.3 : 0);
    const reads = readRng.chance(readP);
    let readMinutes = clamp(roundTo(22 + (isWeekend(i) ? 8 : 0) + readRng.normal(0, 9), 5), 5, 90);
    if (great.has(i)) readMinutes = Math.max(readMinutes, 20 + 5 * greatRng.int(0, 4));
    if (reads || great.has(i)) {
      put('read', i, withNote({ value: readMinutes, updatedAt: stamp(readRng, i, 21.5, 23.5) }, readRng, READ_NOTES, 0.05));
    }
  }

  const routineRng = stream('supplement-routine');
  const vitDRng = stream('vitamin-d');
  const magRng = stream('magnesium');
  const vitCRng = stream('vitamin-c');
  for (let i = 0; i < n; i++) {
    const routine = routineRng.chance((isWeekend(i) ? 0.66 : 0.9) + boost(i) * 0.5) || great.has(i);
    const daysBeforeToday = TODAY - i;

    // Vitamin D gets a long streak that's still running today
    const vitaminD = daysBeforeToday < vitaminDStreak
      || (daysBeforeToday > vitaminDStreak && (vitDRng.chance(routine ? 0.95 : 0.2) || great.has(i)));
    if (vitaminD) put('vitamin-d', i, { value: 1, updatedAt: stamp(vitDRng, i, 8, 10) });
    if (i === TODAY) continue;

    if (travel.has(i)) {
      put('magnesium', i, skippedEntry(magRng, i));
      put('vitamin-c', i, skippedEntry(vitCRng, i));
      continue;
    }
    if (magRng.chance(routine ? 0.88 : 0.3) || great.has(i)) put('magnesium', i, { value: 1, updatedAt: stamp(magRng, i, 21, 23) });
    if (vitCRng.chance(routine ? 0.93 : 0.15) || great.has(i)) put('vitamin-c', i, { value: 1, updatedAt: stamp(vitCRng, i, 8, 10) });
  }

  const dietRng = stream('diet-quality');
  const waterRng = stream('water');
  const healthyRng = stream('eat-healthy');
  const mealsRng = stream('eat-enough');
  const brushRng = stream('brush');
  for (let i = 0; i < n; i++) {
    const diet = dietRng.normal(0, 1);
    const weekendPenalty = isWeekend(i) ? 1 : 0;
    if (i === TODAY) {
      put('water', i, { value: 3, updatedAt: stamp(waterRng, i, 11, 13) });
      put('eat-enough', i, { value: 1, updatedAt: stamp(mealsRng, i, 8.5, 9.5) });
      put('brush', i, { value: 1, updatedAt: stamp(brushRng, i, 7.5, 8.25) });
      continue;
    }
    const isGreat = great.has(i);

    let water = clamp(Math.round(7 + diet * 0.9 + boost(i) * 3 - weekendPenalty * 0.5 + waterRng.normal(0, 0.9)), 2, 13);
    if (isGreat) water = Math.max(water, 8 + greatRng.int(0, 2));
    if (waterRng.chance(0.95) || isGreat) put('water', i, { value: water, updatedAt: stamp(waterRng, i, 20, 23) });

    let healthy = rating(6.4 + diet * 0.9 + boost(i) * 2 - weekendPenalty * 0.6 + healthyRng.normal(0, 0.9));
    if (isGreat) healthy = Math.max(healthy, greatRng.int(7, 9));
    if (healthyRng.chance(0.93) || isGreat) {
      put('eat-healthy', i, withNote({ value: healthy, updatedAt: stamp(healthyRng, i, 20, 22.5) }, healthyRng, FOOD_NOTES, 0.06));
    }

    const roll = mealsRng.next();
    let meals = sick.has(i) ? 2 : roll < 0.08 + (diet < -1 ? 0.1 : 0) ? 2 : roll > 0.95 ? 4 : 3;
    if (isGreat) meals = Math.max(meals, 3);
    if (mealsRng.chance(0.95) || isGreat) put('eat-enough', i, { value: meals, updatedAt: stamp(mealsRng, i, 20, 22) });

    const brushed = brushRng.chance((isWeekend(i) ? 0.8 : 0.88) + boost(i) * 0.3) || isGreat ? 2 : 1;
    if (brushRng.chance(0.97) || isGreat) put('brush', i, { value: brushed, updatedAt: stamp(brushRng, i, 22, 23.5) });
  }

  const notesRng = stream('day-notes');
  const dayNotes: Record<DayKey, string> = {};
  for (let i = 0; i < TODAY; i++) {
    if (notesRng.chance(0.08)) dayNotes[dayKeys[i]] = notesRng.pick(DAY_NOTES);
  }
  const firstOf = (set: Set<number>) => (set.size > 0 ? Math.min(...set) : -1);
  const firstGreat = firstOf(great);
  if (firstGreat >= 0) dayNotes[dayKeys[firstGreat]] = 'Everything clicked today. Slept well, studied, trained and ate well.';
  const firstSick = firstOf(sick);
  if (firstSick >= 0) dayNotes[dayKeys[firstSick]] = 'Feeling sick, taking it easy.';
  const firstTrip = firstOf(travel);
  if (firstTrip >= 0) dayNotes[dayKeys[firstTrip]] = 'Away for a few days. Hard to keep routines on the road.';
  const firstRelapse = firstOf(relapseDays);
  if (firstRelapse >= 0 && quitHabitId) dayNotes[dayKeys[firstRelapse]] = 'Stayed up way too late scrolling.';

  const data: AppData = {
    ...base,
    habits,
    logs,
    relapses,
    timers: {},
    dayNotes,
    settings,
    rewards: { unlocked: {}, lastSeenLevel: 1, celebratedPerfectDays: [] },
    meta: { createdAt, onboarded: true },
  };

  // mark past perfect days, earned badges and the level as seen, so loading the demo doesn't fire a pile of celebrations
  const ctx = makeCtx(settings, now);
  const celebratedPerfectDays: DayKey[] = [];
  for (let i = 0; i < TODAY; i++) {
    if (dayOverview(data, dayKeys[i], ctx).perfect) celebratedPerfectDays.push(dayKeys[i]);
  }
  const unlocked = earnedBadges(data, dayKeys, settings, now);
  data.rewards = { unlocked, lastSeenLevel: 1, celebratedPerfectDays };
  const level = levelFromXp(computeXp(data, ctx).total).level;
  data.rewards.lastSeenLevel = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  return data;
}

const BADGE_CHECK_EVERY_DAYS = 7;

// stamps each badge on the first weekly checkpoint where the history already earns it, so the XP chart
// shows them spread out instead of one spike today
function earnedBadges(
  data: AppData,
  dayKeys: readonly DayKey[],
  settings: AppData['settings'],
  now: Date,
): Record<string, string> {
  const unlocked: Record<string, string> = {};
  const last = dayKeys.length - 1;
  for (let i = Math.min(BADGE_CHECK_EVERY_DAYS - 1, last); ; i = Math.min(i + BADGE_CHECK_EVERY_DAYS, last)) {
    let at = now;
    if (i < last) {
      at = fromDayKey(dayKeys[i]);
      at.setHours(21, 0, 0, 0);
    }
    for (const status of evaluateAchievements(data, makeCtx(settings, at))) {
      if (status.unlocked && !(status.def.id in unlocked)) unlocked[status.def.id] = at.toISOString();
    }
    if (i === last) break;
  }
  return unlocked;
}
