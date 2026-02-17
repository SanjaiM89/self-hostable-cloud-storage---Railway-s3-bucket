import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Save, AlertCircle, CheckCircle } from 'lucide-react';
import { aiAPI } from '../../utils/api';

export default function AIConfigForm() {
    const { user } = useAuth();
    const [config, setConfig] = useState({
        provider: 'gemini',
        api_key: '',
        model: '',
        base_url: ''
    });
    const [status, setStatus] = useState('idle'); // idle, saving, success, error
    const [msg, setMsg] = useState('');

    useEffect(() => {
        // Prefer fetching fresh config, fallback to user context
        const load = async () => {
            try {
                const res = await aiAPI.getConfig();
                if (res.data) setConfig(prev => ({ ...prev, ...res.data }));
            } catch (e) {
                if (user?.ai_config) {
                    setConfig(prev => ({ ...prev, ...user.ai_config }));
                }
            }
        };
        load();
    }, [user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('saving');
        setMsg('');

        try {
            await aiAPI.updateConfig(config);

            setStatus('success');
            setMsg('Configuration saved successfully');
            setTimeout(() => setStatus('idle'), 3000);
        } catch (err) {
            setStatus('error');
            const detail = err.response?.data?.detail;
            setMsg(typeof detail === 'string' ? detail : (err.message || 'Failed to save'));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1 text-[var(--text-secondary)]">Provider</label>
                    <select
                        value={config.provider}
                        onChange={e => setConfig({ ...config, provider: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                    >
                        <option value="gemini">Google Gemini</option>
                        <option value="ollama">Ollama (Local)</option>
                        <option value="lmstudio">LM Studio (Local)</option>
                    </select>
                </div>

                {config.provider === 'gemini' && (
                    <div>
                        <label className="block text-sm font-medium mb-1 text-[var(--text-secondary)]">API Key</label>
                        <input
                            type="password"
                            value={config.api_key}
                            onChange={e => setConfig({ ...config, api_key: e.target.value })}
                            placeholder="Enter Gemini API Key"
                            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                        />
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                            Get your key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Google AI Studio</a>.
                        </p>
                    </div>
                )}

                {(config.provider === 'ollama' || config.provider === 'lmstudio') && (
                    <>
                        <div>
                            <label className="block text-sm font-medium mb-1 text-[var(--text-secondary)]">Base URL</label>
                            <input
                                type="text"
                                value={config.base_url}
                                onChange={e => setConfig({ ...config, base_url: e.target.value })}
                                placeholder={config.provider === 'ollama' ? "http://localhost:11434" : "http://localhost:1234/v1"}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 text-[var(--text-secondary)]">Model Name</label>
                            <input
                                type="text"
                                value={config.model}
                                onChange={e => setConfig({ ...config, model: e.target.value })}
                                placeholder={config.provider === 'ollama' ? "llama3" : "local-model"}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </>
                )}
            </div>

            <div className="flex items-center justify-between pt-2">
                {status === 'error' && <span className="text-red-500 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {msg}</span>}
                {status === 'success' && <span className="text-green-500 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {msg}</span>}
                {status === 'idle' && <span />}

                <button
                    type="submit"
                    disabled={status === 'saving'}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {status === 'saving' ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>
        </form>
    );
}
