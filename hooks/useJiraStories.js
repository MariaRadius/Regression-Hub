import { useCallback, useEffect, useState } from 'react';
import { acknowledgeStory, syncStoryWatches } from '@/lib/api/jira';

/**
 * Shared hook for syncing and managing stale Jira story notifications.
 * Used by both JiraStoryNotifications (popover) and JiraStoriesPanel (inline card).
 */
export function useJiraStories() {
  const [staleStories, setStaleStories] = useState([]);
  const [checking, setChecking] = useState(false);
  const [jiraError, setJiraError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    syncStoryWatches().then(({ stories, jiraError: err }) => {
      if (!cancelled) {
        setStaleStories(stories ?? []);
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
      const { stories, jiraError: err } = await syncStoryWatches({
        force: true,
      });
      setStaleStories(stories ?? []);
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

  return {
    staleStories,
    checking,
    jiraError,
    handleCheckNow,
    handleDismiss,
    handleDismissAll,
  };
}
