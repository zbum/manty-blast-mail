import { useState, useEffect } from 'react';
import { getMe, changePassword } from '../api/client';

export default function ProfilePage() {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPwSubmitting, setIsPwSubmitting] = useState(false);

  useEffect(() => {
    getMe().then((res) => {
      setUsername(res.data.username);
      setRole(res.data.role);
    });
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);

    if (newPassword !== confirmNewPassword) {
      setPwMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    if (newPassword.length < 4) {
      setPwMessage({ type: 'error', text: 'New password must be at least 4 characters.' });
      return;
    }

    setIsPwSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwMessage({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to change password.';
      setPwMessage({ type: 'error', text: msg });
    } finally {
      setIsPwSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Profile</h1>

      <div className="space-y-6 max-w-lg">
        {/* User Info */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-700">Account Info</h2>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Username</span>
              <span className="text-sm font-medium text-slate-800">{username}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Role</span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {role}
              </span>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-700">Change Password</h2>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Enter current password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Enter new password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
              <input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Confirm new password" />
            </div>
            <button type="submit" disabled={isPwSubmitting}
              className="w-full bg-slate-700 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isPwSubmitting ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
