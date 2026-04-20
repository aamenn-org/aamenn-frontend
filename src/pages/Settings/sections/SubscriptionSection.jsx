import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { paymentService } from '../../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCrown,
  faCalendarAlt,
  faReceipt,
  faArrowUpRightFromSquare,
  faRotateRight,
  faExclamationTriangle,
  faCheck,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import PlanSelector from './PlanSelector';

const STATUS_LABELS = {
  active: {
    label: 'Active',
    color:
      'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20',
  },
  grace: {
    label: 'Grace Period',
    color:
      'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20',
  },
  expired: {
    label: 'Expired',
    color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20',
  },
};

const PAYMENT_STATUS = {
  success: { label: 'Paid', color: 'text-green-600' },
  pending: { label: 'Pending', color: 'text-yellow-600' },
  failed: { label: 'Failed', color: 'text-red-600' },
  refunded: { label: 'Refunded', color: 'text-blue-600' },
  expired: { label: 'Expired', color: 'text-gray-600' },
};

const SubscriptionSection = () => {
  const { t } = useTranslation('settings');
  const [subscription, setSubscription] = useState(null);
  const [payments, setPayments] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [renewLoading, setRenewLoading] = useState(false);
  const [showPlanSelector, setShowPlanSelector] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sub, paymentList, planList] = await Promise.all([
          paymentService.getSubscription(),
          paymentService.getPaymentHistory(),
          paymentService.getPlans(),
        ]);
        setSubscription(sub);
        setPayments(paymentList || []);
        setPlans(planList || []);
      } catch (err) {
        console.error('Failed to fetch subscription data:', err);
        setError('Failed to load subscription information');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleRenew = async () => {
    setRenewLoading(true);
    setError('');
    try {
      const { checkoutUrl } = await paymentService.renewSubscription();
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('Failed to initiate renewal:', err);
      setError(err.message || 'Failed to initiate renewal');
    } finally {
      setRenewLoading(false);
    }
  };

  const handleSelectPlan = async (planId) => {
    setError('');
    try {
      const { checkoutUrl } = await paymentService.initiateCheckout(planId);
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error('Failed to initiate checkout:', err);
      setError(err.message || 'Failed to start payment');
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded w-1/3" />
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2" />
          <div className="h-20 bg-gray-200 dark:bg-zinc-700 rounded" />
        </div>
      </div>
    );
  }

  const statusInfo = subscription
    ? STATUS_LABELS[subscription.status] || STATUS_LABELS.expired
    : null;

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Current Subscription Card */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Subscription
          </h2>
          {statusInfo && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
          )}
        </div>

        {subscription ? (
          <div className="space-y-4">
            {/* Plan Info */}
            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg">
              <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <FontAwesomeIcon
                  icon={faCrown}
                  className="w-5 h-5 text-primary-600 dark:text-primary-400"
                />
              </div>
              <div className="flex-1">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {subscription.plan?.displayName || 'Premium'} Plan
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {subscription.plan?.storageGb || 0} GB Storage
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  EGP {Number(subscription.plan?.priceEgp || 0).toFixed(0)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  /month
                </p>
              </div>
            </div>

            {/* Period Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <FontAwesomeIcon
                    icon={faCalendarAlt}
                    className="w-4 h-4 text-gray-400"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Period Start
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {new Date(
                    subscription.currentPeriodStart,
                  ).toLocaleDateString()}
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <FontAwesomeIcon
                    icon={faClock}
                    className="w-4 h-4 text-gray-400"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {subscription.status === 'grace'
                      ? 'Grace Ends'
                      : 'Renews On'}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {subscription.status === 'grace' && subscription.graceEndsAt
                    ? new Date(subscription.graceEndsAt).toLocaleDateString()
                    : new Date(
                        subscription.currentPeriodEnd,
                      ).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Grace Period Warning */}
            {subscription.status === 'grace' && (
              <div className="flex gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-lg">
                <FontAwesomeIcon
                  icon={faExclamationTriangle}
                  className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                    Subscription Expired — Grace Period Active
                  </p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Renew before{' '}
                    {subscription.graceEndsAt
                      ? new Date(subscription.graceEndsAt).toLocaleDateString()
                      : 'the grace period ends'}{' '}
                    to keep your storage. After that, your storage will be
                    downgraded to the free 5GB tier.
                  </p>
                </div>
              </div>
            )}

            {/* Renew Button */}
            {(subscription.status === 'active' ||
              subscription.status === 'grace') && (
              <button
                onClick={handleRenew}
                disabled={renewLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FontAwesomeIcon icon={faRotateRight} className="w-4 h-4" />
                {renewLoading
                  ? 'Redirecting to payment...'
                  : 'Renew Subscription'}
              </button>
            )}

            {/* Change Plan */}
            <button
              onClick={() => setShowPlanSelector(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 dark:border-zinc-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
            >
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="w-4 h-4"
              />
              Change Plan
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="p-3 bg-gray-100 dark:bg-zinc-900 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <FontAwesomeIcon
                icon={faCrown}
                className="w-8 h-8 text-gray-400"
              />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Free Plan
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              You're on the free 5GB plan. Upgrade to get more storage.
            </p>
            <button
              onClick={() => setShowPlanSelector(true)}
              className="px-6 py-3 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
            >
              Upgrade Now
            </button>
          </div>
        )}
      </div>

      {/* Plan Selector Modal */}
      {showPlanSelector && (
        <PlanSelector
          plans={plans}
          currentPlanId={subscription?.planId}
          onSelect={handleSelectPlan}
          onClose={() => setShowPlanSelector(false)}
        />
      )}

      {/* Payment History */}
      {/* {payments.length > 0 && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            <FontAwesomeIcon icon={faReceipt} className="w-5 h-5 mr-2" />
            Payment History
          </h2>

          <div className="divide-y divide-gray-200 dark:divide-zinc-700">
            {payments.slice(0, 10).map((payment) => {
              const statusInfo = PAYMENT_STATUS[payment.status] || PAYMENT_STATUS.pending;
              return (
                <div key={payment.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {payment.plan?.displayName || 'Storage Plan'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(payment.createdAt).toLocaleDateString()} — {payment.paymentMethod || 'Card'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      EGP {(payment.amountPiasters / 100).toFixed(2)}
                    </p>
                    <p className={`text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )} */}
    </div>
  );
};

export default SubscriptionSection;
