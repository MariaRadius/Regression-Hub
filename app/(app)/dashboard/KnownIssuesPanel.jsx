'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import EmptyState from '@/components/EmptyState';

const ALL_ENVS = 'ALL';

/**
 * Known Issues for the active release, broken down by environment. Scoped to the
 * release (NOT the active environment): an in-panel filter (default "All
 * environments") narrows the visible environments. Each environment that holds a
 * known issue is clickable and expands an inline list of the cases.
 *
 * @param {object} props
 * @param {import('@/lib/db/knownIssuesData').ReleaseKnownIssues} props.data
 * @param {string|null} [props.jiraBaseUrl] - when set, Jira keys link to `/browse/<key>`
 * @see {@link app/(app)/dashboard/__tests__/KnownIssuesPanel.test.jsx}
 */
export default function KnownIssuesPanel({ data, jiraBaseUrl }) {
  const [envFilter, setEnvFilter] = useState(ALL_ENVS);
  const [expandedEnv, setExpandedEnv] = useState(null);
  const { total, environments, cells, releaseName } = data;

  if (!total) {
    return (
      <EmptyState
        icon={
          <TaskAltOutlinedIcon sx={{ fontSize: 30, color: 'success.main' }} />
        }
        title='No known issues'
      >
        <Typography
          variant='pageSub'
          color='text.disabled'
          sx={{ textAlign: 'center', maxWidth: 320 }}
        >
          No test case has been reclassified as a Known Issue in{' '}
          {releaseName ? `release ${releaseName}` : 'this release'} for any
          environment.
        </Typography>
      </EmptyState>
    );
  }

  const visibleEnvs =
    envFilter === ALL_ENVS
      ? environments
      : environments.filter((env) => env === envFilter);
  const visibleTotal = visibleEnvs.reduce(
    (sum, env) => sum + (cells[env]?.count ?? 0),
    0,
  );

  return (
    <Stack spacing={1.5}>
      <Stack
        direction='row'
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <TextField
          select
          size='small'
          label='Environment'
          value={envFilter}
          onChange={(e) => {
            setEnvFilter(e.target.value);
            setExpandedEnv(null);
          }}
          sx={{ width: 180 }}
        >
          <MenuItem value={ALL_ENVS}>All environments</MenuItem>
          {environments.map((env) => (
            <MenuItem key={env} value={env}>
              {env}
            </MenuItem>
          ))}
        </TextField>

        <Typography variant='caption' color='text.secondary'>
          {visibleTotal} known {visibleTotal === 1 ? 'issue' : 'issues'}
        </Typography>
      </Stack>

      <Box>
        {visibleEnvs.map((env, i) => {
          const cell = cells[env] ?? { count: 0, cases: [] };
          const hasIssues = cell.count > 0;
          const isExpanded = expandedEnv === env;

          return (
            <Box
              key={env}
              sx={{
                borderTop: i > 0 ? '1px solid' : 0,
                borderColor: 'divider',
              }}
            >
              <Stack
                component={hasIssues ? 'button' : 'div'}
                direction='row'
                sx={{
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 0.75,
                  px: 0.5,
                  border: 0,
                  m: 0,
                  font: 'inherit',
                  color: 'inherit',
                  textAlign: 'left',
                  backgroundColor: 'transparent',
                  cursor: hasIssues ? 'pointer' : 'default',
                  borderRadius: 1,
                  ...(hasIssues && { '&:hover': { bgcolor: 'action.hover' } }),
                }}
                aria-label={
                  hasIssues ? `${env}: ${cell.count} known issues` : undefined
                }
                aria-expanded={hasIssues ? isExpanded : undefined}
                onClick={
                  hasIssues
                    ? () => setExpandedEnv(isExpanded ? null : env)
                    : undefined
                }
              >
                <Typography variant='body2'>{env}</Typography>
                <Stack
                  direction='row'
                  spacing={0.5}
                  sx={{ alignItems: 'center' }}
                >
                  <Typography
                    variant='body2'
                    sx={{
                      fontWeight: hasIssues ? 700 : 400,
                      color: hasIssues ? 'warning.main' : 'text.disabled',
                      minWidth: 16,
                      textAlign: 'right',
                    }}
                  >
                    {cell.count}
                  </Typography>
                  {hasIssues && (
                    <ExpandMoreIcon
                      sx={{
                        fontSize: 18,
                        color: 'text.disabled',
                        transform: isExpanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  )}
                </Stack>
              </Stack>

              {hasIssues && (
                <Collapse in={isExpanded} unmountOnExit>
                  <Stack
                    spacing={0.5}
                    sx={{ pl: 1.5, pr: 0.5, pb: 1, pt: 0.25 }}
                  >
                    {cell.cases.map((c) => (
                      <Stack
                        key={c.tcId}
                        direction='row'
                        spacing={1}
                        sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
                      >
                        <Typography variant='caption' sx={{ fontWeight: 700 }}>
                          {c.testKey}
                        </Typography>
                        <Typography variant='caption' color='text.secondary'>
                          {c.testCaseName}
                        </Typography>
                        {c.jiraKeys.map((key) =>
                          jiraBaseUrl ? (
                            <Link
                              key={key}
                              variant='caption'
                              href={`${jiraBaseUrl}/browse/${key}`}
                              target='_blank'
                              rel='noopener noreferrer'
                              underline='hover'
                            >
                              {key}
                            </Link>
                          ) : (
                            <Typography
                              key={key}
                              component='span'
                              variant='caption'
                              color='text.disabled'
                            >
                              {key}
                            </Typography>
                          ),
                        )}
                      </Stack>
                    ))}
                  </Stack>
                </Collapse>
              )}
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}
