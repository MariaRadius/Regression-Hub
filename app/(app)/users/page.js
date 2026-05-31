import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { getUsers } from '@/lib/db/usersData';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'User Management' };

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/dashboard');
  if (session.user.role !== ROLES.ADMIN) redirect('/dashboard');
  if (!session.user.teamId) redirect('/dashboard');

  const users = await getUsers(session.user.teamId);

  return <UsersClient user={session.user} initialUsers={users} />;
}
