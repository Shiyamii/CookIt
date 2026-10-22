/** Background classes of the cooking colors (theme tokens, listed for Tailwind). */
const COLOR_CLASSES: Record<string, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
};

/** The color of a dish being cooked (decorative: its name is always written next to it). */
export function ColorDot({ color, className }: { color: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 rounded-full ${COLOR_CLASSES[color] ?? ''} ${className}`}
    />
  );
}
