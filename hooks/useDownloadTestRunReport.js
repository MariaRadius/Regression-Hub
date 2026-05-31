'use client';

import { useState } from 'react';
import { showToast } from '@/components/Toast';
import { exportData } from '@/lib/api/exportData';
import { dateStamp } from '@/utils/formatters';
import { generateTestRunReport } from '@/utils/pdf/generateTestRunReport';

/**
 * Encapsulates PDF generation and download logic for a single test run.
 *
 * @param {{ runId: string, softwareVersion: string, uploadedFileName: string, testEnvironment: string, createdAt: string }} props
 * @returns {{ download: () => Promise<void>, downloading: boolean }}
 * @see {@link __tests__/components/DownloadPdfButton.test.jsx}
 */
export function useDownloadTestRunReport({
  runId,
  softwareVersion,
  uploadedFileName,
  testEnvironment,
  createdAt,
}) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const cases = await exportData({ testRunId: runId });
      if (!cases.length) {
        showToast('No test cases for this run', 'info');
        return;
      }

      const runData = {
        _id: runId,
        softwareVersion,
        uploadedFileName,
        testEnvironment,
        createdAt,
      };
      const doc = await generateTestRunReport({ run: runData, cases });
      doc.save(`report-v${softwareVersion || 'NA'}-${dateStamp()}.pdf`);
      showToast('Report downloaded', 'success');
    } catch (e) {
      console.error(e);
      showToast('Download failed — try again', 'error');
    } finally {
      setDownloading(false);
    }
  }

  return { download, downloading };
}
