import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Cloud, Eye, EyeOff, LogIn, ShieldCheck, Zap } from 'lucide-react';
import api from '../utils/api';
import AuthBackground3D from '../components/AuthBackground3D';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.post('/auth/login', { username, password });
            login(res.data.access_token, { username });
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.detail || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-bg relative flex items-center justify-center min-h-screen px-4 py-6">
            <AuthBackground3D />
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="glass-card auth-shell relative z-10 w-full max-w-[440px] p-8"
            >
                <div className="auth-card-header">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--auth-accent)] flex items-center justify-center mb-4 shadow-md">
                        <Cloud className="w-8 h-8 text-[var(--auth-bg-start)]" />
                    </div>
                    <h1 className="text-2xl font-semibold text-[var(--auth-title)] tracking-tight">Welcome back</h1>
                    <p className="text-[13px] text-[var(--auth-muted)] mt-1.5">Sign in to your workspace and continue where you left off.</p>

                    <div className="auth-chip-row mt-4">
                        <span className="auth-chip"><ShieldCheck className="w-3.5 h-3.5" /> Secure</span>
                        <span className="auth-chip"><Zap className="w-3.5 h-3.5" /> Fast Sync</span>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-[var(--auth-error-bg)] border border-[var(--auth-error-border)] text-[13px] text-[var(--auth-error)]">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="auth-input-group">
                        <label className="block text-[12px] font-medium text-[var(--auth-muted)] mb-1.5">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg bg-[var(--auth-input-bg)] border border-[var(--auth-input-border)] text-[14px] text-[var(--auth-title)] placeholder:text-[var(--auth-input-placeholder)] focus:outline-none focus:border-[var(--auth-accent)] transition-colors"
                            placeholder="Enter username"
                            autoComplete="username"
                            required
                        />
                    </div>

                    <div className="auth-input-group">
                        <label className="block text-[12px] font-medium text-[var(--auth-muted)] mb-1.5">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg bg-[var(--auth-input-bg)] border border-[var(--auth-input-border)] text-[14px] text-[var(--auth-title)] placeholder:text-[var(--auth-input-placeholder)] focus:outline-none focus:border-[var(--auth-accent)] transition-colors pr-10"
                                placeholder="Enter password"
                                autoComplete="current-password"
                                required
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--auth-input-placeholder)] hover:text-[var(--auth-muted)]">
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="auth-submit-btn w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--auth-accent)] hover:bg-[var(--auth-accent-hover)] text-[var(--auth-bg-start)] text-[14px] font-semibold transition-colors disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-[var(--auth-spinner-track)] border-t-[var(--auth-bg-start)] rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogIn className="w-4 h-4" />
                                Sign In
                            </>
                        )}
                    </button>
                </form>

                <p className="text-center text-[13px] text-[var(--auth-muted)] mt-6">
                    Don&apos;t have an account?{' '}
                    <Link to="/register" className="text-[var(--auth-accent)] hover:text-[var(--auth-accent-hover)] font-medium transition-colors">
                        Create one
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
