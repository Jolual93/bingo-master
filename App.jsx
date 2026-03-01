import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Volume2, VolumeX, Users, Coins, CheckCircle2,
  Ticket, Gift, Globe, UserPlus, Copy, Link as LinkIcon,
  AlertTriangle, Share2, Check
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc,
  onSnapshot, updateDoc, arrayUnion
} from 'firebase/firestore';

import firebaseConfig from './firebaseConfig';

let auth, db;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) { console.error('Firebase init error:', e); }

const APP_ID = 'bingo-master-v1';
const DRAW_INTERVAL = 3500;

const GAME_MODES = {
  line:  { id: 'line',  name: '1 Línea',     price: 10, reward: 50,  desc: 'Horizontal, vertical o diagonal.' },
  cross: { id: 'cross', name: 'Cruz (+)',      price: 20, reward: 120, desc: 'Tercera fila y tercera columna.' },
  x:     { id: 'x',    name: 'Equis (X)',     price: 20, reward: 120, desc: 'Ambas diagonales completas.' },
  full:  { id: 'full', name: 'Cartón Lleno', price: 50, reward: 400, desc: 'Marca las 24 casillas y el centro.' },
};
const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];

// ── UTILS ──────────────────────────────────────────────────────────────────────

const generateCard = () => {
  const card = Array.from({ length: 5 }, () => []);
  for (let col = 0; col < 5; col++) {
    const min = col * 15 + 1;
    const nums = [];
    while (nums.length < 5) {
      const n = Math.floor(Math.random() * 15) + min;
      if (!nums.includes(n)) nums.push(n);
    }
    for (let row = 0; row < 5; row++) {
      const isFree = row === 2 && col === 2;
      card[row][col] = { value: isFree ? 'FREE' : nums[row], marked: isFree, isFree };
    }
  }
  return card;
};

