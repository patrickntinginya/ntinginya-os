import {
  Home, Sun, CalendarClock, CalendarDays, CheckSquare, Wallet, Target, FolderKanban, Lightbulb, Repeat,
  BookOpen, StickyNote, Bell, BellRing, LineChart, ClipboardCheck, Sparkles, Search, Settings,
} from 'lucide-react'

// V3 order. Shown in the sidebar and in the mobile "More" menu. `match` keeps a parent highlighted for sub-pages.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/planner', label: 'Planner', icon: CalendarClock },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/knowledge', label: 'Learning', icon: BookOpen },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/brainstorm', label: 'Ideas', icon: Lightbulb },
  { to: '/insights', label: 'Insights', icon: LineChart },
  { to: '/ai', label: 'AI Assistant', icon: Sparkles },
  { to: '/notifications', label: 'Notifications', icon: BellRing },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Less frequent screens that are still reachable (More menu, sidebar footer).
export const SECONDARY_ITEMS = [
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/reminders', label: 'Reminders', icon: Bell },
  { to: '/reviews/daily', label: 'Reviews', icon: ClipboardCheck, match: '/reviews' },
  { to: '/search', label: 'Search', icon: Search },
]

export const ALL_ITEMS = [...NAV_ITEMS, ...SECONDARY_ITEMS]

// Mobile bottom bar: the four screens used every day, plus "More".
export const BOTTOM_NAV_PATHS = ['/dashboard', '/today', '/finance', '/habits']
