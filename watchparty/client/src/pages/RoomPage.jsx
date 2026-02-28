import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import VideoPlayer  from '../components/VideoPlayer';
import VideoLibrary from '../components/VideoLibrary';
import Chat         from '../components/Chat';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function RoomPage() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { user, authFetch } = useAuth();
  const { socket } = useSocket();

  // ── Core data ──
  const [room,     setRoom]     = useState(null);
  const [videos,   setVideos]   = useState([]);
  const [messages, setMessages] = useState([]);
  const [members,  setMembers]  = useState([]);
  const [online,   setOnline]   = useState([]);
  const [current,  setCurrent]  = useState(null);
  const [loading,  setLoading]  = useState(true);

  // ── UI toggles ──
  const [showLib,  setShowLib]  = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [copied,   setCopied]   = useState(false);

  // ── Fullscreen + mini chat ──
  const [isFS,        setIsFS]        = useState(false);
  const [showMini,    setShowMini]    = useState(false);
  const [newMsgs,     setNewMsgs]     = useState(0);
  const [recentMsgs,  setRecentMsgs]  = useState([]);
  const containerRef = useRef(null);

  // ── WebRTC / screen share ──
  const [isSharing,        setIsSharing]        = useState(false);
  const [remoteSharerName, setRemoteSharerName] = useState('');
  const [remoteSharerId,   setRemoteSharerId]   = useState('');
  const [screenStream,     setScreenStream]     = useState(null);
  const localStream   = useRef(null);     // my captured screen stream
  const peerConns     = useRef({});       // broadcaster: socketId → RTCPeerConnection
  const viewerPC      = useRef(null);     // viewer: single RTCPeerConnection

  // ── Load room data ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res  = await authFetch(`/api/rooms/${id}`);
        if (!res.ok) { navigate('/'); return; }
        const d    = await res.json();
        setRoom(d.room);
        setVideos(d.videos   || []);
        setMessages(d.messages || []);
        setMembers(d.members   || []);
        if (d.videos?.length) setCurrent(d.videos[0]);
      } catch { navigate('/'); }
      finally { setLoading(false); }
    })();
  }, [id]);

  // ── Socket setup ────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !user || !room) return;

    socket.emit('join_room', {
      roomId: id, userId: user.id, username: user.username, avatar_color: user.avatar_color,
    });

    const onUsers   = u => setOnline(u);
    const onJoined  = ({ username }) => addSys(`${username} joined`);
    const onLeft    = ({ username }) => addSys(`${username} left`);
    const onVideo   = ({ video })    => setCurrent(video);

    // ── Screen share (viewer side) ──
    const onShareAvail = ({ sharerId, sharerName }) => {
      setRemoteSharerName(sharerName);
      setRemoteSharerId(sharerId);
      addSys(`🖥️ ${sharerName} started sharing their screen`);
    };
    const onShareEnded = () => {
      setRemoteSharerName(''); setRemoteSharerId(''); setScreenStream(null);
      viewerPC.current?.close(); viewerPC.current = null;
      addSys('🖥️ Screen share ended');
      setCurrent(c => c?.source_type === 'screen' ? null : c);
    };

    // Viewer receives WebRTC offer from broadcaster
    const onOffer = async ({ fromSocketId, offer }) => {
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        viewerPC.current = pc;
        pc.onicecandidate = e => {
          if (e.candidate) socket.emit('webrtc_ice', { targetSocketId: fromSocketId, candidate: e.candidate });
        };
        pc.ontrack = e => { if (e.streams?.[0]) setScreenStream(e.streams[0]); };
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc_answer', { targetSocketId: fromSocketId, answer });
      } catch (err) { console.error('WebRTC offer error:', err); }
    };

    // Broadcaster receives answer
    const onAnswer = async ({ fromSocketId, answer }) => {
      const pc = peerConns.current[fromSocketId];
      if (pc) try { await pc.setRemoteDescription(new RTCSessionDescription(answer)); } catch {}
    };

    // ICE candidates
    const onIce = ({ fromSocketId, candidate }) => {
      const pc = peerConns.current[fromSocketId] || viewerPC.current;
      if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    };

    // Broadcaster receives a viewer connection request
    const onRequest = async ({ fromSocketId }) => {
      if (!localStream.current) return;
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerConns.current[fromSocketId] = pc;
        localStream.current.getTracks().forEach(t => pc.addTrack(t, localStream.current));
        pc.onicecandidate = e => {
          if (e.candidate) socket.emit('webrtc_ice', { targetSocketId: fromSocketId, candidate: e.candidate });
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { targetSocketId: fromSocketId, offer });
      } catch (err) { console.error('WebRTC request error:', err); }
    };

    socket.on('room_users',            onUsers);
    socket.on('user_joined',           onJoined);
    socket.on('user_left',             onLeft);
    socket.on('video_change',          onVideo);
    socket.on('screen_share_available', onShareAvail);
    socket.on('screen_share_ended',    onShareEnded);
    socket.on('webrtc_offer',          onOffer);
    socket.on('webrtc_answer',         onAnswer);
    socket.on('webrtc_ice',            onIce);
    socket.on('webrtc_request',        onRequest);

    return () => {
      socket.off('room_users',            onUsers);
      socket.off('user_joined',           onJoined);
      socket.off('user_left',             onLeft);
      socket.off('video_change',          onVideo);
      socket.off('screen_share_available', onShareAvail);
      socket.off('screen_share_ended',    onShareEnded);
      socket.off('webrtc_offer',          onOffer);
      socket.off('webrtc_answer',         onAnswer);
      socket.off('webrtc_ice',            onIce);
      socket.off('webrtc_request',        onRequest);
    };
  }, [socket, user, room, id]);

  // ── Track new messages during fullscreen ────────────────────
  useEffect(() => {
    if (!socket) return;
    const h = msg => {
      if (isFS && msg.userId !== user?.id) {
        setNewMsgs(n => n + 1);
        setRecentMsgs(p => [...p.slice(-3), msg]);
      }
    };
    socket.on('receive_message', h);
    return () => socket.off('receive_message', h);
  }, [socket, isFS, user?.id]);

  // ── Fullscreen API ──────────────────────────────────────────
  const enterFS = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
  }, []);

  const exitFS = useCallback(() => {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
  }, []);

  useEffect(() => {
    const h = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFS(fs);
      if (!fs) { setShowMini(false); setNewMsgs(0); }
    };
    document.addEventListener('fullscreenchange',       h);
    document.addEventListener('webkitfullscreenchange', h);
    return () => {
      document.removeEventListener('fullscreenchange',       h);
      document.removeEventListener('webkitfullscreenchange', h);
    };
  }, []);

  // ── Screen share: start broadcasting ────────────────────────
  const startShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always' },
        audio: true,
      });
      localStream.current = stream;
      setIsSharing(true);
      setCurrent({ id: '__screen__', source_type: 'screen', title: 'My Screen Share' });
      socket?.emit('screen_share_start',  { roomId: id, sharerName: user?.username });
      socket?.emit('video_change',        { roomId: id, video: { id: '__screen__', source_type: 'screen', title: `${user?.username}'s screen` } });

      // Connect to each already-online viewer
      const others = online.filter(u => u.userId !== user?.id);
      for (const peer of others) {
        socket?.emit('webrtc_request', { targetSocketId: peer.socketId, roomId: id });
      }

      // Handle user stopping share via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', stopShare);
    } catch (err) {
      if (err.name !== 'NotAllowedError') console.error('Screen share error:', err);
    }
  }, [socket, id, user, online]);

  const stopShare = useCallback(() => {
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    Object.values(peerConns.current).forEach(pc => pc.close());
    peerConns.current = {};
    setIsSharing(false);
    setScreenStream(null);
    socket?.emit('screen_share_stop', { roomId: id });
    setCurrent(null);
  }, [socket, id]);

  // ── Helpers ─────────────────────────────────────────────────
  const addSys = msg => setMessages(p => [...p, { id: Date.now(), type: 'system', content: msg, time: new Date().toISOString() }]);

  const handleSelect = v => {
    setCurrent(v);
    socket?.emit('video_change', { roomId: id, video: v });
  };

  const handleAdded = v => {
    setVideos(p => [v, ...p]);
    setCurrent(v);
    socket?.emit('video_change', { roomId: id, video: v });
  };

  const copyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.invite_code);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const isOnline = uid => online.some(u => u.userId === uid);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", color: '#333' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 10, animation: 'pulse 1.5s infinite' }}>🎬</div>
        <span>Loading room…</span>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a', overflow: 'hidden', fontFamily: "'Syne',sans-serif" }}>

      {/* ── Navbar ── */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.55rem 1rem', borderBottom: '1px solid #111', background: '#0a0a0a', zIndex: 100, flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} style={NB}>← Back</button>

        <span style={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: '1rem' }}>
          Watch<span style={{ color: '#6C63FF' }}>Party</span>
          <span style={{ color: '#333', fontWeight: 400, marginLeft: 8, fontSize: '0.82rem' }}>{room?.name}</span>
        </span>

        {/* Online member pills */}
        {members.map(m => (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '0.18rem 0.55rem', borderRadius: 20, border: '1px solid #1a1a1a' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOnline(m.user_id) ? '#4ade80' : '#2a2a2a', display: 'block' }} />
            <span style={{ fontSize: '0.68rem', color: '#444' }}>{m.users?.username || m.username}</span>
          </div>
        ))}

        <div style={{ flex: 1 }} />

        <button onClick={() => setShowLib(s => !s)} style={{ ...NB, background: showLib ? '#1a1a1a' : 'none', color: showLib ? '#888' : '#333' }}>🎬 {showLib ? 'Hide' : 'Library'}</button>
        <button onClick={() => setShowChat(s => !s)} style={{ ...NB, background: showChat ? '#1a1a1a' : 'none', color: showChat ? '#888' : '#333' }}>💬 {showChat ? 'Hide' : 'Chat'}</button>
        <button onClick={copyCode} style={{ ...NB, color: copied ? '#4ade80' : '#333', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
          {copied ? '✓ Copied' : room?.invite_code}
        </button>
      </nav>

      {/* ── Main layout ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Library sidebar */}
        {showLib && (
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #111', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <VideoLibrary
              videos={videos}
              currentVideo={current}
              onSelect={handleSelect}
              onVideoAdded={handleAdded}
              roomId={id}
              onStartScreenShare={startShare}
              onStopScreenShare={stopShare}
              isSharing={isSharing}
              remoteSharerName={remoteSharerName}
            />
          </div>
        )}

        {/* Video + fullscreen container */}
        <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', background: '#000', overflow: 'hidden' }}>

          <VideoPlayer
            video={current}
            socket={socket}
            roomId={id}
            userId={user?.id}
            screenStream={screenStream}
          />

          {/* Title bar */}
          {current && (
            <div style={{ padding: '0.4rem 1rem', background: '#050505', borderTop: '1px solid #111', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', color: '#333' }}>
                Now watching: <span style={{ color: '#888' }}>{current.title}</span>
              </span>
              <button onClick={isFS ? exitFS : enterFS}
                style={{ ...NB, fontSize: '0.68rem' }}
                onMouseEnter={e => e.target.style.color = '#f0f0f0'}
                onMouseLeave={e => e.target.style.color = '#555'}>
                {isFS ? '⊡ Exit Fullscreen' : '⛶ Fullscreen'}
              </button>
            </div>
          )}

          {/* ── Fullscreen overlays ── */}
          {isFS && (
            <>
              {/* Chat toggle button */}
              <button
                onClick={() => { setShowMini(s => !s); setNewMsgs(0); }}
                style={{
                  position: 'absolute', bottom: 70, right: 20,
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(108,99,255,0.9)', border: 'none',
                  cursor: 'pointer', fontSize: '1.2rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(108,99,255,0.4)',
                  zIndex: 300, transition: 'transform 0.2s',
                  animation: newMsgs > 0 ? 'wiggle 0.5s ease' : 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.12)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                💬
                {newMsgs > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {newMsgs > 9 ? '9+' : newMsgs}
                  </span>
                )}
              </button>

              {/* Mini chat panel */}
              {showMini && (
                <div style={{
                  position: 'absolute', bottom: 130, right: 20,
                  width: 300, height: 380,
                  background: 'rgba(8,8,8,0.94)', backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16,
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
                  zIndex: 300, animation: 'slideUp 0.2s ease',
                }}>
                  <div style={{ padding: '0.6rem 0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.65rem', color: '#444', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Live Chat</span>
                    <button onClick={() => setShowMini(false)} style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <Chat socket={socket} roomId={id} userId={user?.id} username={user?.username} avatarColor={user?.avatar_color} initialMessages={messages} compact />
                  </div>
                </div>
              )}

              {/* Message toasts when mini-chat closed */}
              {!showMini && recentMsgs.length > 0 && (
                <div style={{ position: 'absolute', bottom: 130, right: 80, maxWidth: 220, pointerEvents: 'none', zIndex: 299 }}>
                  {recentMsgs.slice(-1).map((m, i) => (
                    <div key={m.id || i} style={{ background: 'rgba(8,8,8,0.88)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.45rem 0.7rem', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.3s ease' }}>
                      <div style={{ fontSize: '0.62rem', color: '#444', marginBottom: 2 }}>{m.username}</div>
                      <div style={{ fontSize: '0.77rem', color: '#ccc' }}>{m.type === 'voice' ? '🎙 Voice message' : m.content?.slice(0, 55)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Chat sidebar */}
        {showChat && !isFS && (
          <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid #111', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Chat socket={socket} roomId={id} userId={user?.id} username={user?.username} avatarColor={user?.avatar_color} initialMessages={messages} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes wiggle  { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-8deg)} 75%{transform:rotate(8deg)} }
      `}</style>
    </div>
  );
}

// Shared nav button style
const NB = { background: 'none', border: '1px solid #1a1a1a', borderRadius: 7, padding: '0.28rem 0.7rem', color: '#555', fontSize: '0.72rem', cursor: 'pointer', fontFamily: "'Syne',sans-serif", transition: 'color 0.2s' };
