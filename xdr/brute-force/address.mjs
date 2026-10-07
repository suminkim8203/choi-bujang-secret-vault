// Portable address validation; no filesystem, environment or external imports.
export function isIP(value) {
  if (typeof value !== 'string' || value.length > 64) return 0;
  const ipv4 = text => {
    const octets = text.split('.');
    return octets.length === 4 && octets.every(part => /^(?:0|[1-9]\d{0,2})$/u.test(part) && Number(part) <= 255);
  };
  if (ipv4(value)) return 4;
  if (!value.includes(':') || value.includes('%') || /[^\da-f:.]/iu.test(value)) return 0;
  const compression = value.split('::');
  if (compression.length > 2) return 0;
  const groups = compression.flatMap(part => part ? part.split(':') : []);
  let count = 0;
  for (let i = 0; i < groups.length; i++) {
    const part = groups[i];
    if (part.includes('.')) {
      if (i !== groups.length - 1 || !ipv4(part)) return 0;
      count += 2;
    } else {
      if (!/^[\da-f]{1,4}$/iu.test(part)) return 0;
      count++;
    }
  }
  return compression.length === 2 ? (count < 8 ? 6 : 0) : (count === 8 ? 6 : 0);
}
