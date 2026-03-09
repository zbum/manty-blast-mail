import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getCampaign, getSendLogs, exportReport } from '../api/client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface Campaign {
  id: number;
  name: string;
  status: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
}

interface SendLog {
  id: number;
  email: string;
  status: string;
  error_message: string;
  created_at: string;
}

interface LogsResponse {
  logs: SendLog[];
  total: number;
  page: number;
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data: campaign, isLoading: campaignLoading } = useQuery<Campaign>({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const res = await getCampaign(campaignId);
      return res.data;
    },
  });

  const { data: logsData, isLoading: logsLoading } = useQuery<LogsResponse>({
    queryKey: ['sendLogs', campaignId, page],
    queryFn: async () => {
      const res = await getSendLogs(campaignId, page);
      return res.data;
    },
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportReport(campaignId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `campaign-${campaignId}-report.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert(t('report.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  if (campaignLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">{t('compose.notFound')}</div>
    );
  }

  const sentCount = campaign.sent_count ?? 0;
  const failCount = campaign.failed_count ?? 0;
  const totalProcessed = sentCount + failCount;
  const successRate = totalProcessed > 0 ? ((sentCount / totalProcessed) * 100).toFixed(1) : '0.0';

  const pieData = [
    { name: t('report.sent'), value: sentCount },
    { name: t('report.failed'), value: failCount },
  ];
  const PIE_COLORS = ['#6366f1', '#ef4444'];

  const pageSize = 20;
  const totalPages = logsData ? Math.ceil(logsData.total / pageSize) : 0;

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => navigate(`/campaigns/${campaignId}`)}
        className="text-sm text-slate-500 hover:text-slate-700 mb-2 flex items-center gap-1 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('report.backToCampaign')}
      </button>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t('report.title', { name: campaign.name })}</h2>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exporting ? t('report.exporting') : t('report.exportCsv')}
        </button>
      </div>

      {/* Summary Stats + Pie Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Stats */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">{t('report.summary')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500 mb-1">{t('report.sent')}</p>
              <p className="text-2xl font-bold text-green-600">{sentCount.toLocaleString()}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500 mb-1">{t('report.failed')}</p>
              <p className="text-2xl font-bold text-red-600">{failCount.toLocaleString()}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500 mb-1">{t('report.totalRecipients')}</p>
              <p className="text-2xl font-bold text-blue-600">{(campaign.total_count ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500 mb-1">{t('report.successRate')}</p>
              <p className="text-2xl font-bold text-amber-600">{successRate}%</p>
            </div>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">{t('report.distribution')}</h3>
          {totalProcessed > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={(props: any) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(1)}%`}
                >
                  {pieData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-sm text-slate-500">
              {t('report.noData')}
            </div>
          )}
        </div>
      </div>

      {/* Send Logs Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">
            {logsData ? t('report.sendLogs', { total: logsData.total.toLocaleString() }) : t('report.sendLogs', { total: '0' })}
          </h3>
        </div>

        {logsLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('report.loadingLogs')}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('report.email')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('report.status')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('report.error')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('report.sentAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(logsData?.logs ?? []).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-sm text-slate-800">{log.email}</td>
                      <td className="px-6 py-3">
                        {log.status === 'sent' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            {t('status.sent')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            {t('status.failed')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-500 max-w-xs truncate">{log.error_message || '-'}</td>
                      <td className="px-6 py-3 text-sm text-slate-500">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {(logsData?.logs ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">
                        {t('report.noLogs')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {t('common.pageWithTotal', { page: logsData!.page, totalPages, total: logsData!.total.toLocaleString() })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {t('common.previous')}
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {t('common.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
