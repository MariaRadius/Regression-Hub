import Sidebar from '@/components/Sidebar';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);

  return (
    <div className='app-shell'>
      <Sidebar user={session.user} />
      <main className='workspace'>{children}</main>
    </div>
  );
}
