export const metadata = {
  title: 'Your days | DVIR.AI',
  description: 'What a stretch of days adds up to: sleep, meals and bathroom visits over a range you pick.',
};

/**
 * Only the metadata. The navbar comes from `app/routines/layout.tsx`, which wraps
 * this page too — rendering another one here would put two on the screen.
 */
export default function SummaryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
