import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { syncStoryWatches, acknowledgeStory } = vi.hoisted(() => ({
  syncStoryWatches: vi.fn(),
  acknowledgeStory: vi.fn(),
}));

vi.mock('@/lib/api/jira', () => ({ syncStoryWatches, acknowledgeStory }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import JiraStoryNotifications from '../JiraStoryNotifications';

const STORIES = [
  {
    storyKey: 'SAP-1',
    jiraSummary: 'Login flow',
    jiraUpdatedAt: '2026-06-01T00:00:00Z',
  },
  {
    storyKey: 'SAP-2',
    jiraSummary: 'Logout flow',
    jiraUpdatedAt: '2026-06-02T00:00:00Z',
  },
];

const ok = (stories) => ({ stories, jiraError: undefined });

beforeEach(() => {
  vi.clearAllMocks();
  acknowledgeStory.mockResolvedValue();
});

describe('JiraStoryNotifications', () => {
  it('renders bell icon with badge count matching stale stories', async () => {
    syncStoryWatches.mockResolvedValue(ok(STORIES));
    render(<JiraStoryNotifications />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows no badge when there are no stale stories', async () => {
    syncStoryWatches.mockResolvedValue(ok([]));
    render(<JiraStoryNotifications />);
    await waitFor(() => {
      expect(syncStoryWatches).toHaveBeenCalled();
    });
    expect(screen.queryByText('1')).toBeNull();
    expect(screen.queryByText('2')).toBeNull();
  });

  it('opens popover with story list on bell click', async () => {
    syncStoryWatches.mockResolvedValue(ok(STORIES));
    render(<JiraStoryNotifications />);
    await waitFor(() => screen.getByText('2'));

    await userEvent.click(
      screen.getByRole('button', { name: /jira story updates/i }),
    );

    expect(screen.getByText('SAP-1')).toBeInTheDocument();
    expect(screen.getByText('Login flow')).toBeInTheDocument();
    expect(screen.getByText('SAP-2')).toBeInTheDocument();
  });

  it('shows "No story updates" when popover is opened with no stale stories', async () => {
    syncStoryWatches.mockResolvedValue(ok([]));
    render(<JiraStoryNotifications />);
    await waitFor(() => expect(syncStoryWatches).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole('button', { name: /jira story updates/i }),
    );

    expect(screen.getByText(/no story updates/i)).toBeInTheDocument();
  });

  it('dismisses a single story on ✕ click and calls acknowledgeStory', async () => {
    syncStoryWatches.mockResolvedValue(ok(STORIES));
    render(<JiraStoryNotifications />);
    await waitFor(() => screen.getByText('2'));

    await userEvent.click(
      screen.getByRole('button', { name: /jira story updates/i }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /dismiss sap-1/i }),
    );

    expect(acknowledgeStory).toHaveBeenCalledWith({ storyKey: 'SAP-1' });
    await waitFor(() => {
      expect(screen.queryByText('SAP-1')).toBeNull();
    });
  });

  it('dismisses all stories on "Dismiss all" click', async () => {
    syncStoryWatches.mockResolvedValue(ok(STORIES));
    render(<JiraStoryNotifications />);
    await waitFor(() => screen.getByText('2'));

    await userEvent.click(
      screen.getByRole('button', { name: /jira story updates/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /dismiss all/i }));

    expect(acknowledgeStory).toHaveBeenCalledWith({ all: true });
    await waitFor(() => {
      expect(screen.getByText(/no story updates/i)).toBeInTheDocument();
    });
  });

  it('shows no badge and no crash when sync fails', async () => {
    syncStoryWatches.mockResolvedValue(ok([]));
    render(<JiraStoryNotifications />);
    await waitFor(() => expect(syncStoryWatches).toHaveBeenCalled());
    expect(screen.queryByText('1')).toBeNull();
  });

  it('shows Jira sync error banner when jiraError is returned', async () => {
    syncStoryWatches.mockResolvedValue({
      stories: [],
      jiraError: 'Jira authentication failed',
    });
    render(<JiraStoryNotifications />);
    await waitFor(() => expect(syncStoryWatches).toHaveBeenCalled());

    await userEvent.click(
      screen.getByRole('button', { name: /jira story updates/i }),
    );
    expect(screen.getByText(/jira authentication failed/i)).toBeInTheDocument();
  });

  it('"Check now" button calls syncStoryWatches with force:true and updates the list', async () => {
    syncStoryWatches
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(STORIES));
    render(<JiraStoryNotifications />);
    await waitFor(() => expect(syncStoryWatches).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole('button', { name: /jira story updates/i }),
    );
    await userEvent.click(screen.getByRole('button', { name: /check now/i }));

    await waitFor(() => {
      expect(syncStoryWatches).toHaveBeenCalledWith({ force: true });
      expect(screen.getByText('SAP-1')).toBeInTheDocument();
    });
  });
});
