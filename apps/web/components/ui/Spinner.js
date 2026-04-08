export default function Spinner({ label = 'Loading...' }) {
  return (
    <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
      <span className="ui-spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
