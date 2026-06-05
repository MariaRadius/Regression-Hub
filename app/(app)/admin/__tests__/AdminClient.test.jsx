'use client';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListAdminActivity = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/admin', () => ({
  listAdminActivity: mockListAdminActivity,
}));

vi.mock('@/components/Toast', () => ({
  __esModule: true,
  default: () => null,
  showToast: vi.fn(),
}));

import AdminClient from '../AdminClient';

describe('AdminClient activity logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAdminActivity.mockResolvedValue([
      {
        _id: 'evt-1',
        actor: 'Maria',
        title: 'Import completed',
        subject: 'QA environment',
        timestamp: '2026-06-05T09:00:00.000Z',
        details: ['Created 12 test cases'],
      },
    ]);
  });

  it('lazy-loads activity logs only after the admin opens them', async () => {
    await act(async () => {
      render(<AdminClient user={{ id: 'u1', name: 'Maria' }} />);
    });

    expect(mockListAdminActivity).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: /view activity/i }),
    );

    await waitFor(() => {
      expect(mockListAdminActivity).toHaveBeenCalledWith({ limit: 100 });
    });

    expect(await screen.findByText(/import completed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download logs/i }),
    ).toBeInTheDocument();
  });
});
