import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardData {
  total_campaigns: number;
  total_sent: number;
  total_failed: number;
  recent_campaigns: {
    id: number;
    name: string;
    status: string;
    sent_count: number;
    failed_count: number;
    total_count: number;
    created_at: string;
  }[];
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await getDashboard();
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">{t('dashboard.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl">
        {t('dashboard.loadError')}
      </div>
    );
  }

  const successRate = (data?.total_sent ?? 0) + (data?.total_failed ?? 0) > 0
    ? (((data?.total_sent ?? 0) / ((data?.total_sent ?? 0) + (data?.total_failed ?? 0))) * 100).toFixed(1)
    : '0.0';

  const stats = [
    {
      label: t('dashboard.totalCampaigns'),
      value: data?.total_campaigns ?? 0,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      iconBg: 'bg-blue-50 text-blue-500',
    },
    {
      label: t('dashboard.totalSent'),
      value: data?.total_sent ?? 0,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 13l4 4L19 7" />
        </svg>
      ),
      iconBg: 'bg-green-50 text-green-500',
    },
    {
      label: t('dashboard.totalFailed'),
      value: data?.total_failed ?? 0,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
      iconBg: 'bg-red-50 text-red-500',
    },
    {
      label: t('dashboard.successRate') ?? 'Success Rate',
      value: successRate + '%',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      iconBg: 'bg-amber-50 text-amber-500',
    },
  ];

  const chartData = (data?.recent_campaigns ?? []).map((c) => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name,
    sent: c.sent_count,
    failed: c.failed_count,
  }));

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-5">{t('nav.dashboard')}</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-800">
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${stat.iconBg}`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-4">{t('dashboard.recentStats')}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" fontSize={12} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis fontSize={12} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  fontSize: '13px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Bar dataKey="sent" fill="#3b82f6" name={t('dashboard.sent')} radius={[6, 6, 0, 0]} />
              <Bar dataKey="failed" fill="#ef4444" name={t('dashboard.failed')} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Campaigns */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wider">{t('dashboard.recentCampaigns')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.name')}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.status')}</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.sent')}</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.failed')}</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.total')}</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.created')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data?.recent_campaigns ?? []).map((campaign) => (
                <tr
                  key={campaign.id}
                  onClick={() => navigate(`/campaigns/${campaign.id}`)}
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 text-sm font-medium text-slate-800">{campaign.name}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 text-right">{campaign.sent_count.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 text-right">{campaign.failed_count.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 text-right">{campaign.total_count.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(data?.recent_campaigns ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-400">
                    {t('dashboard.noCampaigns')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    ready: 'bg-blue-100 text-blue-700',
    sending: 'bg-amber-100 text-amber-700',
    paused: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {t('status.' + status)}
    </span>
  );
}
