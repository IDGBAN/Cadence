import type { AppData, Category, Habit, Settings } from '@/types';
import { logicalToday, toDayKey } from './dates';

export const DATA_VERSION = 1;

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${rnd}` : rnd;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'midnight',
  accent: 'violet',
  weekStartsOn: 1,
  dayStartHour: 4,
  soundEnabled: true,
  confettiEnabled: true,
  reduceMotion: false,
  todayGroupBy: 'category',
  hideCompleted: false,
  userName: '',
};

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_sleep', name: 'Sleep', icon: '🌙', order: 0 },
  { id: 'cat_nutrition', name: 'Nutrition', icon: '🥗', order: 1 },
  { id: 'cat_supplements', name: 'Supplements', icon: '💊', order: 2 },
  { id: 'cat_hygiene', name: 'Self-care', icon: '🚿', order: 3 },
  { id: 'cat_fitness', name: 'Fitness', icon: '💪', order: 4 },
  { id: 'cat_learning', name: 'Learning', icon: '📚', order: 5 },
  { id: 'cat_mind', name: 'Mind', icon: '🧠', order: 6 },
  { id: 'cat_quit', name: 'Breaking habits', icon: '🚫', order: 7 },
];

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type HabitTemplate = Omit<Habit, 'id' | 'createdAt' | 'startDate' | 'quitStart' | 'archived' | 'order'> & {
  templateId: string;
  blurb: string;
};

const base = {
  description: '',
  kind: 'goal' as const,
  period: 'day' as const,
  schedule: ALL_DAYS,
  direction: 'atLeast' as const,
  unit: '',
  step: 1,
  ratingMax: 10,
};

// created on first run
export const STARTER_TEMPLATES: HabitTemplate[] = [
  {
    ...base, templateId: 'good-sleep', name: 'Good Sleep', icon: '😴', color: 'indigo', categoryId: 'cat_sleep',
    type: 'rating', target: 7, blurb: 'Rate last night’s sleep quality',
    description: 'How well you slept last night. Log it on the day you wake up. 7+ counts as good sleep.',
  },
  {
    ...base, templateId: 'sleep-hours', name: 'Sleep Hours', icon: '🛌', color: 'violet', categoryId: 'cat_sleep',
    type: 'duration', target: 480, step: 30, blurb: 'Hours slept. Pairs with Good Sleep in Insights',
    description: 'How long you slept last night. Log it with Good Sleep and Insights can show what helps.',
  },
  {
    ...base, templateId: 'water', name: 'Drink Water', icon: '💧', color: 'sky', categoryId: 'cat_nutrition',
    type: 'quantity', target: 8, unit: 'glasses', step: 1, blurb: '8 glasses a day',
    description: 'Tap + every time you finish a glass (~250 ml).',
  },
  {
    ...base, templateId: 'eat-enough', name: 'Eat Enough', icon: '🍽️', color: 'orange', categoryId: 'cat_nutrition',
    type: 'quantity', target: 3, unit: 'meals', step: 1, blurb: '3 proper meals a day',
    description: 'Count real meals, not snacks.',
  },
  {
    ...base, templateId: 'eat-healthy', name: 'Eat Healthy', icon: '🥦', color: 'lime', categoryId: 'cat_nutrition',
    type: 'rating', target: 7, blurb: 'Rate how well you ate today',
    description: 'Rate the quality of what you ate today. 7+ is a healthy day.',
  },
  {
    ...base, templateId: 'vitamin-d', name: 'Vitamin D', icon: '☀️', color: 'amber', categoryId: 'cat_supplements',
    type: 'check', target: 1, blurb: 'Daily supplement', description: 'Best taken with a meal that has some fat.',
  },
  {
    ...base, templateId: 'magnesium', name: 'Magnesium', icon: '🧂', color: 'teal', categoryId: 'cat_supplements',
    type: 'check', target: 1, blurb: 'Daily supplement', description: 'Many people take it in the evening.',
  },
  {
    ...base, templateId: 'vitamin-c', name: 'Vitamin C', icon: '🍊', color: 'orange', categoryId: 'cat_supplements',
    type: 'check', target: 1, blurb: 'Daily supplement', description: '',
  },
  {
    ...base, templateId: 'brush', name: 'Brush Teeth', icon: '🦷', color: 'cyan', categoryId: 'cat_hygiene',
    type: 'quantity', target: 2, unit: 'times', step: 1, blurb: 'Morning and night',
    description: 'Two minutes, morning and night.',
  },
  {
    ...base, templateId: 'gym', name: 'Go to the Gym', icon: '🏋️', color: 'rose', categoryId: 'cat_fitness',
    type: 'check', period: 'week', target: 3, blurb: '3 sessions a week',
    description: 'Any days work, as long as you hit the weekly total.',
  },
  {
    ...base, templateId: 'study', name: 'Study', icon: '📖', color: 'blue', categoryId: 'cat_learning',
    type: 'duration', target: 120, step: 15, blurb: '2 focused hours a day, timer included',
    description: 'Focused study time. Start the timer when you sit down.',
  },
  {
    ...base, templateId: 'duolingo', name: 'Duolingo', icon: '🦉', color: 'emerald', categoryId: 'cat_learning',
    type: 'check', target: 1, blurb: 'At least one lesson', description: 'One lesson a day keeps the streak alive.',
  },
];

// also added on first run so Insights has something to correlate
export const RECOMMENDED_TEMPLATES: HabitTemplate[] = [
  {
    ...base, templateId: 'mood', name: 'Mood', icon: '🙂', color: 'yellow', categoryId: 'cat_mind',
    type: 'rating', kind: 'metric', target: 6, blurb: 'Track only, used for correlations',
    description: 'How did today feel overall? Insights uses this to show which habits lift your mood.',
  },
  {
    ...base, templateId: 'energy', name: 'Energy', icon: '⚡', color: 'amber', categoryId: 'cat_mind',
    type: 'rating', kind: 'metric', target: 6, blurb: 'Track only, how much energy you had',
    description: 'Your energy level today, overall.',
  },
  {
    ...base, templateId: 'read', name: 'Read', icon: '📚', color: 'purple', categoryId: 'cat_learning',
    type: 'duration', target: 20, step: 5, blurb: '20 minutes of reading', description: 'Books, not feeds.',
  },
  {
    ...base, templateId: 'no-doomscroll', name: 'No Doomscrolling', icon: '📵', color: 'pink', categoryId: 'cat_quit',
    type: 'quit', target: 30, blurb: 'Count clean days, reset on relapse',
    description: 'Endless feeds and short videos late at night. If you slip, log a relapse and the counter starts over.',
  },
];

export const EXTRA_TEMPLATES: HabitTemplate[] = ([
  { ...base, templateId: 'meditate', name: 'Meditate', icon: '🧘', color: 'teal', categoryId: 'cat_mind', type: 'duration', target: 10, step: 5, blurb: '10 quiet minutes' },
  { ...base, templateId: 'journal', name: 'Journal', icon: '✍️', color: 'violet', categoryId: 'cat_mind', type: 'check', target: 1, blurb: 'A few lines every day' },
  { ...base, templateId: 'gratitude', name: 'Gratitude', icon: '🙏', color: 'amber', categoryId: 'cat_mind', type: 'quantity', target: 3, unit: 'things', step: 1, blurb: '3 things you’re grateful for' },
  { ...base, templateId: 'stress', name: 'Stress', icon: '🌪️', color: 'slate', categoryId: 'cat_mind', type: 'rating', kind: 'metric', target: 5, blurb: 'Stress level, track only' },
  { ...base, templateId: 'walk', name: 'Walk Outside', icon: '🚶', color: 'emerald', categoryId: 'cat_fitness', type: 'duration', target: 30, step: 10, blurb: '30 minutes outside' },
  { ...base, templateId: 'steps', name: 'Steps', icon: '👟', color: 'lime', categoryId: 'cat_fitness', type: 'quantity', target: 8000, unit: 'steps', step: 1000, blurb: '8k steps a day' },
  { ...base, templateId: 'stretch', name: 'Stretch', icon: '🤸', color: 'pink', categoryId: 'cat_fitness', type: 'check', target: 1, blurb: 'Mobility work' },
  { ...base, templateId: 'run', name: 'Run', icon: '🏃', color: 'orange', categoryId: 'cat_fitness', type: 'quantity', period: 'week', target: 15, unit: 'km', step: 1, blurb: '15 km per week' },
  { ...base, templateId: 'protein', name: 'Protein', icon: '🍗', color: 'rose', categoryId: 'cat_nutrition', type: 'quantity', target: 120, unit: 'g', step: 10, blurb: '120 g a day' },
  { ...base, templateId: 'fruit-veg', name: 'Fruit & Veg', icon: '🍎', color: 'lime', categoryId: 'cat_nutrition', type: 'quantity', target: 5, unit: 'servings', step: 1, blurb: '5 a day' },
  { ...base, templateId: 'coffee', name: 'Coffee Limit', icon: '☕', color: 'orange', categoryId: 'cat_nutrition', type: 'quantity', direction: 'atMost', target: 2, unit: 'cups', step: 1, blurb: 'No more than 2 cups' },
  { ...base, templateId: 'omega3', name: 'Omega-3', icon: '🐟', color: 'sky', categoryId: 'cat_supplements', type: 'check', target: 1, blurb: 'Daily supplement' },
  { ...base, templateId: 'creatine', name: 'Creatine', icon: '🧪', color: 'slate', categoryId: 'cat_supplements', type: 'check', target: 1, blurb: 'Daily supplement' },
  { ...base, templateId: 'floss', name: 'Floss', icon: '🦷', color: 'cyan', categoryId: 'cat_hygiene', type: 'check', target: 1, blurb: 'Once a day' },
  { ...base, templateId: 'skincare', name: 'Skincare', icon: '🧴', color: 'pink', categoryId: 'cat_hygiene', type: 'check', target: 1, blurb: 'Evening routine' },
  { ...base, templateId: 'bed-on-time', name: 'In Bed by 23:30', icon: '⏰', color: 'indigo', categoryId: 'cat_sleep', type: 'check', target: 1, blurb: 'A steady bedtime' },
  { ...base, templateId: 'screen-time', name: 'Screen Time', icon: '📱', color: 'slate', categoryId: 'cat_mind', type: 'duration', direction: 'atMost', target: 120, step: 15, blurb: 'At most 2h for fun' },
  { ...base, templateId: 'code', name: 'Side Project', icon: '💻', color: 'blue', categoryId: 'cat_learning', type: 'duration', period: 'week', target: 300, step: 30, blurb: '5 hours a week' },
  { ...base, templateId: 'practice-instrument', name: 'Practice Music', icon: '🎸', color: 'purple', categoryId: 'cat_learning', type: 'duration', target: 30, step: 10, blurb: '30 minutes a day' },
  { ...base, templateId: 'call-family', name: 'Call Family', icon: '📞', color: 'rose', categoryId: 'cat_mind', type: 'check', period: 'week', target: 1, blurb: 'Once a week' },
  { ...base, templateId: 'deep-clean', name: 'Deep Clean', icon: '🧹', color: 'teal', categoryId: 'cat_hygiene', type: 'check', period: 'month', target: 2, blurb: 'Twice a month' },
  { ...base, templateId: 'no-sugar', name: 'No Added Sugar', icon: '🍬', color: 'pink', categoryId: 'cat_quit', type: 'quit', target: 30, blurb: 'Counter resets on a slip' },
  { ...base, templateId: 'no-alcohol', name: 'No Alcohol', icon: '🍺', color: 'amber', categoryId: 'cat_quit', type: 'quit', target: 90, blurb: 'Counter resets on a slip' },
  { ...base, templateId: 'no-nicotine', name: 'No Nicotine', icon: '🚭', color: 'slate', categoryId: 'cat_quit', type: 'quit', target: 90, blurb: 'Counter resets on a slip' },
  { ...base, templateId: 'no-junk', name: 'No Junk Food', icon: '🍟', color: 'orange', categoryId: 'cat_quit', type: 'quit', target: 30, blurb: 'Counter resets on a slip' },
] as Array<Omit<HabitTemplate, 'description'> & { description?: string }>).map((t) => ({ description: '', ...t }));

export const ALL_TEMPLATES: HabitTemplate[] = [...STARTER_TEMPLATES, ...RECOMMENDED_TEMPLATES, ...EXTRA_TEMPLATES];

export function habitFromTemplate(t: HabitTemplate, order: number, dayStartHour = DEFAULT_SETTINGS.dayStartHour): Habit {
  const { templateId: _t, blurb: _b, ...rest } = t;
  const now = new Date().toISOString();
  return {
    ...rest,
    schedule: [...rest.schedule],
    id: uid('h'),
    createdAt: now,
    startDate: logicalToday(dayStartHour),
    quitStart: now,
    archived: false,
    order,
  };
}

export function blankHabit(order: number, categoryId = DEFAULT_CATEGORIES[0].id): Habit {
  const now = new Date();
  return {
    id: uid('h'),
    name: '',
    icon: '✨',
    color: 'violet',
    categoryId,
    description: '',
    type: 'check',
    kind: 'goal',
    period: 'day',
    schedule: [...ALL_DAYS],
    target: 1,
    direction: 'atLeast',
    unit: '',
    step: 1,
    ratingMax: 10,
    quitStart: now.toISOString(),
    startDate: toDayKey(now),
    createdAt: now.toISOString(),
    archived: false,
    order,
  };
}

export function createInitialData(): AppData {
  const now = new Date().toISOString();
  const templates = [...STARTER_TEMPLATES, ...RECOMMENDED_TEMPLATES];
  return {
    version: DATA_VERSION,
    habits: templates.map((t, i) => habitFromTemplate(t, i)),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    logs: {},
    relapses: [],
    timers: {},
    dayNotes: {},
    settings: { ...DEFAULT_SETTINGS },
    rewards: { unlocked: {}, lastSeenLevel: 1, celebratedPerfectDays: [] },
    meta: { createdAt: now, onboarded: false },
  };
}

export const EMOJI_GROUPS: Array<{ label: string; emojis: string[] }> = [
  { label: 'Health', emojis: ['💧', '🥤', '🍵', '☕', '🥦', '🥗', '🍎', '🍊', '🍌', '🥑', '🍳', '🍗', '🐟', '🥩', '🍽️', '🍬', '🍟', '🍺', '🚭', '💊', '🧪', '☀️', '🧂', '🌿'] },
  { label: 'Body', emojis: ['🏋️', '💪', '🏃', '🚶', '🚴', '🏊', '🧘', '🤸', '⚽', '🏀', '🎾', '🥊', '🧗', '👟', '🛌', '😴', '🌙', '⏰', '😁', '🦷', '🧴', '🚿', '💆', '❤️'] },
  { label: 'Mind', emojis: ['🧠', '📖', '📚', '✍️', '📝', '🦉', '🗣️', '🎓', '💻', '🎸', '🎹', '🎨', '📷', '🧩', '♟️', '🙏', '🙂', '⚡', '🌪️', '🌈', '🎯', '📵', '📱', '🔕'] },
  { label: 'Life', emojis: ['🏠', '🧹', '🧺', '🌱', '🌷', '🐶', '🐱', '💰', '📈', '🗓️', '📞', '💌', '🤗', '🤝', '🌍', '✈️', '🚗', '🎮', '🎬', '🎧', '✨', '🔥', '⭐', '🏆'] },
];
