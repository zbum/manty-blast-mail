import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createCampaign } from '../api/client';

export default function NewCampaignPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await createCampaign({
        name,
        subject,
        from_name: fromName,
        from_email: fromEmail,
      });
      navigate(`/campaigns/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || t('newCampaign.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => navigate('/campaigns')}
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('newCampaign.backToCampaigns')}
      </button>

      <h2 className="text-2xl font-bold text-slate-800 mb-6">{t('newCampaign.title')}</h2>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-2xl">
        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('newCampaign.campaignName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder={t('newCampaign.campaignNamePlaceholder')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('newCampaign.subject')}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              placeholder={t('newCampaign.subjectPlaceholder')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('newCampaign.fromName')}</label>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              required
              placeholder={t('newCampaign.fromNamePlaceholder')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('newCampaign.fromEmail')}</label>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
              placeholder={t('newCampaign.fromEmailPlaceholder')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {saving ? t('newCampaign.creating') : t('newCampaign.createCampaign')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/campaigns')}
              className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {t('newCampaign.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
