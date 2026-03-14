import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { logout, getMe, globalSearch } from '../api/client';
import { useTranslation } from 'react-i18next';

interface SearchResult {
  type: string;
  id: number;
  name: string;
  description: string;
  url: string;
  time?: string;
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [role, setRole] = useState('');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    getMe().then((res) => setRole(res.data.role));
  }, []);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close search on navigation
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, [location.pathname]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await globalSearch(value.trim());
        setSearchResults(res.data.results || []);
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleResultClick = (url: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    navigate(url);
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'campaign':
        return (
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        );
      case 'recipient':
        return (
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        );
      case 'audit':
        return (
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        );
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'campaign': return t('search.typeCampaign');
      case 'recipient': return t('search.typeRecipient');
      case 'audit': return t('search.typeAudit');
      default: return type;
    }
  };

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
    }, {
      to: '/audit-logs',
      label: t('nav.auditLogs'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
    if (path === '/audit-logs') return t('nav.auditLogs');
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

          {/* Search bar */}
          <div className="flex items-center gap-3">
            <div ref={searchRef} className="relative">
              <div className="flex items-center bg-white/20 rounded-lg px-3 py-1.5 focus-within:bg-white/30 transition-colors">
                <svg className="w-4 h-4 text-white/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
                  placeholder={t('search.placeholder')}
                  className="bg-transparent border-none outline-none text-white placeholder-white/60 text-sm ml-2 w-48 focus:w-64 transition-all"
                />
                {searching && (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin flex-shrink-0" />
                )}
              </div>

              {/* Search results dropdown */}
              {searchOpen && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-slate-500">{t('search.noResults')}</div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {searchResults.map((result, idx) => (
                        <button
                          key={`${result.type}-${result.id}-${idx}`}
                          onClick={() => handleResultClick(result.url)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0"
                        >
                          {typeIcon(result.type)}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{result.name}</div>
                            <div className="text-xs text-slate-500 truncate">{result.description}</div>
                          </div>
                          <span className="text-[10px] font-medium text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                            {typeLabel(result.type)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
                    {t('search.resultCount', { count: searchResults.length })}
                  </div>
                </div>
              )}
            </div>

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
