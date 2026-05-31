'use client';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RichTextDisplay from '@/components/RichTextDisplay';
import { STATUS } from '@/lib/constants';
import { formatTcId, normalizedStatus } from '@/utils/formatters';

function SectionLabel({ children }) {
  return (
    <Typography
      variant='formLabel'
      color='text.secondary'
      sx={{ lineHeight: 1, mb: 1.5, display: 'block' }}
    >
      {children}
    </Typography>
  );
}

function RichField({ label, value }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant='formLabel' color='text.disabled'>
        {label}
      </Typography>
      <Box
        sx={{
          borderLeft: '3px solid',
          borderColor: 'divider',
          pl: 1.5,
          py: 0.5,
          minHeight: 32,
        }}
      >
        {value ? (
          <RichTextDisplay value={value} />
        ) : (
          <Typography
            variant='tableCell'
            color='text.disabled'
            sx={{ fontStyle: 'italic' }}
          >
            —
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

function ReadField({ label, value, mono }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant='formLabel' color='text.disabled'>
        {label}
      </Typography>
      <Typography variant={mono ? 'mono' : 'tableCell'}>
        {value || '—'}
      </Typography>
    </Stack>
  );
}

/**
 * Detail panel: read-only sectioned view of a selected test case.
 * All edits go through modals — identity fields via the Edit modal (onEdit),
 * execution fields via the Pass / Fail / Pending modals (onAction).
 */
export default function TestCaseDetail({ tc, onEdit, onAction, onClose }) {
  if (!tc) return null;

  const st = normalizedStatus(tc.status);

  return (
    <Stack
      spacing={2}
      sx={{
        p: { xs: 2, sm: 3 },
      }}
    >
      {/* Header */}
      <Stack spacing={1}>
        <Stack
          direction='row'
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant='mono' color='text.disabled'>
            {formatTcId(tc)}
          </Typography>
          {tc.moduleName && (
            <>
              <Typography variant='tableCell' color='text.disabled'>
                ·
              </Typography>
              <Typography variant='tableCell' color='text.secondary'>
                {tc.applicationName}
              </Typography>
              <Typography variant='tableCell' color='text.disabled'>
                /
              </Typography>
              <Typography variant='tableCell' color='text.secondary'>
                {tc.moduleName}
              </Typography>
            </>
          )}
        </Stack>
        <Stack
          direction='row'
          spacing={1}
          sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
        >
          <Typography variant='panelTitle' component='h2' sx={{ flex: 1 }}>
            {tc.testCase || '—'}
          </Typography>
          <IconButton size='small' onClick={() => onEdit(tc)}>
            <EditIcon />
          </IconButton>
          <IconButton
            size='small'
            onClick={onClose}
            aria-label='Close detail panel'
          >
            <CloseIcon fontSize='small' />
          </IconButton>
        </Stack>
      </Stack>

      {/* Execution Action Buttons */}
      <Stack id='execution-action-buttons' direction='row' spacing={1}>
        <Tooltip
          title={
            st === STATUS.PASS
              ? 'Already marked as Pass — select a different status to change it'
              : ''
          }
        >
          <Button
            size='small'
            variant={st === STATUS.PASS ? 'contained' : 'outlined'}
            color='success'
            startIcon={
              st === STATUS.PASS ? (
                <CheckCircleIcon />
              ) : (
                <CheckCircleOutlinedIcon />
              )
            }
            onClick={
              st === STATUS.PASS ? undefined : () => onAction('pass', tc._id)
            }
          >
            Pass
          </Button>
        </Tooltip>
        <Tooltip
          title={
            st === STATUS.FAIL
              ? 'Already marked as Fail — select a different status to change it'
              : ''
          }
        >
          <Button
            size='small'
            variant={st === STATUS.FAIL ? 'contained' : 'outlined'}
            color='error'
            startIcon={
              st === STATUS.FAIL ? <CheckCircleIcon /> : <HighlightOffIcon />
            }
            onClick={
              st === STATUS.FAIL ? undefined : () => onAction('fail', tc._id)
            }
          >
            Fail
          </Button>
        </Tooltip>
        <Tooltip
          title={
            st === STATUS.PENDING
              ? 'Already marked as Pending — select a different status to change it'
              : ''
          }
        >
          <Button
            size='small'
            variant={st === STATUS.PENDING ? 'contained' : 'outlined'}
            color='warning'
            startIcon={
              st === STATUS.PENDING ? (
                <CheckCircleIcon />
              ) : (
                <RadioButtonUncheckedIcon />
              )
            }
            onClick={
              st === STATUS.PENDING
                ? undefined
                : () => onAction('pending', tc._id)
            }
          >
            Pending
          </Button>
        </Tooltip>
      </Stack>

      <Divider />

      {/* Card 1 — Test Content */}
      <Card variant='outlined'>
        <CardContent>
          <SectionLabel>Test Content</SectionLabel>
          <Stack spacing={2}>
            <RichField label='Description' value={tc.testCase} />
            <RichField label='Preconditions' value={tc.preconditions} />
            <RichField label='Steps' value={tc.steps} />
            <RichField label='Expected Result' value={tc.expectedResult} />
          </Stack>
        </CardContent>
      </Card>

      {/* Card 2 — Test Identity */}
      <Card variant='outlined'>
        <CardContent>
          <SectionLabel>Test Identity</SectionLabel>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Test Case ID' value={formatTcId(tc)} mono />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Type' value={tc.type} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Application' value={tc.applicationName} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Module' value={tc.moduleName} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Traceability' value={tc.traceability} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Priority' value={tc.priority} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Jira Story' value={tc.jiraStory} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Card 3 — Test Execution */}
      <Card variant='outlined'>
        <CardContent>
          <SectionLabel>Test Execution</SectionLabel>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Status' value={st} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Assigned To' value={tc.assignedTo} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField label='Tested By' value={tc.testedBy} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField
                label='Tested On'
                value={
                  tc.testedOn
                    ? new Date(tc.testedOn).toLocaleDateString()
                    : null
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <ReadField
                label='Software Version Tested'
                value={tc.softwareVersionTested}
              />
            </Grid>
            <Grid size={12}>
              <RichField label='Notes' value={tc.notes} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Stack>
  );
}
