'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { PostEditor, PostEditorSkeleton } from '@/components/blog/post-editor';
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

export function EditPostView({ slug: rawSlug }: { slug: string }) {
  const { posts, hydrated } = useLocalPosts();
  const slug = decodeSlug(rawSlug);

  const post = useMemo(() => posts.find((candidate) => candidate.slug === slug), [posts, slug]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-6xl px-4 pt-24 md:px-6 md:pt-28">
        <Link
          href={hydrated && post ? `/blog/${post.slug}` : '/blog'}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {hydrated && post ? 'Back to post' : 'Back to Blog'}
        </Link>

        {!hydrated ? (
          <>
            <header className="mb-6 md:mb-8">
              <h1 className="mb-2 text-3xl font-bold text-foreground md:text-4xl">Edit post</h1>
            </header>
            <PostEditorSkeleton />
          </>
        ) : !post ? (
          <div className="pb-16 text-center md:pb-24">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF4D8E]/10">
              <FileQuestion className="h-7 w-7 text-[#FF4D8E]" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">Post not found</h1>
            <p className="mx-auto mb-8 max-w-md text-sm text-muted-foreground md:text-base">
              There is nothing stored in this browser with the slug{' '}
              <code className="rounded bg-[#FF4D8E]/10 px-1.5 py-0.5 text-[#FF4D8E]">{slug}</code>, so there is
              nothing to edit.
            </p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </Link>
          </div>
        ) : (
          <>
            <header className="mb-6 md:mb-8">
              <h1 className="mb-2 text-3xl font-bold text-foreground md:text-4xl">Edit post</h1>
              <p dir="auto" className="text-sm text-muted-foreground md:text-base">
                {post.title}
              </p>
            </header>
            <PostEditor post={post} />
          </>
        )}
      </div>
    </main>
  );
}
