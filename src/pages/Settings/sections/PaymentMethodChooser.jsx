import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faXmark,
  faCreditCard,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import InstaPayLogo from '/InstaPay_Logo.png';
import WalletLogo from '/walletLogo.png';
import BankTransferLogo from '/Bank-Transfer-Logo.png';
import PayPalLogo from '/PayPal.png';

/**
 * Payment method chooser shown after a plan is selected.
 * Lets the user pick between Paymob (card/wallet), InstaPay, Wallet, and Bank Transfer payments.
 *
 * Props:
 * - plan: the selected plan object ({ id, displayName, priceEgp, storageGb, ... })
 * - instapayEnabled: boolean — only show InstaPay option when feature is on
 * - onPickPaymob(): called when user picks Paymob
 * - onPickInstapay(): called when user picks InstaPay
 * - onPickWallet(): called when user picks Wallet payment
 * - onPickBankTransfer(): called when user picks Bank Transfer
 * - onClose(): close and go back to plan selection
 */
const PaymentMethodChooser = ({
  plan,
  instapayEnabled,
  onPickPaymob,
  onPickInstapay,
  onPickWallet,
  onPickBankTransfer,
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


          {instapayEnabled && (
            <>
              <button
                onClick={onPickInstapay}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-zinc-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-left"
              >
                <div className="p-3  rounded-lg flex items-center justify-center">
                  <img
                    src={InstaPayLogo}
                    alt="InstaPay"
                    className="w-10 h-10 object-contain"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    InstaPay (Bank Transfer)
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Pay manually via InstaPay link 
                  </p>
                </div>
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="w-4 h-4 text-gray-400"
                />
              </button>

              <button
                onClick={onPickWallet}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-zinc-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-left"
              >
                <div className="p-3 rounded-lg flex items-center justify-center">
                  <img
                    src={WalletLogo}
                    alt="Wallet"
                    className="w-10 h-10 object-contain"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Pay via Wallet
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Vodafone Cash or Etisalat Cash 
                  </p>
                </div>
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="w-4 h-4 text-gray-400"
                />
              </button>

              <button
                onClick={onPickBankTransfer}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-zinc-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-left"
              >
                <div className="p-3 rounded-lg flex items-center justify-center">
                  <img
                    src={BankTransferLogo}
                    alt="Bank Transfer"
                    className="w-10 h-10 object-contain"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Bank Transfer (IBAN)
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Direct bank transfer via IBAN 
                  </p>
                </div>
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="w-4 h-4 text-gray-400"
                />
              </button>
            </>
          )}

                    <div
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-zinc-700 opacity-60 cursor-not-allowed"
          >
            <div className="p-3 rounded-lg">
                  <img
                    src={PayPalLogo}
                    alt="PayPal"
                    className="w-10 h-10 object-contain"
                  />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-500 dark:text-gray-400">
                Card / Wallet
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Coming soon — PayPal, Visa, Mastercard, Fawry
              </p>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              Soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodChooser;
