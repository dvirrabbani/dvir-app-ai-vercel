import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'About | DVIR.AI',
  description: 'Who this is, and the pages kept inside it.',
};

/**
 * The navbar for About and everything under it — Management, and Finance under
 * that. The inner routes export metadata of their own and render no navbar,
 * since this layout wraps them too and a second one would sit on the screen
 * beside the first.
 */
export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
