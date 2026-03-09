import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { logout, getMe } from '../api/client';
import { useTranslation } from 'react-i18next';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [role, setRole] = useState('');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  useEffect(() => {
    getMe().then((res) => setRole(res.data.role));
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    navigate('/login');
  };

  const navItems = [
    {
      to: '/',
      end: true,
      label: t('nav.dashboard'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      to: '/campaigns',
      label: t('nav.campaigns'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    ...(role === 'admin' ? [{
      to: '/admin',
      label: t('nav.userManagement'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    }] : []),
  ];

  const bottomItems = [
    {
      to: '/profile',
      label: t('nav.profile'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  // Breadcrumb
  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/') return t('nav.dashboard');
    if (path.startsWith('/campaigns')) return t('nav.campaigns');
    if (path === '/admin') return t('nav.userManagement');
    if (path === '/profile') return t('nav.profile');
    return '';
  };

  return (
    <div className="flex h-screen bg-[#f0f2f7]">
      {/* Sidebar - Icon only */}
      <aside
        className="flex flex-col items-center bg-white border-r border-slate-200 flex-shrink-0 py-4 transition-all duration-200"
        style={{ width: sidebarExpanded ? '200px' : '68px' }}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        {/* Logo */}
        <div className="mb-6 px-3 w-full flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          {sidebarExpanded && (
            <span className="text-sm font-bold text-slate-800 whitespace-nowrap overflow-hidden">Blast Mail</span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 w-full px-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group"
            >
              {isActive(item.to, item.end) && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full -ml-2" />
              )}
              <div className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors flex-shrink-0 ${
                isActive(item.to, item.end)
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600'
              }`}>
                {item.icon}
              </div>
              {sidebarExpanded && (
                <span className={`text-sm font-medium whitespace-nowrap overflow-hidden ${
                  isActive(item.to, item.end) ? 'text-blue-600' : 'text-slate-600'
                }`}>
                  {item.label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom items */}
        <div className="w-full px-2 space-y-1 border-t border-slate-100 pt-3">
          {/* Language */}
          <button
            onClick={() => i18n.changeLanguage(i18n.language.startsWith('ko') ? 'en' : 'ko')}
            className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group w-full"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600 transition-colors flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            {sidebarExpanded && (
              <span className="text-sm text-slate-500 whitespace-nowrap">{i18n.language.startsWith('ko') ? 'EN' : 'KO'}</span>
            )}
          </button>

          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group"
            >
              {isActive(item.to) && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full -ml-2" />
              )}
              <div className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors flex-shrink-0 ${
                isActive(item.to)
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600'
              }`}>
                {item.icon}
              </div>
              {sidebarExpanded && (
                <span className={`text-sm font-medium whitespace-nowrap overflow-hidden ${
                  isActive(item.to) ? 'text-blue-600' : 'text-slate-600'
                }`}>
                  {item.label}
                </span>
              )}
            </NavLink>
          ))}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group w-full"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 group-hover:bg-red-50 group-hover:text-red-500 transition-colors flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            {sidebarExpanded && (
              <span className="text-sm font-medium text-slate-500 group-hover:text-red-500 whitespace-nowrap">
                {t('nav.logout')}
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header - Blue bar */}
        <header className="bg-blue-500 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
            </svg>
            <span>{t('nav.dashboard')}</span>
            {getBreadcrumb() !== t('nav.dashboard') && (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-white">{getBreadcrumb()}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => i18n.changeLanguage(i18n.language.startsWith('ko') ? 'en' : 'ko')}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-xs font-medium transition-colors cursor-pointer"
            >
              {i18n.language.startsWith('ko') ? 'EN' : 'KO'}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
