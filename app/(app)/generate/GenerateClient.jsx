'use client';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Button,
  Chip,
  Grid,
  InputAdornment,
  MenuItem,
  Pagination,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import AITestCaseSlidesDialog from '@/components/AITestCaseSlidesDialog';
import GenerateStoryForm from '@/components/GenerateStoryForm';
import JiraStoriesPanel from '@/components/JiraStoriesPanel';
import PageHeader from '@/components/PageHeader';
import { useReleaseEnv } from '@/contexts/ReleaseEnvContext';
import { getGeneratedTestCases } from '@/lib/api/testCases';

const PAGE_SIZE = 20;

export default function GenerateClient({
  aiConfigured,
  applications: initialApplications,
  modules: initialModules,
  initialCases,
  initialTotal,
}) {
  const { releaseId } = useReleaseEnv();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingStories, setPendingStories] = useState(null);
  const [selectedStoryKey, setSelectedStoryKey] = useState('');

  const [applications, setApplications] = useState(initialApplications);
  const [modules, setModules] = useState(initialModules);

  const [cases, setCases] = useState(initialCases);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchCases = useCallback(
    async (opts = {}) => {
      setLoading(true);
      try {
        const result = await getGeneratedTestCases({
          page: opts.page ?? page,
          pageSize: PAGE_SIZE,
          search: opts.search ?? search,
          appId: opts.appId ?? appFilter,
        });
        setCases(result.cases ?? []);
        setTotal(result.total ?? 0);
      } finally {
        setLoading(false);
      }
    },
    [page, search, appFilter],
  );

  const handleSelectStory = useCallback((key) => {
    setSelectedStoryKey(key);
  }, []);

  const handleGenerate = useCallback((combinations) => {
    setPendingStories(combinations);
    setDialogOpen(true);
  }, []);

  const handleGenerationSuccess = useCallback(
    (count) => {
      setDialogOpen(false);
      setPendingStories(null);
      setSelectedStoryKey('');
      if (count > 0) {
        setPage(1);
        fetchCases({ page: 1 });
      }
    },
    [fetchCases],
  );

  const handleApplicationCreated = useCallback((app) => {
    setApplications((prev) => [...prev, app]);
  }, []);

  const handleModuleCreated = useCallback((mod) => {
    setModules((prev) => [...prev, mod]);
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader eyebrow='GENERATE' title='Generate Test Cases' />

      {!releaseId && (
        <Alert severity='warning'>
          Select a release from the top bar to enable generation.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={6}>
          <JiraStoriesPanel onSelectStory={handleSelectStory} />
        </Grid>
        <Grid size={6}>
          <GenerateStoryForm
            applications={applications}
            modules={modules}
            onApplicationCreated={handleApplicationCreated}
            onModuleCreated={handleModuleCreated}
            initialStoryKey={selectedStoryKey}
            onGenerate={handleGenerate}
            aiConfigured={aiConfigured}
            releaseSelected={!!releaseId}
          />
        </Grid>
      </Grid>

      <Stack spacing={2}>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <AutoAwesomeIcon color='primary' fontSize='small' />
          <Typography variant='h6'>AI-Generated Cases</Typography>
          <Chip label={total} size='small' />
        </Stack>

        <Stack direction='row' spacing={2}>
          <TextField
            size='small'
            placeholder='Search by title or ID…'
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              fetchCases({ search: e.target.value, page: 1 });
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position='start'>
                    <SearchIcon fontSize='small' />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: 300 }}
          />
          <TextField
            select
            size='small'
            label='App'
            value={appFilter}
            onChange={(e) => {
              setAppFilter(e.target.value);
              setPage(1);
              fetchCases({ appId: e.target.value, page: 1 });
            }}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
            sx={{ width: 200 }}
          >
            <MenuItem value=''>All apps</MenuItem>
            {applications.map((a) => (
              <MenuItem key={a._id} value={a._id}>
                {a.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {loading ? (
          <Typography variant='body2' color='text.secondary'>
            Loading…
          </Typography>
        ) : cases.length === 0 ? (
          <Stack sx={{ py: 6, alignItems: 'center' }} spacing={1}>
            <AutoAwesomeIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography variant='h6'>No AI-generated cases yet</Typography>
            <Typography variant='body2' color='text.secondary'>
              Use &quot;Generate from Story&quot; above to create your first
              AI-generated test cases.
            </Typography>
            <Button variant='contained' component={Link} href='/test-cases'>
              View Test Cases
            </Button>
          </Stack>
        ) : (
          <Stack
            divider={<Stack sx={{ borderBottom: 1, borderColor: 'divider' }} />}
          >
            {cases.map((tc) => (
              <Stack
                key={tc._id}
                component={Link}
                href={`/test-cases?highlight=${tc._id}`}
                direction='row'
                spacing={2}
                sx={{
                  py: 1.5,
                  px: 1,
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Chip
                  label={tc.testKey || '—'}
                  size='small'
                  variant='outlined'
                />
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant='body2' noWrap>
                    {tc.testCase}
                  </Typography>
                  <Typography variant='caption' color='text.secondary'>
                    {tc.applicationName} / {tc.moduleName}
                    {tc.jiraStory && ` · ${tc.jiraStory}`}
                  </Typography>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}

        {totalPages > 1 && (
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, p) => {
              setPage(p);
              fetchCases({ page: p });
            }}
            size='small'
          />
        )}
      </Stack>

      <AITestCaseSlidesDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setPendingStories(null);
        }}
        onSuccess={handleGenerationSuccess}
        releaseId={releaseId}
        applications={applications}
        modules={modules}
        onApplicationCreated={handleApplicationCreated}
        onModuleCreated={handleModuleCreated}
        stories={pendingStories}
      />
    </Stack>
  );
}
