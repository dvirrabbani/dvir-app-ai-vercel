'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Calendar,
  ArrowRight,
  PenLine,
  Pencil,
  Trash2,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ListFilter,
} from 'lucide-react';
import { LocalBlogPost, deleteLocalPost, getCategoryColor } from '@/lib/local-posts';
import { useLocalPosts } from '@/lib/use-local-posts';

type SortOrder = 'newest' | 'oldest';

const ALL_CATEGORIES = 'All';

/** Posts are ordered by when they were written; the display date is the fallback. */
function postTime(post: LocalBlogPost): number {
  const time = new Date(post.createdAt ?? post.date).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export default function BlogPage() {
  // Every post lives in local storage, so the list is empty until hydration.
  const { posts, hydrated } = useLocalPosts();
  const router = useRouter();

  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [order, setOrder] = useState<SortOrder>('newest');

  // Only offer categories that actually have posts, with their counts.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      counts.set(post.category, (counts.get(post.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [posts]);

  const visiblePosts = useMemo(() => {
    const filtered = category === ALL_CATEGORIES ? posts : posts.filter((post) => post.category === category);
    return [...filtered].sort((a, b) => (order === 'newest' ? postTime(b) - postTime(a) : postTime(a) - postTime(b)));
  }, [posts, category, order]);

  const handleDelete = useCallback((event: React.MouseEvent, post: LocalBlogPost) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    deleteLocalPost(post.slug);
  }, []);

  // A button rather than a link: the whole card is already a link, and anchors
  // cannot be nested.
  const handleEdit = useCallback(
    (event: React.MouseEvent, post: LocalBlogPost) => {
      event.preventDefault();
      event.stopPropagation();
      router.push(`/blog/${post.slug}/edit`);
    },
    [router]
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FFF5F8] via-background to-background dark:from-[#1C1C1E] dark:via-[#1C1C1E] dark:to-[#1C1C1E]">
      {/* Back to Home */}
      <div className="container mx-auto px-4 md:px-6 pt-24 md:pt-28">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 md:mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>

      {/* Header */}
      <header className="container mx-auto px-4 md:px-6 pb-8 md:pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-3 md:mb-4">
              Blog
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl">
              Thoughts on building modern web applications, the tools we use, and the decisions that shape our stack.
            </p>
          </div>

          <Link
            href="/blog/new"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
          >
            <PenLine className="h-4 w-4" />
            New Post
          </Link>
        </motion.div>
      </header>

      {/* Filters */}
      {hydrated && posts.length > 0 && (
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6 rounded-xl border border-white/30 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-white/5 md:mb-8 md:rounded-2xl md:p-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {/* Category */}
              <div className="min-w-0">
                <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ListFilter className="h-3.5 w-3.5" />
                  Category
                </h2>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label={ALL_CATEGORIES}
                    count={posts.length}
                    active={category === ALL_CATEGORIES}
                    onClick={() => setCategory(ALL_CATEGORIES)}
                  />
                  {categoryCounts.map(([name, count]) => (
                    <FilterChip
                      key={name}
                      label={name}
                      count={count}
                      color={getCategoryColor(name)}
                      active={category === name}
                      onClick={() => setCategory(name)}
                    />
                  ))}
                </div>
              </div>

              {/* Date order */}
              <div className="shrink-0">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</h2>
                <div className="flex gap-2">
                  <SortButton
                    label="Newest first"
                    icon={<ArrowDownWideNarrow className="h-3.5 w-3.5" />}
                    active={order === 'newest'}
                    onClick={() => setOrder('newest')}
                  />
                  <SortButton
                    label="Oldest first"
                    icon={<ArrowUpNarrowWide className="h-3.5 w-3.5" />}
                    active={order === 'oldest'}
                    onClick={() => setOrder('oldest')}
                  />
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Showing {visiblePosts.length} of {posts.length} {posts.length === 1 ? 'post' : 'posts'}
              {category !== ALL_CATEGORIES && ` in ${category}`}
            </p>
          </motion.div>
        </div>
      )}

      {/* Posts Grid */}
      <section className="container mx-auto px-4 md:px-6 pb-16 md:pb-24">
        {!hydrated && (
          <div className="grid animate-pulse gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3" aria-hidden>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-56 rounded-xl bg-foreground/5 md:rounded-2xl" />
            ))}
          </div>
        )}

        {hydrated && posts.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center md:rounded-2xl">
            <h2 className="mb-2 text-lg font-semibold text-foreground md:text-xl">No posts yet</h2>
            <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
              Every post lives in this browser&apos;s local storage. Write the first one to get started.
            </p>
            <Link
              href="/blog/new"
              className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
            >
              <PenLine className="h-4 w-4" />
              Write a post
            </Link>
          </div>
        )}

        {hydrated && posts.length > 0 && visiblePosts.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center md:rounded-2xl">
            <h2 className="mb-2 text-lg font-semibold text-foreground md:text-xl">Nothing in {category}</h2>
            <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
              No posts match this filter right now.
            </p>
            <button
              type="button"
              onClick={() => setCategory(ALL_CATEGORIES)}
              className="inline-flex items-center gap-2 rounded-full bg-[#FF4D8E] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
            >
              <ListFilter className="h-4 w-4" />
              Show all posts
            </button>
          </div>
        )}

        <div className="grid gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visiblePosts.map((post, index) => (
            <motion.article
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: Math.min(index, 5) * 0.1 }}
            >
              <Link href={`/blog/${post.slug}`} className="block group">
                <div dir={post.direction ?? 'auto'} lang={post.lang} className="h-full rounded-xl md:rounded-2xl bg-white/60 dark:bg-white/5 backdrop-blur-md border border-white/30 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.2)] p-4 md:p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)]">
                  {/* Category & Reading Time — kept left-to-right on RTL posts,
                      so the clock icon and label keep their usual order. */}
                  <div dir="ltr" className="flex flex-wrap items-center gap-2 md:gap-3 mb-3 md:mb-4">
                    <span
                      className="px-2 md:px-3 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: getCategoryColor(post.category) }}
                    >
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {post.readingTime} min read
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="text-lg md:text-xl font-semibold text-foreground mb-2 md:mb-3 group-hover:text-[#FF4D8E] transition-colors">
                    {post.title}
                  </h2>

                  {/* Excerpt */}
                  <p className="text-sm text-muted-foreground mb-3 md:mb-4 line-clamp-2">
                    {post.excerpt}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 md:pt-4 border-t border-white/10 dark:border-white/5">
                    <span dir="ltr" className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {post.date}
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => handleEdit(event, post)}
                        title="Edit this post"
                        aria-label={`Edit ${post.title}`}
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => handleDelete(event, post)}
                        title="Delete this post"
                        aria-label={`Delete ${post.title}`}
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <span className="flex items-center gap-1 text-xs md:text-sm font-medium text-[#FF4D8E] group-hover:gap-2 transition-all">
                        Read article
                        <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
                      </span>
                    </span>
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>
      </section>
    </main>
  );
}

function FilterChip({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  /** The category's own colour; omitted for the "All" chip. */
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  const accent = color ?? '#FF4D8E';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors"
      style={{
        borderColor: active ? accent : 'rgba(127,127,127,0.3)',
        backgroundColor: active ? `${accent}1f` : 'transparent',
        color: active ? accent : undefined,
      }}
    >
      {color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}

function SortButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors"
      style={{
        borderColor: active ? '#FF4D8E' : 'rgba(127,127,127,0.3)',
        backgroundColor: active ? 'rgba(255,77,142,0.12)' : 'transparent',
        color: active ? '#FF4D8E' : undefined,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
