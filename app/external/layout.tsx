import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'External | DVIR.AI',
  description:
    'The pages that point outward: a copy of this browser leaving for another device, the machine underneath it, a form addressed to somebody else.',
};

/**
 * The navbar for External. The five pages it gathers keep their own top-level
 * routes and their own layouts — this is a way in rather than a parent, so
 * nothing under here renders a second navbar for the same reason
 * `app/about/layout.tsx` is the only one in that chain that does.
 */
export default function ExternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
