'use client';

import { useState } from 'react';
import { isSafeImageSrc } from '@/lib/local-posts';

interface CoverImageProps {
  src?: string;
  alt?: string;
  className?: string;
}

/**
 * The cover image of a post. Renders nothing when there is no image, when the
 * source is not a plain http(s) URL, or when the host fails to serve it — a
 * broken-image icon above a title looks worse than no image at all.
 *
 * A plain <img> rather than next/image: the URL is author input and can point at
 * any host, which next/image would need configured up front.
 */
export function CoverImage({ src, alt = '', className }: CoverImageProps) {
  // Remembering *which* source failed, rather than a flag, means a new source
  // gets a fresh chance to load without an effect resetting anything.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || src === failedSrc || !isSafeImageSrc(src)) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailedSrc(src)} />
  );
}
