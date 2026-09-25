import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarCheck, CalendarOff, ListTodo, PartyPopper, Plus, Sparkles } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import type { DayKey, StreakInfo } from '@/types';
import type { DayOverviewItem } from '@/lib/habitMath';
import { Button, EmptyState } from '@/components/ui';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { isEditableTarget, isModalOpen } from '@/components/layout/platform';
import { addDays, formatDayLong, formatDayShort, greeting, relativeDayLabel } from '@/lib/dates';
import { pluralize } from '@/lib/format';
import { skipManyWithFeedback } from '@/lib/logActions';
import { useActiveHabits, useCategories, useDayOverview, useNow, useSettings, useStreaks, useToday } from '@/store/hooks';
import { useXp } from '@/store/rewardHooks';
import { isValidDayKey } from '@/lib/migrate';
import { actions } from '@/store/store';
import { useUI } from '@/store/ui';
import { DayNav } from '@/components/today/DayNav';
import { DayNoteCard } from '@/components/today/DayNoteCard';
import { SkipDayDialog } from '@/components/today/SkipDayDialog';
import { DaySummary, type TopStreak } from '@/components/today/DaySummary';
import { HabitCard } from '@/components/today/HabitCard';
import { TodayFilters, type TodayFilter } from '@/components/today/TodayFilters';
import { TodaySection } from '@/components/today/TodaySection';
import { WeekStrip } from '@/components/today/WeekStrip';
import { useDayProgress } from '@/components/today/dayProgress';
import { isPeriodGoal } from '@/components/today/shared';

// so a 3-week streak beats a 10-day one
const UNIT_DAYS: Record<StreakInfo['unit'], number> = { day: 1, week: 7, month: 30 };

function isScheduled(item: DayOverviewItem): boolean {
  const { habit, cell, countsForDay } = item;
  if (habit.type === 'quit' || habit.kind === 'metric' || isPeriodGoal(habit)) return true;
  return countsForDay || cell.status === 'skipped';
}

function isHandled(item: DayOverviewItem): boolean {
  if (item.habit.type === 'quit') return true;
  return item.completeForDay || item.cell.status === 'skipped';
}

interface Group {
  id: string;
  title: string;
  icon?: string;
  items: DayOverviewItem[];
}

