import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../utils/api';
import Loader from '../components/Loader';
import Sidebar from '../components/Sidebar';
import { useMobile } from '../mobile';

const GB = 1024 * 1024 * 1024;

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** i)).toFixed(1)} ${units[i]}`;
};

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [limits, setLimits] = useState({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isMobile = useMobile();

  const [profileForm, setProfileForm] = useState({ username: user?.username || '', email: user?.email || '', current_password: '' });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.users();
      setUsers(res.data || []);
      const next = {};
      (res.data || []).forEach((u) => { next[u.id] = Math.round((u.storage_limit || (2 * GB)) / GB); });
      setLimits(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  useEffect(() => {
    setProfileForm((prev) => ({ ...prev, username: user?.username || '', email: user?.email || '' }));
  }, [user?.username, user?.email]);

  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  const handleNavigate = (folderId) => {
    navigate(folderId ? `/?folder=${folderId}` : '/');
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] transition-colors duration-200 main-content-area">
      <div className="desktop-sidebar">
        <Sidebar
          currentFolder={null}
          onNavigate={handleNavigate}
          onCreateFolder={() => navigate('/')}
          onUpload={() => navigate('/')}
          onCreateDocument={() => navigate('/')}
          onOpenTrash={() => navigate('/?trash=1')}
          onOpenSearch={() => { }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden overflow-y-auto">
        <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold mb-2">Admin</h1>
            <p className="text-[var(--text-secondary)] mb-6">Manage users, storage limits, and admin account settings.</p>

            <div className="mb-4 inline-flex rounded-lg border border-[var(--border-color)] overflow-hidden">
              <button className={`px-4 py-2 text-sm ${activeTab === 'users' ? 'bg-[var(--accent)] text-black font-semibold' : 'bg-[var(--bg-secondary)]'}`} onClick={() => setActiveTab('users')}>Users</button>
              <button className={`px-4 py-2 text-sm ${activeTab === 'settings' ? 'bg-[var(--accent)] text-black font-semibold' : 'bg-[var(--bg-secondary)]'}`} onClick={() => setActiveTab('settings')}>Settings</button>
            </div>

            {notice && <div className="mb-4 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">{notice}</div>}

            {activeTab === 'users' && (
              loading ? (
                <div className="py-4 flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader className="scale-50" />Loading users...</div>
              ) : (
                <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--bg-secondary)]">
                      <tr>
                        <th className="text-left p-3">User</th>
                        <th className="text-left p-3">Role</th>
                        <th className="text-left p-3">Used</th>
                        <th className="text-left p-3">Limit</th>
                        <th className="text-left p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-t border-[var(--border-color)]">
                          <td className="p-3">
                            <div className="font-medium">{u.username}</div>
                            <div className="text-xs text-[var(--text-tertiary)]">{u.email}</div>
                          </td>
                          <td className="p-3">{u.is_admin ? 'Admin' : 'User'}</td>
                          <td className="p-3">{formatSize(u.storage_used)}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              min={1}
                              className="w-20 px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                              value={limits[u.id] ?? 2}
                              onChange={(e) => setLimits((prev) => ({ ...prev, [u.id]: Number(e.target.value) }))}
                            />
                            <span className="ml-2 text-xs text-[var(--text-tertiary)]">GB</span>
                          </td>
                          <td className="p-3">
                            <button
                              className="px-3 py-1.5 rounded bg-[var(--accent)] text-black font-medium"
                              onClick={async () => {
                                await adminAPI.updateUserStorage(u.id, (limits[u.id] || 2) * GB);
                                setNotice(`Updated storage for ${u.username}`);
                                await loadUsers();
                              }}
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {activeTab === 'settings' && (
              <div className="grid md:grid-cols-2 gap-4">
                <form
                  className="rounded-xl border border-[var(--border-color)] p-4 space-y-3 bg-[var(--bg-secondary)]"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const res = await adminAPI.updateAdminProfile(profileForm);
                      const nextUser = { ...user, ...res.data };
                      localStorage.setItem('user', JSON.stringify(nextUser));
                      setNotice('Profile updated. Please re-login if your username changed.');
                      setProfileForm((prev) => ({ ...prev, current_password: '' }));
                    } catch (err) {
                      setNotice(err?.response?.data?.detail || 'Failed to update profile');
                    }
                  }}
                >
                  <h2 className="text-lg font-semibold">Profile</h2>
                  <input className="w-full px-3 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]" placeholder="Username" value={profileForm.username} onChange={(e) => setProfileForm((p) => ({ ...p, username: e.target.value }))} required />
                  <input type="email" className="w-full px-3 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]" placeholder="Email" value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} required />
                  <input type="password" className="w-full px-3 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]" placeholder="Current password" value={profileForm.current_password} onChange={(e) => setProfileForm((p) => ({ ...p, current_password: e.target.value }))} required />
                  <button className="px-3 py-2 rounded bg-[var(--accent)] text-black font-semibold">Update profile</button>
                </form>

                <form
                  className="rounded-xl border border-[var(--border-color)] p-4 space-y-3 bg-[var(--bg-secondary)]"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (passwordForm.new_password !== passwordForm.confirm_password) {
                      setNotice('New password and confirm password do not match');
                      return;
                    }
                    try {
                      await adminAPI.updateAdminPassword({
                        current_password: passwordForm.current_password,
                        new_password: passwordForm.new_password,
                      });
                      setNotice('Password updated successfully');
                      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
                    } catch (err) {
                      setNotice(err?.response?.data?.detail || 'Failed to update password');
                    }
                  }}
                >
                  <h2 className="text-lg font-semibold">Change Password</h2>
                  <input type="password" className="w-full px-3 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]" placeholder="Current password" value={passwordForm.current_password} onChange={(e) => setPasswordForm((p) => ({ ...p, current_password: e.target.value }))} required />
                  <input type="password" className="w-full px-3 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]" placeholder="New password" value={passwordForm.new_password} onChange={(e) => setPasswordForm((p) => ({ ...p, new_password: e.target.value }))} required />
                  <input type="password" className="w-full px-3 py-2 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]" placeholder="Confirm new password" value={passwordForm.confirm_password} onChange={(e) => setPasswordForm((p) => ({ ...p, confirm_password: e.target.value }))} required />
                  <button className="px-3 py-2 rounded bg-[var(--accent)] text-black font-semibold">Update password</button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
