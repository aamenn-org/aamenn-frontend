import { useState, useEffect } from 'react';

const useImageRotation = (intervalMs = 4000) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    '/familyImage1.png',
    '/familyImage2.jpg',
    '/familyImage3.jpg',
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [slides.length, intervalMs]);

  return {
    currentImage: slides[currentSlide],
    currentSlide,
  };
};

export default useImageRotation;
