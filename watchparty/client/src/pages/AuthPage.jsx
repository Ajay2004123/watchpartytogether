import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_API_URL;

export default function AuthPage() {
  const [mode,    setMode]    = useState('login');
  const [form,    setForm]    = useState({ username: '', email: '', password: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API}/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      login(data.user, data.token);
      navigate('/');
    } catch { setError('Cannot connect to server.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#0a0a0a 0%,#111118 50%,#0a0a14 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      {/* Decorative grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)',
        backgroundSize: '60px 60px',
      }}/>

      <div style={{ width: '100%', maxWidth: '420px', position: 'relative' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎬</div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>
            Watch<span style={{ color: '#6C63FF' }}>Party</span>
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: '#555', fontSize: '0.82rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Watch together. Chat together.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#111', border: '1px solid #1e1e1e', borderRadius: '16px',
          padding: '2rem', boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '2px', background: '#0a0a0a', borderRadius: '10px', padding: '3px', marginBottom: '1.75rem' }}>
            {['login','signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '0.6rem', border: 'none', borderRadius: '8px', cursor: 'pointer',
                  background: mode === m ? '#6C63FF' : 'transparent',
                  color: mode === m ? '#fff' : '#444',
                  fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s',
                  textTransform: 'capitalize',
                }}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            {mode === 'signup' && (
              <Field label="Username" placeholder="cooluser123" value={form.username} onChange={set('username')} />
            )}
            <Field label="Email" type="email" placeholder="you@email.com" value={form.email} onChange={set('email')} />
            <Field label="Password" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} />

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.65rem 1rem', color: '#f87171', fontSize: '0.82rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '0.85rem', background: loading ? '#333' : '#6C63FF',
                border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700,
                fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s', letterSpacing: '0.02em',
              }}>
              {loading ? '...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, type = 'text', placeholder, value, onChange }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#444', marginBottom: '0.4rem' }}>
        {label}
      </label>
      <input type={type} placeholder={placeholder} value={value} onChange={onChange} required
        style={{
          width: '100%', padding: '0.75rem 1rem', background: '#0a0a0a',
          border: '1px solid #1e1e1e', borderRadius: '8px', color: '#f0f0f0',
          fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s',
        }}
        onFocus={e => e.target.style.borderColor = '#6C63FF'}
        onBlur={e => e.target.style.borderColor = '#1e1e1e'}
      />
    </div>
  );
}
