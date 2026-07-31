import { getPostBySlug, getAllSlugs } from '@/lib/blog';
import { ArticleContent } from '@/components/blog/article-content';
import { LocalPostView } from '@/components/blog/local-post-view';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const resolvedParams = await params;
  const post = getPostBySlug(resolvedParams.slug);

  if (!post) {
    // Could still be a post saved in the reader's browser — resolved client-side.
    return {
      title: 'Blog | YUV.AI',
    };
  }

  return {
    title: `${post.title} | YUV.AI Blog`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const resolvedParams = await params;
  const post = getPostBySlug(resolvedParams.slug);

  if (!post) {
    return <LocalPostView slug={resolvedParams.slug} />;
  }

  return <ArticleContent post={post} />;
}
