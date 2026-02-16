import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Cloud, Eye, EyeOff, UserPlus } from 'lucide-react';
import api from '../utils/api';
import AuthBackground3D from '../components/AuthBackground3D';
import Loader from '../components/Loader';

export default function RegisterPage() {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post('/auth/register', { username, email, password });
            login(res.data.access_token, res.data.user || { username });
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.detail || 'Registration failed');
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
                className="glass-card auth-shell relative z-10 w-full max-w-[460px] p-8"
            >
                <div className="auth-card-header">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--auth-accent)] flex items-center justify-center mb-4 shadow-md">
                        <Cloud className="w-8 h-8 text-[var(--auth-bg-start)]" />
                    </div>
                    <h1 className="text-2xl font-semibold text-[var(--auth-title)] tracking-tight">Create your account</h1>
                    <p className="text-[13px] text-[var(--auth-muted)] mt-1.5">Start storing and collaborating with fast, secure cloud access.</p>
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
                            placeholder="Choose a username"
                            autoComplete="username"
                            required
                        />
                    </div>

                    <div className="auth-input-group">
                        <label className="block text-[12px] font-medium text-[var(--auth-muted)] mb-1.5">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg bg-[var(--auth-input-bg)] border border-[var(--auth-input-border)] text-[14px] text-[var(--auth-title)] placeholder:text-[var(--auth-input-placeholder)] focus:outline-none focus:border-[var(--auth-accent)] transition-colors"
                            placeholder="you@example.com"
                            autoComplete="email"
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
                                placeholder="Minimum 6 characters"
                                autoComplete="new-password"
                                required
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--auth-input-placeholder)] hover:text-[var(--auth-muted)]">
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="auth-input-group">
                        <label className="block text-[12px] font-medium text-[var(--auth-muted)] mb-1.5">Confirm Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg bg-[var(--auth-input-bg)] border border-[var(--auth-input-border)] text-[14px] text-[var(--auth-title)] placeholder:text-[var(--auth-input-placeholder)] focus:outline-none focus:border-[var(--auth-accent)] transition-colors"
                            placeholder="Re-enter password"
                            autoComplete="new-password"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="auth-submit-btn w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--auth-accent)] hover:bg-[var(--auth-accent-hover)] text-[var(--auth-bg-start)] text-[14px] font-semibold transition-colors disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader className="scale-[0.4]" />
                        ) : (
                            <>
                                <UserPlus className="w-4 h-4" />
                                Create Account
                            </>
                        )}
                    </button>
                </form>

                <p className="text-center text-[13px] text-[var(--auth-muted)] mt-6">
                    Already have an account?{' '}
                    <Link to="/login" className="text-[var(--auth-accent)] hover:text-[var(--auth-accent-hover)] font-medium transition-colors">
                        Sign in
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
