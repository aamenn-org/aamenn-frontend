import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faXmark,
  faCreditCard,
  faMoneyBillTransfer,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Payment method chooser shown after a plan is selected.
 * Lets the user pick between Paymob (card/wallet) and InstaPay (manual transfer).
 *
 * Props:
 * - plan: the selected plan object ({ id, displayName, priceEgp, storageGb, ... })
 * - instapayEnabled: boolean — only show InstaPay option when feature is on
 * - onPickPaymob(): called when user picks Paymob
 * - onPickInstapay(): called when user picks InstaPay
 * - onClose(): close and go back to plan selection
 */
const PaymentMethodChooser = ({
  plan,
  instapayEnabled,
  onPickPaymob,
  onPickInstapay,
  onClose,
}) => {
  if (!plan) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 max-w-lg w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Choose Payment Method
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {plan.displayName} — EGP {Number(plan.priceEgp).toFixed(0)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <button
            onClick={onPickPaymob}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-zinc-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-left"
          >
            <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <FontAwesomeIcon
                icon={faCreditCard}
                className="w-6 h-6 text-primary-600 dark:text-primary-400"
              />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">
                Card / Wallet
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Visa, Mastercard, Vodafone Cash, Fawry — instant activation
              </p>
            </div>
            <FontAwesomeIcon
              icon={faChevronRight}
              className="w-4 h-4 text-gray-400"
            />
          </button>

          {instapayEnabled && (
            <button
              onClick={onPickInstapay}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-zinc-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-left"
            >
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <FontAwesomeIcon
                  icon={faMoneyBillTransfer}
                  className="w-6 h-6 text-amber-600 dark:text-amber-400"
                />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">
                  InstaPay (Bank Transfer)
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Pay manually via InstaPay — verified within 12 hours
                </p>
              </div>
              <FontAwesomeIcon
                icon={faChevronRight}
                className="w-4 h-4 text-gray-400"
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodChooser;
