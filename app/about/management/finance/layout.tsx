export const metadata = {
  title: 'Finance | DVIR.AI',
  description: 'Money in, money out, and what a month is meant to cost — kept in this browser.',
};

/**
 * Only the metadata. The navbar comes from `app/about/layout.tsx`, which wraps
 * this page too — rendering another one here would put two on the screen.
 */
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
