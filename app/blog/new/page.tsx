'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PostEditor, PostEditorSkeleton } from '@/components/blog/post-editor';
import { getDraft } from '@/lib/local-posts';
import { useIsHydrated } from '@/lib/use-local-posts';

export default function NewPostPage() {
  const hydrated = useIsHydrated();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      <div className="container mx-auto max-w-3xl px-4 pt-24 md:px-6 md:pt-28">
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Link>

        <header className="mb-6 md:mb-8">
          <h1 className="mb-2 text-3xl font-bold text-foreground md:text-4xl">New Post</h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Write your post below. Everything is saved to this browser&apos;s local storage — nothing is uploaded.
          </p>
        </header>

        {/* The form reads local storage, so it is only mounted on the client. */}
        {hydrated ? <PostEditor draft={getDraft()} /> : <PostEditorSkeleton />}
      </div>
    </main>
  );
}
