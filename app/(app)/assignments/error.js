'use client';

export default function AssignmentsError({ error, reset }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Failed to load assignments</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 20, fontSize: 14 }}>
        {error?.message || 'Something went wrong. Try refreshing the page.'}
      </p>
      <button className='btn btn-primary' onClick={reset}>Try again</button>
    </div>
  );
}
