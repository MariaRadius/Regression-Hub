import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JiraDraftReviewDialog from '../JiraDraftReviewDialog';

const drafts = [
  {
    tcId: 'tc1',
    summary: '[QA] One — failed in v2.9',
    description: 'Body one',
  },
  {
    tcId: 'tc2',
    summary: '[QA] Two — failed in v2.9',
    description: 'Body two',
  },
];

let onCreate;
let onClose;

beforeEach(() => {
  onCreate = vi.fn().mockResolvedValue({ key: 'RXR-1' });
  onClose = vi.fn();
});

function renderDialog(props = {}) {
  return render(
    <JiraDraftReviewDialog
      open
      drafts={drafts}
      onCreate={onCreate}
      onClose={onClose}
      {...props}
    />,
  );
}

describe('JiraDraftReviewDialog', () => {
  it('shows the first draft with editable summary and description', () => {
    renderDialog();
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
    expect(screen.getByLabelText(/summary/i)).toHaveValue(
      '[QA] One — failed in v2.9',
    );
    expect(screen.getByLabelText(/description/i)).toHaveValue('Body one');
  });

  it('creates with the edited text and advances to the next draft', async () => {
    renderDialog();
    const summary = screen.getByLabelText(/summary/i);
    await userEvent.clear(summary);
    await userEvent.type(summary, 'Edited summary');

    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        tcId: 'tc1',
        summary: 'Edited summary',
        description: 'Body one',
      }),
    );
    expect(await screen.findByText(/2 of 2/)).toBeInTheDocument();
    expect(screen.getByLabelText(/summary/i)).toHaveValue(
      '[QA] Two — failed in v2.9',
    );
  });

  it('skips without creating and closes after the last draft', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/2 of 2/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Create while a summary or description is blank', async () => {
    renderDialog();
    await userEvent.clear(screen.getByLabelText(/summary/i));
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
  });

  it('stays on the current draft and shows the error when creation fails', async () => {
    onCreate.mockRejectedValue(new Error('Jira authentication failed'));
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(
      await screen.findByText(/Jira authentication failed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });
});
