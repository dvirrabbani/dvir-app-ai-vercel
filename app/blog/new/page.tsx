'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Eye, PenLine, Trash2, Clock } from 'lucide-react';
import { RichTextEditor, RichTextEditorHandle } from '@/components/blog/rich-text-editor';
import {
  LocalBlogPost,
  POST_CATEGORIES,
  PostDraft,
  clearDraft,
  estimateReadingTime,
  formatPostDate,
  getDraft,
  htmlToPlainText,
  sanitizeHtml,
  saveDraft,
  saveLocalPost,
  uniqueSlug,
} from '@/lib/local-posts';
import { useIsHydrated } from '@/lib/use-local-posts';

interface FormErrors {
  title?: string;
  excerpt?: string;
  content?: string;
}

const AUTOSAVE_INTERVAL_MS = 2000;

const fieldClass =
  'w-full rounded-xl border border-border bg-white/60 px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:bg-white/5';

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
        {hydrated ? <NewPostForm draft={getDraft()} /> : <EditorSkeleton />}
      </div>
    </main>
  );
}

function EditorSkeleton() {
  return (
    <div className="animate-pulse space-y-5 pb-16 md:pb-24" aria-hidden>
      <div className="h-12 rounded-xl bg-foreground/5" />
      <div className="h-20 rounded-xl bg-foreground/5" />
      <div className="h-12 rounded-xl bg-foreground/5" />
      <div className="h-[400px] rounded-xl bg-foreground/5" />
    </div>
  );
}

