import { Navbar } from '@/components/layout/navbar';

export const metadata = {
  title: 'Contact | DVIR.AI',
  description: 'Send a message.',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
