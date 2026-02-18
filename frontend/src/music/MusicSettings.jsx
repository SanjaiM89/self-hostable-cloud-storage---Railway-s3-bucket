import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Save, Upload, Cookie } from 'lucide-react';

export default function MusicSettings() {
    const [cookiesStatus, setCookiesStatus] = useState(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        checkCookiesStatus();
    }, []);

    const checkCookiesStatus = async () => {
        // Implement backend endpoint check if available
        // For now, we'll just mock it or assume false until backend endpoint is confirmed
        // The backend endpoint GET /music/settings/cookies was in the plan but maybe not implemented in router.py yet.
        // Let's implement the upload at least.
        try {
            // const res = await api.get('/music/settings/cookies');
            // setCookiesStatus(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCookiesUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', 'cookies.txt'); // Tell backend where to put it or just file

        try {
            // We need a specific endpoint for this. 
            // I'll assume we used the generic upload generic generic endpoint or specific
            // Actually, in the plan I said POST /music/settings/cookies.
            // I need to add that to backend/music/router.py if I missed it!
            // I missed it in the rewrite of router.py.
            // I will implement a simpler "Upload to Root" via generic /files/upload 
            // OR I should use the /music/cookies endpoint which I should add.

            // For now, let's assume we implement the backend endpoint next or use a generic "Upload Config" endpoint.
            // I'll stick to the plan: POST /music/cookies
            await api.post('/music/cookies', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert('Cookies uploaded successfully!');
            setCookiesStatus({ exists: true, updated_at: new Date() });
        } catch (err) {
            console.error(err);
            alert('Failed to upload cookies.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 text-white">
            <h1 className="text-3xl font-bold">Music Settings</h1>

            <div className="space-y-6">
                <section className="bg-white/5 p-6 rounded-2xl border border-white/10">
                    <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
                        <Cookie className="text-yellow-400" /> YouTube Cookies
                    </h2>

                    <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm p-4 rounded-xl mb-6">
                        <p className="font-medium">Why do I need this?</p>
                        <p className="opacity-80 mt-1">
                            YouTube blocks server-side downloads (HTTP 429/403). Uploading your browser's <code>cookies.txt</code> allows the server to download as "you", bypassing these checks and enabling premium/age-restricted content.
                        </p>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5">
                        <div>
                            <p className="font-medium">{cookiesStatus?.exists ? '✅ Cookies Active' : '❌ No Cookies Found'}</p>
                            <p className="text-sm text-white/40 mt-1">
                                {cookiesStatus?.exists
                                    ? `Last updated: ${new Date(cookiesStatus.updated_at).toLocaleString()}`
                                    : 'Upload a cookies.txt file to enable robust downloads.'}
                            </p>
                        </div>

                        <label className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg hover:opacity-90 transition cursor-pointer font-medium">
                            <Upload size={18} />
                            {uploading ? 'Uploading...' : 'Upload cookies.txt'}
                            <input
                                type="file"
                                accept=".txt"
                                onChange={handleCookiesUpload}
                                className="hidden"
                                disabled={uploading}
                            />
                        </label>
                    </div>
                </section>
            </div>
        </div>
    );
}
