'use client';

import { useState, useRef } from 'react';

export default function UploadExcel({ onImported }) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [env, setEnv] = useState('QA');
  const [version, setVersion] = useState('');
  const fileRef = useRef();

  async function processFile(file) {
    if (!file?.name.toLowerCase().endsWith('.xlsx')) {
      setStatus({ type: 'error', message: 'Please upload a .xlsx file.' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'info', message: `Importing ${file.name}…` });
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('testEnvironment', env);
      form.append('softwareVersion', version);
      const res = await fetch('/api/import-excel', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      if (data.imported > 0) {
        setStatus({ type: 'success', message: `✓ Imported ${data.imported} new test cases. Skipped ${data.skipped} duplicates.` });
      } else {
        setStatus({ type: 'info', message: `No new rows — all ${data.skipped} were duplicates. Existing data preserved.` });
      }
      onImported?.();
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div
        className={`upload-zone ${dragging ? 'drag-over' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
      >
        <input ref={fileRef} type="file" accept=".xlsx" onChange={(e) => { processFile(e.target.files[0]); e.target.value = ''; }} />
        <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--accent)' }}>⊞</div>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
          {loading ? 'Importing…' : 'Drop .xlsx file or click to upload'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          Auto-detects headers · Deduplicates rows · Imports all sheets
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <div className="field-group">
          <label className="field-label">Test Environment</label>
          <input className="field-input" value={env} onChange={(e) => setEnv(e.target.value)} placeholder="QA" />
        </div>
        <div className="field-group">
          <label className="field-label">Software Version</label>
          <input className="field-input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 2.4.1" />
        </div>
      </div>

      {status && (
        <div className={`status-bar ${status.type}`} style={{ marginTop: 10, marginBottom: 0 }}>
          {status.message}
        </div>
      )}
    </div>
  );
}
