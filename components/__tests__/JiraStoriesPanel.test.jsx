import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useJiraStories', () => ({
  useJiraStories: vi.fn(() => ({
    staleStories: [
      {
        storyKey: 'PROJ-1',
        jiraSummary: 'Fix login',
        jiraUpdatedAt: '2026-07-01',
      },
    ],
    checking: false,
    jiraError: null,
    handleCheckNow: vi.fn(),
    handleDismiss: vi.fn(),
    handleDismissAll: vi.fn(),
  })),
}));

import * as useJiraStoriesModule from '@/hooks/useJiraStories';
import JiraStoriesPanel from '../JiraStoriesPanel';

describe('JiraStoriesPanel', () => {
  it('renders stale stories', () => {
    render(<JiraStoriesPanel onSelectStory={vi.fn()} />);
    expect(screen.getByText('PROJ-1')).toBeInTheDocument();
    expect(screen.getByText('Fix login')).toBeInTheDocument();
  });

  it('calls onSelectStory with key when story row is clicked', () => {
    const onSelectStory = vi.fn();
    render(<JiraStoriesPanel onSelectStory={onSelectStory} />);
    fireEvent.click(screen.getByRole('button', { name: /select PROJ-1/i }));
    expect(onSelectStory).toHaveBeenCalledWith('PROJ-1');
  });

  it('shows empty state when no stories', () => {
    vi.mocked(useJiraStoriesModule.useJiraStories).mockReturnValueOnce({
      staleStories: [],
      checking: false,
      jiraError: null,
      handleCheckNow: vi.fn(),
      handleDismiss: vi.fn(),
      handleDismissAll: vi.fn(),
    });
    render(<JiraStoriesPanel onSelectStory={vi.fn()} />);
    expect(screen.getByText(/all stories up to date/i)).toBeInTheDocument();
  });
});
