'use client';

import EditIcon from '@mui/icons-material/Edit';
import {
  Checkbox,
  IconButton,
  MenuItem,
  Select,
  TableCell,
  TableRow,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import RichTextDisplay from '@/components/RichTextDisplay';
import { PRIORITIES, STATUS } from '@/lib/constants';
import { normalizedStatus, toDateInputValue } from '@/utils/formatters';

const STATUS_COLOR = {
  [STATUS.PASS]: 'success.main',
  [STATUS.FAIL]: 'error.main',
  [STATUS.PENDING]: 'warning.main',
};

const INPUT_FONT = { fontSize: 'inherit', fontFamily: 'inherit' };

/**
 * Inline-editable test case table row.
 * @see {@link components/__tests__/TestCaseRow.test.jsx}
 */
export default function TestCaseRow({
  tc,
  rowNum,
  saving,
  onSave,
  onEdit,
  selected,
  onToggle,
  qaUsers,
}) {
  const [local, setLocal] = useState(tc);
  useEffect(() => {
    setLocal(tc);
  }, [tc]);

  function handleChange(field, value) {
    setLocal((prev) => ({ ...prev, [field]: value }));
    onSave(tc._id, field, value);
  }

  const st = normalizedStatus(local.status);

  return (
    <TableRow
      selected={selected}
      sx={{ opacity: saving ? 0.7 : 1, transition: 'opacity 200ms' }}
    >
      {/* Checkbox */}
      <TableCell sx={{ width: 36, textAlign: 'center', p: '4px 6px' }}>
        <Checkbox checked={selected} onChange={onToggle} size='small' />
      </TableCell>

      {/* Row number */}
      <TableCell
        sx={{
          width: 40,
          textAlign: 'center',
          color: 'text.disabled',
          userSelect: 'none',
        }}
      >
        {rowNum}
      </TableCell>

      {/* Application name */}
      <TableCell sx={{ color: 'text.secondary', minWidth: 110 }}>
        {tc.applicationName}
      </TableCell>

      {/* Module name */}
      <TableCell sx={{ minWidth: 110 }}>{tc.moduleName}</TableCell>

      {/* Priority */}
      <TableCell sx={{ minWidth: 90 }}>
        <Select
          variant='standard'
          size='small'
          value={local.priority || ''}
          onChange={(e) => handleChange('priority', e.target.value)}
          sx={{ minWidth: 85, ...INPUT_FONT }}
          slotProps={{ htmlInput: { 'data-testid': 'priority-select' } }}
        >
          <MenuItem value=''>—</MenuItem>
          <MenuItem value={PRIORITIES.HIGH}>High</MenuItem>
          <MenuItem value={PRIORITIES.MEDIUM}>Medium</MenuItem>
          <MenuItem value={PRIORITIES.LOW}>Low</MenuItem>
        </Select>
      </TableCell>

      {/* Type */}
      <TableCell>{tc.type}</TableCell>

      {/* Jira story */}
      <TableCell sx={{ minWidth: 110 }}>
        <TextField
          variant='standard'
          size='small'
          sx={{ minWidth: 100 }}
          slotProps={{ input: { sx: INPUT_FONT } }}
          value={local.jiraStory || ''}
          onChange={(e) =>
            setLocal((prev) => ({ ...prev, jiraStory: e.target.value }))
          }
          onBlur={(e) => {
            if (e.target.value !== tc.jiraStory)
              handleChange('jiraStory', e.target.value);
          }}
          placeholder='JIRA-…'
        />
      </TableCell>

      {/* Traceability */}
      <TableCell>{tc.traceability}</TableCell>

      {/* Test case ID */}
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{tc.testCaseId}</TableCell>

      {/* Test case description */}
      <TableCell sx={{ minWidth: 180, maxWidth: 220 }}>{tc.testCase}</TableCell>

      {/* Preconditions */}
      <TableCell sx={{ minWidth: 160, maxWidth: 220 }}>
        <RichTextDisplay
          value={tc.preconditions}
          style={{ color: 'text.disabled' }}
        />
      </TableCell>

      {/* Steps */}
      <TableCell sx={{ minWidth: 160, maxWidth: 240 }}>
        <RichTextDisplay value={tc.steps} />
      </TableCell>

      {/* Expected result */}
      <TableCell sx={{ minWidth: 180, maxWidth: 240 }}>
        <RichTextDisplay value={tc.expectedResult} />
      </TableCell>

      {/* Notes */}
      <TableCell>
        <TextField
          variant='standard'
          size='small'
          sx={{ minWidth: 140 }}
          slotProps={{ input: { sx: INPUT_FONT } }}
          value={local.notes || ''}
          onChange={(e) =>
            setLocal((prev) => ({ ...prev, notes: e.target.value }))
          }
          onBlur={(e) => {
            if (e.target.value !== tc.notes)
              handleChange('notes', e.target.value);
          }}
        />
      </TableCell>

      {/* Status */}
      <TableCell>
        <Select
          variant='standard'
          size='small'
          value={normalizedStatus(local.status)}
          onChange={(e) => handleChange('status', e.target.value)}
          sx={{ minWidth: 85, color: STATUS_COLOR[st], ...INPUT_FONT }}
          slotProps={{ htmlInput: { 'data-testid': 'status-select' } }}
        >
          <MenuItem value={STATUS.PENDING}>Pending</MenuItem>
          <MenuItem value={STATUS.PASS}>Pass</MenuItem>
          <MenuItem value={STATUS.FAIL}>Fail</MenuItem>
        </Select>
      </TableCell>

      {/* Tested by */}
      <TableCell>
        <Select
          variant='standard'
          size='small'
          value={local.testedBy || ''}
          onChange={(e) => handleChange('testedBy', e.target.value)}
          sx={{ minWidth: 100, ...INPUT_FONT }}
        >
          <MenuItem value=''>—</MenuItem>
          {qaUsers.map((u) => (
            <MenuItem key={u} value={u}>
              {u}
            </MenuItem>
          ))}
        </Select>
      </TableCell>

      {/* Tested on */}
      <TableCell>
        <TextField
          variant='standard'
          size='small'
          type='date'
          value={toDateInputValue(local.testedOn)}
          onChange={(e) =>
            setLocal((prev) => ({ ...prev, testedOn: e.target.value }))
          }
          onBlur={(e) => {
            if (e.target.value !== toDateInputValue(tc.testedOn))
              handleChange('testedOn', e.target.value);
          }}
          sx={{ minWidth: 130 }}
          slotProps={{ input: { sx: INPUT_FONT } }}
        />
      </TableCell>

      {/* Edit button */}
      <TableCell sx={{ textAlign: 'center', p: '4px 8px' }}>
        <IconButton
          size='small'
          onClick={() => onEdit(tc)}
          aria-label='Edit test case'
        >
          <EditIcon fontSize='small' />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}
