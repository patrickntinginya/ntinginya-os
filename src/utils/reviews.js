// Daily and weekly reviews built ONLY from real rows. Every sentence is produced from numbers passed in;
// when there is nothing to say the result says so instead of inventing something.
import { addDays, dateOfTimestamp as _stamp, daysBetween, startOfWeek, timeToMinutes } from './date.js'
import { doneMap as _doneMap, habitSummary as _habitSummary } from './habits.js'
import { projectProgress as _projectProgress, projectsNeedingAttention as _attention, rolledUpProgress as _rolled } from './projects.js'
import { findConflicts, goalsNeedingAttention, recommendNextTopic, studyDaysInRange, studyMinutes, taskStats, totalsByCategory, budgetUsage } from './metrics.js'
import { rankTasks } from './priority.js'
import { financeObservations } from './review.js'
import { formatMoney, sum } from './format.js'
import { labelOf } from '../lib/constants.js'

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const NOT_ENOUGH = 'Not enough data yet.'

/** Open minutes between 08:00 and 20:00 after removing the time taken by events. */
export function freeMinutes(events, startMin = 8 * 60, endMin = 20 * 60) {
  const busy = events
    .map((e) => [Math.max(startMin, timeToMinutes(e.start_time)), Math.min(endMin, e.end_time ? timeToMinutes(e.end_time) : timeToMinutes(e.start_time) + 60)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let used = 0
  let cursor = startMin
  for (const [a, b] of busy) {
    const from = Math.max(a, cursor)
    if (b > from) used += b - from
    cursor = Math.max(cursor, b)
  }
  return endMin - startMin - used
}

export function buildDailyReview({ tasks = [], eventsToday = [], reminders = [], goals = [], milestones = [], learning = [], monthly = [], catThis = [], catPrev = [], budgets = [] }, today) {
  const goalsById = Object.fromEntries(goals.map((g) => [g.id, g]))
  const ranked = rankTasks(tasks, { today, goalsById })
  const stats = taskStats(tasks, today)

  const conflicts = findConflicts(eventsToday).map(([a, b]) => `"${a.title}" and "${b.title}" overlap.`)
  const dueToday = stats.dueToday.length + stats.overdue.length
  const free = freeMinutes(eventsToday)
  if (dueToday > 0 && free < dueToday * 45) {
    conflicts.push(`${plural(dueToday, 'task')} due or overdue, but only about ${free} minutes are open between 08:00 and 20:00 (assuming 45 minutes each).`)
  }

  const flags = goalsNeedingAttention(goals, milestones, tasks, today)
  const topic = recommendNextTopic(learning)
  const remindersToday = reminders.filter((r) => !r.is_done && r.remind_date <= today)

  return {
    matters: {
      priorities: ranked.slice(0, 3).map((r) => ({ title: r.task.title, reasons: r.rec.reasons })),
      events: eventsToday.map((e) => ({ title: e.title, start: String(e.start_time).slice(0, 5) })),
      reminders: remindersToday.map((r) => r.title),
    },
    conflicts: conflicts.length ? conflicts : ['No conflicts found in today\'s schedule.'],
    finance: financeObservations({ monthly, catThis, catPrev, budgets }).slice(0, 4),
    goals: flags.length ? flags.slice(0, 4).map((f) => `${f.goal.name}: ${f.reasons[0]}.`) : goals.some((g) => g.status === 'active') ? ['No active goal needs attention right now.'] : [NOT_ENOUGH],
    learning: topic ? `${topic.item.topic}: ${topic.why}.` : NOT_ENOUGH,
    suggested: ranked.slice(0, 5).map((r) => r.task.title),
    hasAnyData: tasks.length + eventsToday.length + reminders.length + goals.length + learning.length > 0,
  }
}

export function buildWeeklyReview({ tasks = [], goals = [], milestones = [], learning = [], sessions = [], weekIncome = [], weekExpenses = [], budgets = [], catThis = [] }, today) {
  const stats = taskStats(tasks, today)
  const weekStart = startOfWeek(today)
  const weekEnd = addDays(weekStart, 7)

  const income = sum(weekIncome)
  const expenses = sum(weekExpenses)
  const topCategories = totalsByCategory(weekExpenses).slice(0, 3)

  const activeGoals = goals.filter((g) => g.status === 'active')
  const flags = goalsNeedingAttention(goals, milestones, tasks, today)
  const neglected = flags.filter((f) => f.reasons.some((r) => /Not updated|No open milestones/.test(r))).map((f) => f.goal.name)
  const deadlines = activeGoals
    .filter((g) => g.target_date && daysBetween(today, g.target_date) >= 0 && daysBetween(today, g.target_date) <= 14)
    .map((g) => ({ name: g.name, date: g.target_date, days: daysBetween(today, g.target_date) }))

  const minutes = studyMinutes(sessions, weekStart, weekEnd)
  const days = studyDaysInRange(sessions, weekStart, weekEnd)
  const learningActive = learning.filter((l) => l.status === 'learning').length

  const wentWell = []
  const needsWork = []
  const focus = []
  if (stats.completedThisWeek > 0) wentWell.push(`You completed ${plural(stats.completedThisWeek, 'task')} this week.`)
  if (income > 0 && income > expenses) wentWell.push(`You spent less than you earned this week (${formatMoney(income - expenses)} left).`)
  if (days >= 3) wentWell.push(`You studied on ${days} days (${minutes} minutes).`)
  if (stats.overdue.length) {
    needsWork.push(`${plural(stats.overdue.length, 'task')} overdue.`)
    focus.push(`Clear overdue tasks, starting with "${stats.overdue[0].title}".`)
  }
  for (const u of budgetUsage(budgets, catThis).filter((x) => x.level === 'over')) needsWork.push(`${labelOf([], u.category)} is over its monthly budget.`)
  if (learningActive > 0 && days === 0) {
    needsWork.push('No study sessions were logged this week.')
    focus.push('Schedule a study session for a topic you are learning.')
  }
  if (neglected.length) needsWork.push(`Goals with no recent movement: ${neglected.slice(0, 3).join(', ')}.`)
  if (deadlines[0]) focus.push(`"${deadlines[0].name}" is due in ${plural(deadlines[0].days, 'day')}.`)

  return {
    productivity: { completed: stats.completedThisWeek, overdue: stats.overdue.length, rate: stats.weekCompletionRate, dueThisWeek: stats.dueThisWeekCount },
    finance: { income, expenses, savings: income - expenses, topCategories, hasData: weekIncome.length + weekExpenses.length > 0 },
    goals: { active: activeGoals.length, neglected, deadlines },
    learning: { minutes, days, activeTopics: learningActive, consistency: `${days} of 7 days` },
    wentWell: wentWell.length ? wentWell : [NOT_ENOUGH],
    needsWork: needsWork.length ? needsWork : [NOT_ENOUGH],
    focus: focus.length ? focus : [NOT_ENOUGH],
  }
}


// ---------- V3: weekly LIFE review (adds projects, habits, completed goals). Works with no AI. ----------

export function buildWeeklyLifeReview(input, today) {
  const base = buildWeeklyReview(input, today)
  const { tasks = [], goals = [], milestones = [], projects = [], habits = [], entries = [] } = input
  const weekStart = startOfWeek(today)
  const weekEnd = addDays(weekStart, 7)
  const inWeek = (ts) => ts && _stamp(ts) >= weekStart && _stamp(ts) < weekEnd

  const completedGoals = goals.filter((g) => g.status === 'completed' && inWeek(g.updated_at)).map((g) => g.name)
  const goalProgress = goals.filter((g) => g.status === 'active').map((g) => ({ name: g.name, percent: _rolled(g, { milestones, tasks, projects }).percent }))

  const completedMilestones = milestones.filter((m) => m.is_done && inWeek(m.updated_at)).length
  const activeProjects = projects.filter((p) => ['planning', 'active'].includes(p.status))
  const projectRows = activeProjects.map((p) => ({ name: p.name, progress: _projectProgress(p, tasks) }))
  const delayed = _attention(projects, tasks, milestones, today).filter((x) => x.reasons.some((r) => /passed|overdue/i.test(r))).map((x) => x.project.name)

  const map = _doneMap(entries)
  const live = habits.filter((h) => !h.archived_at)
  const sums = live.map((h) => _habitSummary(h, map.get(h.id) || new Set(), today))
  let due = 0
  let done = 0
  for (const s of sums) if (s.week) { due += s.week.due; done += s.week.done }
  const habitRate = due ? Math.round((done / due) * 100) : null
  const bestStreak = sums.reduce((b, s) => (s.streak > (b?.streak || 0) ? { name: s.habit.name, streak: s.streak } : b), null)

  const wentWell = base.wentWell[0] === NOT_ENOUGH ? [] : [...base.wentWell]
  const needsWork = base.needsWork[0] === NOT_ENOUGH ? [] : [...base.needsWork]
  const focus = base.focus[0] === NOT_ENOUGH ? [] : [...base.focus]
  if (completedGoals.length) wentWell.push(`You completed ${plural(completedGoals.length, 'goal')}: ${completedGoals.slice(0, 3).join(', ')}.`)
  if (completedMilestones > 0) wentWell.push(`${plural(completedMilestones, 'milestone')} completed.`)
  if (habitRate != null && habitRate >= 80) wentWell.push(`You completed ${habitRate}% of your habit days.`)
  if (habitRate != null && habitRate < 50) {
    needsWork.push(`Habit completion was ${habitRate}% this week.`)
    focus.push('Pick one habit and protect it every day next week.')
  }
  if (delayed.length) {
    needsWork.push(`Delayed projects: ${delayed.slice(0, 3).join(', ')}.`)
    focus.push(`Review the plan for "${delayed[0]}".`)
  }
  return {
    ...base,
    goals: { ...base.goals, completed: completedGoals, progress: goalProgress },
    projects: { active: projectRows, completedMilestones, delayed },
    habits: { rate: habitRate, due, done, bestStreak, count: live.length },
    wentWell: wentWell.length ? wentWell : [NOT_ENOUGH],
    needsWork: needsWork.length ? needsWork : [NOT_ENOUGH],
    focus: focus.length ? focus : [NOT_ENOUGH],
  }
}
