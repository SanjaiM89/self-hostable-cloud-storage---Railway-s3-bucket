import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { X, Send, Paperclip, FileText, Image as ImageIcon, Sparkles, StopCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useAI } from '../../context/AIContext';
import { useTheme } from '../../context/ThemeContext';
import { filesAPI } from '../../utils/api';

export default function ChatSidebar() {
    const { isOpen, toggleAI, messages, sendMessage, isLoading, clearChat } = useAI();
    const { isDark } = useTheme();
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState([]);

    // Suggestion State
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionIndex, setMentionIndex] = useState(-1); // Position of @
    const [isSearching, setIsSearching] = useState(false);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const inputRef = useRef(null);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle Input Change for Mentions
    const handleInputChange = async (e) => {
        const val = e.target.value;
        setInput(val);

        const cursor = e.target.selectionStart;
        const textBeforeCursor = val.slice(0, cursor);
        const lastAt = textBeforeCursor.lastIndexOf('@');

        if (lastAt !== -1) {
            const query = textBeforeCursor.slice(lastAt + 1);
            // Check if there's a space after @, if so, stop suggesting unless it's part of the query? 
            // Usually valid mentions don't have spaces implies we are searching.
            // But filenames have spaces. So we allow spaces.
            // We stop if there is a newline.
            if (!query.includes('\n')) {
                setMentionIndex(lastAt);
                setMentionQuery(query);
                setShowSuggestions(true);
                setIsSearching(true);

                try {
                    const res = await filesAPI.search(query, { limit: 5 });
                    setSuggestions(res.data.items || []);
                } catch (err) {
                    console.error("Search failed", err);
                } finally {
                    setIsSearching(false);
                }
                return;
            }
        }

        setShowSuggestions(false);
    };

    const handleSelectFile = async (file) => {
        // 1. Remove the @mention text
        const before = input.slice(0, mentionIndex);
        const after = input.slice(mentionIndex + mentionQuery.length + 1); // +1 for the char being typed or cursor pos? 
        // Actually we should use current input value
        // The mentionQuery is what we tracked. 
        // Let's just remove from mentionIndex to current cursor? 
        // Simpler: Remove `@mentionQuery` 

        const newValue = before + after;
        setInput(newValue);
        setShowSuggestions(false);

        // 2. Fetch and attach file
        try {
            // Get download URL
            const res = await filesAPI.download(file.id);
            const { url, filename, mime_type } = res.data;

            // Fetch blob from URL (it's a proxy stream)
            // Note: We need auth header if it is a protected route, but filesAPI.download returns a signed/proxy url.
            // If the proxy url requires auth, we need to pass headers.
            // backend `download_file` returns a URL to `/files/stream/{token}`. This endpoint does NOT require auth header (token is in path).

            const fileRes = await fetch(url);
            const blob = await fileRes.blob();

            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => {
                setAttachments(prev => [...prev, {
                    name: filename,
                    mime_type: mime_type || (file.is_folder ? 'folder' : 'application/octet-stream'),
                    content_base64: reader.result.split(',')[1]
                }]);
            };

        } catch (err) {
            console.error("Failed to attach file", err);
            // Optional: Show error toast
        }
    };

    const handleSend = () => {
        if (!input.trim() && attachments.length === 0) return;
        sendMessage(input, attachments);
        setInput('');
        setAttachments([]);
        setShowSuggestions(false);
    };

    const handleKeyDown = (e) => {
        if (showSuggestions && suggestions.length > 0) {
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                handleSelectFile(suggestions[0]); // Select first for now or implement navigation
                return;
            }
            if (e.key === 'Escape') {
                setShowSuggestions(false);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files);
        const newAttachments = [];

        for (const file of files) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            newAttachments.push(new Promise((resolve) => {
                reader.onload = () => {
                    resolve({
                        name: file.name,
                        mime_type: file.type,
                        content_base64: reader.result.split(',')[1] // Remove data URL prefix
                    });
                };
            }));
        }

        const resolved = await Promise.all(newAttachments);
        setAttachments(prev => [...prev, ...resolved]);
        e.target.value = ''; // Reset input
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    if (!isOpen) return null;

    return (
        <div className={`fixed right-0 top-[58px] bottom-0 w-[400px] bg-[var(--bg-secondary)] border-l border-[var(--border-color)] z-30 flex flex-col shadow-xl transition-transform ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
                <div className="flex items-center gap-2 font-medium">
                    <Sparkles className="w-5 h-5 text-blue-500 fill-blue-500/10" />
                    AI Assistant
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={clearChat} className="p-1.5 hover:bg-[var(--bg-secondary)] rounded-lg text-[var(--text-tertiary)]" title="Clear Chat">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={toggleAI} className="p-1.5 hover:bg-[var(--bg-secondary)] rounded-lg text-[var(--text-tertiary)]">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {messages.length === 0 && (
                    <div className="text-center text-[var(--text-tertiary)] mt-10">
                        <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Ask me anything about your files!</p>
                        <p className="text-xs mt-2 opacity-60">Supported: PDF, Docx, Text, Images (Multimodal)</p>
                        <p className="text-xs mt-1 opacity-60">Tip: Type <b>@</b> to attach a file</p>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[90%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : 'bg-[var(--card-bg)] border border-[var(--border-color)] rounded-bl-none'
                            }`}>
                            {/* Attachments Display */}
                            {msg.attachments && msg.attachments.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                    {msg.attachments.map((att, idx) => (
                                        <div key={idx} className="bg-black/20 p-2 rounded text-xs flex items-center gap-1 max-w-full overflow-hidden">
                                            {att.mime_type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                            <span className="truncate max-w-[100px]">{att.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Content */}
                            <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : isDark ? 'prose-invert' : ''}`}>
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw]}
                                    components={{
                                        code({ node, inline, className, children, ...props }) {
                                            const match = /language-(\w+)/.exec(className || '')
                                            return !inline && match ? (
                                                <SyntaxHighlighter
                                                    style={vscDarkPlus}
                                                    language={match[1]}
                                                    PreTag="div"
                                                    {...props}
                                                >
                                                    {String(children).replace(/\n$/, '')}
                                                </SyntaxHighlighter>
                                            ) : (
                                                <code className={className} {...props}>
                                                    {children}
                                                </code>
                                            )
                                        }
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-start">
                        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl rounded-bl-none px-4 py-3">
                            <span className="animate-pulse">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-primary)] relative">

                {/* Suggestions Dropdown */}
                {showSuggestions && (
                    <div className="absolute bottom-full left-4 right-4 mb-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto z-50">
                        {isSearching && <div className="p-2 text-xs text-[var(--text-tertiary)] flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Searching...</div>}
                        {!isSearching && suggestions.length === 0 && <div className="p-2 text-xs text-[var(--text-tertiary)]">No files found</div>}
                        {suggestions.map((file) => (
                            <button
                                key={file.id}
                                onClick={() => handleSelectFile(file)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] flex items-center gap-2"
                            >
                                <FileText className="w-4 h-4 text-[var(--text-secondary)]" />
                                <span className="truncate flex-1">{file.name}</span>
                                <span className="text-xs text-[var(--text-tertiary)]">{(file.size / 1024).toFixed(1)} KB</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Pending Attachments */}
                {attachments.length > 0 && (
                    <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                        {attachments.map((att, i) => (
                            <div key={i} className="relative group flex-shrink-0">
                                <div className="w-16 h-16 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg flex items-center justify-center overflow-hidden">
                                    {att.mime_type.startsWith('image/') ? (
                                        <img src={`data:${att.mime_type};base64,${att.content_base64}`} className="w-full h-full object-cover" />
                                    ) : (
                                        <FileText className="w-8 h-8 text-[var(--text-tertiary)]" />
                                    )}
                                </div>
                                <button
                                    onClick={() => removeAttachment(i)}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                                <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] truncate px-1">{att.name}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-end gap-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                        title="Add Attachment"
                    >
                        <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={handleFileSelect}
                    />

                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type @ to attach a file..."
                        className="flex-1 bg-transparent border-none resize-none focus:ring-0 text-sm max-h-[120px] py-2.5"
                        rows={1}
                        style={{ minHeight: '40px' }}
                    />

                    <button
                        onClick={handleSend}
                        disabled={isLoading || (!input.trim() && attachments.length === 0)}
                        className={`p-2 rounded-lg transition-all ${(input.trim() || attachments.length > 0) && !isLoading
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                            }`}
                    >
                        {isLoading ? <StopCircle className="w-5 h-5 animate-pulse" /> : <Send className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
