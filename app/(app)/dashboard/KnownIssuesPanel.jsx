'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import EmptyState from '@/components/EmptyState';

const ALL_ENVS = 'ALL';

/**
 * Known Issues for the active release, broken down by environment. Scoped to the
 * release (NOT the active environment): a tab filter (default "All") narrows the
 * visible environments; picking a single environment reveals its cases directly.
 * Each environment that holds a known issue is clickable and expands an inline
 * list of the cases.
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

  const handleFilterChange = (_e, value) => {
    setEnvFilter(value);
    // Picking a specific env reveals its cases immediately; "All" collapses.
    setExpandedEnv(value === ALL_ENVS ? null : value);
  };

  return (
    <Stack spacing={1.5}>
      <Stack
        direction='row'
        spacing={2}
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Tabs
          value={envFilter}
          onChange={handleFilterChange}
          variant='scrollable'
          scrollButtons='auto'
          sx={{
            minHeight: 36,
            '& .MuiTab-root': {
              minHeight: 36,
              minWidth: 'auto',
              px: 1.5,
              textTransform: 'none',
              fontSize: 13,
            },
          }}
        >
          <Tab value={ALL_ENVS} label='All' />
          {environments.map((env) => (
            <Tab key={env} value={env} label={env} />
          ))}
        </Tabs>

        <Typography
          variant='caption'
          color='text.secondary'
          sx={{ flexShrink: 0, pb: 0.5 }}
        >
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
                type={hasIssues ? 'button' : undefined}
                direction='row'
                sx={{
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 0.75,
                  px: 0.75,
                  border: 0,
                  m: 0,
                  font: 'inherit',
                  color: 'inherit',
                  textAlign: 'left',
                  backgroundColor: 'transparent',
                  cursor: hasIssues ? 'pointer' : 'default',
                  borderRadius: 1,
                  transition: 'background-color 0.15s ease',
                  ...(hasIssues && {
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: -2,
                    },
                  }),
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
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{ alignItems: 'center', minWidth: 0 }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      flexShrink: 0,
                      backgroundColor: hasIssues ? 'warning.main' : 'grey.300',
                    }}
                  />
                  <Typography variant='body2' noWrap>
                    {env}
                  </Typography>
                </Stack>
                <Stack
                  direction='row'
                  spacing={0.5}
                  sx={{ alignItems: 'center', flexShrink: 0 }}
                >
                  <Typography
                    variant='body2'
                    sx={{
                      fontWeight: hasIssues ? 700 : 400,
                      color: hasIssues ? 'warning.main' : 'text.disabled',
                      fontVariantNumeric: 'tabular-nums',
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
                    spacing={0.75}
                    sx={{
                      ml: 1.75,
                      pl: 1.5,
                      pr: 0.5,
                      pb: 1.25,
                      pt: 0.25,
                      borderLeft: '2px solid',
                      borderColor: 'warning.light',
                    }}
                  >
                    {cell.cases.map((c) => (
                      <Stack
                        key={c.tcId}
                        direction='row'
                        spacing={1}
                        sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
                      >
                        <Typography
                          variant='caption'
                          sx={{ fontWeight: 700, flexShrink: 0 }}
                        >
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
                              sx={{ fontWeight: 600 }}
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
