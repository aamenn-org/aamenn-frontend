import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';

const TermsOfService = () => {
  const { t, i18n } = useTranslation('terms');
  const isRTL = i18n.language === 'ar';

  return (
    <div className={`min-h-screen bg-white dark:bg-black ${isRTL ? 'rtl' : 'ltr'}`}>
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Link
          to="/auth"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-white hover:text-gray-900 dark:hover:text-gray-300 mb-8 transition-colors"
        >
          <FontAwesomeIcon icon={faArrowLeft} className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} />
          <span>{isRTL ? 'رجوع' : 'Back'}</span>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black dark:text-white mb-2">
            {t('title')}
          </h1>
          <p className="text-sm text-black dark:text-white">
            {t('lastUpdated')}
          </p>
        </div>

        {/* Introduction */}
        <div className="mb-6">
          <p className="text-black dark:text-white leading-relaxed">
            {t('intro')}
          </p>
        </div>

        {/* Section 1: About Aameen */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.about.title')}
          </h2>
          {t('sections.about.content', { returnObjects: true }).map((text, index) => (
            <p key={index} className="text-black dark:text-white leading-relaxed mb-3 last:mb-0">
              {text}
            </p>
          ))}
        </div>

        {/* Section 2: Your Account */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.account.title')}
          </h2>
          <p className="text-black dark:text-white leading-relaxed mb-3">
            {t('sections.account.intro')}
          </p>
          <p className="text-black dark:text-white font-medium mb-2">
            {t('sections.account.responsibilities')}
          </p>
          <ul className={`list-disc ${isRTL ? 'pr-6' : 'pl-6'} mb-3 space-y-1`}>
            {t('sections.account.items', { returnObjects: true }).map((item, index) => (
              <li key={index} className="text-black dark:text-white">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-black dark:text-white leading-relaxed">
            {t('sections.account.outro')}
          </p>
        </div>

        {/* Section 3: Encryption & Recovery Key */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.encryption.title')}
          </h2>
          <p className="text-black dark:text-white leading-relaxed mb-3">
            {t('sections.encryption.intro')}
          </p>
          <p className="text-black dark:text-white font-medium mb-2">
            {t('sections.encryption.means')}
          </p>
          <ul className={`list-disc ${isRTL ? 'pr-6' : 'pl-6'} mb-3 space-y-1`}>
            {t('sections.encryption.items', { returnObjects: true }).map((item, index) => (
              <li key={index} className="text-black dark:text-white">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-black dark:text-white leading-relaxed mb-3">
            {t('sections.encryption.recovery')}
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 mb-3">
            <p className="text-amber-900 dark:text-amber-200 font-semibold mb-2">
              {t('sections.encryption.warning')}
            </p>
            {t('sections.encryption.warningText', { returnObjects: true }).map((text, index) => (
              <p key={index} className="text-amber-800 dark:text-amber-300 text-sm leading-relaxed mb-1 last:mb-0">
                {text}
              </p>
            ))}
          </div>
        </div>

        {/* Section 4: Your Data */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.data.title')}
          </h2>
          <p className="text-black dark:text-white leading-relaxed mb-3">
            {t('sections.data.ownership')}
          </p>
          <p className="text-black dark:text-white font-medium mb-2">
            {t('sections.data.grant')}
          </p>
          <ul className={`list-disc ${isRTL ? 'pr-6' : 'pl-6'} mb-3 space-y-1`}>
            {t('sections.data.items', { returnObjects: true }).map((item, index) => (
              <li key={index} className="text-black dark:text-white">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-black dark:text-white leading-relaxed">
            {t('sections.data.privacy')}
          </p>
        </div>

        {/* Section 5: Acceptable Use */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.acceptable.title')}
          </h2>
          <p className="text-black dark:text-white leading-relaxed mb-2">
            {t('sections.acceptable.intro')}
          </p>
          <ul className={`list-disc ${isRTL ? 'pr-6' : 'pl-6'} mb-3 space-y-1`}>
            {t('sections.acceptable.items', { returnObjects: true }).map((item, index) => (
              <li key={index} className="text-black dark:text-white">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-black dark:text-white leading-relaxed">
            {t('sections.acceptable.outro')}
          </p>
        </div>

        {/* Section 6: Storage Limits */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.storage.title')}
          </h2>
          {t('sections.storage.content', { returnObjects: true }).map((text, index) => (
            <p key={index} className="text-black dark:text-white leading-relaxed mb-3 last:mb-0">
              {text}
            </p>
          ))}
        </div>

        {/* Section 7: Account Deletion */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.deletion.title')}
          </h2>
          <p className="text-black dark:text-white leading-relaxed mb-3">
            {t('sections.deletion.intro')}
          </p>
          <p className="text-black dark:text-white font-medium mb-2">
            {t('sections.deletion.when')}
          </p>
          <ul className={`list-disc ${isRTL ? 'pr-6' : 'pl-6'} space-y-1`}>
            {t('sections.deletion.items', { returnObjects: true }).map((item, index) => (
              <li key={index} className="text-black dark:text-white">
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Section 8: Service Availability */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.availability.title')}
          </h2>
          <p className="text-black dark:text-white leading-relaxed">
            {t('sections.availability.content')}
          </p>
        </div>

        {/* Section 9: Changes to Terms */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.changes.title')}
          </h2>
          {t('sections.changes.content', { returnObjects: true }).map((text, index) => (
            <p key={index} className="text-black dark:text-white leading-relaxed mb-3 last:mb-0">
              {text}
            </p>
          ))}
        </div>

        {/* Section 10: Contact */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            {t('sections.contact.title')}
          </h2>
          <p className="text-black dark:text-white leading-relaxed mb-2">
            {t('sections.contact.intro')}
          </p>
          <a
            href="mailto:support@aameen.app"
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
          >
            {t('sections.contact.email')}
          </a>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
