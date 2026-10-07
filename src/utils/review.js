// Plain-language, fact-only observations for the reviews. Every sentence is built from numbers passed in.
import { budgetUsage, totalsByCategory } from './metrics.js'
import { formatMoney } from './format.js'
import { labelOf } from '../lib/constants.js'

export function financeObservations({ monthly = [], catThis = [], catPrev = [], budgets = [] }) {
  const out = []
  const now = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]
  if (!now || (now.income === 0 && now.expenses === 0)) {
    if (!prev || (prev.income === 0 && prev.expenses === 0)) return ['Not enough data yet.']
  }
  if (now && now.expenses === 0) out.push('No expenses recorded this month.')
  else if (now) {
    out.push(`So far this month you have spent ${formatMoney(now.expenses)}${prev && prev.expenses > 0 ? `; last month's full total was ${formatMoney(prev.expenses)}` : ''}.`)
  }
  if (now && now.income > 0) out.push(`Income this month is ${formatMoney(now.income)}, leaving ${formatMoney(now.income - now.expenses)}.`)
  const top = totalsByCategory(catThis)[0]
  if (top) out.push(`${labelOf([], top.category)} is your largest expense category this month at ${formatMoney(top.total)}.`)
  const prevMap = new Map(totalsByCategory(catPrev).map((c) => [c.category, c.total]))
  for (const c of totalsByCategory(catThis).slice(0, 5)) {
    const p = prevMap.get(c.category)
    if (p && c.total > p) out.push(`${labelOf([], c.category)} spending (${formatMoney(c.total)}) has already passed last month's whole total (${formatMoney(p)}).`)
  }
  for (const u of budgetUsage(budgets, catThis)) {
    if (u.level === 'over') out.push(`${labelOf([], u.category)} is over budget: ${formatMoney(u.spent)} spent of ${formatMoney(u.budget)}.`)
    else if (u.level === 'critical' || u.level === 'warning') out.push(`${labelOf([], u.category)} budget is ${u.percent}% used (${formatMoney(u.remaining)} left).`)
  }
  return out.length ? out : ['Not enough data yet.']
}
