import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RichTextEditor from '../RichTextEditor';

vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => null),
  EditorContent: () => <div data-testid='editor-content' />,
}));

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));

describe('RichTextEditor', () => {
  it('returns null when editor is not yet initialised', () => {
    const { container } = render(
      <RichTextEditor value='' onChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
