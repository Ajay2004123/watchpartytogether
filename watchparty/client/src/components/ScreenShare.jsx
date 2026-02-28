import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * ScreenShare component
 *
 * MODE: 'sharer'  — captures screen via getDisplayMedia, streams to all via WebRTC
 * MODE: 'viewer'  — receives the WebRTC stream and displays it
 * MODE: null      — not active
 *
 * Flow:
 *  1. Sharer clicks "Share Screen" → getDisplayMedia → emit screen_share_start
 *  2. Server tells all viewers screen_share_started with sharerSocketId
 *  3. Each viewer emits webrtc_request_offer (triggers sharer to send RTCOffer)
 *  4. Sharer creates RTCPeerConnection per viewer, adds tracks, sends offer
 *  5. Viewer answers → ICE candidates exchange → stream arrives
 */
export default function ScreenShare({ socket, roomId, userId, username, isFullscreen }) {
  const [mode,          setMode]          = useState(null);   // null | 'sharer' | 'viewer'
  const [sharerName,    setSharerName]    = useState('');
  const [sharerSockId,  setSharerSockId]  = useState(null);
  const [streamActive,  setStreamActive]  = useState(false);
  const [error,         setError]         = useState('');

  const localStream   = useRef(null);     // sharer's captured stream
  const viewerVideo   = useRef(null);     // viewer's <video> element
  const peerConns     = useRef({});       // sharerSocketId -> RTCPeerConnection (for sharer)
  const viewerConn    = useRef(null);     // single RTCPeerConnection (for viewer)

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // ── Socket event listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Someone started sharing → become viewer
    const onShareStarted = ({ sharerSocketId, sharerUsername }) => {
      setSharerSockId(sharerSocketId);
      setSharerName(sharerUsername);
      setMode('viewer');
      // Request offer from sharer
      socket.emit('webrtc_request_offer', { roomId, viewerSocketId: socket.id });
    };

    // Sharer stopped → clean up viewer
    const onShareStopped = () => {
      setMode(null);
      setSharerName('');
      setSharerSockId(null);
      setStreamActive(false);
      if (viewerConn.current) { viewerConn.current.close(); viewerConn.current = null; }
      if (viewerVideo.current) viewerVideo.current.srcObject = null;
    };

    // Sharer: viewer is asking for offer — create RTCPeerConnection and send offer
    const onSendOfferTo = async ({ viewerSocketId }) => {
      if (mode !== 'sharer' && !localStream.current) return;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConns.current[viewerSocketId] = pc;

      // Add local stream tracks
      localStream.current.getTracks().forEach(track => pc.addTrack(track, localStream.current));

      // ICE candidates → forward to viewer
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('webrtc_ice', { candidate, targetSocketId: viewerSocketId });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', { offer, targetSocketId: viewerSocketId });
    };

    // Viewer: received offer from sharer
    const onOffer = async ({ offer, fromSocketId }) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      viewerConn.current = pc;

      // When remote stream tracks arrive → show in video
      pc.ontrack = (e) => {
        if (viewerVideo.current && e.streams[0]) {
          viewerVideo.current.srcObject = e.streams[0];
          setStreamActive(true);
        }
      };

      // ICE → forward to sharer
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit('webrtc_ice', { candidate, targetSocketId: fromSocketId });
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc_answer', { answer, targetSocketId: fromSocketId });
    };

    // Sharer: received answer from viewer
    const onAnswer = async ({ answer }) => {
      // Find which PC this answer belongs to by matching state
      for (const pc of Object.values(peerConns.current)) {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          break;
        }
      }
    };

    // ICE candidate arrived
    const onICE = async ({ candidate, fromSocketId }) => {
      const pc = peerConns.current[fromSocketId] || viewerConn.current;
      if (pc && candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      }
    };

    socket.on('screen_share_started', onShareStarted);
    socket.on('screen_share_stopped', onShareStopped);
    socket.on('webrtc_send_offer_to', onSendOfferTo);
    socket.on('webrtc_offer',         onOffer);
    socket.on('webrtc_answer',        onAnswer);
    socket.on('webrtc_ice',           onICE);

    return () => {
      socket.off('screen_share_started', onShareStarted);
      socket.off('screen_share_stopped', onShareStopped);
      socket.off('webrtc_send_offer_to', onSendOfferTo);
      socket.off('webrtc_offer',         onOffer);
      socket.off('webrtc_answer',        onAnswer);
      socket.off('webrtc_ice',           onICE);
    };
  }, [socket, mode, roomId]);

  // ── Start sharing ──────────────────────────────────────────────────────
  const startShare = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: 30 },
        audio: true,
      });
      localStream.current = stream;
      setMode('sharer');
      setStreamActive(true);
      socket.emit('screen_share_start', { roomId, username });

      // If sharer stops via browser UI (clicks "Stop sharing")
      stream.getVideoTracks()[0].onended = () => stopShare();
    } catch (err) {
      if (err.name !== 'NotAllowedError') setError('Could not capture screen: ' + err.message);
    }
  }, [socket, roomId, username]);

  const stopShare = useCallback(() => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => t.stop());
      localStream.current = null;
    }
    Object.values(peerConns.current).forEach(pc => pc.close());
    peerConns.current = {};
    setMode(null);
    setStreamActive(false);
    socket.emit('screen_share_stop', { roomId });
  }, [socket, roomId]);

  // ── Render ─────────────────────────────────────────────────────────────

  // Not sharing and no one else is sharing → show start button
  if (!mode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '0.75rem' }}>
        <div style={{ fontSize: '2.5rem' }}>🖥️</div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#555', textAlign: 'center', lineHeight: 1.6 }}>
          Share your screen or browser tab.<br />
          <span style={{ color: '#333', fontSize: '0.75rem' }}>Open Netflix, any website, anything — friends see it live.</span>
        </p>
        <button onClick={startShare}
          style={{ padding: '0.7rem 1.5rem', background: 'linear-gradient(135deg,#6C63FF,#a855f7)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: "'Syne',sans-serif" }}>
          📡 Start Screen Share
        </button>
        {error && <p style={{ color: '#f87171', fontSize: '0.75rem', margin: 0 }}>{error}</p>}
        <p style={{ margin: 0, fontSize: '0.68rem', color: '#2a2a2a', textAlign: 'center', maxWidth: '220px', lineHeight: 1.5 }}>
          Tip: Chrome will let you share a specific browser tab — great for sharing Netflix without showing your desktop.
        </p>
      </div>
    );
  }

  // Sharer view — show "You are sharing" + stop button
  if (mode === 'sharer') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', gap: '0.75rem', background: 'rgba(108,99,255,0.05)', borderRadius: '12px', margin: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a78bfa' }}>You are sharing your screen</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#555' }}>Friends in this room can see your screen live</p>
        <button onClick={stopShare}
          style={{ padding: '0.55rem 1.25rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: "'Syne',sans-serif" }}>
          ■ Stop Sharing
        </button>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    );
  }

  // Viewer — show incoming stream
  return (
    <div style={{ flex: 1, position: 'relative', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Stream info banner */}
      <div style={{ padding: '0.35rem 1rem', background: 'rgba(108,99,255,0.15)', borderBottom: '1px solid rgba(108,99,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: '0.72rem', color: '#a78bfa' }}>
            📡 <strong>{sharerName}</strong> is sharing their screen
          </span>
        </div>
      </div>

      {/* Video element for stream */}
      <video
        ref={viewerVideo}
        autoPlay
        playsInline
        style={{ flex: 1, width: '100%', background: '#000', objectFit: 'contain', display: 'block' }}
      />

      {/* Loading state */}
      {!streamActive && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #1a1a1a', borderTopColor: '#6C63FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#333', fontSize: '0.8rem', margin: 0 }}>Connecting to {sharerName}'s screen…</p>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
