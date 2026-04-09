import { useEffect, useState } from 'react';

export function Toast({ message, kind = 'info', timeoutMs = 3500, onClose }) {
  useEffect(() => {
    if (!onClose) return;
    const t = setTimeout(() => onClose(), timeoutMs);
    return () => clearTimeout(t);
  }, [onClose, timeoutMs]);

  if (!message) return null;

  const live = kind === 'error' ? 'assertive' : 'polite';
  return (
    <div className={`ui-toast ui-toast--${kind}`} role="status" aria-live={live} aria-atomic="true">
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);

  return {
    toast,
    showToast: (message, kind = 'info') => setToast({ message, kind, id: Date.now() }),
    clearToast: () => setToast(null),
  };
}
