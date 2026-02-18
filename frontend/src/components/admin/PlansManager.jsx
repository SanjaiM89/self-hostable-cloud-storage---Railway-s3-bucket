import { useState, useEffect } from 'react';
import { plansAPI } from '../../utils/api';
import { Plus, Edit2, Trash2, Check, X, Shield, Upload } from 'lucide-react';
import Loader from '../Loader';

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

export default function PlansManager() {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingPlan, setEditingPlan] = useState(null); // null = list, {} = create, {id...} = edit
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadPlans = async () => {
        setLoading(true);
        try {
            const res = await plansAPI.getAllAdmin();
            setPlans(res.data);
        } catch (err) {
            setError('Failed to load plans');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPlans();
    }, []);

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to deactivate this plan?')) return;
        try {
            await plansAPI.delete(id);
            loadPlans();
            setSuccess('Plan deactivated');
        } catch (err) {
            setError('Failed to delete plan');
        }
    };

    const PlanForm = ({ plan, onSave, onCancel }) => {
        const [formData, setFormData] = useState({
            name: plan?.name || '',
            description: plan?.description || '',
            price: plan?.price ? plan.price / 100 : 0, // Display in main unit
            currency: plan?.currency || 'INR',
            storage_limit_gb: plan?.storage_limit ? plan.storage_limit / (1024 * 1024 * 1024) : 2,
            max_file_size_gb: plan?.max_file_size ? plan.max_file_size / (1024 * 1024 * 1024) : 2,
            duration_days: plan?.duration_days || 30,
            is_active: plan?.is_active ?? true
        });

        const handleSubmit = async (e) => {
            e.preventDefault();
            try {
                const payload = {
                    ...formData,
                    price: formData.price * 100, // Convert to subunits
                    storage_limit: formData.storage_limit_gb * 1024 * 1024 * 1024,
                    max_file_size: formData.max_file_size_gb * 1024 * 1024 * 1024,
                };
                delete payload.storage_limit_gb;
                delete payload.max_file_size_gb;

                if (plan?.id) {
                    await plansAPI.update(plan.id, payload);
                } else {
                    await plansAPI.create(payload);
                }
                onSave();
            } catch (err) {
                console.error(err);
                alert('Failed to save plan. ' + (err.response?.data?.detail || err.message));
            }
        };

        return (
            <div className="bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-color)]">
                <h3 className="text-lg font-semibold mb-4">{plan?.id ? 'Edit Plan' : 'Create New Plan'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Plan Name</label>
                            <input
                                required
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Price (₹)</label>
                            <input
                                required
                                type="number"
                                min="0"
                                value={formData.price}
                                onChange={e => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Storage Limit (GB)</label>
                            <input
                                required
                                type="number"
                                min="1"
                                value={formData.storage_limit_gb}
                                onChange={e => setFormData({ ...formData, storage_limit_gb: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Max File Size (GB)</label>
                            <input
                                required
                                type="number"
                                min="1"
                                value={formData.max_file_size_gb}
                                onChange={e => setFormData({ ...formData, max_file_size_gb: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Duration (Days)</label>
                            <input
                                required
                                type="number"
                                min="1"
                                value={formData.duration_days}
                                onChange={e => setFormData({ ...formData, duration_days: parseInt(e.target.value) || 30 })}
                                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]"
                            />
                        </div>
                        <div className="flex items-center pt-6">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.is_active}
                                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="mr-2"
                                />
                                Is Active
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]"
                            rows="3"
                        />
                    </div>

                    <div className="flex gap-2 justify-end mt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
                        >
                            <Check size={16} /> Save Plan
                        </button>
                    </div>
                </form>
            </div>
        );
    };

    if (loading) return <div className="flex items-center justify-center p-8"><Loader /></div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Subscription Plans</h2>
                {!editingPlan && (
                    <button
                        onClick={() => setEditingPlan({})}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                    >
                        <Plus size={16} /> Create Plan
                    </button>
                )}
            </div>

            {error && <div className="p-3 rounded-lg bg-red-500/10 text-red-500 text-sm border border-red-500/20">{error}</div>}
            {success && <div className="p-3 rounded-lg bg-green-500/10 text-green-500 text-sm border border-green-500/20">{success}</div>}

            {editingPlan ? (
                <PlanForm
                    plan={editingPlan.id ? editingPlan : null}
                    onSave={() => { setEditingPlan(null); loadPlans(); setSuccess('Plan saved successfully'); }}
                    onCancel={() => setEditingPlan(null)}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {plans.map(plan => (
                        <div key={plan.id} className={`bg-[var(--bg-secondary)] rounded-xl border ${plan.is_active ? 'border-[var(--border-color)]' : 'border-red-500/30 opacity-75'} overflow-hidden relative group`}>
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold">{plan.name}</h3>
                                        <div className="text-2xl font-bold mt-1 text-blue-500">
                                            {formatCurrency(plan.price, plan.currency)}
                                            <span className="text-sm text-[var(--text-tertiary)] font-normal"> / {plan.duration_days} days</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditingPlan(plan)}
                                            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
                                            title="Edit"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        {plan.is_active && (
                                            <button
                                                onClick={() => handleDelete(plan.id)}
                                                className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                                                title="Deactivate"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <p className="text-sm text-[var(--text-secondary)] mb-6 h-10 line-clamp-2">{plan.description}</p>

                                <div className="space-y-3 text-sm">
                                    <div className="flex items-center gap-2">
                                        <Shield size={16} className="text-blue-500" />
                                        <span><strong>{formatSize(plan.storage_limit)}</strong> Storage</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Upload size={16} className="text-purple-500" />
                                        <span><strong>{formatSize(plan.max_file_size)}</strong> Max File Size</span>
                                    </div>
                                </div>
                            </div>
                            {!plan.is_active && (
                                <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl">Inactive</div>
                            )}
                        </div>
                    ))}
                    {plans.length === 0 && (
                        <div className="col-span-full text-center py-12 text-[var(--text-tertiary)]">
                            No plans found. Create one to get started.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
