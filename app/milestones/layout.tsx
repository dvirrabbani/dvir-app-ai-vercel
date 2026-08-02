import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Milestones | DVIR.AI',
  description: 'Track how far along each milestone is.',
};

export default function MilestonesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
