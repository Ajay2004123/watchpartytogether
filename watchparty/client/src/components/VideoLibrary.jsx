import { useState, useRef } from 'react';

const API = process.env.REACT_APP_API_URL;

const TABS = [
  { id: 'library', icon: '🎬', label: 'Library'    },
  { id: 'upload',  icon: '⬆️',  label: 'Upload'     },
  { id: 'youtube', icon: '▶️',  label: 'YouTube'    },
  { id: 'direct',  icon: '🔗',  label: 'Direct URL' },
  { id: 'screen',  icon: '🖥️', label: 'Screen'     },
];

const TYPE_ICON = { upload: '📁', youtube: '▶️', direct: '🔗', screen: '🖥️' };

export default function VideoLibrary({
  videos, currentVideo, onSelect, onVideoAdded, roomId,
  onStartScreenShare, onStopScreenShare, isSharing, remoteSharerName,
}) {
  const [tab,         setTab]         = useState('library');
  const [ytUrl,       setYtUrl]       = useState('');
  const [ytTitle,     setYtTitle]     = useState('');
  const [directUrl,   setDirectUrl]   = useState('');
  const [directTitle, setDirectTitle] = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [error,       setError]       = useState('');
  const fileRef  = useRef(null);
  const token    = () => localStorage.getItem('wp_token');

  const fmtSize = b => !b ? '' : b > 1e9 ? `${(b/1e9).toFixed(1)} GB` : b > 1e6 ? `${(b/1e6).toFixed(0)} MB` : `${(b/1e3).toFixed(0)} KB`;

  // Upload local file via XHR so we can track progress
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(''); setUploading(true); setProgress(0);
    const fd = new FormData();
    fd.append('video',  file);
    fd.append('roomId', roomId);
    fd.append('title',  file.name.replace(/\.[^/.]+$/, ''));
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = ev => { if (ev.lengthComputable) setProgress(Math.round(ev.loaded / ev.total * 100)); };
    xhr.onload  = () => {
      setUploading(false); setProgress(0);
      if (xhr.status < 300) { onVideoAdded(JSON.parse(xhr.responseText)); setTab('library'); }
      else { try { setError(JSON.parse(xhr.responseText).message); } catch { setError('Upload failed'); } }
    };
    xhr.onerror = () => { setUploading(false); setError('Upload failed — check connection'); };
    xhr.open('POST', `${API}/api/videos/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token()}`);
    xhr.send(fd);
  };

  // Add YouTube or direct URL
  const addLink = async (e, type) => {
    e.preventDefault(); setError('');
    const url   = type === 'youtube' ? ytUrl   : directUrl;
    const title = type === 'youtube' ? ytTitle : directTitle;
    const res   = await fetch(`${API}/api/videos/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token()}` },
      body: JSON.stringify({ roomId, source_url: url, source_type: type, title: title || url }),
    });
    const data = await res.json();
    if (res.ok) {
      onVideoAdded(data);
      if (type === 'youtube') { setYtUrl(''); setYtTitle(''); }
      else                    { setDirectUrl(''); setDirectTitle(''); }
      setTab('library');
    } else setError(data.message);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d0d', fontFamily: "'Syne',sans-serif" }}>

      {/* Tab strip */}
      <div style={{ display: 'flex', background: '#080808', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setError(''); }}
            title={t.label}
            style={{
              flex: 1, padding: '0.55rem 0.2rem', background: 'none',
              border: 'none', borderBottom: tab === t.id ? '2px solid #6C63FF' : '2px solid transparent',
              cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
              transition: 'border-color 0.15s',
            }}>
            {t.icon}
          </button>
        ))}
      </div>

      {/* Tab title */}
      <div style={{ padding: '0.4rem 0.75rem 0.2rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#2a2a2a' }}>
          {TABS.find(t => t.id === tab)?.label}
        </span>
      </div>

      {error && (
        <div style={{ margin: '0 0.5rem 0.3rem', padding: '0.45rem 0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: 6, color: '#f87171', fontSize: '0.73rem' }}>
          {error}
        </div>
      )}

      {/* ── LIBRARY ── */}
      {tab === 'library' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.3rem' }}>

          {/* Live screen share banner */}
          {remoteSharerName && (
            <div onClick={() => onSelect({ id: '__screen__', source_type: 'screen', title: `${remoteSharerName}'s screen` })}
              style={{ margin: '0 0 6px', padding: '0.6rem 0.75rem', background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.35)', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6C63FF', display: 'block', animation: 'pulse 1s infinite' }} />
              <div>
                <div style={{ fontSize: '0.77rem', color: '#a78bfa', fontWeight: 700 }}>🖥️ Live Screen Share</div>
                <div style={{ fontSize: '0.63rem', color: '#555' }}>{remoteSharerName} is sharing · click to watch</div>
              </div>
            </div>
          )}

          {videos.length === 0 && !remoteSharerName && (
            <div style={{ textAlign: 'center', color: '#222', fontSize: '0.78rem', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>🎬</div>
              Upload a video, add a link, or start screen sharing
            </div>
          )}

          {videos.map(v => {
            const active = currentVideo?.id === v.id;
            return (
              <div key={v.id} onClick={() => onSelect(v)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 0.65rem', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: active ? 'rgba(108,99,255,0.15)' : 'transparent', border: active ? '1px solid rgba(108,99,255,0.3)' : '1px solid transparent', transition: 'all .15s' }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#111'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: active ? 'rgba(108,99,255,0.4)' : '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>
                  {active ? '▶' : TYPE_ICON[v.source_type] || '🎬'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.77rem', fontWeight: 600, color: active ? '#a78bfa' : '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                  <div style={{ fontSize: '0.6rem', color: '#333', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {v.source_type}{v.file_size ? ` · ${fmtSize(v.file_size)}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── UPLOAD ── */}
      {tab === 'upload' && (
        <div style={{ padding: '0.75rem', flex: 1 }}>
          {uploading ? (
            <div>
              <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#6C63FF,#a855f7)', transition: 'width .3s' }} />
              </div>
              <p style={{ color: '#555', fontSize: '0.73rem', margin: 0 }}>Uploading {progress}% — don't close this tab</p>
            </div>
          ) : (
            <div onClick={() => fileRef.current?.click()}
              style={{ border: '1px dashed #2a2a2a', borderRadius: 10, padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color .2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#6C63FF'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a2a'}>
              <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>📁</div>
              <p style={{ margin: '0 0 4px', color: '#888', fontSize: '0.82rem', fontWeight: 600 }}>Click to pick a video</p>
              <p style={{ margin: 0, color: '#333', fontSize: '0.7rem' }}>MP4, WebM, MKV — up to 5 GB</p>
              <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFile} />
            </div>
          )}
        </div>
      )}

      {/* ── YOUTUBE ── */}
      {tab === 'youtube' && (
        <div style={{ padding: '0.75rem', flex: 1 }}>
          <form onSubmit={e => addLink(e, 'youtube')}>
            <div style={{ padding: '0.6rem', background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8, marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#a78bfa', lineHeight: 1.6 }}>
                ✅ <strong>Full sync supported</strong> — play, pause, and seek are automatically shared with everyone in the room.
              </p>
            </div>
            <input value={ytUrl} onChange={e => setYtUrl(e.target.value)} required
              placeholder="https://youtube.com/watch?v=..."
              style={IS} onFocus={e => e.target.style.borderColor='#6C63FF'} onBlur={e => e.target.style.borderColor='#1e1e1e'} />
            <input value={ytTitle} onChange={e => setYtTitle(e.target.value)}
              placeholder="Title (optional)" style={{ ...IS, marginTop: 6 }}
              onFocus={e => e.target.style.borderColor='#6C63FF'} onBlur={e => e.target.style.borderColor='#1e1e1e'} />
            <button type="submit" style={BS}>Add YouTube Video →</button>
          </form>
        </div>
      )}

      {/* ── DIRECT URL ── */}
      {tab === 'direct' && (
        <div style={{ padding: '0.75rem', flex: 1 }}>
          <form onSubmit={e => addLink(e, 'direct')}>
            <div style={{ padding: '0.6rem', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 8, marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#86efac', lineHeight: 1.6 }}>
                ✅ <strong>Full sync supported</strong> — paste any direct .mp4 link. Play/pause/seek syncs for all viewers.
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '0.68rem', color: '#444', lineHeight: 1.6 }}>
                Works with: archive.org, GitHub raw, any CDN .mp4/.webm URL
              </p>
            </div>
            <input value={directUrl} onChange={e => setDirectUrl(e.target.value)} required
              placeholder="https://example.com/movie.mp4"
              style={IS} onFocus={e => e.target.style.borderColor='#6C63FF'} onBlur={e => e.target.style.borderColor='#1e1e1e'} />
            <input value={directTitle} onChange={e => setDirectTitle(e.target.value)}
              placeholder="Movie title (optional)" style={{ ...IS, marginTop: 6 }}
              onFocus={e => e.target.style.borderColor='#6C63FF'} onBlur={e => e.target.style.borderColor='#1e1e1e'} />
            <button type="submit" style={BS}>Add & Play →</button>
          </form>
        </div>
      )}

      {/* ── SCREEN SHARE ── */}
      {tab === 'screen' && (
        <div style={{ padding: '0.75rem', flex: 1 }}>
          <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: '1.25rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>🖥️</div>
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.9rem', color: '#f0f0f0' }}>Screen Share</p>
            <p style={{ margin: '0 0 14px', fontSize: '0.7rem', color: '#555', lineHeight: 1.6 }}>
              Share any tab, window, or app — friends see it live. Works with Netflix, Prime, Disney+, any website.
            </p>

            {remoteSharerName && !isSharing && (
              <div style={{ marginBottom: 12, padding: '0.5rem', background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 7 }}>
                <span style={{ fontSize: '0.72rem', color: '#a78bfa' }}>🔴 {remoteSharerName} is sharing right now</span>
              </div>
            )}

            {!isSharing
              ? <button onClick={onStartScreenShare} style={{ ...BS, width: '100%' }}>🖥️ Start Sharing My Screen</button>
              : <button onClick={onStopScreenShare}  style={{ ...BS, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', width: '100%' }}>⏹ Stop Sharing</button>
            }
            <p style={{ margin: '10px 0 0', fontSize: '0.65rem', color: '#222', lineHeight: 1.5 }}>
              Browser will ask you to choose what to share.
            </p>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}

const IS = {
  width: '100%', padding: '0.6rem 0.85rem', background: '#111',
  border: '1px solid #1e1e1e', borderRadius: 8, color: '#f0f0f0',
  fontSize: '0.82rem', outline: 'none', fontFamily: "'Syne',sans-serif",
  display: 'block', marginBottom: 0,
};
const BS = {
  width: '100%', marginTop: 10, padding: '0.65rem',
  background: '#6C63FF', border: 'none', borderRadius: 8,
  color: '#fff', fontWeight: 700, fontSize: '0.85rem',
  cursor: 'pointer', fontFamily: "'Syne',sans-serif",
};
