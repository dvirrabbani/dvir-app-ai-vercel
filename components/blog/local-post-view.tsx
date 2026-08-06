'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { ArticleContent } from '@/components/blog/article-content';
import { sanitizeHtml } from '@/lib/local-posts';
import { useLocalPosts } from '@/lib/use-local-posts';

/**
 * A non-Latin slug (Hebrew, Arabic) reaches the route percent-encoded, while it
 * is stored as written — so it has to be decoded before matching.
 */
function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug; // Malformed escape sequence — compare it as-is.
  }
}

/**
 * Renders a post from this browser's local storage, where every post lives.
 */
export function LocalPostView({ slug: rawSlug }: { slug: string }) {
  const { posts, hydrated } = useLocalPosts();
  const slug = decodeSlug(rawSlug);

  const post = useMemo(() => {
    const stored = posts.find((candidate) => candidate.slug === slug);
    if (!stored) return null;
    // Re-sanitize on read: storage is user-writable, so never trust it blindly.
    return { ...stored, contentHtml: sanitizeHtml(stored.contentHtml) };
  }, [posts, slug]);

  if (!hydrated) {
    return (
      <main className="min-h-screen pt-24 md:pt-28">
        <div className="container mx-auto max-w-6xl animate-pulse px-4 md:px-6">
          <div className="mb-8 h-4 w-32 rounded bg-foreground/10" />
          <div className="mb-4 h-10 w-3/4 rounded bg-foreground/10" />
          <div className="mb-10 h-4 w-1/2 rounded bg-foreground/10" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-4 w-full rounded bg-foreground/10" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 pt-24">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF4D8E]/10">
            <FileQuestion className="h-7 w-7 text-[#FF4D8E]" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">Post not found</h1>
          <p className="mx-auto mb-8 max-w-md text-sm text-muted-foreground md:text-base">
            There is no post with the slug <code className="rounded bg-[#FF4D8E]/10 px-1.5 py-0.5 text-[#FF4D8E]">{slug}</code>.
            Posts you write are stored in this browser only, so they will not appear in a different browser or in private mode.
          </p>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
        </div>
      </main>
    );
  }

  return <ArticleContent post={post} />;
}
