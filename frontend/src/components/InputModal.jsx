import { useState, useEffect, useRef } from 'react';

export default function InputModal({ title, placeholder, defaultValue, onConfirm, onCancel }) {
    const [value, setValue] = useState(defaultValue || '');
    const inputRef = useRef(null);

    useEffect(() => {
        // Auto-focus and select all text
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (value.trim()) onConfirm(value.trim());
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onCancel}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            {/* Dialog */}
            <div
                className="relative z-10 w-[380px] rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 pt-5 pb-3">
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">{title}</h3>
                    <form onSubmit={handleSubmit}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={placeholder || 'Enter a name...'}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
                        />
                    </form>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/50">
                    <button
                        onClick={onCancel}
                        className="px-4 py-1.5 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { if (value.trim()) onConfirm(value.trim()); }}
                        className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--accent)] text-[#1e1e2e] hover:brightness-110 transition-all"
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}
