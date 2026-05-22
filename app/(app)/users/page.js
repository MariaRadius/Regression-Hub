import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getUsers } from '@/lib/usersData';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (session.user.role !== 'admin') redirect('/dashboard');

  const users = await getUsers({ teamId: session.user.teamId });

  return <UsersClient user={session.user} initialUsers={users} />;
}
