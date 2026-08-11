import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Documents | DVIR.AI',
  description: 'Tables you keep in your own browser — columns, filters and a full-screen view.',
};

export default function DocumentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
