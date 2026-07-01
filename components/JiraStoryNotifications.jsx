'use client';

import CloseIcon from '@mui/icons-material/Close';
import NotificationsIcon from '@mui/icons-material/Notifications';
import UpdateIcon from '@mui/icons-material/Update';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Badge,
  Button,
  Divider,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useJiraStories } from '@/hooks/useJiraStories';

/**
 * Notification bell for Jira story updates. Placed in the test cases page
 * header — shows a badge count of stories updated in Jira since the team
 * last reviewed them. Clicking opens a popover with per-story actions.
 */
export default function JiraStoryNotifications({ onViewCases }) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState(null);
  const {
    staleStories,
    checking,
    jiraError,
    handleCheckNow,
    handleDismiss,
    handleDismissAll,
  } = useJiraStories();

  const open = Boolean(anchorEl);
  const count = staleStories.length;

  const handleViewCases = useCallback(
    (storyKey) => {
      setAnchorEl(null);
      if (onViewCases) {
        onViewCases(storyKey);
      } else {
        router.push(`?jiraStory=${encodeURIComponent(storyKey)}`);
      }
    },
    [onViewCases, router],
  );

  return (
    <>
      <Tooltip title='Jira story updates'>
        <IconButton
          aria-label='Jira story updates'
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <Badge badgeContent={count || null} color='warning' max={99}>
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { sx: { width: 400, maxHeight: 480, overflow: 'hidden' } },
        }}
      >
        <Stack
          direction='row'
          spacing={1}
          sx={{
            px: 2,
            py: 1.5,
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant='subtitle2' sx={{ flex: 1 }}>
            Jira Story Updates
          </Typography>
          <Button size='small' onClick={handleCheckNow} disabled={checking}>
            {checking ? 'Checking…' : 'Check now'}
          </Button>
          {count > 0 && (
            <Button size='small' onClick={handleDismissAll}>
              Dismiss all
            </Button>
          )}
        </Stack>

        {jiraError && (
          <Stack
            direction='row'
            spacing={1}
            sx={{
              px: 2,
              py: 1.5,
              alignItems: 'flex-start',
              bgcolor: 'error.50',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <WarningAmberIcon
              color='warning'
              fontSize='small'
              sx={{ mt: 0.25, flexShrink: 0 }}
            />
            <Typography variant='caption' color='warning.dark'>
              Jira sync failed: {jiraError}
            </Typography>
          </Stack>
        )}

        {count === 0 ? (
          <Stack sx={{ px: 2, py: 3, alignItems: 'center' }}>
            <Typography variant='body2' color='text.secondary'>
              No story updates
            </Typography>
          </Stack>
        ) : (
          <Stack
            sx={{ overflowY: 'auto', maxHeight: 420 }}
            divider={<Divider />}
          >
            {staleStories.map((s) => (
              <Stack
                key={s.storyKey}
                direction='row'
                spacing={1.5}
                sx={{ px: 2, py: 1.5, alignItems: 'flex-start' }}
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
                  <Typography variant='caption' color='text.secondary'>
                    Updated in Jira — test cases may need updating
                  </Typography>
                  <Button
                    size='small'
                    variant='text'
                    sx={{ p: 0, alignSelf: 'flex-start', mt: 0.5 }}
                    onClick={() => handleViewCases(s.storyKey)}
                  >
                    View test cases
                  </Button>
                </Stack>
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
      </Popover>
    </>
  );
}
