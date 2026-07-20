'use client';

import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CloseIcon from '@mui/icons-material/Close';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import UpdateIcon from '@mui/icons-material/Update';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { useJiraStories } from '@/hooks/useJiraStories';

/**
 * Inline card variant of Jira story notifications for the /generate page.
 * Shows stale stories with a "Generate →" action that pre-fills the story form.
 */
export default function JiraStoriesPanel({ onSelectStory, onAnalyzeImpact }) {
  const {
    staleStories,
    checking,
    jiraError,
    handleCheckNow,
    handleDismiss,
    handleDismissAll,
  } = useJiraStories();

  const count = staleStories.length;

  return (
    <Card
      variant='outlined'
      sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <CardHeader
        avatar={
          <Badge badgeContent={count || null} color='warning' max={99}>
            <NotificationsIcon color='action' />
          </Badge>
        }
        title='Jira Stories'
        slotProps={{ title: { variant: 'subtitle2' } }}
        action={
          <Stack direction='row' spacing={0.5}>
            <Button size='small' onClick={handleCheckNow} disabled={checking}>
              {checking ? 'Checking…' : 'Check now'}
            </Button>
            {count > 0 && (
              <Button size='small' onClick={handleDismissAll}>
                Dismiss all
              </Button>
            )}
          </Stack>
        }
        sx={{ pb: 0 }}
      />

      <CardContent
        sx={{
          flex: 1,
          overflow: 'hidden',
          pt: 1,
          px: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {jiraError && (
          <Alert
            severity='warning'
            icon={<WarningAmberIcon fontSize='small' />}
            sx={{ mx: 2, mb: 1 }}
          >
            Jira sync failed: {jiraError}
          </Alert>
        )}

        {count === 0 ? (
          <Stack
            spacing={1}
            sx={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              py: 4,
            }}
          >
            <NotificationsNoneIcon
              sx={{ fontSize: 40, color: 'text.disabled' }}
            />
            <Typography variant='subtitle2' fontWeight={600}>
              All stories up to date
            </Typography>
            <Typography
              variant='body2'
              color='text.secondary'
              sx={{ px: 3, textAlign: 'center' }}
            >
              No Jira stories have changed since the last check.
            </Typography>
          </Stack>
        ) : (
          <Stack sx={{ overflowY: 'auto' }} divider={<Divider />}>
            {staleStories.map((s) => (
              <Stack
                key={s.storyKey}
                direction='row'
                spacing={1.5}
                onClick={() => onSelectStory(s.storyKey)}
                role='button'
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === 'Enter' && onSelectStory(s.storyKey)
                }
                aria-label={`Select ${s.storyKey}`}
                sx={{
                  px: 2,
                  py: 1.25,
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  borderLeft: 3,
                  borderColor: 'rgba(29,78,216,0.3)',
                  transition: 'background-color 120ms ease',
                  '&:hover': { bgcolor: 'rgba(29,78,216,0.05)' },
                }}
              >
                <UpdateIcon
                  sx={{
                    mt: 0.25,
                    flexShrink: 0,
                    color: '#1d4ed8',
                    fontSize: 18,
                  }}
                />
                <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    component='span'
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      px: 0.875,
                      py: 0.2,
                      borderRadius: '5px',
                      border: '1px solid #93c5fd',
                      bgcolor: '#eff6ff',
                      color: '#1d4ed8',
                      fontFamily:
                        '"JetBrains Mono","Fira Code","IBM Plex Mono",monospace',
                      fontSize: '0.695rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      lineHeight: 1.5,
                      alignSelf: 'flex-start',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.storyKey}
                  </Typography>
                  {s.jiraSummary && (
                    <Typography variant='body2' color='text.secondary' noWrap>
                      {s.jiraSummary}
                    </Typography>
                  )}
                </Stack>
                {onAnalyzeImpact && (
                  <IconButton
                    size='small'
                    aria-label={`Analyze impact of ${s.storyKey}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnalyzeImpact(s.storyKey, s.jiraSummary);
                    }}
                  >
                    <AutoFixHighIcon fontSize='small' color='primary' />
                  </IconButton>
                )}
                <IconButton
                  size='small'
                  aria-label={`Dismiss ${s.storyKey}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismiss(s.storyKey);
                  }}
                >
                  <CloseIcon fontSize='small' />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
