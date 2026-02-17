import { redirect } from 'next/navigation';
import { checkAdminAccess } from '@/lib/admin-guard';
import AdminShell from './AdminShell';

export const metadata = {
  title: 'Admin | HeyDPE',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await checkAdminAccess();

  if (!admin) {
    redirect('/admin/login');
  }

  return (
    <AdminShell email={admin.user.email ?? 'admin'}>
      {children}
    </AdminShell>
  );
}
