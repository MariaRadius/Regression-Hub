'use client';

import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
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

/**
 * Inline card variant of Jira story notifications for the /generate page.
 *
 * Purely presentational — all data and handlers come from props.
 * GenerateClient owns useJiraStories() and passes values down.
 *
 * Two sections:
 *   - Discarded stories (amber) — status changed to deferred/grooming/etc
 *     or removed from sprint. User reviews and archives linked test cases.
 *   - Stale stories (blue) — content changed, needs AI impact analysis.
 */
export default function JiraStoriesPanel({
  staleStories,
  discardedStories,
  checking,
  jiraError,
  onCheckNow,
  onSelectStory,
  onAnalyzeImpact,
  onDismiss,
  onDismissAll,
  onReviewDiscard,
}) {
  const discardedKeys = new Set(
    (discardedStories ?? []).map((s) => s.storyKey),
  );
  // A story that is discarded belongs only in the discarded section — exclude
  // it from the stale section so the user doesn't see both actions at once.
  const filteredStaleStories = (staleStories ?? []).filter(
    (s) => !discardedKeys.has(s.storyKey),
  );
  const staleCount = filteredStaleStories.length;
  const discardedCount = discardedStories?.length ?? 0;
  const count = staleCount + discardedCount;

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
            <Button size='small' onClick={onCheckNow} disabled={checking}>
              {checking ? 'Checking…' : 'Check now'}
            </Button>
            {staleCount > 0 && (
              <Button size='small' onClick={onDismissAll}>
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
          <Stack sx={{ overflowY: 'auto' }}>
            {/* Discarded stories section */}
            {discardedCount > 0 && (
              <>
                <Stack
                  direction='row'
                  spacing={0.75}
                  sx={{ px: 2, pt: 1.25, pb: 0.5, alignItems: 'center' }}
                >
                  <BlockOutlinedIcon
                    sx={{ fontSize: 14, color: 'warning.main' }}
                  />
                  <Typography
                    variant='caption'
                    fontWeight={600}
                    color='warning.main'
                  >
                    Discarded
                  </Typography>
                </Stack>
                <Stack divider={<Divider />}>
                  {discardedStories.map((s) => (
                    <Stack
                      key={s.storyKey}
                      direction='row'
                      spacing={1.5}
                      sx={{
                        px: 2,
                        py: 1.25,
                        alignItems: 'flex-start',
                        borderLeft: 3,
                        borderColor: 'warning.main',
                        transition: 'background-color 120ms ease',
                        '&:hover': { bgcolor: 'rgba(245,158,11,0.05)' },
                      }}
                    >
                      <BlockOutlinedIcon
                        sx={{
                          mt: 0.25,
                          flexShrink: 0,
                          color: 'warning.main',
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
                            border: '1px solid #d97706',
                            bgcolor: '#fff8e6',
                            color: '#b45309',
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
                          <Typography
                            variant='body2'
                            color='text.secondary'
                            noWrap
                          >
                            {s.jiraSummary}
                          </Typography>
                        )}
                        {s.jiraStatus && (
                          <Typography variant='caption' color='warning.main'>
                            Status: {s.jiraStatus}
                          </Typography>
                        )}
                      </Stack>
                      {onReviewDiscard && (
                        <IconButton
                          size='small'
                          aria-label={`Review discarded test cases for ${s.storyKey}`}
                          onClick={() =>
                            onReviewDiscard(
                              s.storyKey,
                              s.jiraSummary,
                              s.jiraStatus,
                            )
                          }
                        >
                          <DeleteSweepIcon fontSize='small' color='warning' />
                        </IconButton>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </>
            )}

            {/* Divider between sections */}
            {discardedCount > 0 && staleCount > 0 && <Divider />}

            {/* Stale (content-changed) stories section */}
            {staleCount > 0 && (
              <>
                {discardedCount > 0 && (
                  <Stack
                    direction='row'
                    spacing={0.75}
                    sx={{ px: 2, pt: 1.25, pb: 0.5, alignItems: 'center' }}
                  >
                    <UpdateIcon sx={{ fontSize: 14, color: '#1d4ed8' }} />
                    <Typography
                      variant='caption'
                      fontWeight={600}
                      color='#1d4ed8'
                    >
                      Changed
                    </Typography>
                  </Stack>
                )}
                <Stack divider={<Divider />}>
                  {filteredStaleStories.map((s) => (
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
                          <Typography
                            variant='body2'
                            color='text.secondary'
                            noWrap
                          >
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
                          onDismiss(s.storyKey);
                        }}
                      >
                        <CloseIcon fontSize='small' />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
