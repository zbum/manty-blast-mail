import { useState, useRef, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <div className="text-slate-500">{t('campaignDetail.loading')}</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">
        {t('campaignDetail.notFound')}
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: t('campaignDetail.tabInfo') },
    { key: 'recipients', label: t('campaignDetail.tabRecipients') },
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
            {t('campaignDetail.backToCampaigns')}
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
                if (!confirm(t('campaignDetail.resetConfirm'))) return;
                try {
                  await resetCampaign(campaignId);
                  queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
                  queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
                } catch (err: any) {
                  alert(err.response?.data?.error || t('campaignDetail.resetFailed'));
                }
              }}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {t('campaignDetail.resetToDraft')}
            </button>
          )}
          <button
            onClick={() => navigate(`/campaigns/${campaignId}/compose`)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {t('campaignDetail.compose')}
          </button>
          <button
            onClick={() => navigate(`/campaigns/${campaignId}/send`)}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {t('campaignDetail.send')}
          </button>
          <button
            onClick={() => navigate(`/campaigns/${campaignId}/report`)}
            className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {t('campaignDetail.report')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-100 mb-6">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-blue-600'
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [fromName, setFromName] = useState(campaign.from_name);
  const [fromEmail, setFromEmail] = useState(campaign.from_email);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

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
      setMessageType('success');
      setMessage(t('campaignDetail.updateSuccess'));
      onUpdated();
    } catch (err: any) {
      setMessageType('error');
      setMessage(err.response?.data?.error || t('campaignDetail.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('campaignDetail.deleteConfirm'))) {
      return;
    }
    try {
      await deleteCampaign(campaign.id);
      navigate('/campaigns');
    } catch (err: any) {
      setMessageType('error');
      setMessage(err.response?.data?.error || t('campaignDetail.updateFailed'));
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 max-w-2xl">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">{t('campaignDetail.editInfo')}</h3>

      {message && (
        <div className={`text-sm px-4 py-3 rounded-lg mb-4 ${
          messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('campaignDetail.campaignName')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('campaignDetail.subject')}</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('campaignDetail.fromName')}</label>
          <input
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('campaignDetail.fromEmail')}</label>
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
            {saving ? t('campaignDetail.saving') : t('campaignDetail.saveChanges')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {t('campaignDetail.deleteCampaign')}
          </button>
        </div>
      </form>
    </div>
  );
}

function RecipientsTab({ campaignId }: { campaignId: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recipientPage, setRecipientPage] = useState(1);
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualVars, setManualVars] = useState<{ key: string; value: string }[]>([]);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadMessageType, setUploadMessageType] = useState<'success' | 'error'>('success');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [encoding, setEncoding] = useState('');

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
    mutationFn: (file: File) => uploadRecipients(campaignId, file, encoding || undefined),
    onSuccess: () => {
      setUploadMessageType('success');
      setUploadMessage(t('campaignDetail.uploadSuccess'));
      queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (err: any) => {
      setUploadMessageType('error');
      setUploadMessage(err.response?.data?.error || t('campaignDetail.uploadFailed'));
    },
  });

  const addManualMutation = useMutation({
    mutationFn: (recipients: any[]) => addRecipientsManual(campaignId, recipients),
    onSuccess: () => {
      setUploadMessageType('success');
      setUploadMessage(t('campaignDetail.recipientAdded'));
      setManualEmail('');
      setManualName('');
      setManualVars([]);
      queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (err: any) => {
      setUploadMessageType('error');
      setUploadMessage(err.response?.data?.error || t('campaignDetail.recipientAddFailed'));
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => deleteRecipients(campaignId),
    onSuccess: () => {
      setUploadMessageType('success');
      setUploadMessage(t('campaignDetail.recipientsCleared'));
      queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (err: any) => {
      setUploadMessageType('error');
      setUploadMessage(err.response?.data?.error || t('campaignDetail.recipientsClearFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (recipientId: number) => deleteRecipient(campaignId, recipientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipients', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (err: any) => {
      setUploadMessageType('error');
      setUploadMessage(err.response?.data?.error || t('campaignDetail.recipientDeleteFailed'));
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
    const variables: Record<string, string> = {};
    for (const v of manualVars) {
      if (v.key.trim()) variables[v.key.trim()] = v.value;
    }
    addManualMutation.mutate([{
      email: manualEmail.trim(),
      name: manualName.trim(),
      variables: Object.keys(variables).length > 0 ? variables : undefined,
    }]);
  };

  const handleClearAll = () => {
    if (!confirm(t('campaignDetail.clearAllConfirm'))) return;
    clearMutation.mutate();
  };

  const handleDeleteRecipient = (recipientId: number) => {
    if (!confirm(t('campaignDetail.deleteRecipientConfirm'))) return;
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">{t('campaignDetail.uploadCsv')}</h3>
            <button
              onClick={handleDownloadTemplate}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t('campaignDetail.downloadTemplate')}
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            {t('campaignDetail.csvHelp')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer"
          >
            <svg className="w-10 h-10 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-slate-600 font-medium">{t('campaignDetail.clickToUpload')}</p>
            <p className="text-xs text-slate-400 mt-1">{t('campaignDetail.orDragDrop')}</p>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {t('campaignDetail.csvEncoding')}
            </label>
            <select
              value={encoding}
              onChange={(e) => setEncoding(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t('campaignDetail.autoDetect')}</option>
              <option value="utf-8">UTF-8</option>
              <option value="euc-kr">EUC-KR (Korean)</option>
              <option value="shift_jis">Shift_JIS (Japanese)</option>
              <option value="windows-1252">Windows-1252 (Western)</option>
              <option value="iso-8859-1">ISO-8859-1 (Latin)</option>
              <option value="big5">Big5 (Traditional Chinese)</option>
              <option value="gbk">GBK (Simplified Chinese)</option>
            </select>
          </div>
          {uploadMutation.isPending && (
            <p className="text-sm text-blue-600 mt-3">{t('campaignDetail.uploading')}</p>
          )}
        </div>

        {/* Manual Entry */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">{t('campaignDetail.addManually')}</h3>
          <form onSubmit={handleAddManual} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('campaignDetail.emailLabel')}</label>
              <input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                required
                placeholder={t('campaignDetail.emailPlaceholder')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('campaignDetail.nameOptional')}</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder={t('campaignDetail.namePlaceholder')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {manualVars.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-500">{t('campaignDetail.variables')}</label>
                {manualVars.map((v, i) => (
                  <div key={i} className="flex gap-1">
                    <input
                      type="text"
                      value={v.key}
                      onChange={(e) => setManualVars((prev) => prev.map((item, j) => j === i ? { ...item, key: e.target.value } : item))}
                      placeholder={t('campaignDetail.key')}
                      className="w-1/2 px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={v.value}
                      onChange={(e) => setManualVars((prev) => prev.map((item, j) => j === i ? { ...item, value: e.target.value } : item))}
                      placeholder={t('campaignDetail.value')}
                      className="w-1/2 px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setManualVars((prev) => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600 px-1 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setManualVars((prev) => [...prev, { key: '', value: '' }])}
              className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer py-1"
            >
              {t('campaignDetail.addVariable')}
            </button>
            <button
              type="submit"
              disabled={addManualMutation.isPending}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer w-full"
            >
              {addManualMutation.isPending ? t('campaignDetail.adding') : t('campaignDetail.addRecipient')}
            </button>
          </form>
        </div>
      </div>

      {/* Status Message */}
      {uploadMessage && (
        <div className={`text-sm px-4 py-3 rounded-lg ${
          uploadMessageType === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {uploadMessage}
        </div>
      )}

      {/* Recipients Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            {recipientData ? t('campaignDetail.recipientsCount', { total: recipientData.total.toLocaleString() }) : t('campaignDetail.tabRecipients')}
          </h3>
          <div className="flex items-center gap-4">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('campaignDetail.searchPlaceholder')}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                {t('common.search')}
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSearchInput(''); setRecipientPage(1); }}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  {t('common.clear')}
                </button>
              )}
            </form>
            <button
              onClick={handleClearAll}
              className="text-sm text-red-600 hover:text-red-700 font-medium cursor-pointer"
            >
              {t('campaignDetail.clearAll')}
            </button>
          </div>
        </div>

        {recipientsLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('campaignDetail.loadingRecipients')}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('common.email')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('common.name')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('campaignDetail.variables')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('common.status')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{t('common.actions')}</th>
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
                          {t('status.' + r.status)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <button
                          onClick={() => handleDeleteRecipient(r.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-500 hover:text-red-700 transition-colors cursor-pointer disabled:opacity-50"
                          title={t('campaignDetail.deleteRecipient')}
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
                        {t('campaignDetail.noRecipients')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {t('common.page', { page: recipientData!.page, totalPages })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRecipientPage((p) => Math.max(1, p - 1))}
                    disabled={recipientPage <= 1}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {t('common.previous')}
                  </button>
                  <button
                    onClick={() => setRecipientPage((p) => Math.min(totalPages, p + 1))}
                    disabled={recipientPage >= totalPages}
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
