import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Check, Zap } from 'lucide-react';

const formatCurrency = (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
    }).format(amount / 100);
};

const formatSize = (bytes) => {
    if (!bytes) return '0 GB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(0) + ' GB';
};

export default function PlanSlider({ plans, currentPlanId, onSelectPlan }) {
    const scrollRef = useRef(null);
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(true);

    const checkScroll = () => {
        if (!scrollRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setShowLeft(scrollLeft > 0);
        setShowRight(scrollLeft < scrollWidth - clientWidth - 10);
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, [plans]);

    const scroll = (direction) => {
        if (!scrollRef.current) return;
        const amount = 320; // card width + gap
        scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
        setTimeout(checkScroll, 300);
    };

    return (
        <div className="relative group">
            {/* Navigation Buttons */}
            {showLeft && (
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 bg-[var(--bg-tertiary)] p-2 rounded-full shadow-lg border border-[var(--border-color)] hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                >
                    <ChevronLeft size={20} />
                </button>
            )}

            {showRight && (
                <button
                    onClick={() => scroll('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 bg-[var(--bg-tertiary)] p-2 rounded-full shadow-lg border border-[var(--border-color)] hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                >
                    <ChevronRight size={20} />
                </button>
            )}

            <div
                ref={scrollRef}
                onScroll={checkScroll}
                className="flex gap-6 overflow-x-auto pb-6 pt-2 px-2 snap-x snap-mandatory scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {plans.map((plan) => {
                    const isCurrent = currentPlanId === plan.id;
                    return (
                        <div
                            key={plan.id}
                            className={`flex-shrink-0 w-80 bg-[var(--bg-secondary)] rounded-2xl border ${isCurrent ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'border-[var(--border-color)] hover:border-[var(--text-tertiary)]'} transition-all duration-300 snap-center flex flex-col relative overflow-hidden`}
                        >
                            {isCurrent && (
                                <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">
                                    CURRENT PLAN
                                </div>
                            )}

                            <div className="p-6 flex-1">
                                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                                <div className="text-3xl font-bold mb-1">
                                    {plan.price === 0 ? 'Free' : formatCurrency(plan.price, plan.currency)}
                                    {plan.price > 0 && <span className="text-sm font-normal text-[var(--text-tertiary)]"> / {plan.duration_days} days</span>}
                                </div>
                                <p className="text-sm text-[var(--text-secondary)] mb-6 h-10 line-clamp-2">{plan.description}</p>

                                <div className="space-y-3 mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-full bg-blue-500/10 text-blue-500"><Zap size={14} /></div>
                                        <span className="text-sm"><strong>{formatSize(plan.storage_limit)}</strong> Storage</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-full bg-purple-500/10 text-purple-500"><Check size={14} /></div>
                                        <span className="text-sm"><strong>{formatSize(plan.max_file_size)}</strong> Max File Size</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 pt-0 mt-auto">
                                <button
                                    onClick={() => onSelectPlan(plan)}
                                    disabled={isCurrent}
                                    className={`w-full py-3 rounded-xl font-semibold transition-all ${isCurrent
                                            ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-default'
                                            : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98]'
                                        }`}
                                >
                                    {isCurrent ? 'Current Plan' : (plan.price === 0 ? 'Downgrade' : 'Upgrade Now')}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