export default function TodayPage() {
  const params = useParams<{ day?: string }>();
  const navigate = useNavigate();
  const today = useToday();
  const settings = useSettings();
  const categories = useCategories();
  const habits = useActiveHabits();
  const now = useNow(60_000);
  // same interval as the greeting clock so quit streaks don't add extra renders
  const streaks = useStreaks(habits, 60_000);
  const setSelectedDay = useUI((s) => s.setSelectedDay);
  const openHabitEditor = useUI((s) => s.openHabitEditor);

  const routeDay = params.day;
  const routeValid = routeDay === undefined || (isValidDayKey(routeDay) && routeDay <= today);
  const day: DayKey = routeValid && routeDay !== undefined ? routeDay : today;

  const [filter, setFilter] = useState<TodayFilter>('all');
  const [bonusCollapsed, setBonusCollapsed] = useState(true);

  const overview = useDayOverview(day);
  const xpByDay = useXp().byDay;
  const dayProgress = useDayProgress();

  const selectDay = useCallback(
    (next: DayKey, replace = false) => {
      const clamped = next > today ? today : next;
      if (clamped === day) return;
      navigate(clamped === today ? '/' : `/day/${clamped}`, { replace });
    },
    [day, navigate, today],
  );

  useEffect(() => {
    if (!routeValid) navigate('/', { replace: true });
  }, [routeValid, navigate]);

  useEffect(() => {
    setSelectedDay(day === today ? null : day);
    return () => setSelectedDay(null);
  }, [day, today, setSelectedDay]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isEditableTarget(e.target) || isModalOpen() || useUI.getState().commandPalette) return;
      const delta = e.key === 'ArrowLeft' || e.key === '[' ? -1 : e.key === 'ArrowRight' || e.key === ']' ? 1 : 0;
      if (delta === 0) return;
      e.preventDefault();
      selectDay(addDays(day, delta), true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [day, selectDay]);

  const { main, bonus } = useMemo(() => {
    const inList: DayOverviewItem[] = [];
    const extra: DayOverviewItem[] = [];
    for (const item of overview.items) (isScheduled(item) ? inList : extra).push(item);
    return { main: inList, bonus: extra };
  }, [overview.items]);

  const counts = useMemo(() => {
    let done = 0;
    for (const item of main) if (isHandled(item)) done++;
    return { all: main.length, todo: main.length - done, done };
  }, [main]);

  const skippable = useMemo(
    () => main.filter((item) => item.habit.kind === 'goal' && item.habit.type !== 'quit' && !isHandled(item)),
    [main],
  );

  const visible = useMemo(() => {
    if (filter === 'todo') return main.filter((item) => !isHandled(item));
    if (filter === 'done') return main.filter(isHandled);
    if (settings.hideCompleted) return main.filter((item) => item.habit.type === 'quit' || !isHandled(item));
    return main;
  }, [main, filter, settings.hideCompleted]);

  const groups = useMemo<Group[]>(() => {
    if (settings.todayGroupBy === 'category') {
      const byCategory = new Map<string, DayOverviewItem[]>();
      for (const item of visible) {
        const list = byCategory.get(item.habit.categoryId);
        if (list) list.push(item);
        else byCategory.set(item.habit.categoryId, [item]);
      }
      const out: Group[] = [];
      for (const category of categories) {
        const items = byCategory.get(category.id);
        if (items && items.length > 0) {
          out.push({ id: category.id, title: category.name, icon: category.icon, items });
          byCategory.delete(category.id);
        }
      }
      const orphans = [...byCategory.values()].flat();
      if (orphans.length > 0) out.push({ id: '__other', title: 'Other', icon: '📦', items: orphans });
      return out;
    }

    const quit = visible.filter((item) => item.habit.type === 'quit');
    const rest = visible.filter((item) => item.habit.type !== 'quit');
    const out: Group[] = [];
    if (rest.length > 0) out.push({ id: '__main', title: '', items: rest });
    if (quit.length > 0) out.push({ id: '__quit', title: 'Staying clean', icon: '🛡️', items: quit });
    return out;
  }, [visible, categories, settings.todayGroupBy]);

  const topStreak = useMemo<TopStreak | undefined>(() => {
    let best: TopStreak | undefined;
    let bestWeight = 0;
    for (const item of overview.items) {
      if (item.habit.kind !== 'goal') continue;
      const streak = streaks.get(item.habit.id);
      if (!streak) continue;
      const weight = streak.current * UNIT_DAYS[streak.unit];
      if (streak.current > 0 && weight > bestWeight) {
        bestWeight = weight;
        best = { habitName: item.habit.name, count: streak.current, unit: streak.unit };
      }
    }
    return best;
  }, [overview.items, streaks]);

  const isToday = day === today;

  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const confirmSkipRestOfDay = (reason: string | undefined) => {
    setSkipDialogOpen(false);
    const ids = skippable.map((item) => item.habit.id);
    if (ids.length > 0) skipManyWithFeedback(ids, day, reason);
  };

  const name = settings.userName.trim();
  // one date per header: today greets you, past days show the date as the title
  const relative = relativeDayLabel(day, today);
  const title = isToday ? `${greeting(now)}${name ? `, ${name}` : ''}` : formatDayLong(day);
  const eyebrow = isToday ? 'Today' : relative === formatDayShort(day) ? 'Past day' : relative;
  const hasHabits = habits.length > 0;

  let cardIndex = 0;

  return (
    <Page width="default">
      <PageHeader
        eyebrow={
          <>
            <CalendarCheck aria-hidden className="size-3.5" />
            {eyebrow}
          </>
        }
        title={title}
        subtitle={isToday ? formatDayLong(day) : undefined}
        actions={
          <DayNav
            day={day}
            today={today}
            weekStartsOn={settings.weekStartsOn}
            dayProgress={dayProgress}
            onSelect={selectDay}
          />
        }
      >
        <WeekStrip
          day={day}
          today={today}
          weekStartsOn={settings.weekStartsOn}
          dayProgress={dayProgress}
          onSelect={selectDay}
        />
      </PageHeader>

      <div className="flex flex-col gap-5">
        <DaySummary
          day={day}
          today={today}
          overview={overview}
          listCounts={{ all: counts.all, done: counts.done }}
          xp={xpByDay[day] ?? 0}
          topStreak={topStreak}
        />

        {!hasHabits ? (
          <div className="card">
            <EmptyState
              icon={<Sparkles />}
              title="Add your first habit"
              description='Track a yes/no like "Take vitamin D", an amount like "8 glasses of water", time spent studying, a nightly sleep rating, or days without something.'
              action={
                <div className="flex flex-col items-center gap-2">
                  <Button icon={<Plus aria-hidden />} onClick={() => openHabitEditor(null)}>
                    Add your first habit
                  </Button>
                  <p className="text-xs text-fg-3">
                    Just looking around? You can load a month of demo data in Settings.
                  </p>
                </div>
              }
            />
          </div>
        ) : (
          <>
            <TodayFilters
              filter={filter}
              onFilterChange={setFilter}
              counts={counts}
              groupBy={settings.todayGroupBy}
              onGroupByChange={(groupBy) => actions().updateSettings({ todayGroupBy: groupBy })}
              hideCompleted={settings.hideCompleted}
              onHideCompletedChange={(hide) => actions().updateSettings({ hideCompleted: hide })}
            />

            {visible.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={counts.all === 0 ? <CalendarCheck /> : counts.todo === 0 ? <PartyPopper /> : <ListTodo />}
                  title={
                    counts.all === 0
                      ? 'Nothing scheduled'
                      : counts.todo === 0
                        ? 'All done'
                        : 'Nothing here'
                  }
                  description={
                    counts.all === 0
                      ? 'None of your habits were due this day. Anything you log below counts as a bonus.'
                      : counts.todo === 0
                        ? 'Every habit due this day is taken care of.'
                        : 'No habits match this filter.'
                  }
                  action={
                    filter !== 'all' ? (
                      <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                        Show all habits
                      </Button>
                    ) : settings.hideCompleted ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => actions().updateSettings({ hideCompleted: false })}
                      >
                        Show completed habits
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {groups.map((group) => {
                  const cards = (
                    <AnimatePresence initial={false} mode="popLayout">
                      {group.items.map((item) => (
                        <HabitCard
                          key={item.habit.id}
                          item={item}
                          day={day}
                          today={today}
                          index={cardIndex++}
                          onSelectDay={selectDay}
                        />
                      ))}
                    </AnimatePresence>
                  );

                  if (group.title === '') {
                    return (
                      <div key={group.id} className="flex flex-col gap-2.5">
                        {cards}
                      </div>
                    );
                  }

                  const done = group.items.filter(isHandled).length;
                  return (
                    <TodaySection
                      key={group.id}
                      title={group.title}
                      icon={group.icon}
                      meta={`${done} / ${group.items.length} done`}
                    >
                      {cards}
                    </TodaySection>
                  );
                })}
              </div>
            )}

            {bonus.length > 0 && (
              <TodaySection
                title={`Not scheduled ${isToday ? 'today' : 'that day'}`}
                icon="🌙"
                meta={pluralize(bonus.length, 'habit')}
                collapsed={bonusCollapsed}
                onToggle={() => setBonusCollapsed((c) => !c)}
              >
                <p className="px-1 text-xs text-fg-3">
                  These aren't due. Logging one is a bonus and won't hurt your streak.
                </p>
                {bonus.map((item) => (
                  <HabitCard
                    key={item.habit.id}
                    item={item}
                    day={day}
                    today={today}
                    index={cardIndex++}
                    onSelectDay={selectDay}
                  />
                ))}
              </TodaySection>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="ghost" size="sm" icon={<Plus aria-hidden />} onClick={() => openHabitEditor(null)}>
                Add a habit
              </Button>
              {skippable.length > 0 && (
                <Button variant="ghost" size="sm" icon={<CalendarOff aria-hidden />} onClick={() => setSkipDialogOpen(true)}>
                  {isToday ? 'Skip the rest of today' : 'Skip the rest of this day'}
                </Button>
              )}
            </div>
          </>
        )}

        <DayNoteCard key={day} day={day} />

        <SkipDayDialog
          open={skipDialogOpen}
          day={day}
          isToday={isToday}
          count={skippable.length}
          onCancel={() => setSkipDialogOpen(false)}
          onConfirm={confirmSkipRestOfDay}
        />
      </div>
    </Page>
  );
}
