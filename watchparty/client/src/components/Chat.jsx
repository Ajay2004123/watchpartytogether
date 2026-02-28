import { useState, useEffect, useRef, useCallback } from 'react';

const API    = process.env.REACT_APP_API_URL;
const EMOJIS = ['😂','❤️','🔥','👍','😭','🤣','😍','🥺','💀','✨','🎉','😎','🤔','👏','💯','🫶','😘','🥳','😱','🤯','💪','🙌','🫠','👀','🤭','😅','🤌','💅','🫡','😤'];

export default function Chat({ socket, roomId, userId, username, avatarColor, initialMessages = [], compact = false }) {
  const [messages,  setMessages]  = useState(initialMessages);
  const [text,      setText]      = useState('');
  const [typing,    setTyping]    = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recTime,   setRecTime]   = useState(0);

  const bottomRef    = useRef(null);
  const typingTimer  = useRef(null);
  const mediaRef     = useRef(null);
  const chunksRef    = useRef([]);
  const recTimer     = useRef(null);
  const recStart     = useRef(null);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync initial messages
  useEffect(() => { setMessages(initialMessages); }, [initialMessages.length]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;
    const onMsg = msg => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTyping('');
    };
    const onTyping     = ({ username: u }) => { if (u !== username) setTyping(`${u} is typing...`); };
    const onStopTyping = () => setTyping('');

    socket.on('receive_message', onMsg);
    socket.on('typing',          onTyping);
    socket.on('stop_typing',     onStopTyping);
    return () => {
      socket.off('receive_message', onMsg);
      socket.off('typing',          onTyping);
      socket.off('stop_typing',     onStopTyping);
    };
  }, [socket, username]);

  // ── Send text message ──────────────────────────────────
  const sendText = useCallback(() => {
    const content = text.trim();
    if (!content || !socket) return;
    const msg = { roomId, userId, username, type: 'text', content };
    socket.emit('send_message', msg);
    socket.emit('stop_typing',  { roomId });

    // Persist to DB async
    fetch(`${API}/api/rooms/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('wp_token')}` },
      body: JSON.stringify({ roomId, type: 'text', content }),
    }).catch(() => {});

    setText('');
    setShowEmoji(false);
  }, [text, socket, roomId, userId, username]);

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  };

  const handleTyping = e => {
    setText(e.target.value);
    if (socket) {
      socket.emit('typing', { roomId, username });
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => socket.emit('stop_typing', { roomId }), 1500);
    }
  };

  // ── Voice recording ────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr     = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRef.current  = mr;
      chunksRef.current = [];
      recStart.current  = Date.now();

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob     = new Blob(chunksRef.current, { type: 'audio/webm' });
        const duration = (Date.now() - recStart.current) / 1000;
        stream.getTracks().forEach(t => t.stop());
        await sendVoice(blob, duration);
      };

      mr.start();
      setRecording(true);
      setRecTime(0);
      recTimer.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch {
      alert('Microphone access denied. Please allow mic access.');
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    clearInterval(recTimer.current);
    setRecording(false);
    setRecTime(0);
  };

  const sendVoice = async (blob, duration) => {
    const fd = new FormData();
    fd.append('voice',    blob, 'voice.webm');
    fd.append('roomId',   roomId);
    fd.append('duration', duration.toFixed(2));

    try {
      const res  = await fetch(`${API}/api/voice/upload`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('wp_token')}` }, body: fd,
      });
      const data = await res.json();
      if (res.ok && socket) {
        socket.emit('send_message', { ...data, roomId, userId, username, type: 'voice' });
      }
    } catch (err) { console.error('Voice upload failed', err); }
  };

  const isMe  = uid => uid === userId;
  const fmtT  = iso => { try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return ''; } };
  const fmtSec = s => { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2,'0')}`; };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d0d', fontFamily: "'Syne',sans-serif" }}>

      {/* Header (only if not compact) */}
      {!compact && (
        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
          <span style={{ fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#333' }}>💬 Chat</span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '0.5rem' : '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#222', fontSize: '0.8rem', padding: '2rem 0' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>👋</div>
            Say something to start chatting!
          </div>
        )}

        {messages.map((msg, i) => {
          const me = isMe(msg.userId || msg.user_id);
          const isSystem = msg.type === 'system';
          if (isSystem) return (
            <div key={msg.id || i} style={{ textAlign: 'center', color: '#333', fontSize: '0.72rem', padding: '0.35rem', fontStyle: 'italic' }}>
              {msg.content}
            </div>
          );

          return (
            <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start' }}>
              {!me && !compact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem', marginLeft: '0.25rem' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: avatarColor || '#6C63FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700 }}>
                    {(msg.username || msg.user_name || '?').slice(0,2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.68rem', color: '#444' }}>{msg.username || msg.user_name}</span>
                </div>
              )}

              <div style={{
                maxWidth: compact ? '90%' : '80%',
                background: me ? '#6C63FF' : '#1a1a1a',
                borderRadius: me ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                padding: msg.type === 'voice' ? '0.5rem 0.75rem' : '0.55rem 0.9rem',
                fontSize: compact ? '0.8rem' : '0.88rem',
                lineHeight: 1.5,
                wordBreak: 'break-word',
                color: '#f0f0f0',
              }}>
                {msg.type === 'voice' ? (
                  <VoiceMessage url={`${API}${msg.voice_url}`} duration={msg.duration} isMe={me} />
                ) : (
                  msg.content
                )}
              </div>

              <span style={{ fontSize: '0.6rem', color: '#2a2a2a', marginTop: '0.15rem', marginRight: me ? '0.25rem' : 0, marginLeft: me ? 0 : '0.25rem' }}>
                {fmtT(msg.time || msg.created_at)}
              </span>
            </div>
          );
        })}

        {typing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#333', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
            <span style={{ display: 'flex', gap: '2px' }}>
              {[0,1,2].map(i => <span key={i} style={{ width: '4px', height: '4px', background: '#444', borderRadius: '50%', display: 'inline-block', animation: `bounce 1.2s ${i*0.2}s infinite` }} />)}
            </span>
            {typing}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '0.5rem', borderTop: '1px solid #1a1a1a', background: '#111', maxHeight: '100px', overflowY: 'auto' }}>
          {EMOJIS.map(em => (
            <button key={em} onClick={() => { setText(t => t + em); setShowEmoji(false); }}
              style={{ background: 'none', border: 'none', fontSize: compact ? '1rem' : '1.1rem', cursor: 'pointer', padding: '0.2rem', borderRadius: '4px', transition: 'background 0.1s' }}
              onMouseEnter={e => e.target.style.background = '#1a1a1a'}
              onMouseLeave={e => e.target.style.background = 'none'}>
              {em}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div style={{ padding: compact ? '0.4rem' : '0.6rem', borderTop: '1px solid #1a1a1a', display: 'flex', gap: '0.35rem', alignItems: 'flex-end', flexShrink: 0, background: '#0d0d0d' }}>
        {/* Emoji button */}
        <button onClick={() => setShowEmoji(s => !s)}
          style={{ background: 'none', border: 'none', fontSize: compact ? '1rem' : '1.15rem', cursor: 'pointer', padding: '0.4rem', opacity: showEmoji ? 1 : 0.4, transition: 'opacity 0.2s', flexShrink: 0 }}>
          😊
        </button>

        {/* Voice recording state */}
        {recording ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
            <span style={{ fontSize: '0.8rem', color: '#f87171', fontFamily: "'DM Mono',monospace" }}>{fmtSec(recTime)}</span>
            <span style={{ fontSize: '0.78rem', color: '#555' }}>Recording…</span>
          </div>
        ) : (
          <textarea value={text} onChange={handleTyping} onKeyDown={handleKey}
            placeholder={compact ? 'Message…' : 'Type a message…'}
            rows={1}
            style={{ flex: 1, background: '#1a1a1a', border: '1px solid #222', borderRadius: '10px', padding: '0.6rem 0.85rem', color: '#f0f0f0', fontSize: compact ? '0.8rem' : '0.88rem', resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: '80px', fontFamily: "'Syne',sans-serif" }}
          />
        )}

        {/* Voice button */}
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          title="Hold to record voice message"
          style={{ background: recording ? 'rgba(239,68,68,0.2)' : '#1a1a1a', border: recording ? '1px solid rgba(239,68,68,0.5)' : '1px solid #222', borderRadius: '10px', padding: '0.6rem', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, transition: 'all 0.15s', color: recording ? '#f87171' : '#888' }}>
          🎙️
        </button>

        {/* Send button */}
        {!recording && (
          <button onClick={sendText}
            style={{ background: '#6C63FF', border: 'none', borderRadius: '10px', padding: compact ? '0.55rem 0.7rem' : '0.6rem 0.85rem', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, color: '#fff' }}>
            ↑
          </button>
        )}
      </div>

      <style>{`
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}

// ── Voice message player ──────────────────────────────────
function VoiceMessage({ url, duration, isMe }) {
  const audioRef = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [curTime,  setCurTime]  = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play();  setPlaying(true);  }
  };

  const fmtSec = s => { const m = Math.floor(s/60); return `${m}:${String(Math.floor(s%60)).padStart(2,'0')}`; };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: '160px' }}>
      <audio ref={audioRef} src={url}
        onTimeUpdate={() => { const a = audioRef.current; if (a) { setCurTime(a.currentTime); setProgress(a.duration ? (a.currentTime/a.duration)*100 : 0); } }}
        onEnded={() => { setPlaying(false); setProgress(0); setCurTime(0); }} />
      <button onClick={toggle}
        style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? 'rgba(255,255,255,0.2)' : '#2a2a2a', border: 'none', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 3, background: isMe ? 'rgba(255,255,255,0.2)' : '#333', borderRadius: 2, overflow: 'hidden', marginBottom: '0.2rem' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: isMe ? 'rgba(255,255,255,0.8)' : '#6C63FF', borderRadius: 2, transition: 'width 0.1s' }} />
        </div>
        <span style={{ fontSize: '0.65rem', color: isMe ? 'rgba(255,255,255,0.6)' : '#555' }}>
          {playing ? fmtSec(curTime) : fmtSec(duration || 0)}
        </span>
      </div>
    </div>
  );
}
