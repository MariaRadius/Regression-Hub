'use client';

import UploadExcel from '@/components/UploadExcel';
import ToastProvider from '@/components/Toast';
import PageHeader from '@/components/PageHeader';

/** @see {@link __tests__/ImportCasesClient.test.jsx} */
export default function ImportCasesClient({ user }) {
  return (
    <div>
      <ToastProvider />
      <PageHeader
        eyebrow='QA Regression Control Center'
        title='Import Test Cases'
        sub='Upload an Excel workbook to create or update test cases'
      />
      <div className='panel'>
        <div className='panel-body'>
          <UploadExcel />
        </div>
      </div>
    </div>
  );
}
