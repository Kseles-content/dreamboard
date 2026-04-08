import Card from './Card';

export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="ui-modal__backdrop" onClick={onClose}>
      <div className="ui-modal__content" onClick={(e) => e.stopPropagation()}>
        <Card>
          {title ? <h3 style={{ marginTop: 0 }}>{title}</h3> : null}
          {children}
        </Card>
      </div>
    </div>
  );
}
