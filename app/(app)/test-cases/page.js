import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import TestCasesClient from './TestCasesClient';

export default async function TestCasesPage() {
  const session = await getServerSession(authOptions);
  return <TestCasesClient user={session.user} />;
}
