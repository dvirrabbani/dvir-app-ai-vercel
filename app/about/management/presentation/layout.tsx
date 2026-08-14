export const metadata = {
  title: 'Presentation | DVIR.AI',
  description:
    'What actually changes how you look and how you come across — and what only sells. Kept in this browser.',
};

/**
 * Only the metadata. The navbar comes from `app/about/layout.tsx`, which wraps
 * this page too — rendering another one here would put two on the screen.
 */
export default function PresentationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
