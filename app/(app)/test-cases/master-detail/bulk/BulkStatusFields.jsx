'use client';
import { Grid, MenuItem, TextField } from '@mui/material';

/**
 * Shared form fields used by BulkPassModal and BulkFailModal:
 * Tested By (select) and Tested On (date).
 *
 * @param {{ qaUsers: string[], testedBy: string, onTestedBy: Function, testedOn: string, onTestedOn: Function, disabled?: boolean }} props
 */
export default function BulkStatusFields({
  qaUsers,
  testedBy,
  onTestedBy,
  testedOn,
  onTestedOn,
  disabled = false,
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          select
          fullWidth
          size='small'
          label='Tested By'
          value={testedBy}
          onChange={(e) => onTestedBy(e.target.value)}
          disabled={disabled}
        >
          {qaUsers.map((u) => (
            <MenuItem key={u} value={u}>
              {u}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          type='date'
          fullWidth
          size='small'
          label='Tested On'
          value={testedOn}
          onChange={(e) => onTestedOn(e.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { max: today },
          }}
        />
      </Grid>
    </>
  );
}
