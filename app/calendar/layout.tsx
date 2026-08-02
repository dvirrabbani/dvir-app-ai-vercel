import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Calendar | DVIR.AI',
  description: 'Keep track of what is coming up.',
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
