import { useEffect, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI, plansAPI, paymentsAPI } from '../utils/api';
import AIConfigForm from '../components/ai/AIConfigForm';
import Sidebar from '../components/Sidebar';
import { useMobile } from '../mobile';
import PlanSlider from '../components/PlanSlider';
import Loader from '../components/Loader';

const loadRazorpay = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const SubscriptionSection = ({ user, onProfileUpdate }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    plansAPI.getAll().then(res => {
      setPlans(res.data);
      setLoading(false);
    }).catch(err => {
      console.error("Failed to load plans", err);
      setLoading(false);
    });
  }, []);

  const handleUpgrade = async (plan) => {
    if (processing) return;
    setProcessing(true);

    try {
      const res = await loadRazorpay();
      if (!res) {
        alert('Razorpay SDK failed to load. Are you online?');
        return;
      }

      // Create Order
      const orderRes = await paymentsAPI.createOrder(plan.id);
      const { id: order_id, amount, currency, key_id, prefill } = orderRes.data;

      const options = {
        key: key_id,
        amount: amount,
        currency: currency,
        name: "Cloud Storage",
        description: `Upgrade to ${plan.name}`,
        order_id: order_id,
        handler: async function (response) {
          try {
            await paymentsAPI.verify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            alert("Payment Successful! Plan upgraded.");
            // Refresh user profile
            if (onProfileUpdate) {
              const profileRes = await authAPI.me();
              onProfileUpdate(profileRes.data);
            }
          } catch (err) {
            alert("Payment verification failed. Please contact support.");
          }
        },
        prefill: {
          name: prefill?.name,
          email: prefill?.email,
        },
        theme: {
          color: "#3B82F6"
        }
      };

      const rzp1 = new window.Razorpay(options);
      rzp1.open();

    } catch (err) {
      console.error(err);
      alert("Failed to initiate payment. " + (err.response?.data?.detail || err.message));
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="p-4"><Loader /></div>;

  return (
    <div className="rounded-xl border border-[var(--border-color)] p-5 bg-[var(--card-bg)] mb-6">
      <h2 className="text-lg font-semibold mb-3">Subscription</h2>
      <div className="mb-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Current Plan: <span className="font-bold text-blue-500">{user?.plan?.name || (user?.storage_limit > 2 * 1024 * 1024 * 1024 ? 'Custom' : 'Free Tier')}</span>
          {user?.subscription_expiry && <span className="ml-2 text-xs text-[var(--text-tertiary)]">(Expires: {new Date(user.subscription_expiry).toLocaleDateString()})</span>}
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <PlanSlider
          plans={plans}
          currentPlanId={user?.plan_id}
          onSelectPlan={handleUpgrade}
        />
      </div>
    </div>
  );
};

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

            <SubscriptionSection user={profile} onProfileUpdate={setProfile} />

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
