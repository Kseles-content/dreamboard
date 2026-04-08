export default function Input({ type = 'text', className = '', ...props }) {
  return <input type={type} className={`ui-input ${className}`.trim()} {...props} />;
}
