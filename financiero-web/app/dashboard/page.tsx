import type { Metadata } from 'next';
import DashboardFinanciero from '@/app/Components/DashboardFinanciero';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <DashboardFinanciero />;
}