function NewPostForm({ draft }: { draft: PostDraft | null }) {
  const router = useRouter();
  const { data: session } = useSession();

  const [title, setTitle] = useState(draft?.title ?? '');
  const [excerpt, setExcerpt] = useState(draft?.excerpt ?? '');
  const [category, setCategory] = useState(draft?.category || POST_CATEGORIES[0]);
  const [authorName, setAuthorName] = useState(draft?.authorName ?? '');

  const [errors, setErrors] = useState<FormErrors>({});
  const [showPreview, setShowPreview] = useState(false);
  const [dismissedRestore, setDismissedRestore] = useState(false);

  // The editor owns the live body (it is uncontrolled — see rich-text-editor.tsx).
  // `contentHtml` is a snapshot of it, refreshed only at the points that re-render
  // anyway: opening the preview, discarding, and saving.
  const [contentHtml, setContentHtml] = useState(draft?.contentHtml ?? '');
  const editorApi = useRef<RichTextEditorHandle>(null);
  const draftStatusRef = useRef<HTMLSpanElement>(null);

  const restoredDraft = Boolean(draft?.title || draft?.contentHtml) && !dismissedRestore;
  const sessionName = session?.user?.name ?? '';

  // Autosave polls the editor instead of reacting to keystrokes, since the body
  // never flows through React state while typing.
  useEffect(() => {
    const timer = setInterval(() => {
      // The editor is unmounted while the preview is open — fall back to the snapshot.
      const html = editorApi.current?.getHtml() ?? contentHtml;
      if (!title && !excerpt && !htmlToPlainText(html)) return;

      saveDraft({ title, excerpt, category, authorName, contentHtml: html });
      if (draftStatusRef.current) {
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        draftStatusRef.current.textContent = `Draft saved ${time}`;
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [authorName, category, contentHtml, excerpt, title]);

  const handleDiscard = useCallback(() => {
    if (!window.confirm('Discard this draft? This cannot be undone.')) return;

    clearDraft();
    setContentHtml('');
    editorApi.current?.setHtml('');
    setTitle('');
    setExcerpt('');
    setCategory(POST_CATEGORIES[0]);
    setErrors({});
    setDismissedRestore(true);
    if (draftStatusRef.current) draftStatusRef.current.textContent = '';
  }, []);

  const handlePublish = useCallback(() => {
    const cleanHtml = sanitizeHtml(editorApi.current?.getHtml() ?? contentHtml);
    const plainText = htmlToPlainText(cleanHtml);

    const nextErrors: FormErrors = {};
    if (!title.trim()) nextErrors.title = 'A title is required.';
    if (!excerpt.trim()) nextErrors.excerpt = 'A short excerpt is required.';
    if (!plainText.trim()) nextErrors.content = 'The post body cannot be empty.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const post: LocalBlogPost = {
      slug: uniqueSlug(title),
      title: title.trim(),
      excerpt: excerpt.trim(),
      content: plainText,
      contentHtml: cleanHtml,
      category,
      date: formatPostDate(new Date()),
      readingTime: estimateReadingTime(plainText),
      author: { name: authorName.trim() || sessionName || 'Anonymous' },
      isLocal: true,
      createdAt: new Date().toISOString(),
    };

    saveLocalPost(post);
    clearDraft();
    router.push(`/blog/${post.slug}`);
  }, [authorName, category, contentHtml, excerpt, router, sessionName, title]);

  const togglePreview = useCallback(() => {
    const live = editorApi.current?.getHtml();
    if (live !== undefined) setContentHtml(live);
    setShowPreview((prev) => !prev);
  }, []);

  const previewHtml = showPreview ? sanitizeHtml(contentHtml) : '';

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {restoredDraft && (
        <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#00C2FF]/10 px-3 py-1 text-xs text-[#00C2FF]">
          <Clock className="h-3 w-3" />
          Restored your unsaved draft
        </p>
      )}

      <div className="space-y-5 pb-16 md:pb-24">
        {/* Title */}
        <div>
          <label htmlFor="post-title" className="mb-1.5 block text-sm font-medium text-foreground">
            Title
          </label>
          <input
            id="post-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A headline worth clicking"
            className={`${fieldClass} text-base font-medium placeholder:font-normal`}
          />
          {errors.title && <p className="mt-1.5 text-xs text-destructive">{errors.title}</p>}
        </div>

        {/* Excerpt */}
        <div>
          <label htmlFor="post-excerpt" className="mb-1.5 block text-sm font-medium text-foreground">
            Excerpt
          </label>
          <textarea
            id="post-excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            placeholder="One or two sentences that show up on the blog index."
            className={`${fieldClass} resize-y`}
          />
          {errors.excerpt && <p className="mt-1.5 text-xs text-destructive">{errors.excerpt}</p>}
        </div>

        {/* Category + author */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="post-category" className="mb-1.5 block text-sm font-medium text-foreground">
              Category
            </label>
            <select
              id="post-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${fieldClass} cursor-pointer`}
            >
              {POST_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="post-author" className="mb-1.5 block text-sm font-medium text-foreground">
              Author
            </label>
            <input
              id="post-author"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder={sessionName || 'Your name'}
              className={fieldClass}
            />
          </div>
        </div>

        {/* Content */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Content</label>
            <button
              type="button"
              onClick={togglePreview}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            >
              {showPreview ? <PenLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {showPreview ? (
            <div className="rte-content min-h-[320px] rounded-xl border border-border bg-white/60 px-4 py-4 text-sm leading-relaxed text-foreground dark:bg-white/5 md:text-base md:leading-[1.8]">
              {htmlToPlainText(previewHtml) ? (
                // Sanitized against an allow-list immediately above.
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <p className="text-muted-foreground">Nothing to preview yet.</p>
              )}
            </div>
          ) : (
            <RichTextEditor
              ref={editorApi}
              initialHtml={contentHtml}
              onBlur={setContentHtml}
              placeholder="Start writing… use the toolbar for headings, lists, quotes and links."
            />
          )}
          {errors.content && <p className="mt-1.5 text-xs text-destructive">{errors.content}</p>}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse items-stretch gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-black/5 hover:text-destructive dark:hover:bg-white/10"
            >
              <Trash2 className="h-4 w-4" />
              Discard draft
            </button>
            <span ref={draftStatusRef} className="hidden text-xs text-muted-foreground sm:inline" />
          </div>

          <button
            type="button"
            onClick={handlePublish}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
          >
            <Save className="h-4 w-4" />
            Save post
          </button>
        </div>
      </div>
    </motion.div>
  );
}
