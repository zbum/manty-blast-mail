import { useState, useEffect } from 'react';
import { createUser, getUsers, deleteUser } from '../api/client';

interface UserItem {
  id: number;
  username: string;
  role: string;
}

export default function AdminPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersError, setUsersError] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await getUsers();
      setUsers(res.data);
      setUsersError('');
    } catch {
      setUsersError('Failed to load users. Admin access required.');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    if (password.length < 4) {
      setMessage({ type: 'error', text: 'Password must be at least 4 characters.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createUser(username, password);
      setMessage({ type: 'success', text: `User "${res.data.username}" created successfully.` });
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create user.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: number, uname: string) => {
    if (!confirm(`Are you sure you want to delete user "${uname}"?`)) return;
    try {
      await deleteUser(userId);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete user.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">User Management</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-700">Users</h2>
          </div>
          <div className="p-6">
            {usersError ? (
              <p className="text-sm text-red-600">{usersError}</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-slate-500">No users found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-medium text-slate-600">ID</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Username</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Role</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 px-2 text-slate-500">{u.id}</td>
                      <td className="py-2.5 px-2 text-slate-800 font-medium">{u.username}</td>
                      <td className="py-2.5 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Create User */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-fit">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-700">Create User</h2>
          </div>
          <form onSubmit={handleCreateUser} className="p-6 space-y-4">
            {message && (
              <div
                className={`px-4 py-3 rounded-lg text-sm ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {message.text}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Enter username" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Enter password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" placeholder="Confirm password" />
            </div>
            <button type="submit" disabled={isSubmitting}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
