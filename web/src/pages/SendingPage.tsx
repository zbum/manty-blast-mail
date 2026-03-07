import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCampaign, startSend, pauseSend, resumeSend, cancelSend, setRate } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';

interface Campaign {
  id: number;
  name: string;
  status: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  rate_limit: number;
}

interface SendResult {
  email: string;
  status: 'sent' | 'failed';
  error?: string;
  timestamp: string;
}

export default function SendingPage() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe, on, isConnected } = useWebSocket();

  const [status, setStatus] = useState('');
  const [sentCount, setSentCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [totalRecipients, setTotalRecipients] = useState(0);
  const [currentRate, setCurrentRate] = useState(10);
  const [rateInput, setRateInput] = useState(10);
  const [results, setResults] = useState<SendResult[]>([]);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const resultsEndRef = useRef<HTMLDivElement>(null);

  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const res = await getCampaign(campaignId);
      return res.data;
    },
  });

  // Initialize state from campaign data
  useEffect(() => {
    if (campaign) {
      setStatus(campaign.status);
      setSentCount(campaign.sent_count ?? 0);
      setFailCount(campaign.failed_count ?? 0);
      setTotalRecipients(campaign.total_count ?? 0);
      setCurrentRate(campaign.rate_limit || 10);
      setRateInput(campaign.rate_limit || 10);
    }
  }, [campaign]);

  // WebSocket subscription
  useEffect(() => {
    if (isConnected && campaignId) {
      subscribe(campaignId);
      return () => {
        unsubscribe(campaignId);
      };
    }
  }, [isConnected, campaignId, subscribe, unsubscribe]);

  // WebSocket event handlers
  useEffect(() => {
    const unsubProgress = on('progress', (msg: any) => {
      if (msg.campaign_id === campaignId) {
        setSentCount(msg.data.sent_count ?? 0);
        setFailCount(msg.data.failed_count ?? 0);
        setTotalRecipients(msg.data.total_count ?? totalRecipients);
      }
    });

    const unsubStatus = on('status_change', (msg: any) => {
      if (msg.campaign_id === campaignId) {
        setStatus(msg.data.status);
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      }
    });

    const unsubResult = on('send_results', (msg: any) => {
      if (msg.campaign_id === campaignId) {
        const newResults = (msg.data.results ?? []).map((r: any) => ({
          email: r.email,
          status: r.status,
          error: r.error_message,
          timestamp: new Date().toISOString(),
        }));
        setResults((prev) => [...prev, ...newResults].slice(-200));
      }
    });

    return () => {
      unsubProgress();
      unsubStatus();
      unsubResult();
    };
  }, [on, campaignId, totalRecipients, queryClient]);

  // Auto-scroll results
  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results]);

  const handleAction = useCallback(async (action: string, fn: () => Promise<any>) => {
    setActionLoading(action);
    setError('');
    try {
      await fn();
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    } catch (err: any) {
      setError(err.response?.data?.error || `Failed to ${action}.`);
    } finally {
      setActionLoading('');
    }
  }, [campaignId, queryClient]);

  const handleRateChange = async () => {
    try {
      await setRate(campaignId, rateInput);
      setCurrentRate(rateInput);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update rate.');
    }
  };

  const remaining = totalRecipients - sentCount - failCount;
  const progress = totalRecipients > 0 ? ((sentCount + failCount) / totalRecipients) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">Campaign not found.</div>
    );
  }

  const isSending = status === 'sending';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';
  const isDraft = status === 'draft' || status === 'ready';

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
        Back to Campaign
      </button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Send: {campaign.name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <StatusIndicator status={status} />
            {isConnected ? (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
                Live
              </span>
            ) : (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-slate-300 rounded-full inline-block"></span>
                Offline
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200 mb-4">
          {error}
        </div>
      )}

      {/* Progress Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">Progress</span>
          <span className="text-sm text-slate-500">
            {(sentCount + failCount).toLocaleString()} / {totalRecipients.toLocaleString()}
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2 text-right">{progress.toFixed(1)}%</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sent" value={sentCount} color="text-green-600" bgColor="bg-green-50" />
        <StatCard label="Failed" value={failCount} color="text-red-600" bgColor="bg-red-50" />
        <StatCard label="Remaining" value={remaining} color="text-blue-600" bgColor="bg-blue-50" />
        <StatCard label="Rate" value={`${currentRate}/sec`} color="text-amber-600" bgColor="bg-amber-50" />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Action Buttons */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Controls</h3>
          <div className="flex flex-wrap gap-3">
            {isDraft && (
              <button
                onClick={() => handleAction('start', () => startSend(campaignId))}
                disabled={!!actionLoading}
                className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {actionLoading === 'start' ? 'Starting...' : 'Start Sending'}
              </button>
            )}
            {isSending && (
              <button
                onClick={() => handleAction('pause', () => pauseSend(campaignId))}
                disabled={!!actionLoading}
                className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {actionLoading === 'pause' ? 'Pausing...' : 'Pause'}
              </button>
            )}
            {isPaused && (
              <button
                onClick={() => handleAction('resume', () => resumeSend(campaignId))}
                disabled={!!actionLoading}
                className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {actionLoading === 'resume' ? 'Resuming...' : 'Resume'}
              </button>
            )}
            {(isSending || isPaused) && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to cancel sending? This cannot be undone.')) {
                    handleAction('cancel', () => cancelSend(campaignId));
                  }
                }}
                disabled={!!actionLoading}
                className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
            {(isCompleted || isCancelled) && (
              <button
                onClick={() => navigate(`/campaigns/${campaignId}/report`)}
                className="bg-slate-600 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                View Report
              </button>
            )}
          </div>
        </div>

        {/* Rate Control */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Send Rate</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={100}
                value={rateInput}
                onChange={(e) => setRateInput(Number(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-sm font-mono text-slate-800 w-16 text-right">
                {rateInput}/sec
              </span>
            </div>
            <button
              onClick={handleRateChange}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer w-full"
            >
              Apply Rate
            </button>
          </div>
        </div>
      </div>

      {/* Live Results */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">
            Live Results ({results.length})
          </h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200">
                <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Error</th>
                <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((r, i) => (
                <tr key={i} className="text-sm">
                  <td className="px-6 py-2 text-slate-800">{r.email}</td>
                  <td className="px-6 py-2">
                    {r.status === 'sent' ? (
                      <span className="text-green-600 font-medium">Sent</span>
                    ) : (
                      <span className="text-red-600 font-medium">Failed</span>
                    )}
                  </td>
                  <td className="px-6 py-2 text-slate-500 text-xs max-w-xs truncate">
                    {r.error || '-'}
                  </td>
                  <td className="px-6 py-2 text-slate-400 text-xs">
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">
                    No results yet. Start sending to see live results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div ref={resultsEndRef} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bgColor }: { label: string; value: number | string; color: string; bgColor: string }) {
  return (
    <div className={`${bgColor} rounded-xl p-4`}>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string; pulse: boolean }> = {
    draft: { color: 'bg-slate-400', label: 'Draft', pulse: false },
    ready: { color: 'bg-blue-400', label: 'Ready', pulse: false },
    sending: { color: 'bg-green-500', label: 'Sending', pulse: true },
    paused: { color: 'bg-amber-500', label: 'Paused', pulse: false },
    completed: { color: 'bg-green-600', label: 'Completed', pulse: false },
    cancelled: { color: 'bg-red-500', label: 'Cancelled', pulse: false },
  };

  const c = config[status] ?? config.draft;

  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-700 font-medium">
      <span className="relative flex h-3 w-3">
        {c.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.color} opacity-75`}></span>
        )}
        <span className={`relative inline-flex rounded-full h-3 w-3 ${c.color}`}></span>
      </span>
      {c.label}
    </span>
  );
}
