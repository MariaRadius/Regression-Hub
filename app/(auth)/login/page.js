import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }) {
  const redirectTo = searchParams?.redirectTo;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '48px 40px',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #0d9488, #0f172a)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 20,
              marginBottom: 16,
            }}
          >
            QA
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            Regression Hub
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#64748b' }}>
            Sign in to your team account
          </p>
        </div>

        <LoginForm redirectTo={redirectTo} />

        <p
          style={{
            textAlign: 'center',
            marginTop: 24,
            fontSize: 12,
            color: '#94a3b8',
          }}
        >
          Contact your admin if you need access.
        </p>
      </div>
    </div>
  );
}
