import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faArrowLeft, faXmark } from '@fortawesome/free-solid-svg-icons';

const OnboardingModal = ({ isOpen, onComplete }) => {
  const { t, i18n } = useTranslation('common');
  const [currentStep, setCurrentStep] = useState(0);

  const isRTL = i18n.language === 'ar';

  const screens = [
    { image: '/onboarding1.png', alt: 'Welcome to Aamenn' },
    { image: '/onboarding2.png', alt: 'Secure Your Files' },
    { image: '/onboarding3.png', alt: 'Organize with Folders' },
    { image: '/onboarding4.png', alt: 'Share Safely' },
  ];

  const isLastStep = currentStep === screens.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (!isLastStep) setCurrentStep((s) => s + 1);
    else handleFinish();
  };

  const handlePrevious = () => {
    if (!isFirstStep) setCurrentStep((s) => s - 1);
  };

  const handleFinish = () => {
    localStorage.removeItem('aamenn_pending_onboarding');
    localStorage.setItem('aamenn_onboarding_completed', 'true');
    onComplete();
  };

  const handleSkip = () => {
    localStorage.removeItem('aamenn_pending_onboarding');
    localStorage.setItem('aamenn_onboarding_completed', 'true');
    onComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">

      <div className="relative">

        {/* IMAGE (this defines the size) */}
        <img
          src={screens[currentStep].image}
          alt={screens[currentStep].alt}
          className="max-h-[85vh] max-w-[95vw] object-contain rounded-xl shadow-2xl"
        />

        {/* SKIP */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-20 p-2 text-white rounded-lg backdrop-blur"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>

        {/* LEFT BUTTON */}
        {!isFirstStep && (
          <button
            onClick={handlePrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur"
          >
            <FontAwesomeIcon icon={isRTL ? faArrowRight : faArrowLeft} />
          </button>
        )}

        {/* RIGHT BUTTON */}
        <button
          onClick={handleNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur"
        >
          <FontAwesomeIcon icon={isRTL ? faArrowLeft : faArrowRight} />
        </button>

        {/* DOTS */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
          {screens.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentStep
                  ? 'w-8 bg-white'
                  : 'w-2 bg-white/50'
              }`}
            />
          ))}
        </div>

      </div>
    </div>
  );
};

export default OnboardingModal;