import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Routines | DVIR.AI',
  description: 'The things that come round again, day by day, week by week.',
};

export default function RoutinesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
