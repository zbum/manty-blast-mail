import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getCampaign, updateCampaign, previewCampaign, previewSend, getAttachments, uploadAttachment, deleteAttachment } from '../api/client';

type Mode = 'html' | 'mime';
type IcsMode = 'builder' | 'raw';

interface Campaign {
  id: number;
  name: string;
  subject: string;
  from_name: string;
  from_email: string;
  body_type: string;
  body_html: string;
  body_raw_mime: string;
  ics_enabled: boolean;
  ics_content: string;
  status: string;
}

interface IcsFields {
  summary: string;
  dtstart: string;
  dtend: string;
  location: string;
  description: string;
  organizerName: string;
  organizerEmail: string;
}

function formatDTValue(dtLocal: string): string {
  // datetime-local gives "2026-03-07T14:00" → convert to "20260307T140000"
  return dtLocal.replace(/[-:]/g, '') + '00';
}

function parseDTValue(icsdt: string): string {
  // "20260307T140000" → "2026-03-07T14:00"
  if (!icsdt || icsdt.length < 15) return '';
  const d = icsdt.replace(/[^0-9T]/g, '');
  return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(9,11)}:${d.slice(11,13)}`;
}

function parseIcsString(ics: string): IcsFields | null {
  if (!ics || !ics.includes('BEGIN:VEVENT')) return null;

  // Extract VEVENT lines by splitting on any line ending and finding the section
  const lines = ics.split(/\r?\n/);
  const veventLines: string[] = [];
  let inVevent = false;
  for (const line of lines) {
    if (line.trim() === 'BEGIN:VEVENT') { inVevent = true; continue; }
    if (line.trim() === 'END:VEVENT') break;
    if (inVevent) veventLines.push(line);
  }

  const findLine = (key: string): string => {
    for (const line of veventLines) {
      if (line.startsWith(key + ':') || line.startsWith(key + ';')) {
        return line;
      }
    }
    return '';
  };

  const get = (key: string): string => {
    const line = findLine(key);
    if (!line) return '';
    const colonIdx = line.indexOf(':');
    return colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : '';
  };

  const getDT = (key: string): string => {
    const line = findLine(key);
    if (!line) return '';
    // Extract datetime value: 20260308T100000
    const match = line.match(/(\d{8}T\d{6})/);
    return match ? match[1] : '';
  };

  const summary = get('SUMMARY');
  const dtstart = parseDTValue(getDT('DTSTART'));
  const dtend = parseDTValue(getDT('DTEND'));
  const location = get('LOCATION');
  const rawDesc = get('DESCRIPTION');
  const description = rawDesc.replace(/\\n/g, '\n');

  let organizerName = '';
  let organizerEmail = '';
  const orgLine = findLine('ORGANIZER');
  if (orgLine) {
    const cnMatch = orgLine.match(/;CN=([^:;]*)/);
    organizerName = cnMatch ? cnMatch[1].replace(/^"|"$/g, '') : '';
    const mailtoMatch = orgLine.match(/:mailto:(.*)$/);
    organizerEmail = mailtoMatch ? mailtoMatch[1].trim() : '';
  }

  return { summary, dtstart, dtend, location, description, organizerName, organizerEmail };
}

function nowUTC(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function buildIcsString(f: IcsFields): string {
  const uid = `${Date.now()}@mail-sender`;
  const start = f.dtstart ? formatDTValue(f.dtstart) : '';
  const end = f.dtend ? formatDTValue(f.dtend) : '';
  const stamp = nowUTC();

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Mail Sender//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Seoul',
    'TZURL:http://tzurl.org/zoneinfo-outlook/Asia/Seoul',
    'X-LIC-LOCATION:Asia/Seoul',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:KST',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `DTSTAMP:${stamp}`,
  ];

  if (start) lines.push(`DTSTART;TZID=Asia/Seoul:${start}`);
  if (end) lines.push(`DTEND;TZID=Asia/Seoul:${end}`);
  if (f.summary) lines.push(`SUMMARY:${f.summary}`);
  if (f.location) lines.push(`LOCATION:${f.location}`);
  lines.push(`UID:${uid}`);
  lines.push('SEQUENCE:0');
  if (f.description) lines.push(`DESCRIPTION:${f.description.replace(/\n/g, '\\n')}`);
  lines.push(`CREATED:${stamp}`);
  lines.push(`LAST-MODIFIED:${stamp}`);
  if (f.organizerEmail) {
    const cn = f.organizerName ? `;CN="${f.organizerName}"` : '';
    lines.push(`ORGANIZER${cn}:mailto:${f.organizerEmail}`);
  }
  lines.push('ATTENDEE;CN=;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT;RSVP=TRUE;CUTYPE=INDIVIDUAL:mailto:{{.Email}}');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

export default function ComposePage() {
  const { id } = useParams<{ id: string }>();
  const campaignId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [mode, setMode] = useState<Mode>('html');
  const [htmlContent, setHtmlContent] = useState('');
  const [mimeContent, setMimeContent] = useState('');
  const [icalEnabled, setIcalEnabled] = useState(false);
  const [icalContent, setIcalContent] = useState('');
  const [icsMode, setIcsMode] = useState<IcsMode>('builder');
  const [icsFields, setIcsFields] = useState<IcsFields>({
    summary: '',
    dtstart: '',
    dtend: '',
    location: '',
    description: '',
    organizerName: '',
    organizerEmail: '',
  });
  const [icsPreviewOpen, setIcsPreviewOpen] = useState(false);
  const icsInitialized = useRef(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testName, setTestName] = useState('');
  const [testVars, setTestVars] = useState<{ key: string; value: string }[]>([]);
  const [testSending, setTestSending] = useState(false);

  const attachmentFileRef = useRef<HTMLInputElement>(null);

  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const res = await getCampaign(campaignId);
      return res.data;
    },
  });

  const { data: attachments } = useQuery<Array<{id: number; filename: string; content_type: string; size: number; created_at: string}>>({
    queryKey: ['attachments', campaignId],
    queryFn: async () => {
      const res = await getAttachments(campaignId);
      return res.data;
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(campaignId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', campaignId] });
      setMessageType('success');
      setMessage(t('compose.attachmentUploaded'));
    },
    onError: (err: any) => {
      setMessageType('error');
      setMessage(err.response?.data?.error || t('compose.attachmentUploadFailed'));
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) => deleteAttachment(campaignId, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', campaignId] });
      setMessageType('success');
      setMessage(t('compose.attachmentDeleted'));
    },
    onError: (err: any) => {
      setMessageType('error');
      setMessage(err.response?.data?.error || t('compose.attachmentDeleteFailed'));
    },
  });

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAttachmentMutation.mutate(file);
      e.target.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  useEffect(() => {
    if (campaign) {
      setHtmlContent(campaign.body_html || '');
      setMimeContent(campaign.body_raw_mime || '');
      setIcalContent(campaign.ics_content || '');
      setIcalEnabled(campaign.ics_enabled || false);
      if (campaign.body_type === 'raw_mime') {
        setMode('mime');
      }
      // Try to parse saved ICS into builder fields
      const savedIcs = campaign.ics_content || '';
      const parsed = parseIcsString(savedIcs);
      if (parsed) {
        setIcsFields(parsed);
        setIcsMode('builder');
      } else if (savedIcs) {
        setIcsMode('raw');
      }
      icsInitialized.current = true;
      setDirty(false);
    }
  }, [campaign]);

  // Auto-generate ICS string from builder fields
  const generatedIcs = useMemo(() => buildIcsString(icsFields), [icsFields]);

  // Sync builder output to icalContent when in builder mode (skip during init)
  useEffect(() => {
    if (!icsInitialized.current) return;
    if (icsMode === 'builder' && icalEnabled) {
      setIcalContent(generatedIcs);
    }
  }, [generatedIcs, icsMode, icalEnabled]);

  const buildPayload = () => {
    const payload: Record<string, any> = {};
    if (mode === 'html') {
      payload.body_type = 'html';
      payload.body_html = htmlContent;
      payload.body_raw_mime = '';
      payload.ics_enabled = icalEnabled;
      // In builder mode, always use freshly generated ICS to avoid stale state
      const icsValue = icsMode === 'builder' ? generatedIcs : icalContent;
      payload.ics_content = icalEnabled ? icsValue : '';
    } else {
      payload.body_type = 'raw_mime';
      payload.body_raw_mime = mimeContent;
      payload.body_html = '';
      payload.ics_enabled = false;
      payload.ics_content = '';
    }
    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await updateCampaign(campaignId, buildPayload());
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      setDirty(false);
      setMessageType('success');
      setMessage(t('compose.saveSuccess'));
    } catch (err: any) {
      setMessageType('error');
      setMessage(err.response?.data?.error || t('compose.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setMessage('');
    try {
      // Auto-save before preview so backend has latest content
      await updateCampaign(campaignId, buildPayload());
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });

      const res = await previewCampaign(campaignId);
      setPreviewHtml(res.data.body_html || '');
      setShowPreview(true);
    } catch (err: any) {
      setMessageType('error');
      setMessage(err.response?.data?.error || t('compose.previewFailed'));
    }
  };

  const handleTestSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    setTestSending(true);
    try {
      const variables: Record<string, string> = {};
      for (const v of testVars) {
        if (v.key.trim()) variables[v.key.trim()] = v.value;
      }
      await previewSend(campaignId, testEmail.trim(), testName.trim() || undefined, Object.keys(variables).length > 0 ? variables : undefined);
      setMessageType('success');
      setMessage(t('compose.testSent', { email: testEmail }));
    } catch (err: any) {
      setMessageType('error');
      setMessage(err.response?.data?.error || t('compose.testFailed'));
    } finally {
      setTestSending(false);
    }
  };

  const updateIcsField = (field: keyof IcsFields, value: string) => {
    setIcsFields((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  if (isLoading) {
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
        {t('compose.backToCampaign')}
      </button>
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        {t('compose.title', { name: campaign.name })}
      </h2>

      {message && (
        <div className={`text-sm px-4 py-3 rounded-lg mb-4 ${
          messageType === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Mode Toggle */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm font-medium text-slate-700">{t('compose.mode')}</label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => { setMode('html'); setDirty(true); }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    mode === 'html'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t('compose.html')}
                </button>
                <button
                  onClick={() => { setMode('mime'); setDirty(true); }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    mode === 'mime'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t('compose.rawMime')}
                </button>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-4">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-600">{t('compose.templateVariables')}</span> (case-sensitive):
                <code className="bg-white border border-slate-100 px-1.5 py-0.5 rounded text-blue-600 mx-1">{'{{.Name}}'}</code>
                <code className="bg-white border border-slate-100 px-1.5 py-0.5 rounded text-blue-600 mx-1">{'{{.Email}}'}</code>
                and custom variables like
                <code className="bg-white border border-slate-100 px-1.5 py-0.5 rounded text-blue-600 mx-1">{'{{.Company}}'}</code>
              </p>
            </div>

            {mode === 'html' ? (
              <textarea
                value={htmlContent}
                onChange={(e) => { setHtmlContent(e.target.value); setDirty(true); }}
                placeholder={t('compose.htmlPlaceholder')}
                className="w-full h-96 px-4 py-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
              />
            ) : (
              <textarea
                value={mimeContent}
                onChange={(e) => { setMimeContent(e.target.value); setDirty(true); }}
                placeholder={t('compose.rawMimePlaceholder')}
                className="w-full h-96 px-4 py-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
              />
            )}
          </div>

          {/* iCalendar Section (HTML mode only) */}
          {mode === 'html' && <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex items-center gap-3 mb-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={icalEnabled}
                  onChange={(e) => { setIcalEnabled(e.target.checked); setDirty(true); }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
              <span className="text-sm font-medium text-slate-700">{t('compose.includeIcs')}</span>
            </div>

            {icalEnabled && (
              <div>
                {/* ICS Mode Toggle */}
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit">
                  <button
                    onClick={() => setIcsMode('builder')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      icsMode === 'builder'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t('compose.icsBuilder')}
                  </button>
                  <button
                    onClick={() => setIcsMode('raw')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      icsMode === 'raw'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t('compose.icsRaw')}
                  </button>
                </div>

                {icsMode === 'builder' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('compose.eventTitle')}</label>
                      <input
                        type="text"
                        value={icsFields.summary}
                        onChange={(e) => updateIcsField('summary', e.target.value)}
                        placeholder={t('compose.eventTitlePlaceholder')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('compose.startDateTime')}</label>
                        <input
                          type="datetime-local"
                          value={icsFields.dtstart}
                          onChange={(e) => updateIcsField('dtstart', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('compose.endDateTime')}</label>
                        <input
                          type="datetime-local"
                          value={icsFields.dtend}
                          onChange={(e) => updateIcsField('dtend', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('compose.location')}</label>
                      <input
                        type="text"
                        value={icsFields.location}
                        onChange={(e) => updateIcsField('location', e.target.value)}
                        placeholder={t('compose.locationPlaceholder')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('compose.description')}</label>
                      <textarea
                        value={icsFields.description}
                        onChange={(e) => updateIcsField('description', e.target.value)}
                        placeholder={t('compose.descriptionPlaceholder')}
                        rows={3}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('compose.organizerName')}</label>
                        <input
                          type="text"
                          value={icsFields.organizerName}
                          onChange={(e) => updateIcsField('organizerName', e.target.value)}
                          placeholder={t('compose.organizerNamePlaceholder')}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('compose.organizerEmail')}</label>
                        <input
                          type="email"
                          value={icsFields.organizerEmail}
                          onChange={(e) => updateIcsField('organizerEmail', e.target.value)}
                          placeholder={t('compose.organizerEmailPlaceholder')}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-slate-400">
                      {t('compose.icsTip', { templateEmail: '{{.Email}}', templateName: '{{.Name}}' })}
                    </p>

                    {/* Generated ICS Preview */}
                    <div>
                      <button
                        onClick={() => setIcsPreviewOpen((v) => !v)}
                        className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${icsPreviewOpen ? 'rotate-90' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {t('compose.generatedIcsPreview')}
                      </button>
                      {icsPreviewOpen && (
                        <pre className="mt-2 p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-mono text-slate-600 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                          {generatedIcs}
                        </pre>
                      )}
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={icalContent}
                    onChange={(e) => { setIcalContent(e.target.value); setDirty(true); }}
                    placeholder={'BEGIN:VCALENDAR\nVERSION:2.0\n...'}
                    className="w-full h-40 px-4 py-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                  />
                )}
              </div>
            )}
          </div>}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">{t('compose.actions')}</h3>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {saving ? t('compose.saving') : t('compose.saveContent')}
            </button>
            <button
              onClick={handlePreview}
              className="w-full border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {t('compose.preview')}
            </button>
          </div>

          {/* Attachments */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{t('compose.attachments')}</h3>
            <input
              ref={attachmentFileRef}
              type="file"
              onChange={handleAttachmentUpload}
              className="hidden"
            />
            <button
              onClick={() => attachmentFileRef.current?.click()}
              disabled={uploadAttachmentMutation.isPending}
              className="w-full border-2 border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors cursor-pointer disabled:opacity-50"
            >
              {uploadAttachmentMutation.isPending ? t('compose.uploadingAttachment') : t('compose.addAttachment')}
            </button>
            {attachments && attachments.length > 0 ? (
              <div className="mt-3 space-y-2">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{a.filename}</p>
                      <p className="text-xs text-slate-400">{formatFileSize(a.size)}</p>
                    </div>
                    <button
                      onClick={() => deleteAttachmentMutation.mutate(a.id)}
                      disabled={deleteAttachmentMutation.isPending}
                      className="text-red-400 hover:text-red-600 ml-2 cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-2">{t('compose.noAttachments')}</p>
            )}
          </div>

          {/* Test Send */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{t('compose.testSend')}</h3>
            {dirty ? (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t('compose.saveFirst')}
              </p>
            ) : (
              <form onSubmit={handleTestSend} className="space-y-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder={t('compose.testEmailPlaceholder')}
                  required
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder={t('compose.testNamePlaceholder')}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {testVars.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-500">{t('compose.variables')}</label>
                    {testVars.map((v, i) => (
                      <div key={i} className="flex gap-1">
                        <input
                          type="text"
                          value={v.key}
                          onChange={(e) => setTestVars((prev) => prev.map((item, j) => j === i ? { ...item, key: e.target.value } : item))}
                          placeholder={t('compose.key')}
                          className="w-1/2 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={v.value}
                          onChange={(e) => setTestVars((prev) => prev.map((item, j) => j === i ? { ...item, value: e.target.value } : item))}
                          placeholder={t('compose.value')}
                          className="w-1/2 px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setTestVars((prev) => prev.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600 px-1 cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setTestVars((prev) => [...prev, { key: '', value: '' }])}
                  className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer py-1"
                >
                  {t('compose.addVariable')}
                </button>
                <button
                  type="submit"
                  disabled={testSending}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  {testSending ? t('compose.sending') : t('compose.sendTestEmail')}
                </button>
              </form>
            )}
          </div>

          {/* Campaign Info */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">{t('compose.campaignInfo')}</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">{t('compose.subjectLabel')}</dt>
                <dd className="text-slate-800 font-medium">{campaign.subject}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('compose.fromLabel')}</dt>
                <dd className="text-slate-800">{campaign.from_name} &lt;{campaign.from_email}&gt;</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('compose.statusLabel')}</dt>
                <dd><StatusBadge status={campaign.status} /></dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">{t('compose.emailPreview')}</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-1">
              <iframe
                srcDoc={previewHtml}
                title={t('compose.emailPreview')}
                className="w-full h-full min-h-[500px] border-0"
                sandbox=""
              />
            </div>
          </div>
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
