export const metadata = {
  title: 'Management | DVIR.AI',
  description: 'The running of things, kept in this browser: the money and the body.',
};

/**
 * Only the metadata. The navbar comes from `app/about/layout.tsx`, which wraps
 * this page too — rendering another one here would put two on the screen.
 */
export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
