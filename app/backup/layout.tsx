import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Your data | DVIR.AI',
  description: 'Take a copy of everything this browser holds, or load one from another device.',
};

export default function BackupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
