import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, MoreHorizontal, Search } from 'lucide-react'
import { ALL_ITEMS, NAV_ITEMS, SECONDARY_ITEMS, BOTTOM_NAV_PATHS } from '../lib/navigation'
import OfflineBanner from '../components/OfflineBanner'
import { useAuth } from '../contexts/AuthContext'
import { useDeviceNotifications, useNotificationSync, useUnreadCount } from '../hooks/useAppServices'
import Logo from '../components/Logo'
import Modal from '../components/ui/Modal'

const linkClass = ({ isActive }) =>
  `flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors ${
    isActive
      ? 'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-100'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
  }`

const isActiveItem = (item, pathname) => pathname.startsWith(item.match || item.to)

function Sidebar({ unread, pathname }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col dark:border-white/10 dark:bg-surface-dark">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo size={34} />
        <span className="text-lg font-bold">Life OS</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {[...NAV_ITEMS, ...SECONDARY_ITEMS].map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} className={() => linkClass({ isActive: isActiveItem(item, pathname) })}>
              <Icon size={20} aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.to === '/notifications' && unread > 0 && (
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">{unread > 99 ? '99+' : unread}</span>
              )}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}

function BottomNav({ onMore, pathname }) {
  const items = BOTTOM_NAV_PATHS.map((p) => ALL_ITEMS.find((i) => i.to === p))
  const tab = (active) =>
    `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
      active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
    }`
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-white/10 dark:bg-surface-dark"
      aria-label="Main"
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink key={item.to} to={item.to} className={() => tab(isActiveItem(item, pathname))}>
            <Icon size={22} aria-hidden="true" />
            {item.label}
          </NavLink>
        )
      })}
      <button type="button" onClick={onMore} className={tab(false)}>
        <MoreHorizontal size={22} aria-hidden="true" />
        More
      </button>
    </nav>
  )
}

export default function AppLayout() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const { profile } = useAuth()
  const unread = useUnreadCount()
  useNotificationSync()
  useDeviceNotifications(Boolean(profile?.notifications_enabled))
  const current = ALL_ITEMS.find((i) => isActiveItem(i, pathname))

  return (
    <div className="flex min-h-dvh">
      <Sidebar unread={unread} pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden dark:border-white/10 dark:bg-surface-dark/95">
          <Logo size={26} />
          <span className="flex-1 text-base font-semibold">{current?.label ?? 'Life OS'}</span>
          <Link to="/search" className="icon-btn" aria-label="Search"><Search size={20} /></Link>
          <Link to="/notifications" className="icon-btn relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell size={20} />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-white dark:ring-surface-dark" />}
          </Link>
        </header>
        <OfflineBanner />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
          <Outlet />
        </main>
      </div>
      <BottomNav onMore={() => setMoreOpen(true)} pathname={pathname} />
      {moreOpen && (
        <Modal title="Menu" onClose={() => setMoreOpen(false)}>
          <nav className="grid gap-1" aria-label="All sections">
            {ALL_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <NavLink key={item.to} to={item.to} className={() => linkClass({ isActive: isActiveItem(item, pathname) })} onClick={() => setMoreOpen(false)}>
                  <Icon size={20} aria-hidden="true" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </Modal>
      )}
    </div>
  )
}
