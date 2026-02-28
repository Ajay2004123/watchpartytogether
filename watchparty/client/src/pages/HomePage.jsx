import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function HomePage() {
  const { user, authFetch, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms,    setRooms]    = useState([]);
  const [tab,      setTab]      = useState(null); // 'create'|'join'
  const [roomName, setRoomName] = useState('');
  const [code,     setCode]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const res = await authFetch('/api/rooms/my');
    if (res.ok) setRooms(await res.json());
  };

  const create = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res  = await authFetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: roomName }) });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      navigate(`/room/${data.id}`);
    } catch { setError('Failed'); } finally { setLoading(false); }
  };

  const join = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res  = await authFetch('/api/rooms/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invite_code: code }) });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      navigate(`/room/${data.id}`);
    } catch { setError('Failed'); } finally { setLoading(false); }
  };

  const copyCode = (c) => { navigator.clipboard.writeText(c); setCopied(c); setTimeout(() => setCopied(null), 2000); };

  const initials = (name) => name?.slice(0,2).toUpperCase() || '?';
  const color    = user?.avatar_color || '#6C63FF';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid #111', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 50 }}>
        <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.03em' }}>Watch<span style={{ color: '#6C63FF' }}>Party</span></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem' }}>
            {initials(user?.username)}
          </div>
          <span style={{ color: '#555', fontSize: '0.85rem' }}>{user?.username}</span>
          <button onClick={logout} style={{ background: 'none', border: '1px solid #1e1e1e', borderRadius: '8px', padding: '0.35rem 0.85rem', color: '#555', fontSize: '0.8rem', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {/* Hero text */}
        <div style={{ marginBottom: '3rem' }}>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Your rooms
          </h1>
          <p style={{ margin: 0, color: '#444', fontSize: '0.9rem' }}>
            Create a room, invite friends with a code, and watch together.
          </p>
        </div>

        {/* Action row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button onClick={() => { setTab(tab === 'create' ? null : 'create'); setError(''); }}
            style={{ padding: '1rem', background: tab === 'create' ? '#6C63FF' : '#111', border: '1px solid #1e1e1e', borderRadius: '12px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s' }}>
            + Create Room
          </button>
          <button onClick={() => { setTab(tab === 'join' ? null : 'join'); setError(''); }}
            style={{ padding: '1rem', background: tab === 'join' ? '#1e1e1e' : '#111', border: '1px solid #1e1e1e', borderRadius: '12px', color: '#888', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s' }}>
            Join with Code
          </button>
        </div>

        {/* Forms */}
        {tab === 'create' && (
          <form onSubmit={create} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', animation: 'slideDown 0.2s ease' }}>
            <input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="Room name, e.g. Friday Movie Night" required
              style={{ flex: 1, padding: '0.75rem 1rem', background: '#111', border: '1px solid #1e1e1e', borderRadius: '10px', color: '#f0f0f0', fontSize: '0.9rem', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#6C63FF'} onBlur={e => e.target.style.borderColor = '#1e1e1e'} />
            <button type="submit" disabled={loading} style={{ padding: '0.75rem 1.25rem', background: '#6C63FF', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {loading ? '...' : 'Create →'}
            </button>
          </form>
        )}

        {tab === 'join' && (
          <form onSubmit={join} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', animation: 'slideDown 0.2s ease' }}>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Enter 6-letter code" required maxLength={6}
              style={{ flex: 1, padding: '0.75rem 1rem', background: '#111', border: '1px solid #1e1e1e', borderRadius: '10px', color: '#f0f0f0', fontSize: '1rem', outline: 'none', letterSpacing: '0.2em', textAlign: 'center', fontFamily: "'DM Mono', monospace" }}
              onFocus={e => e.target.style.borderColor = '#6C63FF'} onBlur={e => e.target.style.borderColor = '#1e1e1e'} />
            <button type="submit" disabled={loading} style={{ padding: '0.75rem 1.25rem', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '10px', color: '#aaa', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {loading ? '...' : 'Join →'}
            </button>
          </form>
        )}

        {error && <div style={{ color: '#f87171', fontSize: '0.83rem', marginBottom: '1rem', padding: '0.65rem 1rem', background: 'rgba(239,68,68,0.07)', borderRadius: '8px' }}>{error}</div>}

        {/* Rooms list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#2a2a2a' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎬</div>
              <p style={{ margin: 0 }}>No rooms yet — create one and invite your friends!</p>
            </div>
          ) : rooms.map(room => (
            <div key={room.id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: '#111', border: '1px solid #1a1a1a', borderRadius: '12px', cursor: 'pointer', transition: 'border-color 0.2s' }}
              onClick={() => navigate(`/room/${room.id}`)}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#2a2a2a'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#1a1a1a'}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{room.name}</div>
                <div style={{ color: '#444', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                  {new Date(room.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button onClick={ev => { ev.stopPropagation(); copyCode(room.invite_code); }}
                  style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '6px', padding: '0.3rem 0.75rem', color: copied === room.invite_code ? '#4ade80' : '#555', fontFamily: "'DM Mono',monospace", fontSize: '0.78rem', cursor: 'pointer', letterSpacing: '0.1em', transition: 'color 0.2s' }}>
                  {copied === room.invite_code ? '✓ Copied' : room.invite_code}
                </button>
                <span style={{ color: '#333' }}>→</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
