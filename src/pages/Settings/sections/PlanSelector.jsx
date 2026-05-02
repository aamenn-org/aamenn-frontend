import { useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faChevronRight,
  faShieldHalved,
  faServer,
  faStar,
  faRocket,
  faGem,
  faCrown,
  faBolt,
  faFire,
  faAtom,
  faCheck,
  faArrowRight,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

// ─── config ──────────────────────────────────────────────────────────────────

const PLAN_ICONS = {
  starter: faShieldHalved,
  basic: faServer,
  plus: faStar,
  pro: faRocket,
  premium: faGem,
  elite: faCrown,
  ultra: faBolt,
  max: faFire,
  titan: faAtom,
};

// Tailwind text/border accent classes per plan.
// Using fixed tailwind classes (not template literals) so JIT picks them up.
const PLAN_ACCENT = {
  starter: {
    text: 'text-gray-500 dark:text-gray-400',
    border: 'border-gray-400 dark:border-gray-500',
    bg: 'bg-gray-500',
    badgeBg: 'bg-gray-100 dark:bg-gray-500/20',
    badgeText: 'text-gray-700 dark:text-gray-300',
  },
  basic: {
    text: 'text-blue-500',
    border: 'border-blue-500',
    bg: 'bg-blue-500',
    badgeBg: 'bg-blue-100 dark:bg-blue-500/20',
    badgeText: 'text-blue-700 dark:text-blue-300',
  },
  plus: {
    text: 'text-emerald-500',
    border: 'border-emerald-500',
    bg: 'bg-emerald-500',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-500/20',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
  },
  pro: {
    text: 'text-violet-500',
    border: 'border-violet-500',
    bg: 'bg-violet-500',
    badgeBg: 'bg-violet-100 dark:bg-violet-500/20',
    badgeText: 'text-violet-700 dark:text-violet-300',
  },
  premium: {
    text: 'text-pink-500',
    border: 'border-pink-500',
    bg: 'bg-pink-500',
    badgeBg: 'bg-pink-100 dark:bg-pink-500/20',
    badgeText: 'text-pink-700 dark:text-pink-300',
  },
  elite: {
    text: 'text-amber-500',
    border: 'border-amber-500',
    bg: 'bg-amber-500',
    badgeBg: 'bg-amber-100 dark:bg-amber-500/20',
    badgeText: 'text-amber-700 dark:text-amber-300',
  },
  ultra: {
    text: 'text-orange-500',
    border: 'border-orange-500',
    bg: 'bg-orange-500',
    badgeBg: 'bg-orange-100 dark:bg-orange-500/20',
    badgeText: 'text-orange-700 dark:text-orange-300',
  },
  max: {
    text: 'text-red-500',
    border: 'border-red-500',
    bg: 'bg-red-500',
    badgeBg: 'bg-red-100 dark:bg-red-500/20',
    badgeText: 'text-red-700 dark:text-red-300',
  },
  titan: {
    text: 'text-lime-600 dark:text-lime-500',
    border: 'border-lime-600 dark:border-lime-500',
    bg: 'bg-lime-600 dark:bg-lime-500',
    badgeBg: 'bg-lime-100 dark:bg-lime-500/20',
    badgeText: 'text-lime-700 dark:text-lime-300',
  },
};

const DEFAULT_ACCENT = PLAN_ACCENT.basic;
const POPULAR_PLAN = 'premium';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtStorage(gb) {
  return gb >= 1024 ? `${(gb / 1024).toFixed(0)} TB` : `${gb} GB`;
}

function getAccent(name) {
  return PLAN_ACCENT[name] ?? DEFAULT_ACCENT;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function Badge({ children, className }) {
  return (
    <span
      className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${className}`}
    >
      {children}
    </span>
  );
}

function PlanCard({ plan, isCurrent }) {
  const accent = getAccent(plan.name);
  return (
    <div className="w-full shrink-0 px-2">
      <div
        className={`rounded-2xl border p-7 pb-6 bg-white dark:bg-zinc-800 select-none ${accent.border}`}
      >
        {/* top badges */}
        <div className="flex justify-between items-center min-h-[24px] mb-5">
          {isCurrent ? (
            <Badge className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              Current plan
            </Badge>
          ) : plan.popular ? (
            <Badge className="bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300">
              Most popular
            </Badge>
          ) : (
            <span />
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {plan._index + 1} / {plan._total}
          </span>
        </div>

        {/* icon */}
        <div className="mb-3">
          <FontAwesomeIcon
            icon={PLAN_ICONS[plan.name] ?? faServer}
            className={`text-[28px] ${accent.text}`}
          />
        </div>

        {/* name + storage (primary) + price (secondary) */}
        <p className="text-[13px] font-medium text-gray-600 dark:text-gray-300 m-0">
          {plan.displayName}
        </p>
        <p className="mt-1 mb-0 text-4xl font-semibold leading-tight text-gray-900 dark:text-white">
          {fmtStorage(plan.storageGb)}
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">
            storage
          </span>
        </p>

        {/* price */}
        <p className="mt-1.5 mb-5 text-sm text-gray-600 dark:text-gray-300">
          EGP {Number(plan.priceEgp).toFixed(0)}
          <span className="text-gray-500 dark:text-gray-400">/mo</span>
        </p>

        {/* features */}
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {(plan.features ?? []).map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-gray-300"
            >
              <FontAwesomeIcon
                icon={faCheck}
                className={`text-[11px] shrink-0 ${accent.text}`}
              />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function NavArrow({ icon, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-9 h-9 rounded-full border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 flex items-center justify-center shrink-0 transition-opacity hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-default disabled:hover:bg-white dark:disabled:hover:bg-zinc-800"
    >
      <FontAwesomeIcon
        icon={icon}
        className="text-[13px] text-gray-700 dark:text-gray-200"
      />
    </button>
  );
}

function Dot({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`h-1.5 rounded-full border-0 p-0 transition-all ${
        active
          ? 'w-4 bg-primary-500'
          : 'w-1.5 bg-gray-300 dark:bg-zinc-600 hover:bg-gray-400 dark:hover:bg-zinc-500'
      }`}
    />
  );
}

// ─── confirmation screen ─────────────────────────────────────────────────────

function ConfirmScreen({ plan, onBack, onConfirm, loading }) {
  const accent = getAccent(plan.name);
  return (
    <div className="text-center px-4 py-8">
      <div className="mb-3">
        <FontAwesomeIcon
          icon={PLAN_ICONS[plan.name] ?? faServer}
          className={`text-4xl ${accent.text}`}
        />
      </div>
      <p className="m-0 mb-1 text-lg font-semibold text-gray-900 dark:text-white">
        {plan.displayName}
      </p>
      <p className="m-0 mb-2 text-sm text-gray-600 dark:text-gray-300">
        EGP {Number(plan.priceEgp).toFixed(0)}/mo &middot;{' '}
        {fmtStorage(plan.storageGb)}
      </p>
      <p className="m-0 mb-7 text-[13px] text-gray-500 dark:text-gray-400">
        You're upgrading to {fmtStorage(plan.storageGb)} of encrypted storage.
      </p>

      <button
        onClick={onConfirm}
        disabled={loading}
        className={`flex items-center justify-center gap-2 w-full max-w-[280px] mx-auto mb-3 py-3 rounded-lg border-0 text-white text-sm font-medium transition-opacity ${accent.bg} ${
          loading ? 'opacity-60 cursor-default' : 'hover:opacity-90'
        }`}
      >
        {loading ? 'Redirecting...' : 'Confirm & continue'}
        {!loading && (
          <FontAwesomeIcon icon={faArrowRight} className="text-[13px]" />
        )}
      </button>

      <button
        onClick={onBack}
        className="bg-transparent border-0 text-[13px] text-gray-600 dark:text-gray-300 cursor-pointer underline hover:text-gray-900 dark:hover:text-white"
      >
        Go back
      </button>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

/**
 * PlanSelector
 *
 * Props:
 *   plans         – array of plan objects
 *   currentPlanId – string id of the user's active plan
 *   onSelect      – async (planId: string) => void
 *   onClose       – () => void
 */
export default function PlanSelector({
  plans,
  currentPlanId,
  onSelect,
  onClose,
}) {
  const currentIndex = Math.max(
    0,
    plans.findIndex((p) => p.id === currentPlanId),
  );
  const [idx, setIdx] = useState(currentIndex);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const trackRef = useRef(null);

  const plan = plans[idx];
  const accent = getAccent(plan?.name);
  const isCurrent = plan?.id === currentPlanId;

  const annotated = plans.map((p, i) => ({
    ...p,
    _index: i,
    _total: plans.length,
    popular: p.name === POPULAR_PLAN,
  }));

  function go(dir) {
    setIdx((prev) => Math.max(0, Math.min(plans.length - 1, prev + dir)));
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      await onSelect(plan.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* modal */}
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-700 overflow-hidden shadow-2xl">
        {/* header */}
        <div className="px-6 pt-5 flex justify-between items-center">
          <p className="m-0 text-xs font-medium tracking-[0.08em] uppercase text-gray-500 dark:text-gray-400">
            Storage plan
          </p>
          <button
            onClick={onClose}
            className="bg-transparent border-0 cursor-pointer p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="text-lg" />
          </button>
        </div>

        {/* body */}
        {confirming ? (
          <ConfirmScreen
            plan={annotated[idx]}
            onBack={() => setConfirming(false)}
            onConfirm={handleConfirm}
            loading={loading}
          />
        ) : (
          <>
            {/* carousel — px-4 on viewport + px-2 on each card creates a 16px visual gap between slides */}
            <div className="px-4 pt-4 overflow-hidden">
              <div
                ref={trackRef}
                className="flex transition-transform duration-300 ease-out will-change-transform"
                style={{ transform: `translateX(-${idx * 100}%)` }}
              >
                {annotated.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    isCurrent={p.id === currentPlanId}
                  />
                ))}
              </div>
            </div>

            {/* nav row */}
            <div className="flex items-center justify-center gap-3 px-6 pt-4">
              <NavArrow
                icon={faChevronLeft}
                onClick={() => go(-1)}
                disabled={idx === 0}
              />
              <div className="flex items-center gap-1.5">
                {plans.map((_, i) => (
                  <Dot key={i} active={i === idx} onClick={() => setIdx(i)} />
                ))}
              </div>
              <NavArrow
                icon={faChevronRight}
                onClick={() => go(1)}
                disabled={idx === plans.length - 1}
              />
            </div>

            {/* action buttons */}
            <div className="px-6 pt-5 pb-6 flex flex-col gap-2">
              <button
                onClick={() => setConfirming(true)}
                disabled={isCurrent}
                className={`w-full py-3 rounded-lg border-0 text-sm font-medium transition-opacity ${
                  isCurrent
                    ? 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 cursor-default'
                    : `${accent.bg} text-white hover:opacity-90 cursor-pointer`
                }`}
              >
                {isCurrent
                  ? 'This is your current plan'
                  : `Select ${plan?.displayName ?? ''} — EGP ${Number(plan?.priceEgp ?? 0).toFixed(0)}/mo`}
              </button>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-transparent text-[13px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Maybe later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
