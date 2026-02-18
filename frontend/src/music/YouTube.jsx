import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Download, Trash2, Youtube, RefreshCw } from 'lucide-react';

export default function YouTube() {
    const [url, setUrl] = useState('');
    const [quality, setQuality] = useState('320');
    const [tasks, setTasks] = useState([]);
    const [error, setError] = useState('');

    const fetchTasks = async () => {
        try {
            const res = await api.get('/music/youtube/tasks');
            setTasks(res.data);
        } catch (e) {
            console.error("Failed to fetch tasks", e);
        }
    };

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleDownload = async () => {
        if (!url) return;
        try {
            setError('');
            await api.post('/music/youtube/download', null, {
                params: { url, quality }
            });
            setUrl('');
            fetchTasks();
        } catch (e) {
            setError(e.response?.data?.detail || "Download failed");
        }
    };

    const handleDelete = async (taskId) => {
        try {
            await api.delete(`/music/youtube/tasks/${taskId}`);
            fetchTasks();
        } catch (e) {
            // ignore
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="text-center mb-10">
                <Youtube size={48} className="mx-auto text-red-500 mb-4" />
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-pink-600">
                    YouTube to Audio
                </h1>
                <p className="text-[var(--text-secondary)] mt-2">Download high-quality audio from YouTube videos</p>
            </div>

            {/* Input Area */}
            <div className="bg-[var(--bg-secondary)] p-6 rounded-2xl shadow-xl mb-8 border border-[var(--border-color)]">
                <div className="flex flex-col md:flex-row gap-4">
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="Paste YouTube URL here..."
                        className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <select
                        value={quality}
                        onChange={(e) => setQuality(e.target.value)}
                        className="bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] px-4 py-3 rounded-xl focus:outline-none"
                    >
                        <option value="320">320kbps (Best)</option>
                        <option value="256">256kbps</option>
                        <option value="192">192kbps</option>
                        <option value="128">128kbps</option>
                    </select>
                    <button
                        onClick={handleDownload}
                        className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition"
                    >
                        <Download size={20} /> Download
                    </button>
                </div>
                {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
            </div>

            {/* Tasks List */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    Queue <RefreshCw size={16} className={`text-[var(--text-secondary)] ${tasks.some(t => t.status === 'downloading') ? 'animate-spin' : ''}`} />
                </h2>

                {tasks.length === 0 && (
                    <div className="text-center py-10 text-[var(--text-secondary)] border-2 border-dashed border-[var(--border-color)] rounded-xl">
                        Your queue is empty
                    </div>
                )}

                {tasks.map(task => (
                    <div key={task.task_id} className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-color)] flex items-center gap-4">
                        <div className="w-16 h-16 bg-[var(--bg-primary)] rounded-lg overflow-hidden flex-shrink-0">
                            {task.thumbnail ? (
                                <img src={task.thumbnail} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                                    <Youtube size={24} />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate text-[var(--text-primary)]">{task.title || task.url}</h3>

                            <div className="mt-2">
                                <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
                                    <span className="capitalize">{task.status}</span>
                                    <span>{Math.round(task.progress)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-[var(--bg-primary)] rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ${task.status === 'failed' ? 'bg-red-500' :
                                            task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                                            }`}
                                        style={{ width: `${task.progress}%` }}
                                    ></div>
                                </div>
                                {task.error && <p className="text-xs text-red-400 mt-1 truncate">{task.error}</p>}
                            </div>
                        </div>

                        <button
                            onClick={() => handleDelete(task.task_id)}
                            className="p-2 text-[var(--text-secondary)] hover:text-red-500 transition"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
