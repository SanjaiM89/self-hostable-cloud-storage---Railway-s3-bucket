export default function Loader({ className = '' }) {
  return (
    <div className={`loader ${className}`.trim()} aria-label="loading">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className={`bar${i + 1}`} />
      ))}
    </div>
  );
}
