import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Download, Archive, CheckCircle2, AlertCircle } from 'lucide-react';
import Loader from './Loader';

const iconMap = {
    upload: Upload,
    download: Download,
    extract: Archive,
};

const statusColors = {
    running: 'text-[var(--accent)]',
    done: 'text-green-400',
    error: 'text-[var(--danger)]',
};

export default function ActivityBar({ activities = [], open, onClose }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.aside
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 300, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col h-full border-l border-[var(--border-color)] bg-[var(--bg-primary)] overflow-hidden flex-shrink-0"
                >
                    <div className="flex items-center justify-between px-4 h-[52px] border-b border-[var(--border-color)] flex-shrink-0">
                        <span className="text-[13px] font-semibold text-[var(--text-primary)]">Activity</span>
                        <button onClick={onClose} className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {activities.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                                <div className="w-12 h-12 rounded-2xl bg-[var(--bg-secondary)] flex items-center justify-center mb-3">
                                    <Archive className="w-6 h-6 text-[var(--text-tertiary)]" />
                                </div>
                                <p className="text-[13px] font-medium text-[var(--text-primary)]">No activity</p>
                                <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                                    Uploads, downloads, and processing tasks will appear here
                                </p>
                            </div>
                        ) : (
                            <div className="p-2 space-y-1">
                                {activities.map((a) => {
                                    const Icon = iconMap[a.type] || Upload;
                                    return (
                                        <motion.div
                                            key={a.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                                        >
                                            <div className={`mt-0.5 ${statusColors[a.status] || ''}`}>
                                                {a.status === 'running' ? (
                                                    <Loader className="scale-[0.35]" />
                                                ) : a.status === 'done' ? (
                                                    <CheckCircle2 className="w-4 h-4" />
                                                ) : a.status === 'error' ? (
                                                    <AlertCircle className="w-4 h-4" />
                                                ) : (
                                                    <Icon className="w-4 h-4" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{a.name}</p>
                                                <p className="text-[11px] text-[var(--text-tertiary)] capitalize">{a.type}{a.status === 'running' ? '...' : ''}</p>
                                                {a.status === 'running' && a.percent != null && (
                                                    <div className="mt-1 h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                                                        <div className="upload-progress h-full rounded-full" style={{ width: `${a.percent}%` }} />
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
}
