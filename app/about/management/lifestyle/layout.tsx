export const metadata = {
  title: 'Lifestyle | DVIR.AI',
  description:
    'The upkeep under how you look: sleep, the supplements that do something, and what to eat to get stronger. Kept in this browser.',
};

/**
 * Only the metadata. The navbar comes from `app/about/layout.tsx`, which wraps
 * this page too — rendering another one here would put two on the screen.
 */
export default function LifestyleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
