import { LocalPostView } from '@/components/blog/local-post-view';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: 'Blog | DVIR.AI',
  description: 'Thoughts on building modern web applications.',
};

/**
 * Posts live in the reader's local storage, so there is nothing to render on the
 * server — the slug is resolved in the browser.
 */
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;

  return <LocalPostView slug={slug} />;
}
