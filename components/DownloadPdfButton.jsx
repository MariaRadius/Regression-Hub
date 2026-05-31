'use client';

import DownloadIcon from '@mui/icons-material/Download';
import Button from '@mui/material/Button';
import { useDownloadTestRunReport } from '@/hooks/useDownloadTestRunReport';

/**
 * @param {object} props
 * @param {{ _id: string, softwareVersion: string, uploadedFileName: string, testEnvironment: string, createdAt: string }} props.run
 * @see {@link __tests__/components/DownloadPdfButton.test.jsx}
 */
export default function DownloadPdfButton({ run }) {
  const { download, downloading } = useDownloadTestRunReport({
    runId: run._id,
    softwareVersion: run.softwareVersion,
    uploadedFileName: run.uploadedFileName,
    testEnvironment: run.testEnvironment,
    createdAt: run.createdAt,
  });

  return (
    <Button
      variant='outlined'
      size='small'
      loading={downloading}
      loadingPosition='start'
      startIcon={<DownloadIcon />}
      onClick={download}
      sx={{ whiteSpace: 'nowrap' }}
    >
      Download PDF
    </Button>
  );
}