const generatePool = () => {
  const pool = Array.from({ length: 75 }, (_, i) => {
    const n = i + 1;
    return { letter: n <= 15 ? 'B' : n <= 30 ? 'I' : n <= 45 ? 'N' : n <= 60 ? 'G' : 'O', number: n };
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
};

const analyzeCard = (card, modeId) => {
  const marks = (cells) => cells.filter(c => c.marked).length;
  let progress = 0, maxNeeded = 5;
  if (modeId === 'line') {
    let best = 0;
    for (let i = 0; i < 5; i++) {
      best = Math.max(best, marks(card[i]));
      best = Math.max(best, marks([card[0][i], card[1][i], card[2][i], card[3][i], card[4][i]]));
    }
    best = Math.max(best, marks([card[0][0], card[1][1], card[2][2], card[3][3], card[4][4]]));
    best = Math.max(best, marks([card[0][4], card[1][3], card[2][2], card[3][1], card[4][0]]));
    progress = best;
  } else if (modeId === 'x') {
    maxNeeded = 9;
    const cells = new Set([card[0][0], card[1][1], card[2][2], card[3][3], card[4][4], card[0][4], card[1][3], card[3][1], card[4][0]]);
    progress = marks([...cells]);
  } else if (modeId === 'cross') {
    maxNeeded = 9;
    const cells = new Set([card[2][0], card[2][1], card[2][2], card[2][3], card[2][4], card[0][2], card[1][2], card[3][2], card[4][2]]);
    progress = marks([...cells]);
  } else {
    maxNeeded = 25;
    card.forEach(row => row.forEach(c => { if (c.marked) progress++; }));
  }
  return { hasBingo: progress >= maxNeeded, progress, maxNeeded };
};

const copyToClipboard = async (text) => {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const el = document.createElement('textarea');
    el.value = text; el.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
  }
};

const getInviteUrl = (code) => window.location.href.split('?')[0] + '?room=' + code;

// ── SHARE PANEL ────────────────────────────────────────────────────────────────

function SharePanel({ roomCode, onToast }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const url = getInviteUrl(roomCode);

  const handleCopy = async (text, type) => {
    await copyToClipboard(text);
    if (type === 'code') { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); onToast('¡Código copiado!'); }
    else { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); onToast('¡Link copiado! 🔗'); }
  };

  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '0.75rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Share2 size={13} /> Invita a tus amigos
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1, background: '#1e293b', border: '1px solid #475569', borderRadius: '0.5rem', padding: '0.75rem', fontFamily: 'monospace', fontSize: '1.5rem', letterSpacing: '0.3em', color: '#fbbf24', fontWeight: 900, textAlign: 'center', userSelect: 'all' }}>{roomCode}</div>
        <button onClick={() => handleCopy(roomCode, 'code')} style={{ padding: '0 0.75rem', background: copiedCode ? 'rgba(34,197,94,0.2)' : '#1e293b', border: `1px solid ${copiedCode ? '#22c55e' : '#475569'}`, borderRadius: '0.5rem', color: copiedCode ? '#4ade80' : '#cbd5e1', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', fontSize: '0.65rem', fontWeight: 700, minWidth: '56px' }}>
          {copiedCode ? <Check size={16} /> : <Copy size={16} />}{copiedCode ? 'Copiado' : 'Código'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
        <button onClick={() => handleCopy(url, 'link')} style={{ padding: '0 0.75rem', background: copiedLink ? 'rgba(34,197,94,0.2)' : '#1e293b', border: `1px solid ${copiedLink ? '#22c55e' : '#475569'}`, borderRadius: '0.5rem', color: copiedLink ? '#4ade80' : '#cbd5e1', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', fontSize: '0.65rem', fontWeight: 700, minWidth: '56px' }}>
          {copiedLink ? <Check size={16} /> : <LinkIcon size={16} />}{copiedLink ? 'Copiado' : 'Link'}
        </button>
      </div>
      <button onClick={async () => { if (navigator.share) { try { await navigator.share({ title: '¡Juega Bingo!', url }); } catch {} } else handleCopy(url, 'link'); }}
        style={{ width: '100%', background: '#f59e0b', color: '#0f172a', fontWeight: 900, padding: '0.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
        <Share2 size={16} />{navigator.share ? 'Compartir con...' : 'Copiar Link'}
      </button>
    </div>
  );
}

// ── JOIN MODAL ─────────────────────────────────────────────────────────────────

function JoinModal({ roomCode, playerName, setPlayerName, onJoin, onCancel, loading, roomInfo }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
      <div style={{ background: '#1e293b', border: '2px solid rgba(245,158,11,0.5)', borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: '22rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎱</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', marginBottom: '0.5rem' }}>¡Te invitaron a jugar!</h2>
        {roomInfo && <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>Sala de <span style={{ color: '#fbbf24', fontWeight: 700 }}>{roomInfo.players?.[0]?.name || 'alguien'}</span></p>}
        <div style={{ background: '#0f172a', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '0.75rem', padding: '0.75rem 1.5rem', display: 'inline-block', margin: '0.75rem 0 1.5rem' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '2rem', letterSpacing: '0.3em', color: '#fbbf24', fontWeight: 900 }}>{roomCode}</span>
        </div>
        <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase' }}>Tu nombre:</label>
          <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && playerName.trim() && onJoin()}
            style={{ width: '100%', background: '#0f172a', border: '2px solid #475569', borderRadius: '0.75rem', padding: '0.75rem 1rem', color: '#fff', fontSize: '1.125rem', outline: 'none', fontFamily: 'Inter,sans-serif', boxSizing: 'border-box' }}
            placeholder="¿Cómo te llamas?" maxLength={15} autoFocus />
        </div>
        <button onClick={onJoin} disabled={!playerName.trim() || loading}
          style={{ width: '100%', background: '#f59e0b', color: '#0f172a', fontWeight: 900, padding: '1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem', marginBottom: '0.75rem', opacity: (!playerName.trim() || loading) ? 0.5 : 1 }}>
          {loading ? <div style={{ width: '1.25rem', height: '1.25rem', border: '2px solid #0f172a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <><UserPlus size={18} /> Entrar</>}
        </button>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline' }}>No, gracias</button>
      </div>
    </div>
  );
}

// ── MAIN ───────────────────────────────────────────────────────────────────────

export default function BingoMaster() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState(localStorage.getItem('bingo_name') || '');
  const [coins, setCoins] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [screen, setScreen] = useState('main_menu');
  const [playMode, setPlayMode] = useState(null);
  const [selectedMode, setSelectedMode] = useState('line');
  const [numCards, setNumCards] = useState(1);
  const [playerCards, setPlayerCards] = useState([]);
  const [aiPlayers, setAiPlayers] = useState([]);
  const [localBalls, setLocalBalls] = useState([]);
  const [localPool, setLocalPool] = useState([]);
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [toast, setToast] = useState('');
  const [gameState, setGameState] = useState('menu');
  const [promoCode, setPromoCode] = useState('');
  const [pendingRoom, setPendingRoom] = useState('');
  const [pendingRoomInfo, setPendingRoomInfo] = useState(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joiningLoading, setJoiningLoading] = useState(false);

  // Refs for intervals
  const localTimerRef = useRef(null);
  const winRef = useRef(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  // ── AUTH ──
  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const ref = doc(db, 'artifacts', APP_ID, 'users', u.uid, 'profile', 'data');
        const snap = await getDoc(ref);
        if (snap.exists()) setCoins(snap.data().coins ?? 200);
        else { await setDoc(ref, { coins: 200 }); setCoins(200); }
      }
    });
  }, []);

  const updateCoins = async (delta) => {
    setCoins(prev => {
      const next = prev + delta;
      if (user) setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), { coins: next }, { merge: true });
      return next;
    });
  };

  // ── INVITE LINK ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('room');
    if (!r) return;
    const code = r.toUpperCase();
    setPendingRoom(code);
    setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', code));
        if (snap.exists()) setPendingRoomInfo(snap.data());
      } catch {}
      setShowJoinModal(true);
    }, 1200);
  }, []);

  const handleJoinFromLink = async () => {
    if (!playerName.trim() || !pendingRoom || !user) return;
    setJoiningLoading(true);
    try {
      const code = pendingRoom;
      const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', code));
      if (!snap.exists()) { showToast('La sala ya no existe'); setShowJoinModal(false); window.history.replaceState({}, '', window.location.pathname); setJoiningLoading(false); return; }
      if (snap.data().status !== 'lobby') { showToast('La partida ya comenzó'); setShowJoinModal(false); window.history.replaceState({}, '', window.location.pathname); setJoiningLoading(false); return; }
      localStorage.setItem('bingo_name', playerName);
      await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', code), { players: arrayUnion({ uid: user.uid, name: playerName }) });
      window.history.replaceState({}, '', window.location.pathname);
      setRoomCode(code); setIsHost(snap.data().hostId === user.uid); setPlayMode('multi'); setScreen('lobby'); setShowJoinModal(false); setPendingRoom('');
    } catch (e) { console.error(e); showToast('Error al unirse'); }
    setJoiningLoading(false);
  };

  // ── VOICE ──
  const speak = useCallback((letter, number) => {
    if (!soundEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`${letter}. ${number}.`);
    u.lang = 'es-ES'; u.rate = 0.85;
    window.speechSynthesis.speak(u);
  }, [soundEnabled]);

  // ── ROOM LISTENER ──
  useEffect(() => {
    if (!user || !roomCode || playMode !== 'multi') return;
    const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', roomCode);
    return onSnapshot(ref, snap => {
      if (!snap.exists()) { showToast('La sala fue cerrada.'); leaveRoom(); return; }
      const data = snap.data();
      setRoomData(data);
      setSelectedMode(data.mode);

      setScreen(prev => {
        if (data.status === 'playing' && prev === 'lobby') { winRef.current = false; return 'playing'; }
        if (data.status === 'finished' && prev === 'playing') {
          setGameState(data.winnerInfo?.uid === user.uid ? 'won' : 'lost');
          if (data.winnerInfo?.uid !== user.uid) {
            window.speechSynthesis?.cancel();
            window.speechSynthesis?.speak(new SpeechSynthesisUtterance(`¡Bingo! ¡Ganó ${data.winnerInfo?.name}!`));
          }
          return 'finished';
        }
        if (data.status === 'lobby' && prev === 'finished') return 'lobby';
        return prev;
      });

      if (data.status === 'playing' && data.drawnBalls?.length > 0) {
        speak(data.drawnBalls[0].letter, data.drawnBalls[0].number);
      }
    });
  }, [user, roomCode, playMode, speak]);

  // ── CHECK CARDS (MULTI) ──
  useEffect(() => {
    if (playMode !== 'multi' || screen !== 'playing' || !roomData?.drawnBalls?.length) return;
    const balls = roomData.drawnBalls;
    let won = false, winCount = 0;
    const updated = playerCards.map(card => {
      const nc = card.map(row => row.map(cell => balls.some(b => b.number === cell.value) ? { ...cell, marked: true } : cell));
      if (analyzeCard(nc, selectedMode).hasBingo) { won = true; winCount++; }
      return nc;
    });
    setPlayerCards(updated);
    if (won && !winRef.current) {
      winRef.current = true;
      const reward = GAME_MODES[selectedMode].reward * winCount;
      updateCoins(reward);
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance('¡Bingo! ¡Has ganado!'));
      updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', roomCode), {
        status: 'finished', winnerInfo: { uid: user.uid, name: playerName, reward },
      });
    }
  }, [roomData?.drawnBalls]);

  // ── HOST: DRAW BALLS ──
  // This effect runs whenever screen or isHost changes
  // HOST: draw balls every DRAW_INTERVAL using setInterval
  // Reads fresh data from Firestore every tick to avoid stale state
  useEffect(() => {
    if (screen !== 'playing' || playMode !== 'multi' || !isHost || !roomCode) return;

    console.log('[HOST] Starting ball draw interval for room:', roomCode);

    const timer = setInterval(async () => {
      try {
        const roomRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', roomCode);
        const snap = await getDoc(roomRef);
        if (!snap.exists()) return;
        const data = snap.data();
        console.log('[HOST] tick - status:', data.status, 'pool size:', data.pool?.length);
        if (data.status !== 'playing') return;
        if (!data.pool || data.pool.length === 0) { console.log('[HOST] Pool empty, stopping'); return; }
        const pool = [...data.pool];
        const ball = pool.pop();
        console.log('[HOST] Drawing ball:', ball);
        await updateDoc(roomRef, {
          pool,
          drawnBalls: [ball, ...(data.drawnBalls || [])],
        });
      } catch (e) {
        console.error('[HOST] draw error:', e);
      }
    }, DRAW_INTERVAL);

    return () => {
      console.log('[HOST] Clearing ball draw interval');
      clearInterval(timer);
    };
  }, [screen, isHost, playMode, roomCode]);

  // ── MULTIPLAYER ROOM ──
  const createRoom = async () => {
    if (!playerName.trim()) return showToast('Ingresa tu nombre primero');
    if (!user) return showToast('Espera un momento...');
    localStorage.setItem('bingo_name', playerName);
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', code), {
      roomId: code, hostId: user.uid, status: 'lobby', mode: 'line',
      pool: [], drawnBalls: [], winnerInfo: null,
      players: [{ uid: user.uid, name: playerName }],
    });
    setRoomCode(code); setIsHost(true); setPlayMode('multi'); setScreen('lobby');
  };

  const joinRoom = async () => {
    if (!playerName.trim()) return showToast('Ingresa tu nombre primero');
    if (!joinInput.trim()) return showToast('Ingresa un código');
    const code = joinInput.toUpperCase();
    const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', code));
    if (!snap.exists()) return showToast('La sala no existe');
    if (snap.data().status !== 'lobby') return showToast('La partida ya comenzó');
    localStorage.setItem('bingo_name', playerName);
    await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', code), { players: arrayUnion({ uid: user.uid, name: playerName }) });
    setRoomCode(code); setIsHost(snap.data().hostId === user.uid); setPlayMode('multi'); setScreen('lobby');
  };

  const startMultiGame = async () => {
    const cost = GAME_MODES[selectedMode].price * numCards;
    if (coins < cost) return showToast('Monedas insuficientes');
    updateCoins(-cost);
    const cards = Array.from({ length: numCards }, generateCard);
    setPlayerCards(cards);
    winRef.current = false;
    await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', roomCode), {
      status: 'playing', pool: generatePool(), drawnBalls: [], winnerInfo: null, mode: selectedMode,
    });
    setScreen('playing');
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance('¡Comienza el Bingo!'));
  };

  // Guests click this to confirm cards and wait
  const guestReady = () => {
    const cost = GAME_MODES[selectedMode].price * numCards;
    if (coins < cost) return showToast('Monedas insuficientes');
    updateCoins(-cost);
    const cards = Array.from({ length: numCards }, generateCard);
    setPlayerCards(cards);
    winRef.current = false;
    showToast('¡Cartones listos! Espera que el anfitrión inicie 🎱');
  };

  const leaveRoom = () => { setRoomCode(''); setRoomData(null); setPlayMode(null); setScreen('main_menu'); setJoinInput(''); };

  // ── LOCAL GAME ──
  const startLocalGame = () => {
    const cost = GAME_MODES[selectedMode].price * numCards;
    if (coins < cost) return showToast('Monedas insuficientes');
    updateCoins(-cost);
    winRef.current = false;
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(`¡Comienza el Bingo!`));
    setPlayerCards(Array.from({ length: numCards }, generateCard));
    setAiPlayers([
      { id: 1, name: 'Abuela Rosa', card: generateCard() },
      { id: 2, name: 'Tío Paco',    card: generateCard() },
      { id: 3, name: 'Primo Juan',  card: generateCard() },
    ].map(ai => ({ ...ai, ...analyzeCard(ai.card, selectedMode) })));
    setLocalPool(generatePool());
    setLocalBalls([]);
    setPlayMode('local');
    setGameState('playing');
    setScreen('playing');
  };

  useEffect(() => {
    if (playMode !== 'local' || screen !== 'playing') {
      clearInterval(localTimerRef.current);
      return;
    }
    localTimerRef.current = setInterval(() => {
      if (winRef.current) return;
      setLocalPool(pool => {
        if (!pool.length) return pool;
        const np = [...pool];
        const ball = np.pop();
        speak(ball.letter, ball.number);
        setLocalBalls(prev => [ball, ...prev]);

        setPlayerCards(cards => {
          let won = false, wc = 0;
          const u = cards.map(card => {
            const nc = card.map(row => row.map(c => c.value === ball.number ? { ...c, marked: true } : c));
            if (analyzeCard(nc, selectedMode).hasBingo) { won = true; wc++; }
            return nc;
          });
          if (won && !winRef.current) {
            winRef.current = true;
            setScreen('finished'); setGameState('won');
            updateCoins(GAME_MODES[selectedMode].reward * wc);
            window.speechSynthesis?.speak(new SpeechSynthesisUtterance('¡Bingo! ¡Has ganado!'));
          }
          return u;
        });

        setAiPlayers(ais => {
          let aiWon = false, wName = '';
          const u = ais.map(ai => {
            const nc = ai.card.map(row => row.map(c => c.value === ball.number ? { ...c, marked: true } : c));
            const a = analyzeCard(nc, selectedMode);
            if (a.hasBingo && !winRef.current && !aiWon) { aiWon = true; wName = ai.name; }
            return { ...ai, card: nc, progress: a.progress, maxNeeded: a.maxNeeded };
          });
          if (aiWon && !winRef.current) {
            winRef.current = true;
            setScreen('finished'); setGameState('lost');
            window.speechSynthesis?.speak(new SpeechSynthesisUtterance(`¡Bingo! ¡Ganó ${wName}!`));
          }
          return u;
        });
        return np;
      });
    }, DRAW_INTERVAL);
    return () => clearInterval(localTimerRef.current);
  }, [playMode, screen, speak, soundEnabled, selectedMode]);

  // ── PROMO ──
  const handlePromo = () => {
    if (promoCode.trim().toLowerCase() === 'jolual') { updateCoins(10000); showToast('¡+10,000 monedas! 💰'); }
    else showToast('Código inválido.');
    setPromoCode('');
  };

  // ── RENDER VARS ──
  const drawnBalls = playMode === 'multi' ? (roomData?.drawnBalls || []) : localBalls;
  const currentBall = drawnBalls[0] || null;
  const totalCost = GAME_MODES[selectedMode].price * numCards;

  const btn = (bg, color = '#fff') => ({
    width: '100%', background: bg, color, border: 'none', borderRadius: '0.75rem',
    padding: '1rem 1.5rem', fontWeight: 900, fontSize: '1.125rem', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
    fontFamily: 'inherit', transition: 'opacity 0.15s',
  });
  const inp = { width: '100%', background: '#0f172a', border: '2px solid #475569', borderRadius: '0.75rem', padding: '0.75rem 1rem', color: '#fff', fontSize: '1.125rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: "'Inter',sans-serif", padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {toast && (
        <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', background: '#f59e0b', color: '#0f172a', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 700, zIndex: 99999, display: 'flex', alignItems: 'center', gap: '0.5rem', border: '2px solid #fff', whiteSpace: 'nowrap' }}>
          <AlertTriangle size={18} /> {toast}
        </div>
      )}

      {showJoinModal && (
        <JoinModal roomCode={pendingRoom} playerName={playerName} setPlayerName={setPlayerName}
          onJoin={handleJoinFromLink} onCancel={() => { setShowJoinModal(false); window.history.replaceState({}, '', window.location.pathname); }}
          loading={joiningLoading} roomInfo={pendingRoomInfo} />
      )}

      {/* HEADER */}
      <header style={{ width: '100%', maxWidth: '72rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ cursor: screen !== 'playing' ? 'pointer' : 'default' }} onClick={() => screen !== 'playing' && setScreen('main_menu')}>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fbbf24', letterSpacing: '0.05em', textTransform: 'uppercase' }}>🎱 Bingo Master</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Multijugador & IA</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1e293b', padding: '0.5rem 1rem', borderRadius: '9999px', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Coins size={18} color="#fbbf24" /><span style={{ fontWeight: 700, color: '#fef3c7', fontSize: '1.125rem' }}>{coins}</span>
          </div>
          <button onClick={() => setSoundEnabled(v => !v)} style={{ background: '#1e293b', border: 'none', borderRadius: '9999px', padding: '0.6rem', cursor: 'pointer', display: 'flex' }}>
            {soundEnabled ? <Volume2 size={20} color="#fbbf24" /> : <VolumeX size={20} color="#64748b" />}
          </button>
        </div>
      </header>

      {/* MAIN MENU */}
      {screen === 'main_menu' && (
        <div style={{ width: '100%', maxWidth: '28rem', background: '#1e293b', border: '2px solid #334155', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>🎱</div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 900, color: '#fff', marginBottom: '1.5rem' }}>¿Cómo quieres jugar?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button style={{ ...btn('#2563eb') }} onClick={() => setScreen('local_setup')}><Play fill="currentColor" size={20} /> Jugar Local (vs IA)</button>
            <button style={{ ...btn('#f59e0b', '#0f172a') }} onClick={() => setScreen('multi_setup')}><Globe size={20} /> Multijugador Online</button>
          </div>
          <div style={{ borderTop: '1px solid #334155', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', marginBottom: '0.75rem' }}><Gift size={14} /> Canjear Código</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input value={promoCode} onChange={e => setPromoCode(e.target.value)} style={{ ...inp, flex: 1, textAlign: 'center', textTransform: 'uppercase', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }} placeholder="Ej. JOLUAL" />
              <button onClick={handlePromo} style={{ background: '#334155', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Canjear</button>
            </div>
          </div>
        </div>
      )}

      {/* MULTI SETUP */}
      {screen === 'multi_setup' && (
        <div style={{ width: '100%', maxWidth: '28rem', background: '#1e293b', border: '2px solid #334155', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
          <Globe size={56} color="#f59e0b" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', marginBottom: '1.5rem' }}>Multijugador Online</h2>
          <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem' }}>Tu Nombre:</label>
            <input value={playerName} onChange={e => setPlayerName(e.target.value)} style={inp} placeholder="Ej. Carlos" maxLength={15} />
          </div>
          <div style={{ background: '#0f172a', borderRadius: '0.75rem', border: '1px solid #334155', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.75rem' }}>Tengo un código de sala</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input value={joinInput} onChange={e => setJoinInput(e.target.value)} style={{ ...inp, flex: 1, textAlign: 'center', fontFamily: 'monospace', letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '1rem', padding: '0.5rem' }} placeholder="CÓDIGO" maxLength={6} />
              <button onClick={joinRoom} style={{ background: '#f59e0b', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: '#0f172a' }}>Unirse</button>
            </div>
          </div>
          <div style={{ color: '#475569', fontWeight: 700, margin: '0.5rem 0' }}>O</div>
          <button style={{ ...btn('#2563eb') }} onClick={createRoom}><UserPlus size={20} /> Crear Nueva Sala</button>
          <button onClick={() => setScreen('main_menu')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginTop: '1rem', textDecoration: 'underline', fontSize: '0.875rem', fontFamily: 'inherit' }}>Volver atrás</button>
        </div>
      )}

      {/* LOBBY */}
      {screen === 'lobby' && roomData && (
        <div style={{ width: '100%', maxWidth: '56rem', background: '#1e293b', border: '2px solid #334155', borderRadius: '1rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #334155', paddingBottom: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>Sala de {roomData.players?.[0]?.name}</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>{isHost ? '👑 Eres el anfitrión' : '🎮 Eres invitado'}</p>
            </div>
            <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', fontFamily: 'inherit' }}>Salir</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={14} /> Jugadores ({roomData.players?.length || 0})</div>
              <div style={{ background: '#0f172a', borderRadius: '0.75rem', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {roomData.players?.map((p, i) => (
                  <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                    <div style={{ width: '2rem', height: '2rem', borderRadius: '9999px', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#0f172a', fontSize: '0.875rem' }}>{p.name.charAt(0).toUpperCase()}</div>
                    <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.875rem' }}>{p.name} {p.uid === user?.uid && '(Tú)'} {i === 0 && '👑'}</span>
                  </div>
                ))}
              </div>
              <SharePanel roomCode={roomCode} onToast={showToast} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#0f172a', borderRadius: '0.75rem', padding: '1rem', border: '1px solid #334155' }}>
                {isHost ? (
                  <select value={selectedMode} onChange={e => { setSelectedMode(e.target.value); updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', roomCode), { mode: e.target.value }); }}
                    style={{ width: '100%', background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '0.5rem', padding: '0.75rem', fontFamily: 'inherit', outline: 'none' }}>
                    {Object.values(GAME_MODES).map(m => <option key={m.id} value={m.id}>{m.name} — {m.reward} 🪙</option>)}
                  </select>
                ) : (
                  <div style={{ padding: '0.75rem', background: '#1e293b', borderRadius: '0.5rem', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', fontWeight: 700, textAlign: 'center' }}>
                    {GAME_MODES[selectedMode].name} ({GAME_MODES[selectedMode].reward} 🪙)
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                  <span style={{ color: '#cbd5e1', fontSize: '0.875rem' }}>Tus Cartones:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#1e293b', padding: '0.25rem', borderRadius: '0.5rem' }}>
                    <button onClick={() => setNumCards(Math.max(1, numCards - 1))} style={{ width: '2rem', height: '2rem', background: '#334155', border: 'none', borderRadius: '0.25rem', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>-</button>
                    <span style={{ fontWeight: 900, width: '1rem', textAlign: 'center' }}>{numCards}</span>
                    <button onClick={() => setNumCards(Math.min(4, numCards + 1))} style={{ width: '2rem', height: '2rem', background: '#334155', border: 'none', borderRadius: '0.25rem', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>+</button>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                  Costo: <span style={{ color: coins >= totalCost ? '#fbbf24' : '#f87171', fontWeight: 700 }}>{totalCost} 🪙</span>
                </div>
              </div>
              {isHost ? (
                <button onClick={startMultiGame} disabled={coins < totalCost} style={{ ...btn('#22c55e', '#0f172a'), opacity: coins < totalCost ? 0.5 : 1 }}>
                  <Play fill="currentColor" size={20} /> ¡Empezar Partida!
                </button>
              ) : playerCards.length > 0 ? (
                <div style={{ textAlign: 'center', background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e', borderRadius: '0.75rem', padding: '1rem', color: '#4ade80', fontWeight: 700 }}>
                  ✅ Cartones listos — esperando al anfitrión...
                </div>
              ) : (
                <button onClick={guestReady} disabled={coins < totalCost} style={{ ...btn('#f59e0b', '#0f172a'), opacity: coins < totalCost ? 0.5 : 1 }}>
                  <Ticket size={20} /> Comprar {numCards} Cartón{numCards > 1 ? 'es' : ''} ({totalCost} 🪙)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LOCAL SETUP */}
      {screen === 'local_setup' && (
        <div style={{ width: '100%', maxWidth: '42rem', background: '#1e293b', border: '2px solid #334155', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', marginBottom: '1.5rem' }}>Jugar contra la IA</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            {Object.values(GAME_MODES).map(mode => (
              <div key={mode.id} onClick={() => setSelectedMode(mode.id)} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: `2px solid ${selectedMode === mode.id ? '#f59e0b' : '#334155'}`, background: selectedMode === mode.id ? 'rgba(245,158,11,0.1)' : 'rgba(15,23,42,0.5)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>{selectedMode === mode.id && <CheckCircle2 size={14} color="#f59e0b" />} {mode.name}</span>
                  <span style={{ color: '#fbbf24', fontWeight: 900, fontSize: '0.75rem' }}>{mode.reward} 🪙</span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.7rem', marginBottom: '0.25rem' }}>{mode.desc}</p>
                <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>Costo: <span style={{ color: '#fbbf24' }}>{mode.price}</span></div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #334155', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <span style={{ fontWeight: 700, color: '#e2e8f0' }}>¿Cuántos cartones?</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#1e293b', borderRadius: '0.5rem', padding: '0.25rem' }}>
              <button onClick={() => setNumCards(Math.max(1, numCards - 1))} style={{ width: '2rem', height: '2rem', background: '#334155', border: 'none', borderRadius: '0.375rem', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>-</button>
              <span style={{ fontWeight: 900, fontSize: '1.25rem', width: '1.5rem', textAlign: 'center' }}>{numCards}</span>
              <button onClick={() => setNumCards(Math.min(4, numCards + 1))} style={{ width: '2rem', height: '2rem', background: '#334155', border: 'none', borderRadius: '0.375rem', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>+</button>
            </div>
            <span style={{ fontWeight: 900, fontSize: '1.25rem', color: coins >= totalCost ? '#fbbf24' : '#f87171' }}>{totalCost} 🪙</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => setScreen('main_menu')} style={{ flex: 1, background: '#334155', border: 'none', borderRadius: '0.75rem', padding: '1rem', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '1rem' }}>Volver</button>
            <button onClick={startLocalGame} disabled={coins < totalCost} style={{ flex: 2, ...btn('#f59e0b', '#0f172a'), opacity: coins < totalCost ? 0.5 : 1 }}><Play fill="currentColor" size={20} /> Jugar Ahora</button>
          </div>
        </div>
      )}

      {/* FINISHED */}
      {screen === 'finished' && (
        <div style={{ width: '100%', maxWidth: '28rem', background: '#1e293b', border: '2px solid #334155', borderRadius: '1rem', padding: '2rem', textAlign: 'center', marginTop: '2rem' }}>
          {gameState === 'won' ? (
            <><div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🏆</div>
              <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#fbbf24', marginBottom: '0.5rem' }}>¡BINGO!</h2>
              <p style={{ color: '#4ade80', fontSize: '1.25rem', fontWeight: 700, marginBottom: '2rem' }}>¡Premio entregado! 🪙</>
          ) : (
            <><div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>💸</div>
              <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#ef4444', marginBottom: '0.5rem' }}>Alguien más ganó</h2>
              <p style={{ fontSize: '1.125rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '2rem' }}>{playMode === 'multi' ? roomData?.winnerInfo?.name : 'La IA'} gritó Bingo primero.</p></>
          )}
          {playMode === 'multi' ? (
            isHost
              ? <button onClick={() => updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bingo_rooms', roomCode), { status: 'lobby' })} style={btn('#f59e0b', '#0f172a')}>Volver al Lobby</button>
              : <div style={{ color: '#94a3b8', fontWeight: 700, animation: 'pulse 2s infinite' }}>Esperando al anfitrión...</div>
          ) : (
            <button onClick={() => setScreen('local_setup')} style={btn('#f59e0b', '#0f172a')}>Jugar de Nuevo</button>
          )}
        </div>
      )}

      {/* PLAYING */}
      {screen === 'playing' && (
        <div style={{ width: '100%', maxWidth: '72rem', display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: '100%', maxWidth: '220px', display: 'flex', flexDirection: 'column', gap: '1rem', flexShrink: 0 }}>
            <div style={{ background: '#1e293b', borderRadius: '1rem', padding: '1rem', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>Última Bola</div>
              <div style={{ width: '6rem', height: '6rem', background: '#0f172a', borderRadius: '9999px', border: '4px solid #f59e0b', boxShadow: '0 0 20px rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                {currentBall
                  ? <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f59e0b' }}>{currentBall.letter}</div><div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{currentBall.number}</div></div>
                  : <div style={{ color: '#334155', fontSize: '1.5rem' }}>...</div>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxHeight: '4rem', overflowY: 'auto', justifyContent: 'center', width: '100%' }}>
                {drawnBalls.slice(1).map((b, i) => (
                  <span key={i} style={{ background: 'rgba(51,65,85,0.5)', color: '#cbd5e1', padding: '0.1rem 0.3rem', borderRadius: '0.25rem', fontSize: '0.625rem', fontWeight: 500, border: '1px solid #475569' }}>{b.letter}{b.number}</span>
                ))}
              </div>
            </div>
            <div style={{ background: '#1e293b', borderRadius: '1rem', padding: '1rem', border: '1px solid #334155' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Users size={12} color="#60a5fa" /> Rivales</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {playMode === 'local' ? aiPlayers.map(ai => {
                  const pct = (ai.progress / ai.maxNeeded) * 100;
                  return (
                    <div key={ai.id} style={{ background: 'rgba(15,23,42,0.5)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(51,65,85,0.5)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>{ai.name}</span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#fbbf24' }}>{ai.progress}/{ai.maxNeeded}</span>
                      </div>
                      <div style={{ height: '0.375rem', background: '#1e293b', borderRadius: '9999px' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct >= 80 ? '#ef4444' : '#3b82f6', borderRadius: '9999px', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                }) : roomData?.players?.map(p => (
                  <div key={p.uid} style={{ background: 'rgba(15,23,42,0.5)', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid rgba(51,65,85,0.5)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '1.5rem', height: '1.5rem', borderRadius: '9999px', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700 }}>{p.name.charAt(0)}</div>
                    <span style={{ fontSize: '0.75rem', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name} {p.uid === user?.uid && '(Tú)'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: 'rgba(30,41,59,0.8)', borderRadius: '0.75rem', padding: '0.75rem', border: '1px solid #334155', textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Modo</div>
              <div style={{ fontWeight: 700, color: '#fbbf24' }}>{GAME_MODES[selectedMode].name}</div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: playerCards.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: '1rem', width: '100%', maxWidth: playerCards.length === 1 ? '28rem' : '56rem' }}>
              {playerCards.map((card, ci) => (
                <div key={ci} style={{ background: '#fff', borderRadius: '0.75rem', boxShadow: '0 25px 50px rgba(0,0,0,.25)', padding: '0.75rem', borderBottom: '8px solid #cbd5e1', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-0.75rem', left: '-0.75rem', background: '#f59e0b', color: '#0f172a', fontWeight: 900, fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', border: '2px solid #fff', display: 'flex', alignItems: 'center', gap: '0.25rem', zIndex: 10 }}>
                    <Ticket size={12} /> Cartón {ci + 1}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '2px', marginBottom: '4px' }}>
                    {BINGO_LETTERS.map((l, i) => (
                      <div key={i} style={{ background: '#dc2626', borderRadius: '0.375rem 0.375rem 0 0', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff' }}>{l}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '2px' }}>
                    {card.map((row, ri) => row.map((cell, ci2) => (
                      <div key={`${ri}-${ci2}`} style={{ position: 'relative', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${cell.isFree ? '#fcd34d' : '#e2e8f0'}`, borderRadius: '0.5rem', background: cell.isFree ? '#fef3c7' : '#f8fafc', fontSize: '1.1rem', fontWeight: 700, color: cell.marked && !cell.isFree ? '#cbd5e1' : '#1e293b', overflow: 'hidden' }}>
                        <span style={{ position: 'relative', zIndex: 1, fontSize: cell.isFree ? '0.6rem' : undefined, color: cell.isFree ? '#d97706' : undefined, fontWeight: cell.isFree ? 900 : undefined }}>{cell.value}</span>
                        {cell.marked && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                            <div style={{ width: '83%', height: '83%', borderRadius: '9999px', background: 'rgba(59,130,246,0.6)', mixBlendMode: 'multiply', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div style={{ width: '60%', height: '60%', borderRadius: '9999px', background: 'rgba(37,99,235,0.8)' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  );
}
