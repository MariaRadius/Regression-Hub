'use client';

import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import { Divider, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';

// ── Editor ──────────────────────────────────────────────────────────────────
/** @see {@link __tests__/RichTextEditor.test.jsx} */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 80,
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'rte-content',
        style: `min-height:${minHeight}px; outline:none;`,
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. when modal opens with a different record)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className='rte-wrap'>
      {/* Toolbar */}
      <Stack
        direction='row'
        spacing={0.5}
        className='rte-toolbar'
        sx={{
          alignItems: 'center',
          p: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {/* Text formatting group */}
        <ToggleButtonGroup size='small' aria-label='text formatting'>
          <ToggleButton
            value='bold'
            selected={editor.isActive('bold')}
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleBold().run();
            }}
            aria-label='bold'
          >
            <FormatBoldIcon fontSize='small' />
          </ToggleButton>
          <ToggleButton
            value='italic'
            selected={editor.isActive('italic')}
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleItalic().run();
            }}
            aria-label='italic'
          >
            <FormatItalicIcon fontSize='small' />
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation='vertical' flexItem sx={{ mx: 0.5 }} />

        {/* List formatting group */}
        <ToggleButtonGroup size='small' aria-label='list formatting'>
          <ToggleButton
            value='bulletList'
            selected={editor.isActive('bulletList')}
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleBulletList().run();
            }}
            aria-label='bullet list'
          >
            <FormatListBulletedIcon fontSize='small' />
          </ToggleButton>
          <ToggleButton
            value='orderedList'
            selected={editor.isActive('orderedList')}
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleOrderedList().run();
            }}
            aria-label='numbered list'
          >
            <FormatListNumberedIcon fontSize='small' />
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation='vertical' flexItem sx={{ mx: 0.5 }} />

        {/* Indent group */}
        <ToggleButtonGroup size='small' aria-label='indentation'>
          <ToggleButton
            value='outdent'
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().liftListItem('listItem').run();
            }}
            aria-label='outdent'
          >
            <FormatIndentDecreaseIcon fontSize='small' />
          </ToggleButton>
          <ToggleButton
            value='indent'
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().sinkListItem('listItem').run();
            }}
            aria-label='indent'
          >
            <FormatIndentIncreaseIcon fontSize='small' />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {/* Content area */}
      <EditorContent editor={editor} />
      {!value && <div className='rte-placeholder'>{placeholder}</div>}
    </div>
  );
}
