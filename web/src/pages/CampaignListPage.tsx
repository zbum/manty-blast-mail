import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCampaigns } from '../api/client';

interface Campaign {
  id: number;
  user_id: number;
  name: string;
  subject: string;
  status: string;
  sent_count: number;
  failed_count: number;
  total_count: number;
  created_at: string;
}

interface CampaignListResponse {
  data: Campaign[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export default function CampaignListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery<CampaignListResponse>({
    queryKey: ['campaigns', page],
    queryFn: async () => {
      const res = await getCampaigns(page);
      return res.data;
    },
  });

  const totalPages = data ? data.total_pages : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">{t('campaignList.title')}</h2>
        <button
          onClick={() => navigate('/campaigns/new')}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          {t('campaignList.newCampaign')}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-500">{t('campaignList.loading')}</div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">
          {t('campaignList.loadError')}
        </div>
      )}

      {data && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.id')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.creatorId')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.name')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.subject')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.status')}</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.sent')}</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.failed')}</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.recipients')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignList.created')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.data.map((campaign) => (
                  <tr
                    key={campaign.id}
                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-slate-600">#{campaign.id}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{campaign.user_id}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">{campaign.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{campaign.subject}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{campaign.sent_count.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{campaign.failed_count.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">{campaign.total_count.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-sm text-slate-500">
                      {t('campaignList.noCampaigns')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {t('common.pageWithTotal', { page: data.page, totalPages, total: data.total })}
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
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    ready: 'bg-blue-100 text-blue-700',
    sending: 'bg-amber-100 text-amber-700',
    paused: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {t('status.' + status)}
    </span>
  );
}
