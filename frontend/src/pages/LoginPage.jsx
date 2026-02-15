import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Cloud, Eye, EyeOff, LogIn } from 'lucide-react';
import api from '../utils/api';

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
        <div className="auth-bg relative flex items-center justify-center min-h-screen px-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="glass-card w-full max-w-[400px] p-8"
            >
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 rounded-xl bg-[#a6e3a1] flex items-center justify-center mb-4">
                        <Cloud className="w-7 h-7 text-[#1e1e2e]" />
                    </div>
                    <h1 className="text-xl font-semibold text-[#cdd6f4]">Welcome back</h1>
                    <p className="text-[13px] text-[#a6adc8] mt-1">Sign in to your workspace</p>
                </div>

                {error && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-[#f38ba8]/10 border border-[#f38ba8]/20 text-[13px] text-[#f38ba8]">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[12px] font-medium text-[#a6adc8] mb-1.5">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg bg-[#181825] border border-[#313244] text-[14px] text-[#cdd6f4] placeholder:text-[#6c7086] focus:outline-none focus:border-[#a6e3a1] transition-colors"
                            placeholder="Enter username"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-[#a6adc8] mb-1.5">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg bg-[#181825] border border-[#313244] text-[14px] text-[#cdd6f4] placeholder:text-[#6c7086] focus:outline-none focus:border-[#a6e3a1] transition-colors pr-10"
                                placeholder="Enter password"
                                required
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6c7086] hover:text-[#a6adc8]">
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#a6e3a1] hover:bg-[#94e2d5] text-[#1e1e2e] text-[14px] font-semibold transition-colors disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-[#1e1e2e]/30 border-t-[#1e1e2e] rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogIn className="w-4 h-4" />
                                Sign In
                            </>
                        )}
                    </button>
                </form>

                <p className="text-center text-[13px] text-[#a6adc8] mt-6">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-[#a6e3a1] hover:text-[#94e2d5] font-medium transition-colors">
                        Create one
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
