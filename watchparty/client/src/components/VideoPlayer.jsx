/**
 * VideoPlayer — supports upload, direct URL, youtube, screen share
 * Key fixes in this version:
 *  - YouTube: ytDiv ref preserved via a stable wrapper div + inner mount point
 *  - Sync: applySync reads refs (not stale closure values) for isYT / isNative
 *  - Seek bar: fixed CSS (no inset clash)
 *  - Native: preload="auto" + proper buffering events for lag-free playback
 *  - isSyncing guard works for both directions (local → remote, remote → local)
 */
import { useRef, useEffect, useState, useCallback } from 'react';

const API        = process.env.REACT_APP_API_URL;
const DRIFT_SEC  = 1.5;   // re-seek only if > 1.5 s out of sync

// ── YouTube IFrame API — load once globally ──────────────────────
let ytApiLoaded = false;
const ytWaiters = [];
function ensureYTApi() {
  return new Promise(resolve => {
    if (ytApiLoaded) return resolve();
    ytWaiters.push(resolve);
    if (document.getElementById('yt-api-script')) return;
    window.onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      ytWaiters.forEach(r => r());
      ytWaiters.length = 0;
    };
    const s  = document.createElement('script');
    s.id     = 'yt-api-script';
    s.src    = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
}

function extractYtId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    if (u.hostname.includes('youtu.be'))    return u.pathname.split('/').filter(Boolean)[0];
  } catch {}
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function VideoPlayer({ video, socket, roomId, screenStream }) {
  /* ── Refs that never change identity ── */
  const nativeRef   = useRef(null);   // <video> for upload/direct
  const screenRef   = useRef(null);   // <video> for screen share
  const ytMountRef  = useRef(null);   // stable div; YT.Player replaces its child
  const ytPlayer    = useRef(null);   // YT.Player instance
  const typeRef     = useRef(null);   // mirrors video.source_type without closure stale
  const isSyncing   = useRef(false);
  const hideTimer   = useRef(null);
  const ytPollTimer = useRef(null);

  /* ── React state (UI only) ── */
  const [playing,   setPlaying]   = useState(false);
  const [current,   setCurrent]   = useState(0);
  const [duration,  setDuration]  = useState(0);
  const [vol,       setVol]       = useState(100);
  const [muted,     setMuted]     = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [showCtrl,  setShowCtrl]  = useState(true);
  const [ytReady,   setYtReady]   = useState(false);

  const type     = video?.source_type;
  const isNative = type === 'upload' || type === 'direct';
  const isYT     = type === 'youtube';
  const isScreen = type === 'screen' || video?.id === '__screen__';
  const ytId     = isYT ? extractYtId(video?.source_url) : null;

  // keep typeRef in sync so socket handlers read fresh value
  useEffect(() => { typeRef.current = type; }, [type]);

  /* ────────────────────────────────────────────────────────────
     YouTube Player lifecycle
  ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isYT || !ytId) return;

    setYtReady(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);

    let cancelled = false;

    // Create a fresh inner div for YT to replace with an iframe
    // (ytMountRef is the stable wrapper; we insert a new child each time)
    const inner = document.createElement('div');
    inner.style.cssText = 'width:100%;height:100%;';
    if (ytMountRef.current) {
      ytMountRef.current.innerHTML = '';
      ytMountRef.current.appendChild(inner);
    }

    ensureYTApi().then(() => {
      if (cancelled || !inner.isConnected) return;

      try { ytPlayer.current?.destroy(); } catch {}
      ytPlayer.current = null;

      ytPlayer.current = new window.YT.Player(inner, {
        videoId: ytId,
        width:   '100%',
        height:  '100%',
        playerVars: {
          autoplay:       0,
          controls:       1,
          modestbranding: 1,
          rel:            0,
          enablejsapi:    1,
          origin:         window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            setYtReady(true);
            setDuration(e.target.getDuration() || 0);
            socket?.emit('request_sync', { roomId });
          },
          onStateChange: (e) => {
            if (cancelled || isSyncing.current) return;
            const YTS = window.YT?.PlayerState;
            if (!YTS) return;
            const t = e.target.getCurrentTime();
            if (e.data === YTS.PLAYING)  {
              setPlaying(true); setBuffering(false);
              socket?.emit('playback_event', { roomId, state: 'playing',   currentTime: t });
            } else if (e.data === YTS.PAUSED) {
              setPlaying(false);
              socket?.emit('playback_event', { roomId, state: 'paused',    currentTime: t });
            } else if (e.data === YTS.BUFFERING) {
              setBuffering(true);
              socket?.emit('playback_event', { roomId, state: 'buffering', currentTime: t });
            } else if (e.data === YTS.ENDED) {
              setPlaying(false); setBuffering(false);
            }
          },
          onError: () => setBuffering(false),
        },
      });
    });

    // Poll current time for seek bar
    ytPollTimer.current = setInterval(() => {
      const p = ytPlayer.current;
      if (p && typeof p.getCurrentTime === 'function') {
        setCurrent(p.getCurrentTime() || 0);
        if (!duration) setDuration(p.getDuration() || 0);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(ytPollTimer.current);
      setYtReady(false);
      try { ytPlayer.current?.destroy(); } catch {}
      ytPlayer.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId]);   // only recreate when ytId changes

  /* ────────────────────────────────────────────────────────────
     Socket sync — single unified handler for all video types
  ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!socket) return;

    // applySync reads typeRef so it always uses the current video type
    const applySync = (state, targetTime) => {
      const t = typeRef.current;
      if (t === 'youtube') {
        const p = ytPlayer.current;
        if (!p || typeof p.seekTo !== 'function') return;
        isSyncing.current = true;
        if (Math.abs((p.getCurrentTime() || 0) - targetTime) > DRIFT_SEC) {
          p.seekTo(targetTime, true);
        }
        if (state === 'playing')   { p.playVideo();  setPlaying(true);  setBuffering(false); }
        if (state === 'paused')    { p.pauseVideo(); setPlaying(false); }
        if (state === 'buffering') { setBuffering(true); }
        setTimeout(() => { isSyncing.current = false; }, 600);

      } else if (t === 'upload' || t === 'direct') {
        const v = nativeRef.current;
        if (!v) return;
        isSyncing.current = true;
        if (Math.abs(v.currentTime - targetTime) > DRIFT_SEC) v.currentTime = targetTime;
        if (state === 'playing')   { v.play().catch(() => {}); setPlaying(true);  setBuffering(false); }
        if (state === 'paused')    { v.pause(); setPlaying(false); }
        if (state === 'buffering') { setBuffering(true); }
        setTimeout(() => { isSyncing.current = false; }, 400);
      }
    };

    /* Remote user played/paused/seeked */
    const onPlaybackEvent = ({ state, currentTime }) => {
      if (isSyncing.current) return;
      applySync(state, currentTime);
    };

    /* A new user joined and needs to know our current time */
    const onSyncPlease = ({ toSocketId }) => {
      let currentTime = 0, isPlaying = false;
      const t = typeRef.current;
      if (t === 'youtube') {
        const p = ytPlayer.current;
        if (p?.getCurrentTime) {
          currentTime = p.getCurrentTime();
          isPlaying   = p.getPlayerState() === window.YT?.PlayerState?.PLAYING;
        }
      } else {
        const v = nativeRef.current;
        if (v) { currentTime = v.currentTime; isPlaying = !v.paused; }
      }
      socket.emit('sync_response', { toSocketId, currentTime, playing: isPlaying, videoId: video?.id });
    };

    /* We just joined and receive the host's current time */
    const onSyncResponse = ({ currentTime, playing: p, videoId }) => {
      if (videoId !== video?.id) return;   // stale — different video
      applySync(p ? 'playing' : 'paused', currentTime);
    };

    /* Server sent us the room's last known state immediately on join */
    const onInitialSync = ({ currentTime, playing: p }) => {
      applySync(p ? 'playing' : 'paused', currentTime);
    };

    socket.on('playback_event', onPlaybackEvent);
    socket.on('sync_please',    onSyncPlease);
    socket.on('sync_response',  onSyncResponse);
    socket.on('initial_sync',   onInitialSync);

    return () => {
      socket.off('playback_event', onPlaybackEvent);
      socket.off('sync_please',    onSyncPlease);
      socket.off('sync_response',  onSyncResponse);
      socket.off('initial_sync',   onInitialSync);
    };
  }, [socket, roomId, video?.id]);

  /* Reset + request sync on video change */
  useEffect(() => {
    setPlaying(false); setCurrent(0); setDuration(0); setBuffering(false);
    // YT handles its own sync in onReady; native requests immediately
    if (socket && video && !isYT) {
      const t = setTimeout(() => socket.emit('request_sync', { roomId }), 600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  /* Attach screen share MediaStream */
  useEffect(() => {
    if (isScreen && screenRef.current && screenStream) {
      screenRef.current.srcObject = screenStream;
      screenRef.current.play().catch(() => {});
    }
  }, [isScreen, screenStream]);

  /* ── Native video controls ── */
  const togglePlay = useCallback(() => {
    const v = nativeRef.current;
    if (!v || !isNative) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
      if (!isSyncing.current) socket?.emit('playback_event', { roomId, state: 'playing', currentTime: v.currentTime });
    } else {
      v.pause();
      setPlaying(false);
      if (!isSyncing.current) socket?.emit('playback_event', { roomId, state: 'paused', currentTime: v.currentTime });
    }
  }, [socket, roomId, isNative]);

  const handleSeekClick = useCallback((e) => {
    const v = nativeRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t    = ((e.clientX - rect.left) / rect.width) * duration;
    v.currentTime = t;
    socket?.emit('playback_event', { roomId, state: v.paused ? 'paused' : 'playing', currentTime: t });
  }, [socket, roomId, duration]);

  const changeVol = useCallback((val) => {
    setVol(val);
    if (nativeRef.current) nativeRef.current.volume = val / 100;
    setMuted(val === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const m = !muted;
    setMuted(m);
    if (nativeRef.current) nativeRef.current.muted = m;
  }, [muted]);

  /* Auto-hide controls */
  const bumpControls = useCallback(() => {
    setShowCtrl(true);
    clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setShowCtrl(false), 3500);
  }, [playing]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const fmt = s => {
    const n = Math.max(0, s || 0);
    return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  };

  /* ────────────────────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────────────────────── */

  if (!video) return (
    <div style={css.empty}>
      <span style={{ fontSize: '3rem' }}>🎬</span>
      <p style={{ color: '#2a2a2a', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
        Select a video, paste a link, or share your screen
      </p>
    </div>
  );

  /* Screen share */
  if (isScreen) return (
    <div style={{ ...css.wrap, cursor: 'default' }}>
      {screenStream
        ? <video ref={screenRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <div style={css.empty}>
            <span style={{ fontSize: '3rem' }}>🖥️</span>
            <p style={{ color: '#555', margin: '0.5rem 0 0' }}>Connecting to screen share…</p>
            <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
              {[0,1,2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#6C63FF', display: 'block', animation: `dot 1s ${i*0.2}s infinite` }} />)}
            </div>
          </div>
      }
      <style>{`@keyframes dot{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`}</style>
    </div>
  );

  /* YouTube */
  if (isYT) return (
    <div style={{ ...css.wrap, flexDirection: 'column', cursor: 'default' }}>
      {/* stable outer wrapper div — ytMountRef stays constant across renders */}
      <div ref={ytMountRef} style={{ flex: 1, width: '100%', background: '#000', overflow: 'hidden' }} />

      {/* Status strip */}
      <div style={css.ytBar}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'block', flexShrink: 0, transition: 'background .3s', background: ytReady ? '#4ade80' : '#333' }} />
        <span style={{ fontSize: '0.67rem', color: ytReady ? '#4ade80' : '#444' }}>
          {ytReady ? '✅ YouTube synced — everyone\'s play/pause/seek is linked' : '⏳ Loading YouTube player…'}
        </span>
        {buffering && <span style={{ fontSize: '0.67rem', color: '#f59e0b', marginLeft: 8 }}>Buffering…</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.67rem', color: '#2a2a2a', fontFamily: 'monospace' }}>{fmt(current)} / {fmt(duration)}</span>
      </div>
    </div>
  );

  /* Native video (upload / direct URL) */
  const src = type === 'upload' ? `${API}/stream/${video.filename}` : video.source_url;

  return (
    <div style={css.wrap} onMouseMove={bumpControls} onClick={togglePlay}>
      <video
        ref={nativeRef}
        src={src}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
        onTimeUpdate={() => setCurrent(nativeRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(nativeRef.current?.duration || 0)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => { setBuffering(false); setPlaying(true); }}
        onPause={() => { if (!isSyncing.current) setPlaying(false); }}
        onEnded={() => { setPlaying(false); setBuffering(false); }}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
      />

      {/* Loading spinner */}
      {buffering && (
        <div style={css.overlay}>
          <div style={{ width: 48, height: 48, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#6C63FF', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
        </div>
      )}

      {/* Big play button */}
      {!playing && !buffering && (
        <div style={{ ...css.overlay, pointerEvents: 'none' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(108,99,255,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.9rem', boxShadow: '0 8px 40px rgba(108,99,255,0.5)' }}>▶</div>
        </div>
      )}

      {/* Controls overlay */}
      <div onClick={e => e.stopPropagation()}
        style={{ ...css.controls, opacity: showCtrl ? 1 : 0, pointerEvents: showCtrl ? 'auto' : 'none' }}>

        {/* Seek bar — note: no 'inset' here, just width for fill */}
        <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, cursor: 'pointer', marginBottom: 12, position: 'relative', transition: 'height .15s' }}
          onClick={handleSeekClick}
          onMouseEnter={e => e.currentTarget.style.height = '6px'}
          onMouseLeave={e => e.currentTarget.style.height = '4px'}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            width: `${duration ? (current / duration) * 100 : 0}%`,
            background: 'linear-gradient(90deg,#6C63FF,#a855f7)',
            borderRadius: 2,
          }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={togglePlay} style={css.cb}>{playing ? '⏸' : '▶'}</button>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            {fmt(current)} / {fmt(duration)}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={toggleMute} style={css.cb}>{muted ? '🔇' : '🔊'}</button>
          <input type="range" min={0} max={100} value={muted ? 0 : vol}
            onChange={e => changeVol(+e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{ width: 70, accentColor: '#6C63FF', cursor: 'pointer' }} />
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const css = {
  wrap:  { flex: 1, position: 'relative', background: '#000', overflow: 'hidden', display: 'flex' },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: '#000', minHeight: 300 },
  overlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.38)' },
  controls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    background: 'linear-gradient(transparent,rgba(0,0,0,0.92))',
    padding: '3rem 1rem 0.9rem', transition: 'opacity 0.3s',
  },
  cb: { background: 'none', border: 'none', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', padding: '0.2rem', lineHeight: 1 },
  ytBar: { background: '#080808', padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, borderTop: '1px solid #111' },
};
