import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCampaigns } from '../api/client';

interface Campaign {
  id: number;
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
        <h2 className="text-2xl font-bold text-slate-800">Campaigns</h2>
        <button
          onClick={() => navigate('/campaigns/new')}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          + New Campaign
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-500">Loading campaigns...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">
          Failed to load campaigns.
        </div>
      )}

      {data && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Subject</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Sent</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Failed</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Recipients</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
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
                    <td colSpan={8} className="px-6 py-8 text-center text-sm text-slate-500">
                      No campaigns found. Create your first campaign to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Page {data.page} of {totalPages} ({data.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Next
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
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    ready: 'bg-indigo-100 text-indigo-700',
    sending: 'bg-amber-100 text-amber-700',
    paused: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
}
