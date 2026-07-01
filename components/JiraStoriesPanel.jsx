'use client';

import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';
import NotificationsIcon from '@mui/icons-material/Notifications';
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
  Tooltip,
  Typography,
} from '@mui/material';
import { useJiraStories } from '@/hooks/useJiraStories';

/**
 * Inline card variant of Jira story notifications for the /generate page.
 * Shows stale stories with a "Generate →" action that pre-fills the story form.
 */
export default function JiraStoriesPanel({ onSelectStory }) {
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
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
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

      <CardContent sx={{ flex: 1, overflow: 'hidden', pt: 1, px: 0 }}>
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
          <Stack sx={{ px: 2, py: 3, alignItems: 'center' }}>
            <Typography variant='body2' color='text.secondary'>
              No story updates
            </Typography>
          </Stack>
        ) : (
          <Stack
            sx={{ overflowY: 'auto', maxHeight: 340 }}
            divider={<Divider />}
          >
            {staleStories.map((s) => (
              <Stack
                key={s.storyKey}
                direction='row'
                spacing={1.5}
                sx={{ px: 2, py: 1.25, alignItems: 'flex-start' }}
              >
                <UpdateIcon
                  color='warning'
                  fontSize='small'
                  sx={{ mt: 0.25, flexShrink: 0 }}
                />
                <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant='body2' fontWeight={600}>
                    {s.storyKey}
                  </Typography>
                  {s.jiraSummary && (
                    <Typography variant='body2' color='text.secondary' noWrap>
                      {s.jiraSummary}
                    </Typography>
                  )}
                </Stack>
                <Tooltip title='Generate test cases from this story'>
                  <Button
                    size='small'
                    variant='outlined'
                    endIcon={<ArrowForwardIcon fontSize='small' />}
                    onClick={() => onSelectStory(s.storyKey)}
                    aria-label={`Generate test cases for ${s.storyKey}`}
                  >
                    Generate
                  </Button>
                </Tooltip>
                <IconButton
                  size='small'
                  aria-label={`Dismiss ${s.storyKey}`}
                  onClick={() => handleDismiss(s.storyKey)}
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
