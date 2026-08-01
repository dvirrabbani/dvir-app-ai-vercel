'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Save, Eye, PenLine, Trash2, Clock, X } from 'lucide-react';
import { CategorySelect } from '@/components/blog/category-select';
import { EditorDirection, RichTextEditor, RichTextEditorHandle } from '@/components/blog/rich-text-editor';
import {
  LocalBlogPost,
  POST_CATEGORIES,
  PostDraft,
  applyAutoDirection,
  clearDraft,
  detectDirection,
  detectLanguage,
  estimateReadingTime,
  formatPostDate,
  htmlToPlainText,
  sanitizeHtml,
  saveDraft,
  saveLocalPost,
  uniqueSlug,
} from '@/lib/local-posts';

interface FormErrors {
  title?: string;
  excerpt?: string;
  content?: string;
}

const AUTOSAVE_INTERVAL_MS = 2000;

const fieldClass =
  'w-full rounded-xl border border-border bg-white/60 px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#FF4D8E]/50 focus:ring-2 focus:ring-[#FF4D8E]/20 dark:bg-white/5';

interface PostEditorProps {
  /** Given a post, the editor updates it in place instead of creating a new one. */
  post?: LocalBlogPost;
  /** Only used when writing a new post — an edit never touches the saved draft. */
  draft?: PostDraft | null;
}

export function PostEditor({ post, draft }: PostEditorProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const isEditing = Boolean(post);
  const initial = post ?? draft;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
  const [category, setCategory] = useState(initial?.category || POST_CATEGORIES[0]);
  const [authorName, setAuthorName] = useState(post?.author.name ?? draft?.authorName ?? '');

  const [errors, setErrors] = useState<FormErrors>({});
  const [showPreview, setShowPreview] = useState(false);
  const [dismissedRestore, setDismissedRestore] = useState(false);
  // null = let the browser decide from the text, which already handles Hebrew.
  const [direction, setDirection] = useState<EditorDirection>(post?.direction ?? draft?.direction ?? null);

  // The editor owns the live body (it is uncontrolled — see rich-text-editor.tsx).
  // `contentHtml` is a snapshot of it, refreshed only at the points that re-render
  // anyway: opening the preview, discarding, and saving.
  const [contentHtml, setContentHtml] = useState(initial?.contentHtml ?? '');
  const editorApi = useRef<RichTextEditorHandle>(null);
  const draftStatusRef = useRef<HTMLSpanElement>(null);

  const restoredDraft = !isEditing && Boolean(draft?.title || draft?.contentHtml) && !dismissedRestore;
  const sessionName = session?.user?.name ?? '';

  // Autosave polls the editor instead of reacting to keystrokes, since the body
  // never flows through React state while typing. Editing an existing post skips
  // this: its changes belong to the post, not to the new-post draft.
  useEffect(() => {
    if (isEditing) return;

    const timer = setInterval(() => {
      // The editor is unmounted while the preview is open — fall back to the snapshot.
      const html = editorApi.current?.getHtml() ?? contentHtml;
      if (!title && !excerpt && !htmlToPlainText(html)) return;

      saveDraft({ title, excerpt, category, authorName, contentHtml: html, direction });
      if (draftStatusRef.current) {
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        draftStatusRef.current.textContent = `Draft saved ${time}`;
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [authorName, category, contentHtml, direction, excerpt, isEditing, title]);

  const handleDiscard = useCallback(() => {
    if (isEditing) {
      router.push(`/blog/${post!.slug}`);
      return;
    }

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
  }, [isEditing, post, router]);

  const handleSave = useCallback(() => {
    const cleanHtml = applyAutoDirection(sanitizeHtml(editorApi.current?.getHtml() ?? contentHtml));
    const plainText = htmlToPlainText(cleanHtml);

    const nextErrors: FormErrors = {};
    if (!title.trim()) nextErrors.title = 'A title is required.';
    if (!excerpt.trim()) nextErrors.excerpt = 'A short excerpt is required.';
    if (!plainText.trim()) nextErrors.content = 'The post body cannot be empty.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Saving an edit re-dates the post, so the list shows what changed most recently.
    const now = new Date();

    const saved: LocalBlogPost = {
      // The slug stays put when editing, so existing links keep working.
      slug: post?.slug ?? uniqueSlug(title),
      title: title.trim(),
      excerpt: excerpt.trim(),
      content: plainText,
      contentHtml: cleanHtml,
      category,
      date: formatPostDate(now),
      readingTime: estimateReadingTime(plainText),
      author: { name: authorName.trim() || sessionName || 'Anonymous' },
      createdAt: now.toISOString(),
      // The title matters as much as the body here: a Hebrew post usually has both.
      direction: direction ?? detectDirection(`${title} ${plainText}`),
      lang: detectLanguage(`${title} ${plainText}`),
    };

    saveLocalPost(saved);
    if (!isEditing) clearDraft();
    router.push(`/blog/${saved.slug}`);
  }, [authorName, category, contentHtml, direction, excerpt, isEditing, post, router, sessionName, title]);

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

      {isEditing && (
        <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#FF9100]/10 px-3 py-1 text-xs text-[#FF9100]">
          <Clock className="h-3 w-3" />
          Saving will date this post today
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
            dir={direction ?? 'auto'}
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
            dir={direction ?? 'auto'}
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
            <CategorySelect id="post-category" value={category} onChange={setCategory} />
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
            <div
              dir={direction ?? 'auto'}
              className="rte-content min-h-[320px] rounded-xl border border-border bg-white/60 px-4 py-4 text-sm leading-relaxed text-foreground dark:bg-white/5 md:text-base md:leading-[1.8]"
            >
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
              direction={direction}
              onDirectionChange={setDirection}
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
              {isEditing ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
              {isEditing ? 'Cancel' : 'Discard draft'}
            </button>
            {!isEditing && <span ref={draftStatusRef} className="hidden text-xs text-muted-foreground sm:inline" />}
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF4D8E] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#FF4D8E]/25 transition-colors hover:bg-[#FF4D8E]/90"
          >
            <Save className="h-4 w-4" />
            {isEditing ? 'Save changes' : 'Save post'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function PostEditorSkeleton() {
  return (
    <div className="animate-pulse space-y-5 pb-16 md:pb-24" aria-hidden>
      <div className="h-12 rounded-xl bg-foreground/5" />
      <div className="h-20 rounded-xl bg-foreground/5" />
      <div className="h-12 rounded-xl bg-foreground/5" />
      <div className="h-[400px] rounded-xl bg-foreground/5" />
    </div>
  );
}
