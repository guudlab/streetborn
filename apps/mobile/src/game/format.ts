// Turkish number formatting without relying on Intl (Hermes builds may lack locale data).
export function tr(n: number, digits = 0) {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(digits);
  const [int = '0', frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' : '') + grouped + (frac ? ',' + frac : '');
}

export function mmss(ms: number) {
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
