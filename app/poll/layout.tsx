import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Poll | YUV.AI',
  description: 'Tell us whether what we shared helped, and what worked better for you.',
};

export default function PollLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
