'use client';

import Stack from '@mui/material/Stack';
import PageHeader from '@/components/PageHeader';
import ToastProvider from '@/components/Toast';
import UploadExcel from '@/components/UploadExcel';

/** @see {@link __tests__/ImportCasesClient.test.jsx} */
export default function ImportCasesClient({ initialEnv, initialVersion }) {
  return (
    <Stack>
      <ToastProvider />
      <PageHeader
        eyebrow='QA Regression Control Center'
        title='Import Test Cases'
        sub='Upload an Excel workbook to create or update test cases'
      />
      <UploadExcel initialEnv={initialEnv} initialVersion={initialVersion} />
    </Stack>
  );
}
