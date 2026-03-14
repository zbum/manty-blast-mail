import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getAuditLogs } from '../api/client';

interface AuditLog {
  id: number;
  actor_id: number;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: number;
  target_name: string;
  detail: string;
  created_at: string;
}

interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

function parseDetail(detail: string): Record<string, string> {
  try {
    return JSON.parse(detail);
  } catch {
    return {};
  }
}

function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation();
  const config: Record<string, { label: string; className: string }> = {
    role_change: {
      label: t('audit.actionRoleChange'),
      className: 'bg-purple-100 text-purple-700',
    },
    mail_start: {
      label: t('audit.actionMailStart'),
      className: 'bg-blue-100 text-blue-700',
    },
    user_create: {
      label: t('audit.actionUserCreate'),
      className: 'bg-green-100 text-green-700',
    },
    user_delete: {
      label: t('audit.actionUserDelete'),
      className: 'bg-red-100 text-red-700',
    },
  };

  const c = config[action] || {
    label: action,
    className: 'bg-slate-100 text-slate-600',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

function DetailCell({ action, detail }: { action: string; detail: string }) {
  const { t } = useTranslation();
  const parsed = parseDetail(detail);

  if (action === 'role_change') {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-medium">
          {parsed.old_role}
        </span>
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium">
          {parsed.new_role}
        </span>
      </div>
    );
  }

  if (action === 'mail_start') {
    return (
      <span className="text-sm text-slate-600">
        {t('audit.recipientCount', { count: Number(parsed.recipient_count || 0) })}
      </span>
    );
  }

  return <span className="text-sm text-slate-500">{detail}</span>;
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery<AuditLogsResponse>({
    queryKey: ['auditLogs', page],
    queryFn: async () => {
      const res = await getAuditLogs(page, pageSize);
      return res.data;
    },
  });

  const totalPages = data?.total_pages ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('audit.title')}</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-700">
            {data ? t('audit.totalLogs', { total: data.total.toLocaleString() }) : t('audit.totalLogs', { total: '0' })}
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('common.loading')}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('audit.time')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('audit.actor')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('audit.action')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('audit.target')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('audit.detail')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.data ?? []).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-sm text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-800 font-medium">{log.actor_name}</td>
                      <td className="px-6 py-3">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        <span className="text-slate-400 text-xs mr-1">[{log.target_type}]</span>
                        {log.target_name}
                      </td>
                      <td className="px-6 py-3">
                        <DetailCell action={log.action} detail={log.detail} />
                      </td>
                    </tr>
                  ))}
                  {(data?.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                        {t('audit.noLogs')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {t('common.pageWithTotal', { page, totalPages, total: data!.total.toLocaleString() })}
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
