import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../utils/api';
import AIConfigForm from '../components/ai/AIConfigForm';
import Sidebar from '../components/Sidebar';
import { useMobile } from '../mobile';

export default function SettingsPage() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(user || null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isMobile = useMobile();

  useEffect(() => {
    let mounted = true;
    authAPI.me().then((res) => {
      if (mounted) setProfile(res.data || user);
    }).catch(() => {
      if (mounted) setProfile(user);
    });
    return () => { mounted = false; };
  }, [user]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const handleNavigate = (folderId) => {
    navigate(folderId ? `/?folder=${folderId}` : '/');
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] transition-colors duration-200 main-content-area">
      <div className="desktop-sidebar">
        <Sidebar
          currentFolder={null} // Settings doesn't have a folder context
          onNavigate={handleNavigate}
          onCreateFolder={() => navigate('/')} // Redirect to home for actions
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
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-semibold mb-2">Settings</h1>
            <p className="text-[var(--text-secondary)] mb-6">Manage your account and session.</p>

            <div className="rounded-xl border border-[var(--border-color)] p-5 bg-[var(--card-bg)] mb-6">
              <h2 className="text-lg font-semibold mb-3">AI Configuration</h2>
              <AIConfigForm />
            </div>

            <div className="rounded-xl border border-[var(--border-color)] p-5 bg-[var(--card-bg)]">
              <h2 className="text-lg font-semibold mb-3">Account</h2>
              <div className="space-y-2 text-sm">
                <div><span className="text-[var(--text-tertiary)]">Username:</span> {profile?.username || '—'}</div>
                <div><span className="text-[var(--text-tertiary)]">Email:</span> {profile?.email || '—'}</div>
                <div><span className="text-[var(--text-tertiary)]">Role:</span> {profile?.is_admin ? 'Admin' : 'User'}</div>
              </div>

              <div className="mt-6 flex gap-2">
                {profile?.is_admin && (
                  <button onClick={() => navigate('/admin')} className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm">Open Admin</button>
                )}
                <button
                  onClick={() => {
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="px-3 py-2 rounded-lg bg-[var(--danger)] text-white text-sm"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
