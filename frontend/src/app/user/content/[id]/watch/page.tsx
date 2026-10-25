import WatchPageClient from './WatchPageClient';

export const dynamic = 'force-static';

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  // For static export, generate a placeholder page
  // The actual routing will be handled client-side by WatchPageClient
  return [{ id: '_' }];
}

export default function WatchPage() {
  return <WatchPageClient />;
}