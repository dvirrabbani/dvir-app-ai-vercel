'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { LOCAL_POSTS_EVENT, LOCAL_POSTS_KEY, LocalBlogPost, getLocalPosts } from '@/lib/local-posts';

function subscribeToPosts(onChange: () => void) {
  window.addEventListener(LOCAL_POSTS_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(LOCAL_POSTS_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// The snapshot is the raw JSON string rather than a parsed array: it only changes
// when the stored data changes, so React does not see a new value every render.
function getPostsSnapshot(): string {
  try {
    return window.localStorage.getItem(LOCAL_POSTS_KEY) ?? '';
  } catch {
    return '';
  }
}

function getServerPostsSnapshot(): null {
  return null;
}

/**
 * Reads locally saved posts and re-renders when they change (including from
 * another tab). `hydrated` is false on the server and during the hydration
 * render, which is what lets callers show a loading state without an effect.
 */
export function useLocalPosts(): { posts: LocalBlogPost[]; hydrated: boolean } {
  const raw = useSyncExternalStore(subscribeToPosts, getPostsSnapshot, getServerPostsSnapshot);

  return useMemo(
    () => ({
      posts: raw === null ? [] : getLocalPosts(),
      hydrated: raw !== null,
    }),
    [raw]
  );
}

function subscribeToNothing() {
  return () => {};
}

/** False on the server and during hydration, true afterwards. */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}
