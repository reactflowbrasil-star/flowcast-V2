import LiveTVPageClient from './LiveTVPageClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function UserLivePage() {
  return <LiveTVPageClient />;
}
