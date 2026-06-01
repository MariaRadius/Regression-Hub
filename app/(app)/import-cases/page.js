import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import ImportCasesClient from './ImportCasesClient';

export default async function ImportCasesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/dashboard');
  if (session.user.role !== ROLES.ADMIN) redirect('/dashboard');

  return <ImportCasesClient />;
}
