import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faXmark,
  faShieldHalved,
  faServer,
  faRocket,
} from '@fortawesome/free-solid-svg-icons';

const PLAN_ICONS = {
  sentinel: faShieldHalved,
  guardian: faServer,
  foundation: faRocket,
};

const PLAN_COLORS = {
  sentinel: 'border-blue-500 bg-blue-50 dark:bg-blue-900/10',
  guardian: 'border-purple-500 bg-purple-50 dark:bg-purple-900/10',
  foundation: 'border-amber-500 bg-amber-50 dark:bg-amber-900/10',
};

const PlanSelector = ({ plans, currentPlanId, onSelect, onClose }) => {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selectedPlan) return;
    setLoading(true);
    await onSelect(selectedPlan);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Choose a Plan
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Select a storage plan that fits your needs
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
          </button>
        </div>

        {/* Plans Grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              const isSelected = plan.id === selectedPlan;
              const icon = PLAN_ICONS[plan.name] || faServer;
              const colorClass =
                PLAN_COLORS[plan.name] ||
                'border-gray-300 bg-gray-50 dark:bg-zinc-900';

              return (
                <button
                  key={plan.id}
                  onClick={() => !isCurrent && setSelectedPlan(plan.id)}
                  disabled={isCurrent}
                  className={`relative p-5 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
                      : isCurrent
                        ? 'border-green-500 opacity-75 cursor-default'
                        : `${colorClass} hover:border-primary-400 cursor-pointer`
                  }`}
                >
                  {isCurrent && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
                      Current
                    </span>
                  )}

                  <div className="mb-3">
                    <FontAwesomeIcon
                      icon={icon}
                      className="w-8 h-8 text-primary-500"
                    />
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {plan.displayName}
                  </h3>

                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                    EGP {Number(plan.priceEgp).toFixed(0)}
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                      /mo
                    </span>
                  </p>

                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {plan.storageGb >= 1024
                      ? `${(plan.storageGb / 1024).toFixed(0)} TB`
                      : `${plan.storageGb} GB`}{' '}
                    Storage
                  </p>

                  <ul className="mt-4 space-y-2">
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <FontAwesomeIcon
                        icon={faCheck}
                        className="w-3 h-3 text-green-500"
                      />
                      End-to-end encryption
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <FontAwesomeIcon
                        icon={faCheck}
                        className="w-3 h-3 text-green-500"
                      />
                      Zero-knowledge privacy
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <FontAwesomeIcon
                        icon={faCheck}
                        className="w-3 h-3 text-green-500"
                      />
                      File sharing & folders
                    </li>
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-zinc-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedPlan || loading}
            className="px-6 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Redirecting...' : 'Continue to Payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanSelector;
