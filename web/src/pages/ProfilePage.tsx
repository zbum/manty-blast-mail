import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../api/client';
import { useAuth } from '../App';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPwSubmitting, setIsPwSubmitting] = useState(false);

  const isOAuth = user?.auth_type === 'oauth';

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);

    if (newPassword !== confirmNewPassword) {
      setPwMessage({ type: 'error', text: t('profile.passwordMismatch') });
      return;
    }

    if (newPassword.length < 4) {
      setPwMessage({ type: 'error', text: t('profile.passwordTooShort') });
      return;
    }

    setIsPwSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwMessage({ type: 'success', text: t('profile.passwordChanged') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      const msg = err.response?.data?.error || t('profile.changeFailed');
      setPwMessage({ type: 'error', text: msg });
    } finally {
      setIsPwSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">{t('profile.title')}</h1>

      <div className="space-y-6 max-w-lg">
        {/* User Info */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-700">{t('profile.accountInfo')}</h2>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{t('profile.username')}</span>
              <span className="text-sm font-medium text-slate-800">{user?.username}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{t('profile.role')}</span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                user?.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {user?.role === 'admin' ? t('profile.roleAdmin') : t('profile.roleUser')}
              </span>
            </div>
            {isOAuth && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{t('admin.authType')}</span>
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">SSO</span>
              </div>
            )}
          </div>
        </div>

        {/* Change Password - only for local users */}
        {!isOAuth && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-700">{t('profile.changePassword')}</h2>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {pwMessage && (
                <div
                  className={`px-4 py-3 rounded-lg text-sm ${
                    pwMessage.type === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {pwMessage.text}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('profile.currentPassword')}</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder={t('profile.currentPasswordPlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('profile.newPassword')}</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder={t('profile.newPasswordPlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('profile.confirmNewPassword')}</label>
                <input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder={t('profile.confirmNewPasswordPlaceholder')} />
              </div>
              <button type="submit" disabled={isPwSubmitting}
                className="w-full bg-slate-700 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {isPwSubmitting ? t('profile.changing') : t('profile.changePassword')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
