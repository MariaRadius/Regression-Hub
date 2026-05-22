import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import ImportCasesClient from './ImportCasesClient';

export default async function ImportCasesPage() {
  const session = await getServerSession(authOptions);
  if (session.user.role !== 'admin') redirect('/dashboard');
  return <ImportCasesClient user={session.user} />;
}
