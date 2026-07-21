import { useCallback, useEffect, useState } from 'react';
import { acknowledgeStory, syncStoryWatches } from '@/lib/api/jira';

/**
 * Shared hook for syncing and managing stale and discarded Jira story notifications.
 * Used by both JiraStoryNotifications (popover) and GenerateClient (inline card via JiraStoriesPanel).
 */
export function useJiraStories() {
  const [staleStories, setStaleStories] = useState([]);
  const [discardedStories, setDiscardedStories] = useState([]);
  const [checking, setChecking] = useState(false);
  const [jiraError, setJiraError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    syncStoryWatches().then(({ stories, discarded, jiraError: err }) => {
      if (!cancelled) {
        setStaleStories(stories ?? []);
        setDiscardedStories(discarded ?? []);
        setJiraError(err ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckNow = useCallback(async () => {
    setChecking(true);
    setJiraError(null);
    try {
      const {
        stories,
        discarded,
        jiraError: err,
      } = await syncStoryWatches({
        force: true,
      });
      setStaleStories(stories ?? []);
      setDiscardedStories(discarded ?? []);
      setJiraError(err ?? null);
    } finally {
      setChecking(false);
    }
  }, []);

  const handleDismiss = useCallback(async (storyKey) => {
    await acknowledgeStory({ storyKey });
    setStaleStories((prev) => prev.filter((s) => s.storyKey !== storyKey));
  }, []);

  const handleDismissAll = useCallback(async () => {
    await acknowledgeStory({ all: true });
    setStaleStories([]);
  }, []);

  const handleDiscardAcknowledge = useCallback((storyKey) => {
    setDiscardedStories((prev) => prev.filter((s) => s.storyKey !== storyKey));
  }, []);

  return {
    staleStories,
    discardedStories,
    checking,
    jiraError,
    handleCheckNow,
    handleDismiss,
    handleDismissAll,
    handleDiscardAcknowledge,
  };
}
