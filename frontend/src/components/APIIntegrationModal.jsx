import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { X, Copy, RefreshCw, Code, Server, Key } from 'lucide-react';

export default function APIIntegrationModal({ isOpen, onClose }) {
    const [apiKey, setApiKey] = useState(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('credentials'); // 'credentials' | 'docs'

    useEffect(() => {
        if (isOpen) {
            fetchApiKey();
        }
    }, [isOpen]);

    const fetchApiKey = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/api/auth/api-key/my-key`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setApiKey(res.data.api_key);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const generateApiKey = async () => {
        if (apiKey && !window.confirm("Generating a new key will invalidate your old one. Are you sure?")) {
            return;
        }
        try {
            setLoading(true);
            const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/auth/api-key/generate`, {}, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setApiKey(res.data.api_key);
            toast.success("New API Key generated successfully");
        } catch (err) {
            console.error(err);
            toast.error("Failed to generate API Key");
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (apiKey) {
            navigator.clipboard.writeText(apiKey);
            toast.success("API Key copied to clipboard");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Code className="text-blue-500" />
                            API Integration
                        </h2>
                        <p className="text-gray-400 mt-1 text-sm">Automate file operations and integrate CloudStorage into your apps</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 bg-gray-900/30">
                    <button
                        onClick={() => setActiveTab('credentials')}
                        className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'credentials' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}
                    >
                        Credentials
                    </button>
                    <button
                        onClick={() => setActiveTab('docs')}
                        className={`px-6 py-3 text-sm font-medium transition-colors ${activeTab === 'docs' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-400 hover:text-white'}`}
                    >
                        Documentation
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-black/20">
                    {activeTab === 'credentials' ? (
                        <div className="space-y-8">
                            {/* API Key Section */}
                            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
                                        <Key size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-white mb-2">Your API Key</h3>
                                        <p className="text-gray-400 text-sm mb-4">
                                            This key acts as a bearer token for authentication via the external api endpoints. Do not share it publicly.
                                        </p>

                                        {loading ? (
                                            <div className="h-12 w-full bg-gray-800 animate-pulse rounded-lg"></div>
                                        ) : apiKey ? (
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-4 py-3 font-mono text-sm text-green-400 break-all select-all">
                                                    {apiKey}
                                                </div>
                                                <button
                                                    onClick={copyToClipboard}
                                                    className="p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors flex shrink-0"
                                                    title="Copy Key"
                                                >
                                                    <Copy size={18} />
                                                </button>
                                                <button
                                                    onClick={generateApiKey}
                                                    className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors shrink-0"
                                                    title="Revoke and Generate New Key"
                                                >
                                                    <RefreshCw size={18} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={generateApiKey}
                                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                                            >
                                                <RefreshCw size={16} />
                                                Generate API Key
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Endpoint Information */}
                            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg">
                                        <Server size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-white mb-2">Base Endpoint</h3>
                                        <p className="text-gray-400 text-sm mb-4">
                                            All api requests should be prefixed with your server's address. Use the <span className="font-mono text-xs bg-black px-1 py-0.5 rounded">X-API-Key</span> header for authentication.
                                        </p>
                                        <div className="bg-black/40 border border-gray-700 rounded-lg px-4 py-3 font-mono text-sm text-white">
                                            {window.location.origin}/api/external
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">

                            {/* Upload Endpoint */}
                            <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
                                <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded">POST</span>
                                    <span className="font-mono text-sm text-gray-300">/api/external/upload</span>
                                </div>
                                <div className="p-4 space-y-4">
                                    <p className="text-gray-400 text-sm">Upload a new file. Returns upload speed and percentage stats.</p>
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Headers</h4>
                                        <code className="block bg-black/50 p-2 rounded text-sm text-blue-300">X-API-Key: your_api_key</code>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Form Data</h4>
                                        <ul className="text-sm text-gray-300 list-disc list-inside">
                                            <li><span className="font-mono text-amber-400">file</span>: (Required) The file object</li>
                                            <li><span className="font-mono text-amber-400">parent_id</span>: (Optional) Folder ID to upload into</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Download Endpoint */}
                            <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
                                <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded">GET</span>
                                    <span className="font-mono text-sm text-gray-300">/api/external/download/&#123;file_id&#125;</span>
                                </div>
                                <div className="p-4 space-y-4">
                                    <p className="text-gray-400 text-sm">Get a presigned S3 url to download the file directly.</p>
                                </div>
                            </div>

                            {/* Stats Endpoint */}
                            <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
                                <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded">GET</span>
                                    <span className="font-mono text-sm text-gray-300">/api/external/storage</span>
                                </div>
                                <div className="p-4 space-y-4">
                                    <p className="text-gray-400 text-sm">Get overall storage statistics (limit, used, free).</p>
                                </div>
                            </div>

                            {/* Update/Rename Endpoint */}
                            <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
                                <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-bold rounded">PUT</span>
                                    <span className="font-mono text-sm text-gray-300">/api/external/update/&#123;file_id&#125;</span>
                                </div>
                                <div className="p-4 space-y-4">
                                    <p className="text-gray-400 text-sm">Rename an existing file.</p>
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">JSON Body</h4>
                                        <code className="block bg-black/50 p-4 rounded text-sm text-green-300 whitespace-pre">
                                            {`{
  "name": "new_filename.txt"
}`}
                                        </code>
                                    </div>
                                </div>
                            </div>

                            {/* Folder Operations */}
                            <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
                                <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded">POST</span>
                                    <span className="font-mono text-sm text-gray-300">/api/external/folder</span>
                                </div>
                                <div className="p-4 space-y-4">
                                    <p className="text-gray-400 text-sm">Create a new folder.</p>
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Form Data</h4>
                                        <ul className="text-sm text-gray-300 list-disc list-inside">
                                            <li><span className="font-mono text-amber-400">name</span>: (Required) Folder name</li>
                                            <li><span className="font-mono text-amber-400">parent_id</span>: (Optional) Parent folder ID</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
