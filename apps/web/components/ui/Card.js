export default function Card({ children, className = '', ...props }) {
  return (
    <section className={`ui-card ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
