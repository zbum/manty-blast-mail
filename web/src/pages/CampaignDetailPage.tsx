import { useState, useRef, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCampaign,
  updateCampaign,
  deleteCampaign,
  resetCampaign,
  uploadRecipients,
  addRecipientsManual,
  getRecipients,
  deleteRecipients,
  deleteRecipient,
} from '../api/client';

interface Campaign {
  id: number;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  status: string;
  body_html: string;
  body_raw_mime: string;
  ics_content: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

interface Recipient {
  id: number;
  email: string;
  name: string;
  variables: Record<string, string>;
  status: string;
}

type Tab = 'info' | 'recipients';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const res = await getCampaign(campaignId);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading campaign...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">
        Campaign not found.
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Campaign Info' },
    { key: 'recipients', label: 'Recipients' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/campaigns')}
            className="text-sm text-slate-500 hover:text-slate-700 mb-2 flex items-center gap-1 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Campaigns
          </button>
          <h2 className="text-2xl font-bold text-slate-800">{campaign.name}</h2>
          <p className="text-sm text-slate-500 mt-1">
            Status: <StatusBadge status={campaign.status} /> | Recipients: {(campaign.total_count ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {(campaign.status === 'completed' || campaign.status === 'cancelled') && (
            <button
              onClick={async () => {
                if (!confirm('Reset this campaign to draft? All send logs will be cleared and recipients will be reset to pending.')) return;
                try {
                  await resetCampaign(campaignId);
                  queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
                  queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
                } catch (err: any) {
                  alert(err.response?.data?.error || 'Failed to reset campaign.');
                }
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              Reset to Draft
            </button>
          )}
          <button
            onClick={() => navigate(`/campaigns/${campaignId}/compose`)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Compose
          </button>
          <button
            onClick={() => navigate(`/campaigns/${campaignId}/send`)}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Send
          </button>
          <button
            onClick={() => navigate(`/campaigns/${campaignId}/report`)}
            className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <CampaignInfoTab campaign={campaign} onUpdated={() => queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })} />
      )}
      {activeTab === 'recipients' && (
        <RecipientsTab campaignId={campaignId} />
      )}
    </div>
  );
}

function CampaignInfoTab({ campaign, onUpdated }: { campaign: Campaign; onUpdated: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [fromName, setFromName] = useState(campaign.from_name);
  const [fromEmail, setFromEmail] = useState(campaign.from_email);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await updateCampaign(campaign.id, {
        name,
        subject,
        from_name: fromName,
        from_email: fromEmail,
      });
      setMessage('Campaign updated successfully.');
      onUpdated();
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to update campaign.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteCampaign(campaign.id);
      navigate('/campaigns');
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Failed to delete campaign.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-2xl">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Edit Campaign Info</h3>

      {message && (
        <div className={`text-sm px-4 py-3 rounded-lg mb-4 ${
          message.includes('success') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">From Name</label>
          <input
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">From Email</label>
          <input
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Delete Campaign
          </button>
        </div>
      </form>
    </div>
  );
}

function RecipientsTab({ campaignId }: { campaignId: number }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recipientPage, setRecipientPage] = useState(1);
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data: recipientData, isLoading: recipientsLoading } = useQuery<{
    data: Recipient[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  }>({
    queryKey: ['recipients', campaignId, recipientPage, search],
    queryFn: async () => {
      const res = await getRecipients(campaignId, recipientPage, search);
      return res.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadRecipients(campaignId, file),
    onSuccess: () => {
      setUploadMessage('File uploaded successfully.');
      queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (err: any) => {
      setUploadMessage(err.response?.data?.error || 'Upload failed.');
    },
  });

  const addManualMutation = useMutation({
    mutationFn: (recipients: any[]) => addRecipientsManual(campaignId, recipients),
    onSuccess: () => {
      setUploadMessage('Recipient added successfully.');
      setManualEmail('');
      setManualName('');
      queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (err: any) => {
      setUploadMessage(err.response?.data?.error || 'Failed to add recipient.');
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => deleteRecipients(campaignId),
    onSuccess: () => {
      setUploadMessage('All recipients cleared.');
      queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (err: any) => {
      setUploadMessage(err.response?.data?.error || 'Failed to clear recipients.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (recipientId: number) => deleteRecipient(campaignId, recipientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (err: any) => {
      setUploadMessage(err.response?.data?.error || 'Failed to delete recipient.');
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleAddManual = (e: FormEvent) => {
    e.preventDefault();
    if (!manualEmail.trim()) return;
    addManualMutation.mutate([{ email: manualEmail.trim(), name: manualName.trim() }]);
  };

  const handleClearAll = () => {
    if (!confirm('Are you sure you want to remove all recipients?')) return;
    clearMutation.mutate();
  };

  const handleDeleteRecipient = (recipientId: number) => {
    if (!confirm('Are you sure you want to delete this recipient?')) return;
    deleteMutation.mutate(recipientId);
  };

  const handleDownloadTemplate = () => {
    const csv = 'email,name\nuser1@example.com,John Doe\nuser2@example.com,Jane Smith\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recipients_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setRecipientPage(1);
  };

  const totalPages = recipientData ? recipientData.total_pages : 0;

  const recipientStatusStyles: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700',
    sent: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="space-y-6">
      {/* Upload and Manual Entry */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* File Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Upload CSV</h3>
            <button
              onClick={handleDownloadTemplate}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Template
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Upload a CSV file with columns: email, name (and optional variable columns).
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
          >
            <svg className="w-10 h-10 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-slate-600 font-medium">Click to upload CSV</p>
            <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
          </div>
          {uploadMutation.isPending && (
            <p className="text-sm text-blue-600 mt-3">Uploading...</p>
          )}
        </div>

        {/* Manual Entry */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Manually</h3>
          <form onSubmit={handleAddManual} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                required
                placeholder="recipient@example.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name (optional)</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={addManualMutation.isPending}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer w-full"
            >
              {addManualMutation.isPending ? 'Adding...' : 'Add Recipient'}
            </button>
          </form>
        </div>
      </div>

      {/* Status Message */}
      {uploadMessage && (
        <div className={`text-sm px-4 py-3 rounded-lg ${
          uploadMessage.includes('success') || uploadMessage.includes('cleared')
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {uploadMessage}
        </div>
      )}

      {/* Recipients Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Recipients {recipientData ? `(${recipientData.total.toLocaleString()})` : ''}
          </h3>
          <div className="flex items-center gap-4">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search email or name..."
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Search
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSearchInput(''); setRecipientPage(1); }}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </form>
            <button
              onClick={handleClearAll}
              className="text-sm text-red-600 hover:text-red-700 font-medium cursor-pointer"
            >
              Clear All
            </button>
          </div>
        </div>

        {recipientsLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading recipients...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Variables</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(recipientData?.data ?? []).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-sm text-slate-800">{r.email}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{r.name || '-'}</td>
                      <td className="px-6 py-3 text-sm text-slate-500 font-mono text-xs">
                        {r.variables && Object.keys(r.variables).length > 0
                          ? JSON.stringify(r.variables)
                          : '-'}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${recipientStatusStyles[r.status] ?? 'bg-slate-100 text-slate-700'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <button
                          onClick={() => handleDeleteRecipient(r.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-500 hover:text-red-700 transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete recipient"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(recipientData?.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                        No recipients added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Page {recipientData!.page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRecipientPage((p) => Math.max(1, p - 1))}
                    disabled={recipientPage <= 1}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setRecipientPage((p) => Math.min(totalPages, p + 1))}
                    disabled={recipientPage >= totalPages}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Next
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

function StatusBadge({ status }: { status: string }) {
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
      {status}
    </span>
  );
}
