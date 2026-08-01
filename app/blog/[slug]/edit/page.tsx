import { EditPostView } from '@/components/blog/edit-post-view';

interface EditPostPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: 'Edit post | DVIR.AI',
};

/**
 * Posts live in the reader's local storage, so the post being edited can only be
 * loaded in the browser.
 */
export default async function EditPostPage({ params }: EditPostPageProps) {
  const { slug } = await params;

  return <EditPostView slug={slug} />;
}
