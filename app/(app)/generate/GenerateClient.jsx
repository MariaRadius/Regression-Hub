'use client';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Button,
  Chip,
  Divider,
  Grid,
  InputAdornment,
  MenuItem,
  Pagination,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import AITestCaseSlidesDialog from '@/components/AITestCaseSlidesDialog';
import GenerateStoryForm from '@/components/GenerateStoryForm';
import JiraImpactAnalysisDialog from '@/components/JiraImpactAnalysisDialog';
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
  const router = useRouter();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingStories, setPendingStories] = useState(null);
  const [selectedStoryKey, setSelectedStoryKey] = useState('');
  const [impactDialogOpen, setImpactDialogOpen] = useState(false);
  const [impactStoryKey, setImpactStoryKey] = useState('');
  const [impactStorySummary, setImpactStorySummary] = useState('');

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

  const handleAnalyzeImpact = useCallback((storyKey, jiraSummary) => {
    setImpactStoryKey(storyKey);
    setImpactStorySummary(jiraSummary ?? '');
    setImpactDialogOpen(true);
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

      <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
        <Grid size={6} sx={{ display: 'flex' }}>
          <JiraStoriesPanel
            onSelectStory={handleSelectStory}
            onAnalyzeImpact={handleAnalyzeImpact}
          />
        </Grid>
        <Grid size={6} sx={{ display: 'flex' }}>
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

      <Stack spacing={1.5}>
        <Stack
          direction='row'
          spacing={1.5}
          sx={{ alignItems: 'center', pb: 0.5 }}
        >
          <AutoAwesomeIcon color='primary' sx={{ fontSize: 18 }} />
          <Typography variant='subtitle1' fontWeight={600}>
            AI-Generated Cases
          </Typography>
          <Chip
            label={total}
            size='small'
            color='primary'
            variant='outlined'
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
          <Stack direction='row' spacing={1.5} sx={{ ml: 'auto' }}>
            <TextField
              size='small'
              placeholder='Search…'
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
                      <SearchIcon
                        sx={{ fontSize: 16, color: 'text.disabled' }}
                      />
                    </InputAdornment>
                  ),
                  sx: { fontSize: '0.8125rem' },
                },
              }}
              sx={{ width: 220 }}
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
                select: { displayEmpty: true, sx: { fontSize: '0.8125rem' } },
                inputLabel: { shrink: true },
              }}
              sx={{ width: 160 }}
            >
              <MenuItem value=''>All apps</MenuItem>
              {applications.map((a) => (
                <MenuItem key={a._id} value={a._id}>
                  {a.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Stack>

        {loading ? (
          <Typography variant='body2' color='text.secondary' sx={{ py: 2 }}>
            Loading…
          </Typography>
        ) : cases.length === 0 ? (
          <Stack sx={{ py: 6, alignItems: 'center' }} spacing={1}>
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
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              overflow: 'hidden',
            }}
            divider={<Divider />}
          >
            {cases.map((tc) => (
              <Stack
                key={tc._id}
                direction='row'
                spacing={2}
                onClick={() =>
                  router.push(
                    `/test-cases?testKey=${encodeURIComponent(tc.testKey || '')}&open=${tc._id}`,
                  )
                }
                role='button'
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  router.push(
                    `/test-cases?testKey=${encodeURIComponent(tc.testKey || '')}&open=${tc._id}`,
                  )
                }
                aria-label={`View ${tc.testKey || tc.testCase}`}
                sx={{
                  py: 1.25,
                  px: 2,
                  alignItems: 'center',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Chip
                  label={tc.testKey || '—'}
                  size='small'
                  color='primary'
                  variant='outlined'
                  sx={{
                    fontWeight: 600,
                    minWidth: 80,
                    justifyContent: 'center',
                  }}
                />
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant='body2' fontWeight={500} noWrap>
                    {tc.testCase}
                  </Typography>
                  <Stack
                    direction='row'
                    spacing={0.75}
                    sx={{ alignItems: 'center' }}
                  >
                    <Typography variant='caption' color='text.secondary' noWrap>
                      {tc.applicationName} / {tc.moduleName}
                    </Typography>
                    {tc.jiraStory && (
                      <>
                        <Typography variant='caption' color='text.disabled'>
                          ·
                        </Typography>
                        <Chip
                          label={tc.jiraStory}
                          size='small'
                          variant='outlined'
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            color: 'text.secondary',
                          }}
                        />
                      </>
                    )}
                  </Stack>
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

      <JiraImpactAnalysisDialog
        open={impactDialogOpen}
        storyKey={impactStoryKey}
        jiraSummary={impactStorySummary}
        onClose={() => setImpactDialogOpen(false)}
        onApplied={({ updated, deleted, added }) => {
          if (updated + deleted + added > 0) {
            setPage(1);
            fetchCases({ page: 1 });
          }
        }}
        applications={applications}
        modules={modules}
      />

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
