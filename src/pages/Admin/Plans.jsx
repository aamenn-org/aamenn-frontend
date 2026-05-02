import { useState, useEffect } from 'react';
import { adminService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPen,
  faCheck,
  faXmark,
  faToggleOn,
  faToggleOff,
} from '@fortawesome/free-solid-svg-icons';

const Plans = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const data = await adminService.getPlans();
      setPlans(data);
    } catch (err) {
      setError('Failed to load plans');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const startEdit = (plan) => {
    setEditingId(plan.id);
    setEditForm({
      displayName: plan.displayName,
      storageGb: plan.storageGb,
      priceEgp: Number(plan.priceEgp),
      durationDays: plan.durationDays,
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setError(null);
  };

  const saveEdit = async (planId) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await adminService.updatePlan(planId, editForm);
      setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      setError('Failed to update plan');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (plan) => {
    try {
      const updated = await adminService.updatePlan(plan.id, {
        isActive: !plan.isActive,
      });
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? updated : p)));
    } catch (err) {
      setError('Failed to toggle plan status');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
          Plan Management
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Update pricing, storage limits, and availability for each plan.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Plans Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  Plan
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  Display Name
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  Storage (GB)
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  Price (EGP)
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  Duration (days)
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  Status
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {plans.map((plan) => {
                const isEditing = editingId === plan.id;

                return (
                  <tr
                    key={plan.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    {/* Internal Name */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                        {plan.name}
                      </span>
                    </td>

                    {/* Display Name */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.displayName}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              displayName: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-white">
                          {plan.displayName}
                        </span>
                      )}
                    </td>

                    {/* Storage */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          min="1"
                          value={editForm.storageGb}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              storageGb: Number(e.target.value),
                            })
                          }
                          className="w-24 px-2 py-1 text-sm text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">
                          {plan.storageGb >= 1024
                            ? `${(plan.storageGb / 1024).toFixed(0)} TB`
                            : `${plan.storageGb} GB`}
                        </span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.priceEgp}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              priceEgp: Number(e.target.value),
                            })
                          }
                          className="w-24 px-2 py-1 text-sm text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span className="font-semibold text-gray-900 dark:text-white">
                          EGP {Number(plan.priceEgp).toFixed(0)}
                        </span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          min="1"
                          value={editForm.durationDays}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              durationDays: Number(e.target.value),
                            })
                          }
                          className="w-20 px-2 py-1 text-sm text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span className="text-gray-700 dark:text-gray-300">
                          {plan.durationDays}
                        </span>
                      )}
                    </td>

                    {/* Status Toggle */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(plan)}
                        className="inline-flex items-center gap-1.5"
                        title={
                          plan.isActive
                            ? 'Click to deactivate'
                            : 'Click to activate'
                        }
                      >
                        <FontAwesomeIcon
                          icon={plan.isActive ? faToggleOn : faToggleOff}
                          className={`w-6 h-6 ${
                            plan.isActive
                              ? 'text-green-500'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        />
                        <span
                          className={`text-xs font-medium ${
                            plan.isActive
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {plan.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => saveEdit(plan.id)}
                            disabled={saving}
                            className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50"
                            title="Save"
                          >
                            <FontAwesomeIcon
                              icon={faCheck}
                              className="w-4 h-4"
                            />
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                            title="Cancel"
                          >
                            <FontAwesomeIcon
                              icon={faXmark}
                              className="w-4 h-4"
                            />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(plan)}
                          className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          title="Edit plan"
                        >
                          <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-lg text-sm">
        <strong>Note:</strong> Price changes apply to new subscriptions only.
        Existing active subscriptions keep their current pricing until renewal.
      </div>
    </div>
  );
};

export default Plans;
