import SyncfyEmbedClient from './SyncfyEmbedClient';

type SyncfyEmbedPageProps = {
  searchParams: Promise<{
    country?: string;
  }>;
};

export default async function SyncfyEmbedPage({ searchParams }: SyncfyEmbedPageProps) {
  const params = await searchParams;

  return <SyncfyEmbedClient country={params.country || 'MX'} />;
}
