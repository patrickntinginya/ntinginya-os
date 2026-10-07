// Finance intelligence. Deterministic arithmetic on real rows only: no model, no guessing.
import { daysBetween, startOfMonth, startOfNextMonth } from './date.js'
import { budgetUsage } from './metrics.js'
import { formatMoney } from './format.js'

export const MIN_DAYS_FOR_FORECAST = 3
export const UNUSUAL_RATIO = 1.5 // this month's projected spend vs last month's, per category
export const UNUSUAL_MIN_INCREASE = 20000 // TSh: ignore small categories

const norm = (s) => String(s ?? '').trim().toLowerCase()
const daysIn = (today) => daysBetween(startOfMonth(today), startOfNextMonth(today))
const dayOfMonth = (today) => Number(today.slice(8, 10))

/** Straight-line projection of month-end spending from the pace so far. Null in the first days (too little data). */
export function projectMonthEnd(spentSoFar, today) {
  const elapsed = dayOfMonth(today)
  if (elapsed < MIN_DAYS_FOR_FORECAST || !(spentSoFar > 0)) return null
  return Math.round((spentSoFar / elapsed) * daysIn(today))
}

/** For each budget: used %, projected month-end spend, and how much it may exceed the budget by. */
export function budgetForecasts(budgets, catThis, today) {
  return budgetUsage(budgets, catThis).map((u) => {
    const projected = projectMonthEnd(u.spent, today)
    const overBy = projected != null && projected > u.budget ? projected - u.budget : 0
    return { ...u, projected, overBy }
  })
}

/** Categories whose projected spend is far above last month. catPrev/catThis are [{category, amount}]. */
export function unusualSpending(catThis, catPrev, today) {
  const prev = new Map(catPrev.map((c) => [norm(c.category), Number(c.amount) || 0]))
  const out = []
  for (const c of catThis) {
    const spent = Number(c.amount) || 0
    const projected = projectMonthEnd(spent, today)
    if (projected == null) continue
    const before = prev.get(norm(c.category)) || 0
    if (before > 0 && projected >= before * UNUSUAL_RATIO && projected - before >= UNUSUAL_MIN_INCREASE) {
      out.push({ category: c.category, spent, projected, lastMonth: before, ratio: Math.round((projected / before) * 100) / 100 })
    }
  }
  return out.sort((a, b) => b.projected - b.lastMonth - (a.projected - a.lastMonth))
}

/** Recurring expenses that will still be charged between tomorrow and the end of this month. */
export function upcomingRecurringExpenses(recurring, today) {
  const end = startOfNextMonth(today)
  let total = 0
  const items = []
  for (const r of recurring) {
    if (r.kind !== 'expense' || r.is_active === false) continue
    let d = r.next_date
    let guard = 0
    while (d < end && guard++ < 62) {
      if (d > today && (!r.end_date || d <= r.end_date)) {
        total += Number(r.amount) || 0
        items.push({ category: r.category, amount: Number(r.amount) || 0, date: d })
      }
      d = r.frequency === 'daily' ? addDay(d, 1) : r.frequency === 'weekly' ? addDay(d, 7) : end
    }
  }
  return { total, items }
}
function addDay(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Monthly amount to set aside for active savings goals that have a target date (their own plan.monthly). */
export function monthlySavingsCommitment(savingsPlans) {
  return savingsPlans.reduce((t, p) => t + (p && p.monthly ? p.monthly : 0), 0)
}

/**
 * "Can I afford this?" Every step is returned so the screen can show the calculation.
 * freeCash = income this month - spent this month - recurring still to come - monthly savings commitments.
 * Verdict: affordable if amount <= 50% of freeCash, risky if <= 100%, otherwise not recommended.
 * Also not recommended when the amount is bigger than the all-time balance.
 */
export function canAfford({ amount, monthIncome, monthExpenses, upcomingRecurring = 0, savingsCommitment = 0, balance = null, budgetRemaining = null }) {
  const want = Number(amount)
  if (!(want > 0)) return { verdict: 'invalid', message: 'Enter an amount greater than zero.', steps: [] }
  if (!(monthIncome > 0) && !(monthExpenses > 0)) {
    return { verdict: 'unknown', message: 'Not enough data yet. Record some income and expenses this month first.', steps: [] }
  }
  const freeCash = monthIncome - monthExpenses - upcomingRecurring - savingsCommitment
  const steps = [
    { label: 'Income this month', value: monthIncome },
    { label: 'Spent so far this month', value: -monthExpenses },
    { label: 'Recurring expenses still to come this month', value: -upcomingRecurring },
    { label: 'Monthly savings goal targets', value: -savingsCommitment },
    { label: 'Free cash this month', value: freeCash, total: true },
    { label: 'This purchase', value: -want },
    { label: 'Left after purchase', value: freeCash - want, total: true },
  ]
  const warnings = []
  if (balance != null && want > balance) warnings.push(`It is more than your recorded balance (${formatMoney(balance)}).`)
  if (budgetRemaining != null && want > budgetRemaining) warnings.push(`It is more than your remaining budgets this month (${formatMoney(Math.max(0, budgetRemaining))}).`)

  let verdict
  if (freeCash <= 0 || want > freeCash || (balance != null && want > balance)) verdict = 'not_recommended'
  else if (want <= freeCash * 0.5) verdict = 'affordable'
  else verdict = 'risky'
  if (verdict === 'affordable' && warnings.length) verdict = 'risky'

  const message = {
    affordable: `This is within about half of your free cash this month (${formatMoney(freeCash)}).`,
    risky: `It fits within your free cash (${formatMoney(freeCash)}) but would use more than half of it${warnings.length ? ', and see the warnings below' : ''}.`,
    not_recommended: freeCash <= 0 ? 'Your income this month does not cover what you have already spent and planned.' : `It is more than your free cash this month (${formatMoney(freeCash)}).`,
  }[verdict]
  return { verdict, message, steps, warnings, freeCash }
}

/** Plain sentences about this month, from real numbers. */
export function financeAlerts({ monthIncome, monthExpenses, budgets, catThis, catPrev, today }) {
  const out = []
  if (monthExpenses > 0) out.push(`You have spent ${formatMoney(monthExpenses)} this month.`)
  for (const f of budgetForecasts(budgets, catThis, today)) {
    if (f.percent >= 100) out.push(`You are over your ${f.category} budget by ${formatMoney(f.spent - f.budget)}.`)
    else if (f.percent >= 70) out.push(`You have used ${f.percent}% of your ${f.category} budget.`)
    if (f.overBy > 0 && f.percent < 100) out.push(`At your current pace you may exceed the ${f.category} budget by about ${formatMoney(f.overBy)}.`)
  }
  for (const u of unusualSpending(catThis, catPrev, today)) {
    out.push(`${u.category} spending is on pace to be ${u.ratio}x last month (about ${formatMoney(u.projected)} vs ${formatMoney(u.lastMonth)}).`)
  }
  if (monthIncome > 0 && monthExpenses > monthIncome) out.push('You have spent more than you earned this month.')
  return out
}
