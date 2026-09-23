import { useEffect, useState } from 'react';

export function useScrolled(threshold: number): boolean {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > threshold));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
    };
  }, [threshold]);

  return scrolled;
}
