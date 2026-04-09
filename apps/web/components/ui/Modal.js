import { useEffect } from 'react';
import Card from './Card';
import Button from './Button';

export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-modal__backdrop" onClick={onClose}>
      <div className="ui-modal__content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title || 'Диалог'}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            {title ? <h3 style={{ marginTop: 0, marginBottom: 0 }}>{title}</h3> : <span />}
            <Button variant="ghost" onClick={onClose} aria-label="Close">×</Button>
          </div>
          <div style={{ marginTop: 12 }}>{children}</div>
        </Card>
      </div>
    </div>
  );
}
