    const { useState, useEffect, useRef } = React;

    // --- Supabase Initialization ---
    // ※ Supabaseプロジェクトを作成し、以下のURLとKEYを書き換えてください。
    const SUPABASE_URL = 'https://gxqowjjwhmbvvzuixcix.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4cW93amp3aG1idnZ6dWl4Y2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NjA2NjQsImV4cCI6MjA5OTIzNjY2NH0.tJLMJ-SDZpqcYIx0izkFff_lP9wBkQDMHt7cnVVANAQ';
    
    let supabaseClient = null;
    let isSupabaseReady = false;
    let myUid = localStorage.getItem('my_uid');
    
    try {
      // Babel環境などでのロード遅延に備えて安全に初期化
      if (typeof window !== 'undefined' && window.supabase && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        isSupabaseReady = true;
      }
      
      // UUID v4 generator for anonymous user
      if (!myUid) {
        myUid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
        localStorage.setItem('my_uid', myUid);
      }
    } catch (e) {
      console.warn("Supabase initialization failed.", e);
    }

    // --- Rate System ---

    const calculateElo = (playerRating, opponentRating, isWin, kFactor = 32) => {
      const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
      const actualScore = isWin ? 1 : 0;
      return Math.round(playerRating + kFactor * (actualScore - expectedScore));
    };


    const SUITS = ['♠', '♥', '♦', '♣'];
    const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const rankToValue = (r) => {
      if (r === 'A') return 1;
      if (r === '2') return 2;
      if (r === 'J') return 11;
      if (r === 'Q') return 12;
      if (r === 'K') return 13;
      if (r === 'Joker') return 0;
      return parseInt(r) || 0;
    };
    const valueToRank = (v) => {
      if (v === 1) return 'A';
      if (v === 2) return '2';
      if (v === 11) return 'J';
      if (v === 12) return 'Q';
      if (v === 13) return 'K';
      return v.toString();
    };
    const getEffectiveCount = (cardsToCount) => {
      if (cardsToCount.length === 2 && cardsToCount.some(c => c.rank === '5')) {
        const other = cardsToCount.find(c => c.rank !== '5');
        if (other && ['A', '2', '3', '4', '6', '7', '8'].includes(other.rank)) {
          return 1;
        }
      }
      return cardsToCount.length;
    };

    // Death Game Icons
    const ICONS = {
      '4': '🛡️', '5': '⛓️', '6': '🔥', '7': '🩸',
      '8': '🪓', '9': '🌀', '10': '💀', 'J': '⏳',
      'Q': '💣', 'K': '👁️', 'A': '🎯', 'Joker': '🃏'
    };

    const RANK_NAMES = {
      '3': '3', '4': '4シールド', '5': '5スキップ', '6': '6フェニックス', '7': '7渡し',
      '8': '8切り', '9': '9リバース', '10': '10捨て', 'J': '11バック', 'Q': '12ボンバー',
      'K': 'キングウォッチ', 'A': 'サービスエース', '2': '2', 'Joker': 'ジョーカー'
    };

    // ------------------- Sound Manager -------------------
    class SoundManager {
      constructor() {
        this.ctx = null;
        this.bgm = null;
        this.bgmType = null;
        this.bgmVolume = 0.28;
        this._pendingBGM = null; // queued before first interaction
      }

      // ---- Context Init ----
      _ensureCtx() {
        if (!this.ctx) {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      }

      // ---- BGM ----
      playTitleBGM() { this._playBGM('bgm tittle.mp3', 'title'); }
      playHomeBGM() { this._playBGM('bgm home.mp3', 'home'); }
      playGameBGM() { this._playBGM('bgm battle.mp3', 'game'); }

      _playBGM(file, type) {
        if (this.bgmType === type && this.bgm) return;
        this.stopBGM();
        const audio = new Audio(file);
        audio.loop = true;
        audio.volume = this.bgmVolume;
        this.bgm = audio;
        this.bgmType = type;
        // Try immediate play; if blocked, queue for first-interaction
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.catch(() => {
            this._pendingBGM = { audio, type };
          });
        }
      }

      // Called on first user gesture — flush any pending BGM
      flushPendingBGM() {
        if (this._pendingBGM) {
          const { audio, type } = this._pendingBGM;
          this._pendingBGM = null;
          this.bgm = audio;
          this.bgmType = type;
          audio.play().catch(() => { });
        }
        // Also resume AudioContext if it was suspended
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      }

      stopBGM() {
        if (this.bgm) {
          this.bgm.pause();
          this.bgm.currentTime = 0;
          this.bgm = null;
          this.bgmType = null;
        }
      }

      // ---- Noise helper ----
      _noise(freq, endFreq, vol, dur, filterType = 'highpass') {
        const ctx = this._ensureCtx();
        const now = ctx.currentTime;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const flt = ctx.createBiquadFilter();
        flt.type = filterType;
        flt.frequency.setValueAtTime(freq, now);
        flt.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        src.connect(flt); flt.connect(g); g.connect(ctx.destination);
        src.start(); src.stop(now + dur);
      }

      // ---- Osc helper ----
      _osc(type, freq, endFreq, vol, dur, endVol) {
        const ctx = this._ensureCtx();
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, now);
        if (endFreq !== null) o.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(endVol ?? 0.001, now + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(now + dur);
        return { osc: o, gainNode: g };
      }

      // ---- Card Handling: ページを捲るような摩擦音 ----
      playLightPaperSE() {
        // 高域ノイズ(4kHz→1kHz)の短いスウィープ
        this._noise(4000, 800, 0.06, 0.09, 'highpass');
        // 極薄い低域ノイズを重ねてコシを出す
        this._noise(800, 200, 0.03, 0.07, 'bandpass');
      }

      // ---- Heavier shuffle sound ----
      playPaperSE() {
        this._noise(3000, 600, 0.12, 0.15, 'highpass');
        this._noise(600, 200, 0.06, 0.12, 'bandpass');
      }

      // ---- Crumple (10 Discard) ----
      playCrumpleSE() {
        for (let i = 0; i < 10; i++) {
          const delay = i * 22;
          setTimeout(() => {
            this._noise(300 + Math.random() * 600, 80, 0.14, 0.06, 'bandpass');
          }, delay);
        }
      }

      // ---- Explosion wrapper (Q) ----
      playExplosionSE() { this.playEffectSE('Q'); }

      // ---- Game Start SE ----
      playStartSE() {
        const audio = new Audio('START.mp3');
        audio.volume = 0.3; // 小さめ
        audio.play().catch(e => console.warn(e));
      }

      playReadySE() {
        const audio = new Audio('READY.mp3');
        audio.volume = 0.3; // 小さめ
        audio.play().catch(e => console.warn(e));
      }

      // ---- Shield Miss SE ----
      playShieldMissSE() {
        const ctx = this._ensureCtx();
        if (!ctx) return;
        // 弾いた瞬間の硬いアタック音（カチンッ）
        this._osc('square', 6000, 2000, 0.15, 0.05, 0.001);
        
        // メインの「キーン」という金属の鳴り（長く伸びる高音）
        // わずかに周波数をずらした2つの音を重ねることで、金属特有の「うねり」を出す
        this._osc('sine', 4200, null, 0.6, 0.7, 0.001);
        this._osc('sine', 4220, null, 0.3, 0.7, 0.001); 
        
        // 高い倍音の響き
        setTimeout(() => {
          this._osc('sine', 8400, null, 0.1, 0.5, 0.001);
        }, 10);
      }

      // ---- Slash (2 Night) SE ----
      playSlashSE() {
        const ctx = this._ensureCtx();
        if (!ctx) return;
        // ザクッと切れる音（高域ノイズの鋭いアタック）
        this._noise(6000, 800, 0.5, 0.15, 'highpass');
        // 刃の鋭い響き
        this._osc('triangle', 2000, 200, 0.4, 0.15, 0.001);
      }

      // ================================================================
      // ---- playEffectSE — 全14ランク完全書き直し ----
      // ================================================================
      playEffectSE(rank) {
        const ctx = this._ensureCtx();
        const now = ctx.currentTime;

        switch (rank) {
          // -------- A : テニスの打球音 --------
          case 'A': {
            // 短く鋭いパーカッシブ・ピンポン音
            this._osc('sine', 900, 120, 0.35, 0.14, 0.001);
            // 打撃のノイズ(スウィッシュ)
            this._noise(3000, 800, 0.15, 0.1, 'highpass');
            break;
          }

          // -------- 2 : 鋭い剣戟音 --------
          case '2': {
            // 主剣撃 (鋭い金属インパクト)
            this._osc('sawtooth', 1400, 300, 0.3, 0.25, 0.001);
            // 副音 (共鳴リン)
            this._osc('sine', 2200, 2200, 0.18, 0.4, 0.001);
            // 空気を切る音
            this._noise(5000, 1000, 0.2, 0.15, 'highpass');
            break;
          }

          // -------- 3 : 布が擦れる柔らかな音 --------
          case '3': {
            this._noise(1200, 400, 0.12, 0.5, 'bandpass');
            this._noise(600, 200, 0.07, 0.45, 'bandpass');
            break;
          }

          // -------- 4 : 重厚な金属の盾の防御音 --------
          case '4': {
            // 低域衝撃
            this._osc('sine', 60, 30, 0.5, 0.6, 0.001);
            // 金属リン (高域余韻)
            this._osc('sine', 2800, 2800, 0.2, 0.8, 0.001);
            // 中域ガンとぶつかる音
            this._noise(1500, 400, 0.25, 0.3, 'bandpass');
            break;
          }

          // -------- 5 : ジャラジャラと鳴り響く鎖の音 --------
          case '5': {
            // 不規則な金属鎖 (7回)
            for (let i = 0; i < 7; i++) {
              const t = i * 65 + Math.random() * 30;
              setTimeout(() => {
                this._noise(4000 + Math.random() * 2000, 800, 0.1, 0.06, 'bandpass');
              }, t);
            }
            break;
          }

          // -------- 6 : 燃え盛る業火の炎 --------
          case '6': {
            // ランブリング・ファイアーノイズ
            const sr = ctx.sampleRate;
            const len = Math.ceil(sr * 2.0);
            const buf = ctx.createBuffer(1, len, sr);
            const dat = buf.getChannelData(0);
            for (let i = 0; i < len; i++) dat[i] = Math.random() * 2 - 1;
            const fireNoise = ctx.createBufferSource();
            fireNoise.buffer = buf;
            // ローパス + 揺れLFO
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 350;
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 9;
            const lfoG = ctx.createGain(); lfoG.gain.value = 220;
            lfo.connect(lfoG); lfoG.connect(lp.frequency);
            const fGain = ctx.createGain();
            fGain.gain.setValueAtTime(0.5, now);
            fGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
            fireNoise.connect(lp); lp.connect(fGain); fGain.connect(ctx.destination);
            lfo.start(now); lfo.stop(now + 2.0);
            fireNoise.start(now); fireNoise.stop(now + 2.0);
            break;
          }

          // -------- 7 : カードを捌く「サッ」という音 --------
          case '7': {
            this.playPaperSE();
            break;
          }

          // -------- 8 : 金属的な響きを伴う鋭い斬撃 --------
          case '8': {
            // 斬撃 (sawtooth pitch-drop)
            this._osc('sawtooth', 1200, 40, 0.4, 0.2, 0.001);
            // 空気を切るホワイトノイズ
            this._noise(6000, 800, 0.35, 0.2, 'highpass');
            // 金属残響 (キィン)
            this._osc('sine', 3500, 3500, 0.15, 0.55, 0.001);
            break;
          }

          // -------- 9 : 正確に刻まれる時計の秒針(チクタク) --------
          case '9': {
            // チク(高め)
            this._osc('sine', 3000, 3000, 0.25, 0.05, 0.001);
            this._noise(4000, 4000, 0.1, 0.04, 'bandpass');
            // タク (低め) — 少し遅れ
            setTimeout(() => {
              this._osc('sine', 2400, 2400, 0.2, 0.05, 0.001);
              this._noise(3000, 3000, 0.08, 0.04, 'bandpass');
            }, 380);
            break;
          }

          // -------- 10 : 紙をクシャクシャにする音 --------
          case '10': {
            this.playCrumpleSE();
            break;
          }

          // -------- J : どよめく群衆の声 --------
          case 'J': {
            // 15本のランダム周波数デチューン・オシレータ
            for (let i = 0; i < 15; i++) {
              const o = ctx.createOscillator();
              o.type = 'sine';
              o.frequency.value = 120 + Math.random() * 320;
              const g = ctx.createGain();
              g.gain.setValueAtTime(0.0, now);
              g.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.02, now + 0.25);
              g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
              o.connect(g); g.connect(ctx.destination);
              o.start(now); o.stop(now + 1.4);
            }
            // ざわめきノイズ
            this._noise(800, 300, 0.08, 1.2, 'bandpass');
            break;
          }

          // -------- Q : 画面を揺らす激しい爆発音 --------
          case 'Q': {
            // 超低域impact
            this._osc('square', 80, 8, 0.6, 1.2, 0.001);
            // 爆風ノイズ (ローパス)
            this._noise(1200, 20, 0.7, 1.2, 'lowpass');
            // 高域フラッシュノイズ
            this._noise(8000, 500, 0.3, 0.2, 'highpass');
            break;
          }

          // -------- K : 監視の目が光るような「ビーン」 --------
          case 'K': {
            // 上昇するサイン波 (エコー感)
            this._osc('sine', 400, 1200, 0.3, 0.9, 0.001);
            // 高周波ビビリ (vibrato)
            const kO = ctx.createOscillator();
            kO.type = 'sawtooth';
            kO.frequency.setValueAtTime(700, now);
            const vLfo = ctx.createOscillator(); vLfo.type = 'sine'; vLfo.frequency.value = 45;
            const vG = ctx.createGain(); vG.gain.value = 120;
            vLfo.connect(vG); vG.connect(kO.frequency);
            const kG = ctx.createGain();
            kG.gain.setValueAtTime(0.22, now);
            kG.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
            kO.connect(kG); kG.connect(ctx.destination);
            vLfo.start(now); vLfo.stop(now + 0.9);
            kO.start(now); kO.stop(now + 0.9);
            break;
          }

          // -------- Joker : カオス --------
          case 'Joker': {
            this._osc('sawtooth', 150, 3000, 0.35, 0.4, 0.001);
            this._noise(6000, 200, 0.2, 0.4, 'highpass');
            break;
          }

          default: {
            this._osc('sine', 440, 440, 0.2, 0.2, 0.001);
          }
        }
      }
    }

    const sm = new SoundManager();

    // ------------------- Card Data -------------------
    const TCG_DATA = {
      'A': { name: 'サービスＡ', desc: 'このカードで場が流れた時、6,7,Q,Kのいずれかの能力を発動', url: 'Aimage.webp', icon: '🎯', auraColor: '#2980b9' },
      '2': { name: '２ナイト', desc: '次のプレイヤーの手札からカードをランダムに2枚捨てる', url: '2image.webp', icon: '⚔️', auraColor: '#27ae60' },
      '3': { name: '３コモン', desc: '3枚出しで革命', url: '3image.webp', icon: '', auraColor: '#7f8c8d' },
      '4': { name: '４シールド', desc: 'このターン、他プレイヤーからの攻撃を受けない', url: '4image.webp', icon: '🛡️', auraColor: '#00b4d8' },
      '5': { name: 'プラス5', desc: '他のカードと合計したランクの効果を発動', url: '5image.webp', icon: '➕', auraColor: '#ff4444' },
      '6': { name: '６フェニックス', desc: '墓地からランダムにカードを入手', url: '6image.webp', icon: '🔥', auraColor: '#8e44ad' },
      '7': { name: '７渡し', desc: '次のプレイヤーにカードを譲渡', url: '7image.webp', icon: '🩸', auraColor: '#ffffff' },
      '8': { name: '８切り', desc: 'この場を強制的に終了', url: '8image.webp', icon: '🪓', auraColor: '#d35400' },
      '9': { name: '９リバース', desc: '回り順を逆転', url: '9image.webp', icon: '🌀', auraColor: '#f1c40f' },
      '10': { name: '１０捨て', desc: '任意のカードを墓地に捨てる', url: '10image.webp', icon: '💀', auraColor: '#2c3e50' },
      'J': { name: 'Ｊバック', desc: 'このターン、カードの強さが逆転', url: 'Jimage.webp', icon: '⏳', auraColor: '#e67e22' },
      'Q': { name: 'Ｑボンバー', desc: '場にある特定のカードを消滅', url: 'Qimage.webp', icon: '💣', auraColor: '#bdc3c7' },
      'K': { name: 'Ｋウォッチ', desc: '指定したプレイヤーの手札を監視', url: 'Kimage.webp', icon: '👁️', auraColor: '#f1c40f' },
      'Joker': { name: 'ジョーカー', desc: '最強のカード。何にでも成り代わる', url: 'joker.webp', icon: '🃏', auraColor: '#fd79a8' }
    };

    const createDeck = () => {
      let deck = [];
      for (let suit of SUITS) {
        for (let i = 0; i < RANKS.length; i++) {
          deck.push({ id: `${suit}${RANKS[i]}`, suit, rank: RANKS[i], strength: i });
        }
      }
      deck.push({ id: 'Joker1', suit: 'Joker', rank: 'Joker', strength: 13 });
      deck.push({ id: 'Joker2', suit: 'Joker', rank: 'Joker', strength: 13 });
      return deck;
    };

    const shuffle = (array) => {
      let deck = [...array];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      return deck;
    };



    // Rank title mapping representing hierarchy
    const getHierarchyTitle = (finishOrder) => {
      if (finishOrder === 1) return { title: "大富豪", cls: "rank-daifugo" };
      if (finishOrder === 2) return { title: "富豪", cls: "rank-fugo" };
      if (finishOrder === 3) return { title: "貧民", cls: "rank-hinmin" };
      if (finishOrder === 4) return { title: "大貧民", cls: "rank-daihinmin" };
      return { title: "生贄候補", cls: "" };
    };

    const LoadingIndicator = () => {
      const [cardData, setCardData] = useState(null);
      const [isFlipped, setIsFlipped] = useState(false);

      useEffect(() => {
        const ranks = ['3','4','5','6','7','8','9','10','J','Q','K','A','2','Joker'];
        setCardData(TCG_DATA[ranks[Math.floor(Math.random() * ranks.length)]]);

        const flipInterval = setInterval(() => {
          setIsFlipped(false); // flip face down
          setTimeout(() => {
            setCardData(TCG_DATA[ranks[Math.floor(Math.random() * ranks.length)]]);
            setIsFlipped(true); // flip face up
          }, 400); // Wait for face down animation to complete
        }, 1500);

        setTimeout(() => setIsFlipped(true), 50);

        return () => clearInterval(flipInterval);
      }, []);

      return (
        <div className="loading-card-container">
          <div className={`loading-card ${isFlipped ? 'flipped' : ''}`}>
            <div className="loading-card-front" style={{ backgroundImage: `url(${cardData?.url || ''})` }}></div>
            <div className="loading-card-back"></div>
          </div>
        </div>
      );
    };

    function App() {
      const [gameStarted, setGameStarted] = useState(false);
      const [titleStage, setTitleStage] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isStartPressed, setIsStartPressed] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isReadyPressed, setIsReadyPressed] = useState(false);
  const [hoveredMode, setHoveredMode] = useState(null);
  const [showLegalModal, setShowLegalModal] = useState(null);
  const [showInterstitialAd, setShowInterstitialAd] = useState(false);
  
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showLoadingUi, setShowLoadingUi] = useState(true);

  useEffect(() => {
    setIsAppLoading(true);
    setShowLoadingUi(true);

    let bgUrl = '';
    if (gameStarted) {
      bgUrl = 'room-bg.webp';
    } else if (titleStage === 2) {
      bgUrl = 'lobby-bg.webp';
    } else {
      bgUrl = 'title-bg.webp';
    }
    
    // preload image
    const img = new Image();
    img.onload = () => {
      // 念のため少しだけ遅延させてDOMの描画を待つ
      setTimeout(() => setIsAppLoading(false), 300);
    };
    img.onerror = () => {
      setIsAppLoading(false);
    };
    img.src = bgUrl;
  }, [gameStarted, titleStage]);

  useEffect(() => {
    if (!isAppLoading) {
      const timer = setTimeout(() => setShowLoadingUi(false), 500); // fade duration
      return () => clearTimeout(timer);
    } else {
      setShowLoadingUi(true);
    }
  }, [isAppLoading]);
  
  // Carousel State for Mobile
  const [carouselIndex, setCarouselIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleCarouselTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleCarouselTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const handleCarouselTouchEnd = () => {
    if (touchStartX.current - touchEndX.current > 50) {
      setCarouselIndex((prev) => (prev + 1) % 3);
    } else if (touchEndX.current - touchStartX.current > 50) {
      setCarouselIndex((prev) => (prev - 1 + 3) % 3);
    }
    // reset
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  const [privateCarouselIndex, setPrivateCarouselIndex] = useState(0);
  const privateTouchStartX = useRef(0);
  const privateTouchEndX = useRef(0);
  const handlePrivateTouchStart = (e) => {
    privateTouchStartX.current = e.touches[0].clientX;
  };
  const handlePrivateTouchMove = (e) => {
    privateTouchEndX.current = e.touches[0].clientX;
  };
  const handlePrivateTouchEnd = () => {
    if (privateTouchStartX.current - privateTouchEndX.current > 50) {
      setPrivateCarouselIndex((prev) => (prev + 1) % 2);
    } else if (privateTouchEndX.current - privateTouchStartX.current > 50) {
      setPrivateCarouselIndex((prev) => (prev - 1 + 2) % 2);
    }
    privateTouchStartX.current = 0;
    privateTouchEndX.current = 0;
  };
  
  const handleExitWithAd = () => {
    // 30%の確率で全面広告を表示
    if (Math.random() < 0.3) {
      setShowInterstitialAd(true);
      // 実際には広告表示後に閉じるイベント等で退場処理を行いますが、
      // プレースホルダーでは3秒後に自動で閉じて退場処理を行うモックにします
      setTimeout(() => {
        setShowInterstitialAd(false);
        performExit();
      }, 3000);
    } else {
      performExit();
    }
  };

  const performExit = () => {
    sm.playPaperSE();
    if (roomChannel) {
      roomChannel.unsubscribe();
      setRoomChannel(null);
    }
    setCurrentRoom(null);
    setIsHost(false);
    setGameStarted(false);
    setMultiplayerMode(null);
    setTitleStage(2);
    sm.playHomeBGM();
  };

  const handleReadyClick = () => {
    sm.playReadySE();
    setIsReadyPressed(true);
    setTimeout(() => {
      sm.playTitleBGM();
      setIsReady(true);
      setIsReadyPressed(false);
    }, 200);
  };

  const preloadImages = (srcArray, callback) => {
    let loaded = 0;
    let hasFired = false;
    const fireCallback = () => {
      if (!hasFired) {
        hasFired = true;
        callback();
      }
    };
    if (srcArray.length === 0) { fireCallback(); return; }
    srcArray.forEach(src => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        if (loaded === srcArray.length) fireCallback();
      };
      img.src = src;
    });
    setTimeout(fireCallback, 3000); // 3s fallback timeout
  };

  const handleStartGameTransition = () => {
    sm.playStartSE();
    setIsStartPressed(true);
    setIsTransitioning(true);
    
    const startTime = Date.now();
    preloadImages(['room home.png', 'online.png', 'CPU.png'], () => {
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 1500 - elapsed);
      setTimeout(() => {
        setTitleStage(2);
        sm.playHomeBGM();
        setIsStartPressed(false);
        setTimeout(() => setIsTransitioning(false), 50);
      }, remainingTime);
    });
  }; // 1: START, 2: 1人/マルチのモード選択
      const [multiplayerMode, setMultiplayerMode] = useState(null); // 'connecting' | 'lobby' | 'active'
      const [isHost, setIsHost] = useState(false);
      const [roomChannel, setRoomChannel] = useState(null);
      const [currentRoom, setCurrentRoom] = useState(null);
      const [myPlayerIndex, setMyPlayerIndex] = useState(0);
      const [passphrase, setPassphrase] = useState('');
      const [remotePlayers, setRemotePlayers] = useState([{ id: 'local', name: 'YOU' }]); // For lobby display
      const [isDealing, setIsDealing] = useState(false);
      const [hands, setHands] = useState([[], [], [], []]);
      const handsRef = React.useRef(hands);
      useEffect(() => { handsRef.current = hands; }, [hands]);
      const [tableCards, setTableCards] = useState([]);
      const [previousTableCards, setPreviousTableCards] = useState([]);
      const [turn, setTurn] = useState(0);
      const [turnTimeLeft, setTurnTimeLeft] = useState(15);
      const prevTimerTurnRef = useRef(0);
      const [passCount, setPassCount] = useState(0);
      const [lastPlayPlayer, setLastPlayPlayer] = useState(null);
      const [selectedCards, setSelectedCards] = useState([]);
      const [ranksDiscovered, setRanksDiscovered] = useState([]);
      const [restartVotes, setRestartVotes] = useState({});

      const [graveyard, setGraveyard] = useState([]);
      const [isShielded, setIsShielded] = useState([false, false, false, false]);
      const [is11Back, setIs11Back] = useState(false);
      const [isRevolution, setIsRevolution] = useState(false);
      const [isPlus5Active, setIsPlus5Active] = useState(false);
      const [playDirection, setPlayDirection] = useState(1);
      const [effectMessage, setEffectMessage] = useState(null);
      const [revAnimMessage, setRevAnimMessage] = useState(null);
      const [serviceAAnimMessage, setServiceAAnimMessage] = useState(null);
      const [watchTarget, setWatchTarget] = useState(null);
      const [watchSelectedTargets, setWatchSelectedTargets] = useState([]);
      const [serviceAState, setServiceAState] = useState(null);

      const [selectionTimeLeft, setSelectionTimeLeft] = useState(10);
      const [myProfile, setMyProfile] = useState(() => {
        const savedAvatar = localStorage.getItem('local_avatar') || 'knight';
        const savedName = localStorage.getItem('local_display_name') || 'YOU';
        return {
          display_name: savedName,
          avatar: savedAvatar
        };
      });

      // Online Match states
      const [playerRating, setPlayerRating] = useState(() => parseInt(localStorage.getItem('local_rating') || '1500', 10));
      const [onlineMatchStatus, setOnlineMatchStatus] = useState('idle'); // 'idle' | 'searching' | 'found'
      const [isOnlineMatch, setIsOnlineMatch] = useState(false);
      const [showLeaderboard, setShowLeaderboard] = useState(false);

      // --- Latest State Refs for Event Listeners (Stale Closure対策) ---
      const turnRef = useRef(turn);
      const isAnimatingRef = useRef(isAnimating);
      const remotePlayersRef = useRef(remotePlayers);
      const isGameOverRef = useRef(isGameOver);
      const myPlayerIndexRef = useRef(myPlayerIndex);
      const restartVotesRef = useRef(restartVotes);

      const executePlayRef = useRef();
      const executePassRef = useRef();
      const completeSpecialEffectRef = useRef();
      const handleRestartRef = useRef();
      const isValidPlayRef = useRef();

      useEffect(() => {
        turnRef.current = turn;
        isAnimatingRef.current = isAnimating;
        remotePlayersRef.current = remotePlayers;
        isGameOverRef.current = isGameOver;
        myPlayerIndexRef.current = myPlayerIndex;
        restartVotesRef.current = restartVotes;
      }, [turn, isAnimating, remotePlayers, isGameOver, myPlayerIndex, restartVotes]);

      const [leaderboardData, setLeaderboardData] = useState([]);
      const [showProfileSettings, setShowProfileSettings] = useState(false);
      const [tempProfileName, setTempProfileName] = useState('');
      
      const updateProfileName = () => {
        const newName = tempProfileName.trim() || 'YOU';
        localStorage.setItem('local_display_name', newName);
        setMyProfile(prev => prev ? { ...prev, display_name: newName } : null);
        setShowProfileSettings(false);
      };
      const [ratingChange, setRatingChange] = useState(null); // { old: 1500, new: 1520, diff: 20 }

      // Temporary Animation triggers
      const [clearingField, setClearingField] = useState(false);
      const [phoenixActive, setPhoenixActive] = useState(false);
      const [guillotineActive, setGuillotineActive] = useState(false);
      const [reverseActive, setReverseActive] = useState(false);
      const [bomberActive, setBomberActive] = useState(false);

      // Service A CPU Auto-Selection
      useEffect(() => {
        if (serviceAState && serviceAState.playerIndex !== 0 && !isActionLoading) {
          const rp = remotePlayers[serviceAState.playerIndex];
          const isCpu = !rp || (rp.id && rp.id.startsWith('cpu'));
          if (isCpu) {
            const options = ['6', '7', 'Q', 'K'];
            const choice = options[Math.floor(Math.random() * options.length)];
            setTimeout(() => {
              executeServiceAEffect(choice);
            }, 500); // 演出後にすぐ選択する
          }
        }
      }, [serviceAState, isActionLoading]);
      
      const [passThreadActive, setPassThreadActive] = useState(false);
      const [skipTarget, setSkipTarget] = useState(null); // CSS Chain effect
      const [missEffectTarget, setMissEffectTarget] = useState(null); // Shield sparks
      const [slashEffectTarget, setSlashEffectTarget] = useState(null); // Slash cut on opponent

      const [animMessage, setAnimMessage] = useState({ data: null, state: 'exit' });
      // New state for character cut‑in overlay
      const [cutIn, setCutIn] = useState(null);
      const [resurrectCard, setResurrectCard] = useState(null);
      const [discardingToGy, setDiscardingToGy] = useState([]); // cards flying to gy now

      // New selection states for special effects
      const [selectionMode, setSelectionMode] = useState(null); // '7', '10', 'Q'
      const [selectionInfo, setSelectionInfo] = useState(null); // { playerIndex, nextP, count }
      const [isActionLoading, setIsActionLoading] = useState(false);
      const cpuThinkingRef = React.useRef(false); // refで競合状態を防ぐ
      const prevTurnRef = React.useRef(0);
      const [passedPlayers, setPassedPlayers] = useState([]);

      // Performance/Animation states
      const [explodingCards, setExplodingCards] = useState([]); // { playerIndex, rank }[]
      const [centralBombCards, setCentralBombCards] = useState([]);
      const [flyingCards, setFlyingCards] = useState([]); // { from, to, card, type: 'phoenix'|'pass' }[]
      const [receivedHighlight, setReceivedHighlight] = useState(null); // playerIndex
      const [highlightedCardIds, setHighlightedCardIds] = useState([]); // Array of card IDs
      const [gyShuffling, setGyShuffling] = useState(false);
      const [phoenixGlowIds, setPhoenixGlowIds] = useState([]); // 6フェニックスで取得したカードID（紫色グロー）
      const [phoenixFlyCards, setPhoenixFlyCards] = useState([]); // {id, sx, sy, ex, ey}

      /**
       * 墓地からプレイヤー手札へカード飛翔アニメーション
       * getBoundingClientRect()で實座標を取得し、CSSカスタムプロパティでBezier曲線移動
       */
      const triggerPhoenixCardFly = (pIdx, onComplete) => {
        const gravityEl = document.querySelector('[data-graveyard]');
        const handEl = document.querySelector(`[data-player-hand="${pIdx}"]`);
        if (!gravityEl || !handEl) { setTimeout(onComplete, 750); return; }

        const fromRect = gravityEl.getBoundingClientRect();
        const toRect   = handEl.getBoundingClientRect();

        const flyId = Symbol();
        const sx = fromRect.left + fromRect.width  / 2;
        const sy = fromRect.top  + fromRect.height / 2;
        const ex = toRect.left   + toRect.width    / 2;
        const ey = toRect.top    + toRect.height   / 2;

        setPhoenixFlyCards(prev => [...prev, { id: flyId, sx, sy, ex, ey }]);
        setTimeout(() => {
          setPhoenixFlyCards(prev => prev.filter(c => c.id !== flyId));
          onComplete();
        }, 750);
      };
      const [isAnimating, setIsAnimating] = useState(false); // 全演出完了フラグ
      const [abilityLog, setAbilityLog] = useState("");
      const triggerAbilityLog = (msg) => {
        setAbilityLog(msg);
        setTimeout(() => setAbilityLog(""), 3000);
      };
      const lastTouchedId = React.useRef(null);
      const isSwipingRef = React.useRef(false); // スワイプ中判定
      const touchStartPos = React.useRef({ x: 0, y: 0 });
      const touchStartCardId = React.useRef(null);
      const hasFlickedPlay = React.useRef(false);

      const handlePointerDown = (e) => {
        isSwipingRef.current = false;
        hasFlickedPlay.current = false;
        // PCとモバイル両対応のためポインタ位置を記録
        touchStartPos.current = { x: e.clientX, y: e.clientY };

        const startCardElem = e.target.closest('.card.selectable');
        if (startCardElem) {
          touchStartCardId.current = startCardElem.getAttribute('data-card-id');
        } else {
          touchStartCardId.current = null;
        }

        try { e.target.setPointerCapture(e.pointerId); } catch(err) {}
      };

      const handlePointerMove = (e, playerIdx) => {
        if (playerIdx !== myPlayerIndex || turn !== myPlayerIndex || selectionMode || exchangePhase || hasFlickedPlay.current) return;
        // ドラッグ（マウスボタン押しっぱなし or タッチ中）のみ処理
        if (e.pointerType === 'mouse' && e.buttons === 0) return;
        
        // フリック（上方向へのスライド）判定
        const deltaY = touchStartPos.current.y - e.clientY; // 上にスワイプすると正
        const deltaX = Math.abs(e.clientX - touchStartPos.current.x);

        // 少しのブレはスワイプとみなさない（タップ判定を維持するための遊び）
        if (Math.abs(deltaY) < 10 && deltaX < 10) return;
        
        isSwipingRef.current = true;

        // Y方向へ50px以上、かつX方向の1.5倍以上の移動で「上フリック」とみなす
        if (deltaY > 50 && deltaY > deltaX * 1.5) {
          if (!isActionLoading) {
            // フリックされたカードを特定
            let flickedCard = null;
            if (touchStartCardId.current) {
              flickedCard = hands[myPlayerIndex].find(c => c.id === touchStartCardId.current);
            }

            let playCandidate = [...selectedCards];
            
            // 選択されていないカードをフリックした場合は、候補に追加
            if (flickedCard && !selectedCards.find(c => c.id === flickedCard.id)) {
              playCandidate.push(flickedCard);
            }

            // 出せる条件を満たしているかチェック
            if (playCandidate.length > 0 && isValidPlay(playCandidate)) {
              handleFlickPlay(playCandidate);
              hasFlickedPlay.current = true; // 1回のフリックで複数回発火しないようにする
            } else if (flickedCard && isValidPlay([flickedCard])) {
              // 選択中カード＋フリックカードでは出せないが、フリックカード単体なら出せる場合
              handleFlickPlay([flickedCard]);
              hasFlickedPlay.current = true;
            }
          }
          return; // フリックと判定された場合はカード選択処理をスキップ
        }

        // Y方向の移動が大きい場合（フリックの途中）、またはX方向への移動が明確でない場合は横スワイプ選択をスキップ
        if (Math.abs(deltaY) > 15 || deltaX < 15 || Math.abs(deltaY) > deltaX) {
          return;
        }

        const elem = document.elementFromPoint(e.clientX, e.clientY);
        const cardElem = elem?.closest('.card.selectable');
        if (cardElem) {
          const cardId = cardElem.getAttribute('data-card-id');
          if (cardId && cardId !== lastTouchedId.current) {
            const card = hands[myPlayerIndex].find(c => c.id === cardId);
            if (card) {
              sm.playLightPaperSE();
              // ユーザー要望：スワイプ中は「触れている位置のみ」を選択
              setSelectedCards([card]); 
              lastTouchedId.current = cardId;
            }
          }
        }
      };
      
      const handlePointerUp = (e) => {
        try { e.target.releasePointerCapture(e.pointerId); } catch(err) {}
        lastTouchedId.current = null;
        // スワイプ終了後、少し待って判定をリセット
        setTimeout(() => { isSwipingRef.current = false; }, 50);
      };

      const [watchSelecting, setWatchSelecting] = useState(false); // Kウォッチ対象選択モード
      const [watchTimerTick, setWatchTimerTick] = useState(0); // タイマー描画更新用

      const [isGameOver, setIsGameOver] = useState(false);
      const [revealedDaihinmin, setRevealedDaihinmin] = useState(null);
      const [activeRingStyle, setActiveRingStyle] = useState({ opacity: 0 });
      const [settledTurn, setSettledTurn] = useState(-1);
      const prevTurnForRingRef = useRef(-1);
      const [isFastForward, setIsFastForward] = useState(false);
      const isFastForwardRef = useRef(false);
      useEffect(() => { isFastForwardRef.current = isFastForward; }, [isFastForward]);
      const [roundResults, setRoundResults] = useState([]); // [p0, p1, p2, p3] ranking for the last round
      const [exchangePhase, setExchangePhase] = useState(null); // 'selecting' | 'animating' | null
      const [exchangeDecisions, setExchangeDecisions] = useState({}); // { playerIdx: cardIds[] }
      const [showExplanation, setShowExplanation] = useState(false);
      const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);

      useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
      }, []);

      const updateProfileAvatar = (avatarKey) => {
        localStorage.setItem('local_avatar', avatarKey);
        setMyProfile(prev => prev ? { ...prev, avatar: avatarKey } : null);
      };


      useEffect(() => {
        if (watchTarget) {
          const interval = setInterval(() => {
            setWatchTimerTick(t => t + 1);
          }, 1000);
          return () => clearInterval(interval);
        }
      }, [watchTarget]);

      const [isAltarActive, setIsAltarActive] = useState(false);

      useEffect(() => {
        // ターンが実際に移動したかチェック
        if (turn !== prevTurnRef.current) {
          if (turn === myPlayerIndex) setIsActionLoading(false);
          cpuThinkingRef.current = false;
          prevTurnRef.current = turn;
          if (multiplayerMode === 'active' && isHost && turn !== -1) {
            // 状態の完全な同期はターンの切り替わり時に一回だけ行う（演出阻害防止）
            broadcastState(hands, turn);
          }
        }
        
        // CPUターンのトリガー
        if (turn !== myPlayerIndex && !ranksDiscovered.includes(turn) && !selectionMode && !serviceAState && !isAnimating && !watchTarget && turn !== -1) {
          // マルチプレイヤー時はホストのみがCPUを動かす
          if (multiplayerMode === 'active' && !isHost) return;
          const isCpuTurn = multiplayerMode === 'active' ? (remotePlayers[turn] && remotePlayers[turn].id && remotePlayers[turn].id.startsWith('cpu')) : true;
          if (!isCpuTurn) return;
          if (cpuThinkingRef.current) return;
          const timeout = setTimeout(() => {
            if (cpuThinkingRef.current) return;
            cpuThinkingRef.current = true;
            playCpuTurn(turn);
          }, isFastForwardRef.current ? 10 : 600);
          return () => clearTimeout(timeout);
        }
      }, [turn, selectionMode, serviceAState, isAnimating, watchTarget, multiplayerMode, isHost, myPlayerIndex]);

      useEffect(() => {
        if (effectMessage) {
          setAnimMessage({ data: effectMessage, state: 'enter' });
          const tmEnter = setTimeout(() => setAnimMessage(prev => ({ ...prev, state: 'enter-active' })), 50);

          const tmExit = setTimeout(() => {
            setAnimMessage(prev => ({ ...prev, state: 'exit-active' }));
            setTimeout(() => setEffectMessage(null), 300);
          }, 3000);
          return () => { clearTimeout(tmEnter); clearTimeout(tmExit); };
        } else {
          setAnimMessage({ data: null, state: 'exit' });
        }
      }, [effectMessage]);

      useEffect(() => {
        if (revAnimMessage) {
          const tmExit = setTimeout(() => {
            setRevAnimMessage(null);
          }, 3000);
          return () => clearTimeout(tmExit);
        }
      }, [revAnimMessage]);

      useEffect(() => {
        if (serviceAAnimMessage) {
          const tmExit = setTimeout(() => {
            setServiceAAnimMessage(null);
          }, 3000);
          return () => clearTimeout(tmExit);
        }
      }, [serviceAAnimMessage]);

      // Update active turn ring position
      useEffect(() => {
        if (turn === -1 && !isGameOver) return; // Ignore temporary -1 states during trick clearing

        let isTurnChange = (prevTurnForRingRef.current !== turn);
        prevTurnForRingRef.current = turn;

        const setPosition = (isInitialForTurn = false) => {
          if (turn === -1 || isGameOver) {
            setActiveRingStyle(prev => ({ ...prev, opacity: 0 }));
            setSettledTurn(-1);
            return;
          }
          const el = document.getElementById(`avatar-${turn}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            // Start the global moving ring towards the new avatar
            setActiveRingStyle(prev => ({
              ...prev,
              top: `${rect.top + rect.height / 2}px`,
              left: `${rect.left + rect.width / 2}px`,
              width: `${size}px`,
              height: `${size}px`,
              opacity: isInitialForTurn ? 0.4 : 0, // Make it slightly more visible while moving
              transform: 'translate(-50%, -50%) scale(1.08)',
            }));
            
            if (isInitialForTurn) {
              setSettledTurn(-1); // Hide the local ring while the global ring is moving
              setTimeout(() => {
                setActiveRingStyle(prev => ({ ...prev, opacity: 0 })); // Hide the global ring
                setSettledTurn(turn); // Show the local ring perfectly attached to the avatar
              }, 400); // 400ms is close to the 0.5s CSS transition
            } else {
              setSettledTurn(turn);
            }
          } else {
            setActiveRingStyle(prev => ({ ...prev, opacity: 0 }));
            setSettledTurn(-1);
          }
        };

        const onInit = () => setPosition(isTurnChange);
        const onResize = () => setPosition(false);

        // Use requestAnimationFrame to ensure DOM layout is complete before reading rects
        requestAnimationFrame(onInit);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, [turn, isGameOver, isMobile, myPlayerIndex, remotePlayers]);

      useEffect(() => {
        const hasAnimatingCards = tableCards.some(tc => tc.isAnimating);
        if (hasAnimatingCards) {
          const timer = setTimeout(() => {
            sm.playPaperSE(); // Use paper sound for field clear
            setTableCards(prev => prev.map(tc => {
              if (tc.isAnimating) {
                return { ...tc, isAnimating: false, isSlammed: true };
              }
              return tc;
            }));
          }, 50);
          return () => clearTimeout(timer);
        }
      }, [tableCards]);

      // Remove slam effect class after animation finishes so it doesn't replay
      useEffect(() => {
        const hasSlammed = tableCards.some(tc => tc.isSlammed);
        if (hasSlammed) {
          const timer = setTimeout(() => {
            setTableCards(prev => prev.map(tc => ({ ...tc, isSlammed: false })));
          }, 500);
          return () => clearTimeout(timer);
        }
      }, [tableCards]);

      const showMessage = (title, desc) => {
        setEffectMessage({ title, desc });
      };

      // --- Multiplayer Logic ---
      const createRoom = () => {
        const roomNum = Math.floor(1000 + Math.random() * 9000).toString();
        setPassphrase(roomNum);
        const hostId = "ultimate-daihugou-" + btoa(roomNum).replace(/=/g, "");
        startAsHost(hostId);
      };

      const initMultiplayer = (pass) => {
        if (!pass) return alert("ルーム番号を入力してください");
        setPassphrase(pass);
        const hostId = "ultimate-daihugou-" + btoa(pass).replace(/=/g, "");
        joinAsGuest(hostId);
      };

      const joinRoomAndSyncPresence = async (roomCode, userProfile, isHostMode = false) => {
        if (!isSupabaseReady) {
          if (typeof window !== 'undefined' && window.supabase && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            isSupabaseReady = true;
          } else {
            alert("データベースの初期化に失敗しました。時間をおいて再試行してください。");
            return;
          }
        }
        
        let targetRoom = null;
        if (isHostMode) {
          const { data, error } = await supabaseClient.from('rooms').insert([{ room_code: roomCode, status: 'waiting' }]).select().single();
          if (error) { alert("エラーが発生しました: " + error.message + "\n※Supabaseにroomsテーブルが作成されているか確認してください"); return; }
          targetRoom = data;
        } else {
          const { data, error } = await supabaseClient.from('rooms').select('*').eq('room_code', roomCode).single();
          if (error || !data) { alert("ルームが見つかりません。(" + (error?.message || '') + ")"); return; }
          targetRoom = data;
        }
        
        setCurrentRoom(targetRoom);
        setIsHost(isHostMode);
        setMultiplayerMode(multiplayerMode === 'online' ? 'active' : 'lobby');
        
        const myPlayerData = { id: myUid || `guest-${Date.now()}`, name: userProfile.name, avatar: userProfile.avatar || 'knight' };
        if (isHostMode) setRemotePlayers([myPlayerData]);
        
        const channel = supabaseClient.channel(`room:${targetRoom.id}`, { config: { presence: { key: myPlayerData.id } } });
        setRoomChannel(channel);

        channel
          .on('presence', { event: 'sync' }, () => {
             const state = channel.presenceState();
             const players = [];
             for (const id in state) { players.push(state[id][0]); }
             players.sort((a, b) => {
               const timeA = a.joined_at || '';
               const timeB = b.joined_at || '';
               return timeA.localeCompare(timeB);
             });
             setRemotePlayers(prev => {
               if (!gameStarted) return players;
               // ゲーム中は既存のCPUを維持する
               const cpus = prev.filter(p => p.id && p.id.startsWith('cpu'));
               return [...players, ...cpus];
             });
             
             if (isHostMode && multiplayerMode === 'online' && players.length >= 2 && !gameStarted) {
                setTimeout(() => startGame(), 1000);
             }
          })
          .on('broadcast', { event: 'STATE_UPDATE' }, (payload) => {
             if (isHostMode) return;
             const data = payload.payload;
             setHands(data.state.hands || [[], [], [], []]);
             setTableCards(prev => {
               if (prev && prev.some(tc => tc.isAnimating || tc.isSlammed)) {
                 return prev;
               }
               return data.state.tableCards || [];
             });
             if (data.state.previousTableCards) {
               setPreviousTableCards(prev => {
                 if (prev && prev.some(tc => tc.isAnimating || tc.isSlammed)) return prev;
                 return data.state.previousTableCards || [];
               });
             }
             setTurn(data.state.turn);
             setGameStarted(prev => {
               if (!prev && data.state.gameStarted) sm.playGameBGM();
               return data.state.gameStarted;
             });
             const pIndex = data.state.remotePlayers.findIndex(rp => rp.id === myPlayerData.id);
             setMyPlayerIndex(pIndex > 0 ? pIndex : 1);
             setMultiplayerMode('active');
             setRanksDiscovered(data.state.ranksDiscovered || []);
             setIsGameOver(data.state.isGameOver);
             setRoundResults(data.state.roundResults || []);
             setExchangePhase(data.state.exchangePhase);
             setPassCount(data.state.passCount);
             setLastPlayPlayer(data.state.lastPlayPlayer);
             setIs11Back(data.state.is11Back);
             setIsRevolution(data.state.isRevolution);
             setPlayDirection(data.state.playDirection);
             setGraveyard(data.state.graveyard || []);
             if (data.state.remotePlayers) setRemotePlayers(data.state.remotePlayers);
             
             // ターン同期時にローカルのUIロックのみ強制リセット（アニメーションは阻害しない）
             setIsActionLoading(false);
          })
          .on('broadcast', { event: 'EVENT' }, (payload) => {
             if (isHostMode) return;
             const data = payload.payload;
             if (data.event === 'PLAY') {
               if (data.playerIndex === myPlayerIndexRef.current) return;
               executePlayRef.current(data.playerIndex, data.cards);
             } else if (data.event === 'PASS') {
               if (data.playerIndex === myPlayerIndexRef.current) return;
               executePassRef.current(data.playerIndex);
             } else if (data.event === 'COMPLETE_EFFECT') {
               if (data.playerIndex === myPlayerIndexRef.current) return;
               completeSpecialEffectRef.current(data.choice, data.playerIndex, data.selectionInfo, data.selectionMode);
             }
          })
          .on('broadcast', { event: 'ACTION' }, (payload) => {
             if (!isHostMode) return;
             const data = payload.payload;
             console.log('Action from guest', data);
             const pIdx = data.playerIndex;
             if (pIdx === undefined || pIdx <= 0) return;
             if (['PLAY', 'PASS', 'COMPLETE_EFFECT'].includes(data.action) && turnRef.current !== pIdx) return;

             if (data.action === 'FAST_FORWARD') {
               setIsFastForward(true);
             } else if (data.action === 'PLAY') {
               if (isValidPlayRef.current(data.cards)) {
                 executePlayRef.current(pIdx, data.cards);
                 broadcastEvent({ event: 'PLAY', playerIndex: pIdx, cards: data.cards });
               } else {
                 roomChannel.send({ type: 'broadcast', event: 'ACTION_REJECTED', payload: { playerIndex: pIdx, reason: 'INVALID_PLAY' } });
               }
             } else if (data.action === 'PASS') {
               executePassRef.current(pIdx);
               broadcastEvent({ event: 'PASS', playerIndex: pIdx });
             } else if (data.action === 'COMPLETE_EFFECT') {
               completeSpecialEffectRef.current(data.choice, pIdx, data.selectionInfo, data.selectionMode);
               broadcastEvent({ event: 'COMPLETE_EFFECT', playerIndex: pIdx, choice: data.choice, selectionInfo: data.selectionInfo, selectionMode: data.selectionMode });
             } else if (data.action === 'CONFIRM_EXCHANGE') {
               setExchangeDecisions(prev => ({ ...prev, [pIdx]: data.cards }));
             } else if (data.action === 'RESTART' && isGameOverRef.current) {
               checkRestartVotesRef.current = checkRestartVotes;
               setRestartVotes(prev => {
                 const next = { ...prev, [pIdx]: true };
                 checkRestartVotesRef.current(next);
                 return next;
               });
             }
          })
          .on('broadcast', { event: 'ACTION_REJECTED' }, (payload) => {
             if (isHostMode) return;
             if (payload.payload.playerIndex === myPlayerIndex) {
               setIsActionLoading(false);
               showMessage('INVALID SACRIFICE', 'ホスト側でそのカードは場に出せないと判定されました');
             }
          });

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ ...myPlayerData, joined_at: new Date().toISOString() });
          }
        });
      };

      const startAsHost = (hostId) => joinRoomAndSyncPresence(hostId, { name: myProfile.display_name, avatar: myProfile.avatar }, true);
      const joinAsGuest = (hostId) => joinRoomAndSyncPresence(hostId, { name: myProfile.display_name, avatar: myProfile.avatar }, false);

      const broadcastEvent = async (eventData) => {
        if (!roomChannel) return;
        await roomChannel.send({ type: 'broadcast', event: 'EVENT', payload: eventData });
      };

      const sendActionToHost = async (actionData) => {
        if (!roomChannel || isHost) return;
        await roomChannel.send({ type: 'broadcast', event: 'ACTION', payload: { ...actionData, playerIndex: myPlayerIndex } });
      };

      const getDisplayIndex = (i) => {
        if (!gameStarted || multiplayerMode !== 'active') return i;
        return (i - myPlayerIndex + 4) % 4;
      };

      // Edge animation start points
      const getPlayerEdgePosition = (playerIndex) => {
        const dispIdx = getDisplayIndex(playerIndex);
        
        const isMobile = window.innerWidth <= 768;
        const yOffset = isMobile ? '38vh' : '42vh';
        const xOffset = isMobile ? '38vw' : '42vw';

        switch (dispIdx) {
          case 0: return { top: `calc(50% + ${yOffset})`, left: '50%', rot: '0deg' };
          case 1: return { top: '50%', left: `calc(50% - ${xOffset})`, rot: '90deg' };
          case 2: return { top: `calc(50% - ${yOffset})`, left: '50%', rot: '180deg' };
          case 3: return { top: '50%', left: `calc(50% + ${xOffset})`, rot: '-90deg' };
          default: return { top: '50%', left: '50%', rot: '0deg' };
        }
      };

      const broadcastState = async (currentHands, nextTurnValue = null, customRemotePlayers = null) => {
        if (!isHost || !roomChannel) return;
        const baseState = {
          hands: currentHands,
          tableCards,
          previousTableCards,
          turn: nextTurnValue !== null ? nextTurnValue : turn,
          gameStarted: true,
          ranksDiscovered,
          isGameOver,
          roundResults,
          exchangePhase,
          passCount,
          lastPlayPlayer,
          is11Back,
          isRevolution,
          playDirection,
          graveyard,
          remotePlayers: customRemotePlayers || remotePlayers
        };

        await roomChannel.send({
          type: 'broadcast',
          event: 'STATE_UPDATE',
          payload: { state: baseState }
        });
        
        // Update local state (Host is player 0)
        setHands(currentHands);
        if (nextTurnValue !== null) setTurn(nextTurnValue);
      };

      const startMultiplayerGame = () => {
        const deck = shuffle(createDeck());
        const newHands = [[], [], [], []];
        let i = 0;
        while (deck.length > 0) {
          newHands[i % 4].push(deck.pop());
          i++;
        }
        const sortedHands = newHands.map(h => sortHand(h));
        
        let finalRemotePlayers = [...remotePlayers];
        for (let j = finalRemotePlayers.length; j < 4; j++) {
          finalRemotePlayers.push({ id: `cpu${j}`, name: `CPU ${j}` });
        }
        setRemotePlayers(finalRemotePlayers);
        
        broadcastState(sortedHands, 0, finalRemotePlayers);
        setGameStarted(true);
        sm.playGameBGM();
        setMultiplayerMode('active');
        setMyPlayerIndex(0);
      };

      const triggerTempEffect = (setter, time = 1000) => {
        setter(true);
        setTimeout(() => setter(false), time);
      };

      const triggerMiss = (playerIndex) => {
        setMissEffectTarget(playerIndex);
        sm.playShieldMissSE();
        setTimeout(() => setMissEffectTarget(null), 600); // 弾き演出が0.6sになったので少し長めに
      };

      const compareStrength = (targetSt, tableSt) => {
        // JOKER単体(13)は最強だが、JOKERがなり変わった後の強さは各数字に従う
        if (targetSt === 13 && tableSt !== 13) return true;
        if (tableSt === 13 && targetSt !== 13) return false;
        if (targetSt === 13 && tableSt === 13) return false; // JOKERはJOKERに勝てない
        
        const isInverse = isRevolution !== is11Back;
        return isInverse ? targetSt < tableSt : targetSt > tableSt;
      };

      const sortHand = (hand, revOverride = null, b11Override = null) => {
        const rev = revOverride !== null ? revOverride : isRevolution;
        const b11 = b11Override !== null ? b11Override : is11Back;
        return [...hand].sort((a, b) => {
          if (a.strength === 13) return 1;
          if (b.strength === 13) return -1;
          const isInverse = rev !== b11;
          return isInverse ? b.strength - a.strength : a.strength - b.strength;
        });
      };

      const getNextPlayer = (current, steps = 1, forceDirection = null, currentRanks = null) => {
        let count = 0;
        let next = current;
        const dir = forceDirection !== null ? forceDirection : playDirection;
        const ranks = currentRanks || ranksDiscovered;
        while (count < steps) {
          next = (next + dir + 4) % 4;
          if (!ranks.includes(next)) count++;
        }
        return next;
      };

      const executeNextTurn = (startIndex, steps = 1, forceDirection = null, excludeRanks = null) => {
        setIsActionLoading(false); // 次のターンへ行くときに必ず解除
        const nextTarget = getNextPlayer(startIndex, steps, forceDirection, excludeRanks);
        if (nextTarget === turn) {
          // 同一プレイヤーにターンが回る場合（8切り等）、思考フラグをリセット
          cpuThinkingRef.current = false;
          // useEffectを発火させるために一瞬-1にする（必要に応じて）
          setTurn(-1);
          setTimeout(() => setTurn(nextTarget), 10);
        } else {
          setTurn(nextTarget);
        }
      };

      const triggerClearFieldAnim = (callback) => {
        setIsAnimating(true);
        setIsAltarActive(true); // 祭壇を活性化
        setTimeout(() => {
          callback();
          setIsAnimating(false);
          setTimeout(() => setIsAltarActive(false), isFastForwardRef.current ? 10 : 800); // 吸い込まれたら閉じる
        }, isFastForwardRef.current ? 10 : 300); // 1200msから300msに短縮し、祭壇オープン後すぐに吸い込み開始
      };

      const clearFieldLogic = (newGraveyard = null) => {
        let currentGy = newGraveyard || [...graveyard];
        let cardsOnly = tableCards.map(tc => tc.card);

        if (cardsOnly.length > 0) {
          // ここでアニメーション用に discardingToGy をセットする (fromPlayer: 'center' を指定)
          setDiscardingToGy(cardsOnly.map(c => ({ card: c, fromPlayer: 'center' })));
          setTimeout(() => {
            setDiscardingToGy([]);
            setGraveyard(prev => [...prev, ...cardsOnly]);
          }, 1300);
        }
        // Plus 5 combo check for clear field logic
        const isPlus5Combo = tableCards.length === 2 && tableCards.some(tc => tc.card.rank === '5');
        if (isPlus5Combo) {
          setIsPlus5Active(true);
          setTimeout(() => setIsPlus5Active(false), 3000);
        }
        setTableCards(prev => {
          if (prev && prev.some(tc => tc.isAnimating || tc.isSlammed)) {
            return prev;
          }
          return [];
        });
        setPreviousTableCards([]);
        setPassedPlayers([]);
        setIsShielded([false, false, false, false]);
        setIs11Back(false);
        setGraveyard(currentGy);
      };

      const executePass = (playerIndex) => {
        const activePlayersCount = 4 - ranksDiscovered.length;
        const newPassCount = passCount + 1;
        
        const requiredPassCount = activePlayersCount - 1;

        // 場に出ているカードがあり、必要数パスした場合
        if (newPassCount >= requiredPassCount && tableCards.length > 0) {
          if (isHost) broadcastEvent({ event: 'PASS', playerIndex: playerIndex });
          
          const isA_Flow = tableCards.every(tc => tc.card.rank === 'A');
          const countA = tableCards.length;

          triggerClearFieldAnim(() => {
            clearFieldLogic();
            let nextStarter = lastPlayPlayer;
            // 既に上がっている場合は次のプレイヤーから開始
            const currentRanks = ranksDiscovered; // 呼び出し時点の最新
            if (currentRanks.includes(nextStarter)) {
              nextStarter = getNextPlayer(nextStarter, 1, null, currentRanks);
            }
            
            if (isA_Flow) {
              // サービスAの文字演出を表示
              setTurn(-1);
              setServiceAAnimMessage('サービスA');
              if (sm.playStartSE) sm.playStartSE();
              setTimeout(() => {
                setServiceAState({ playerIndex: nextStarter, count: countA });
              }, 3000);
            } else {
              // 自動的に次の手番を開始
              setTurn(-1);
              setIsActionLoading(false); // UIロック解除
              setTimeout(() => setTurn(nextStarter), 10);
            }
          });
        } else {
          setPassCount(newPassCount);
          setPassedPlayers(prev => [...new Set([...prev, playerIndex])]);

          // 残り1人かチェック
          const remaining = [0, 1, 2, 3].filter(p => !ranksDiscovered.includes(p));
          if (ranksDiscovered.length === 3 && remaining.length === 1) {
            const lastP = remaining[0];
            const finalRanks = ranksDiscovered ? [...ranksDiscovered] : [];
            setRevealedDaihinmin(lastP);
            setTurn(-1);
            if (sm.playJBackSE) sm.playJBackSE(); // Optional reveal sound
            setTimeout(() => {
              finalRanks.push(lastP);
              setRanksDiscovered(finalRanks);
              setRoundResults(finalRanks);
              setIsGameOver(true);
              setRevealedDaihinmin(null);
            }, 3000);
            return;
          }

          if (isHost) broadcastEvent({ event: 'PASS', playerIndex: playerIndex });
          executeNextTurn(playerIndex, 1, null, ranksDiscovered);
        }
      };

      const isValidPlay = (cardsToPlay) => {
        if (cardsToPlay.length === 0) return false;

        // Check for Plus 5 combination (5 + one card from {A, 2, 3, 4, 6, 7, 8})
        if (cardsToPlay.length === 2 && (tableCards.length === 0 || tableCards.length === 1)) {
          const has5 = cardsToPlay.some(c => c.rank === '5');
          if (has5) {
            const other = cardsToPlay.find(c => c.rank !== '5') || cardsToPlay[0];
            const allowed = ['A', '2', '3', '4', '5', '6', '7', '8'];
            if (allowed.includes(other.rank)) {
              // Valid Plus 5! Calculate effective strength
              let effectiveStrength = 13;
              if (other.rank === '5' && cardsToPlay[0].rank === '5') {
                 // 5 + 5 result in rank 10
                 effectiveStrength = RANKS.indexOf('10');
              } else {
                 const total = rankToValue(other.rank) + 5;
                 const resRank = valueToRank(total);
                 effectiveStrength = RANKS.indexOf(resRank);
              }
              if (tableCards.length === 0) return true;
              const tableStrength = tableCards[0].card.strength;
              return compareStrength(effectiveStrength, tableStrength);
            }
          }
        }

        // JOKERのワイルドカード判定
        const nonJokers = cardsToPlay.filter(c => c.rank !== 'Joker');
        let effectiveStrength = 13;

        if (nonJokers.length > 0) {
          const firstRank = nonJokers[0].rank;
          if (!nonJokers.every(c => c.rank === firstRank)) return false;
          effectiveStrength = nonJokers[0].strength;
        }

        const tableEffectiveCount = getEffectiveCount(tableCards.map(tc => tc.card));
        const playEffectiveCount = getEffectiveCount(cardsToPlay);

        if (tableCards.length === 0) return true;
        if (playEffectiveCount !== tableEffectiveCount) return false;

        const tableStrength = tableCards[0].card.strength;
        return compareStrength(effectiveStrength, tableStrength);
      };

      const triggerCutinGlobal = (rank, customTitle = '', customDesc = '') => {
        let tcg = TCG_DATA[rank];
        if (!tcg) return;
        let aura = tcg.auraColor || '#b8860b';
        let name = customTitle || tcg.name;
        let desc = customDesc || tcg.desc;
        if (sm.playEffectSE) sm.playEffectSE(rank);
        setCutIn({ name, effect: desc, url: tcg.url, rank, auraColor: aura, comboData: null });
        setTimeout(() => setCutIn(null), 2500);
      };

      const evaluateSpecialEffects = (playerIndex, playedCards, currentHands, currentGraveyard, opts = {}) => {
        let title = ''; let desc = ''; let steps = 1; let pDir = playDirection;
        let gy = [...currentGraveyard]; let h = [...currentHands];
        let shieldStates = [...isShielded]; let is11B = is11Back; let isFieldCleared = false;
        let isRev = isRevolution; 
        let isAsync = false; // Add this flag
        let phoenixDrawn = null; // 6フェニックスで引いたカード情報

        let nonJokers = playedCards.filter(c => c.rank !== 'Joker');
        let effectiveRank = nonJokers.length > 0 ? nonJokers[0].rank : 'Joker';
        
        // Plus 5 override rank
        if (playedCards.length === 2 && playedCards.some(c => c.rank === '5')) {
          const other = playedCards.find(c => c.rank !== '5');
          if (other && ['A', '2', '3', '4', '6', '7', '8'].includes(other.rank)) {
             const total = rankToValue(other.rank) + 5;
             effectiveRank = valueToRank(total);
          } else if (!other) {
             // 5+5
             effectiveRank = '10_NO_EFFECT'; // Mark as no effect per user request
          }
        }

        const rank = effectiveRank;
        const isPlus5Combo = playedCards.length === 2 && playedCards.some(c => c.rank === '5') && playedCards.some(c => c.rank !== '5');
        let effectDelay = isPlus5Combo ? 6500 : 3400;
        const isThreeOf3s = (playedCards.length === 3 && rank === '3');
        if (playedCards.length >= 4 || isThreeOf3s) effectDelay += 2200; // Account for revolution animation push
        const count = isPlus5Combo ? 1 : playedCards.length; // プラス5の合成は1枚出し判定とする
        const tcg = TCG_DATA[rank];

        if (tcg) {
          title = tcg.name;
          if (rank === '3') {
             desc = count === 3 ? '3枚出しで革命' : '効果なし';
          } else {
             desc = tcg.desc || '';
          }
        } else if (rank === '10_NO_EFFECT') {
          title = 'プラス5'; // 「連鎖」を削除
          desc = '効果なし（ただの5の2枚出し）';
        }

        // 革命判定 (同時出しが4枚以上、または3の3枚出し)
        if (playedCards.length >= 4 || isThreeOf3s) {
          isRev = !isRev;
          setIsRevolution(isRev);
        }

        if (rank === '4') {
          shieldStates[playerIndex] = true;
        }

        if (rank === '2') {
          const nextP = getNextPlayer(playerIndex, 1, pDir);
          if (h[nextP].length > 0) {
            if (shieldStates[nextP]) {
              triggerMiss(nextP);
              isAsync = true;
              setIsAnimating(true);
              setTimeout(() => setIsAnimating(false), effectDelay + 1000);
              steps = 1;
            } else {
              const dropCount = Math.min(count * 2, h[nextP].length);
              let dropped = [];
              let tempHand = [...h[nextP]];
              for (let i = 0; i < dropCount; i++) {
                const cIndex = Math.floor(Math.random() * tempHand.length);
                const card = tempHand.splice(cIndex, 1)[0];
                dropped.push(card);
              }
              isAsync = true;
              setIsAnimating(true);
              setTimeout(() => {
                setSlashEffectTarget(nextP);
                if (sm.playSlashSE) sm.playSlashSE();
                
                setHands(prev => {
                  const updated = [...prev];
                  updated[nextP] = updated[nextP].filter(c => !dropped.some(d => d.id === c.id));
                  return updated;
                });

                setTimeout(() => setSlashEffectTarget(null), 1000);
                setTimeout(() => {
                  setIsAltarActive(true);
                  setDiscardingToGy(dropped.map(c => ({ card: c, fromPlayer: nextP })));
                  setTimeout(() => {
                    setDiscardingToGy([]);
                    setGraveyard(prev => [...prev, ...dropped]);
                    setGyShuffling(true);
                    setTimeout(() => {
                      setGyShuffling(false);
                      setIsAnimating(false);
                      setTimeout(() => setIsAltarActive(false), 800);
                    }, 1200);
                  }, dropCount * 120 + 800);
                }, 700);
              }, effectDelay);
              steps = 1;
            }
          }
        }

        if (rank === '6') {
          if (gy.length > 0) {
            setIsAltarActive(true);
            triggerTempEffect(setPhoenixActive, 1500);
            const drawCount = Math.min(count, gy.length);
            let drawn = [];
            for (let i = 0; i < drawCount; i++) {
              const rIndex = Math.floor(Math.random() * gy.length);
              const card = gy.splice(rIndex, 1)[0];
              drawn.push(card);
            }
            // drawnをexecut ePlay側の演出へ渡すためresultに保存
            phoenixDrawn = { drawn, playerIndex };
            isAsync = true;
            steps = 1;
          }
        }
        if (rank === '7') {
          if (h[playerIndex].length > 0) {
            const nextP = getNextPlayer(playerIndex, 1, pDir);
            if (shieldStates[nextP]) {
              // シールド所持者へ渡そうとした場合：カードが使用者に戻ってくる
              triggerMiss(nextP);
              
              const passCount = Math.min(count, h[playerIndex].length);
              for (let i = 0; i < passCount; i++) {
                const cIndex = Math.floor(Math.random() * h[playerIndex].length);
                const card = h[playerIndex][cIndex] || { id: 'dummy', suit: '♠', rank: '?' };
                const newFly = { from: playerIndex, to: nextP, card: { ...card, rank: '?' }, type: 'shield-repel', id: Math.random(), delay: i * 0.3 };
                setFlyingCards(prev => [...prev, newFly]);
              }
              setIsAnimating(true);
              setTimeout(() => {
                setFlyingCards(prev => prev.filter(f => f.type !== 'shield-repel'));
                setIsAnimating(false);
              }, 1500 + passCount * 300);
              
              isAsync = true;
              steps = 1;
            } else {
              triggerTempEffect(setPassThreadActive, 1000);
              const rp = remotePlayers[playerIndex];
              const isWaitingForOther = multiplayerMode === 'active' && rp && rp.id !== 'local' && !(rp.id && rp.id.startsWith('cpu'));
              if (playerIndex === myPlayerIndexRef.current) {
                // カットイン演出(800ms開始+2500ms)終了後にUIを表示
                setTimeout(() => {
                  setSelectionMode('7');
                  setSelectionInfo({ playerIndex, nextP, count: Math.min(count, h[playerIndex].length), isSpecialEffect: true, isServiceA: opts.isServiceA });
                }, effectDelay);
                steps = 0;
              } else if (isWaitingForOther) {
                // ゲストの入力を待つ
                steps = 0;
              } else {
                const passCount = Math.min(count, h[playerIndex].length);
                let passed = [];
                // カットイン終了を待ってからカードを移動させる
                setTimeout(() => {
                  for (let i = 0; i < passCount; i++) {
                    const cIndex = Math.floor(Math.random() * h[playerIndex].length);
                    const card = h[playerIndex].splice(cIndex, 1)[0];
                    passed.push(card);

                    // 7渡し：裏向きで移動させる
                    const newFly = { from: playerIndex, to: nextP, card: { ...card, rank: '?' }, type: 'pass', id: Math.random(), delay: i * 0.5 };
                    setFlyingCards(prev => [...prev, newFly]);
                    setIsAnimating(true);
                    setTimeout(() => {
                      setFlyingCards(prev => prev.filter(f => f.id !== newFly.id));
                      h[nextP].push(card);
                      if (nextP === 0) {
                        setHighlightedCardIds(prev => [...prev, card.id]);
                        setTimeout(() => setHighlightedCardIds(prev => prev.filter(id => id !== card.id)), 4000);
                      }
                      setHands([...h]);
                      sm.playPaperSE();
                      setReceivedHighlight(nextP);
                      setTimeout(() => {
                        setReceivedHighlight(null);
                        setIsAnimating(false);
                      }, 1500);
                    }, 500 + i * 500); // 1800ms待機済みなので500ms短縮
                  }
                }, 1800);
                
                isAsync = true; // Mark as async
                steps = 1; // 7の後、次は順当に次の人
              }
            }
          }
        }
        if (rank === '8') {
          isFieldCleared = true; steps = 0;
          if (!isPlus5Combo) {
            triggerTempEffect(setGuillotineActive, 1200);
          }
        }
        if (rank === '9') {
          pDir = pDir * -1;
          setPlayDirection(pDir); // 正しい状態更新関数名
          triggerTempEffect(setReverseActive, 1800);
        }
        if (rank === '10') {
          if (h[playerIndex].length > 0) {
            setIsAnimating(true);
            if (playerIndex === myPlayerIndexRef.current) {
              // カットイン演出(800ms開始+2500ms)終了後にUIを表示
              setTimeout(() => {
                setSelectionMode('10');
                setSelectionInfo({ playerIndex, count: Math.min(count, h[playerIndex].length), isSpecialEffect: true });
              }, effectDelay);
              steps = 0;
            } else {
              const rp = remotePlayers[playerIndex];
              const isWaitingForOther = multiplayerMode === 'active' && rp && rp.id !== 'local' && !(rp.id && rp.id.startsWith('cpu'));
              if (isWaitingForOther) {
                steps = 0;
              } else {
                const dropCount = Math.min(count, h[playerIndex].length);
                let dropped = [];
              for (let i = 0; i < dropCount; i++) {
                const cIndex = Math.floor(Math.random() * h[playerIndex].length);
                const card = h[playerIndex].splice(cIndex, 1)[0];
                dropped.push(card);
              }
              // 捨て逃げ
              setIsAltarActive(true);
              setDiscardingToGy(dropped.map(c => ({ card: c, fromPlayer: playerIndex })));
              setIsAnimating(true);
              isAsync = true; // Mark as async
              setTimeout(() => {
                setDiscardingToGy([]);
                setGraveyard(prev => [...prev, ...dropped]);
                 setGyShuffling(true);
                setTimeout(() => {
                  setGyShuffling(false);
                  setIsAnimating(false);
                  setTimeout(() => setIsAltarActive(false), 800);
                }, 1200);
              }, effectDelay - 2000 + dropCount * 120);
              steps = 1;
            }
            }
          }
        }
        if (rank === 'J') {
          is11B = true;
        }
        if (rank === 'Q') {
          const targetRank = RANKS[Math.floor(Math.random() * RANKS.length)];
          if (playerIndex === myPlayerIndexRef.current) {
            // カットイン演出(800ms開始+2500ms)終了後にUIを表示
            setTimeout(() => {
              setSelectionMode('Q');
              // Qボンバーは出した枚数分選択可能
              setSelectionInfo({ playerIndex, count: Math.min(count, RANKS.length), isServiceA: opts.isServiceA });
            }, effectDelay);
            steps = 0;
          } else {
            const rp = remotePlayers[playerIndex];
            const isWaitingForOther = multiplayerMode === 'active' && rp && rp.id !== 'local' && !(rp.id && rp.id.startsWith('cpu'));
            if (isWaitingForOther) {
              steps = 0;
            } else {
              isAsync = true;
              setTimeout(() => {
                triggerTempEffect(setBomberActive, 2000);
              }, effectDelay);

            let targetRanks = [];
            let rShuffled = [...RANKS].sort(() => Math.random() - 0.5);
            targetRanks = rShuffled.slice(0, count);

            let bombCount = 0;
            let tempH = [...h];
            let affectedPlayers = [];
            let shieldedPlayers = [];

            let bombedCards = [];

            targetRanks.forEach(tr => {
              for (let i = 0; i < 4; i++) {
                const drop = h[i].filter(c => c.rank === tr);
                if (drop.length > 0) {
                  if (shieldStates[i]) {
                    // シールド所持者は自身であっても爆破されず弾き演出
                    triggerMiss(i);
                    if (!shieldedPlayers.includes(i)) shieldedPlayers.push(i);
                    continue;
                  }
                  bombCount += drop.length;
                  bombedCards.push(...drop);
                  // gy.push(...drop); // delayed until animation
                  tempH[i] = tempH[i].filter(c => c.rank !== tr);
                  if (!affectedPlayers.includes(i)) affectedPlayers.push(i);
                }
              }
            });

            setTimeout(() => {
              setExplodingCards(affectedPlayers.map(pIdx => ({ playerIndex: pIdx, rank: targetRanks[0] })));
              setCentralBombCards(bombedCards);
            }, effectDelay);

            setTimeout(() => {
              setExplodingCards([]);
              setCentralBombCards([]);
              setGraveyard(prev => [...prev, ...bombedCards]);
              // Removed internal executeNextTurn call
            }, effectDelay + 2500); // Wait for cut-in before graveyard move

            h = tempH;
            triggerAbilityLog(`Qボンバー: ${targetRanks.join(',')}`);
          }
          }
        }
        if (rank === 'K') {
          setIsAnimating(true);
          if (playerIndex === 0 || playerIndex === myPlayerIndexRef.current) {
            // カットイン演出(800ms開始+2500ms)終了後にUIを表示
            setTimeout(() => {
              setWatchSelecting(true);
              setSelectionInfo({ playerIndex, count });
            }, effectDelay);
            steps = 0;
          } else {
            const rp = remotePlayers[playerIndex];
            const isWaitingForOther = multiplayerMode === 'active' && rp && rp.id !== 'local' && !(rp.id && rp.id.startsWith('cpu'));
            if (isWaitingForOther) {
              steps = 0;
            } else {
            const watchDuration = 5000;
            // シールド所持者はKウォッチの対象から除外
            const others = [0, 1, 2, 3].filter(v => v !== playerIndex && !ranksDiscovered.includes(v) && !shieldStates[v]);
            // シールドで全員除外された場合は弾き演出
            if (others.length === 0) {
              const shieldedOthers = [0, 1, 2, 3].filter(v => v !== playerIndex && !ranksDiscovered.includes(v) && shieldStates[v]);
              if (shieldedOthers.length > 0) triggerMiss(shieldedOthers[0]);
              setIsAnimating(false);
              return { h, gy, shieldStates, is11B, isRev, isFieldCleared, steps: 1, pDir, isAsync, phoenixDrawn, title, desc };
            }
            
            const targetCount = Math.min(count, others.length);
            let targets = [];
            let tempOthers = [...others];
            for (let i = 0; i < targetCount; i++) {
              const tIndex = Math.floor(Math.random() * tempOthers.length);
              targets.push(tempOthers[tIndex]);
              tempOthers.splice(tIndex, 1);
            }

            if (false) { /* シールド除外済みなのでここは到達しない */ }
            else {
              setWatchTarget({
                targetIndexes: targets,
                activatorIndex: playerIndex,
                endTime: Date.now() + watchDuration,
                isServiceA: opts.isServiceA
              });
              setTimeout(() => {
                setWatchTarget(null);
                setIsAnimating(false);
                // Removed internal executeNextTurn call
              }, watchDuration);
            }
            isAsync = true; // Mark as async
          }
          }
        }

        // if (title) showMessage(title, desc); // Removed to avoid overlapping with cut-in

        // Kウォッチ選択モードでない場合のみターンの処理を返す
        const rp = remotePlayers[playerIndex];
        const isWaitingForOther = multiplayerMode === 'active' && rp && rp.id !== 'local' && !(rp.id && rp.id.startsWith('cpu'));
        const kWait = rank === 'K' && (playerIndex === 0 || playerIndex === myPlayerIndexRef.current || isWaitingForOther);
        return { h, gy, shieldStates, is11B, isRev, isFieldCleared, steps: kWait ? 0 : steps, pDir, isAsync, phoenixDrawn, title, desc };
      };

      const executePlay = (playerIndex, cards) => {
        if (playerIndex === myPlayerIndexRef.current) setIsActionLoading(true);
        sm.playPaperSE();
        // Helper to trigger character cut‑in based on rank
        const triggerCutIn = (rank, comboData = null, customTitle = '', customDesc = '') => {
          let tcg = TCG_DATA[rank];
          if (!tcg && rank !== '5_SOLO') return;

          let aura = tcg ? (tcg.auraColor || '#b8860b') : '#b8860b';
          let name = customTitle || (tcg ? tcg.name : '');
          let desc = customDesc || (tcg ? tcg.desc : '');
          let url = tcg ? tcg.url : '';

          if (rank === '5_SOLO') {
            const t5 = TCG_DATA['5'];
            tcg = t5;
            name = 'プラス5';
            desc = '単独での効果なし';
            url = t5.url;
            aura = '#f1c40f';
          }

          if (comboData) {
            // ===== プラス5コンボ: 4フェーズ演出 =====
            // Phase 1: +5カード単独カットイン（0s〜1.2s）
            sm.playEffectSE('5');
            setCutIn({ name, effect: desc, url, rank: '5', auraColor: '#f1c40f', comboData, comboPhase: 1 });

            // Phase 2: +5が左へスライドアウト → 追加カードが中央に登場（1.2s〜2.7s）
            setTimeout(() => {
              const otherRank = comboData.otherRank;
              sm.playEffectSE(otherRank); // 追加カードのSEを再生
              setCutIn(prev => prev ? { ...prev, comboPhase: 2 } : null);
            }, 1200);

            // Phase 3: +5が左から戻り、中央で合体 + 赤い爆発（2.7s〜4.0s）
            setTimeout(() => {
              setCutIn(prev => prev ? { ...prev, comboPhase: 3 } : null);
            }, 2800);

            // Phase 4: 赤い演出と同時に合計カードのカットイン
            setTimeout(() => {
              const resRank = comboData.resultRank;
              const resTcg = TCG_DATA[resRank];
              sm.playEffectSE(resRank);
              setCutIn(prev => prev ? { ...prev, comboPhase: 4, rank: resRank, auraColor: resTcg?.auraColor || '#b8860b' } : null);
            }, 3400); // Phase3(2800ms) + カード合体(0.7s) - フラッシュが出始める直後

            setTimeout(() => setCutIn(null), 6500);
          } else {
            // 通常カットイン
            sm.playEffectSE(rank === '5_SOLO' ? '5' : (rank === '10_NO_EFFECT' ? '5' : rank));
            setCutIn({ name, effect: desc, url, rank: (rank === '5_SOLO' ? '5' : (rank === '10_NO_EFFECT' ? '5' : rank)), auraColor: aura, comboData: null });
            setTimeout(() => setCutIn(null), 2500);
          }
        };

        let newHands = [...hands];
        newHands[playerIndex] = newHands[playerIndex].filter(c => !cards.find(sc => sc.id === c.id));

        let currentGraveyard = [...graveyard];
        let steps = 1; let isFieldCleared = false;
        const effectRes = evaluateSpecialEffects(playerIndex, cards, newHands, currentGraveyard);

        const startEdge = getPlayerEdgePosition(playerIndex);
        const isPlus5Combo = cards.length === 2 && cards.some(c => c.rank === '5') && cards.some(c => c.rank !== '5');

        let styledTableCards = cards.map((c, idx) => {
          let tgtLeft, tgtTop;
          if (isPlus5Combo) {
             // Side-by-side in center
             tgtLeft = idx === 0 ? 'calc(50% - 65px)' : 'calc(50% + 65px)';
             tgtTop = '50%';
          } else {
             tgtLeft = `calc(50% + ${Math.random() * 30 - 15}px)`;
             tgtTop = `calc(50% + ${Math.random() * 30 - 15}px)`;
          }
          const tgtTransform = isPlus5Combo ? `translate(-50%, -50%) scale(0.8) rotate(0deg)` : `translate(-50%, -50%) rotate(${Math.random() * 20 - 10}deg)`;

          return {
            card: c, isAnimating: true, isSlammed: false,
            initialStyle: { top: startEdge.top, left: startEdge.left, transform: `translate(-50%, -50%) scale(0.8) rotate(${startEdge.rot || '0deg'})`, marginLeft: 0 },
            targetStyle: { top: tgtTop, left: tgtLeft, transform: tgtTransform, marginLeft: 0 }
          };
        });
        
        // Calculate effective rank for visual cut-in
        const nonJokers = cards.filter(c => c.rank !== 'Joker');
        let effectiveVisualRank = nonJokers.length > 0 ? nonJokers[0].rank : 'Joker';
        if (cards.length === 2 && cards.some(c => c.rank === '5')) {
          const other = cards.find(c => c.rank !== '5');
          if (other && ['A', '2', '3', '4', '6', '7', '8'].includes(other.rank)) {
             const total = rankToValue(other.rank) + 5;
             effectiveVisualRank = valueToRank(total);
          } else {
             effectiveVisualRank = '5_SOLO';
          }
        } else if (cards.length === 1 && cards[0].rank === '5') {
          effectiveVisualRank = '5_SOLO';
        }
        
        const isThreeOf3sVisual = cards.length === 3 && effectiveVisualRank === '3';
        const isRevToggle = cards.length >= 4 || isThreeOf3sVisual;
        if (isRevToggle) {
          let revText = effectRes.isRev ? "革命" : "反革命";
          setRevAnimMessage(revText);
          if (sm.playStartSE) sm.playStartSE();
        }
        const cutInDelay = isFastForwardRef.current ? 10 : (isRevToggle ? 3000 : 800);

        // --- STAGE 1: Land side-by-side or normally ---
        setTimeout(() => {
          if (isPlus5Combo) {
             const other = cards.find(c => c.rank !== '5');
             triggerCutIn('5', { otherRank: other.rank, resultRank: effectiveVisualRank }, effectRes.title, effectRes.desc); // Start Cinematic Merger
          } else {
             triggerCutIn(effectiveVisualRank, null, effectRes.title, effectRes.desc); // Standard cards cut-in immediately
          }
        }, cutInDelay);
        
        setPreviousTableCards(prev => [...prev, ...tableCards.map(tc => ({ ...tc, isOld: true }))]);
        setTableCards(styledTableCards);

        // --- STAGE 2 & 3: Plus 5 場に合体カードを出すのは全カットイン終了後 ---
        if (isPlus5Combo) {
          // カットイン全期間終了後に場に合体カードを表示（800ms後からカットイン開始し〗6500ms経過後）
          setTimeout(() => {
            const resRank = effectiveVisualRank;
            const mergedCard = { id: `merged_${Date.now()}`, suit: 'Magic', rank: resRank, strength: RANKS.indexOf(resRank) };
            const finalPos = { top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(1.1) rotate(0deg)' };
            setTableCards([{
              card: mergedCard, isAnimating: false, isSlammed: true,
              initialStyle: finalPos, targetStyle: finalPos
            }]);
            if (sm.playSlamSE) sm.playSlamSE();
          }, 800 + 3400); // Phase4カットイン開始と同時
        }
        // ---------------------------------------------

        newHands = effectRes.h; currentGraveyard = effectRes.gy;
        setIsShielded(effectRes.shieldStates); setIs11Back(effectRes.is11B);
        setIsRevolution(effectRes.isRev);
        setPlayDirection(effectRes.pDir); steps = effectRes.steps; isFieldCleared = effectRes.isFieldCleared;

        newHands = newHands.map(h => sortHand(h, effectRes.isRev, effectRes.is11B));
        setHands(newHands); setGraveyard(currentGraveyard);

        // 手札が空になったプレイヤーをランクに登録
        let updatedRanks = ranksDiscovered ? [...ranksDiscovered] : [];
        newHands.forEach((h, idx) => {
          if (h.length === 0 && !updatedRanks.includes(idx)) {
            updatedRanks.push(idx);
          }
        });
        setRanksDiscovered(updatedRanks);

        if (isFieldCleared) {
          const clearDelay = isFastForwardRef.current ? 10 : (isPlus5Combo ? 5000 : 3400);
          
          if (isPlus5Combo) {
            setTimeout(() => triggerTempEffect(setGuillotineActive, 1200), isFastForwardRef.current ? 10 : (clearDelay - 800));
          }

          setTimeout(() => {
            triggerClearFieldAnim(() => {
              clearFieldLogic([...currentGraveyard, ...cards]);
              setLastPlayPlayer(playerIndex);

              let nextStarter = playerIndex;
              if (updatedRanks.includes(nextStarter)) {
                nextStarter = getNextPlayer(nextStarter, 1, null, updatedRanks);
              }

              // 同一ターン主の場合はセットするだけではuseEffectが発火しないため、一瞬-1にしてから再代入する
              setTurn(-1);
              setIsActionLoading(false); // UIロック解除
              setTimeout(() => {
                setTurn(nextStarter);
              }, 50);

            });
          }, clearDelay); // カットイン終了後（800+2500ms）に場を流す
          return;
        } else {
          setPassCount(0);
          setPassedPlayers([]);  // カード出し時にパス状態を全員リセット
          setLastPlayPlayer(playerIndex);
        }

        // 6フェニックス: 墓地シャッフル演出 → 1枚ずつ裏面のまま墓地から手札へ飛ぶ
        if (effectRes.phoenixDrawn) {
          const { drawn, playerIndex: pIdx } = effectRes.phoenixDrawn;

          // カットイン終了(800ms+2500ms=3300ms)後にシャッフル開始
          setTimeout(() => {
            // ① 墓地シャッフル演出
            setGyShuffling(true);
            setTimeout(() => {
              setGyShuffling(false);

              // ② 1枚ずつ順番にカードを飛ばす
              const flyNext = (i) => {
                if (i >= drawn.length) {
                  setIsAnimating(false);
                  setTimeout(() => setIsAltarActive(false), 500);
                  return;
                }
                const card = drawn[i];
                sm.playPaperSE();

                // ③ getBoundingClientRect()で実座標を計算しアニメ開始
                triggerPhoenixCardFly(pIdx, () => {
                  // ④ 飛翔完了後: sortHandで正しい位置に挿入、紫グロー開始
                  setHands(prev => {
                    const next = prev.map((h, idx) => idx === pIdx ? [...h, card] : h);
                    next[pIdx] = sortHand(next[pIdx], effectRes.isRev, effectRes.is11B);
                    return next;
                  });
                  setPhoenixGlowIds(prev => [...prev, card.id]);
                  setTimeout(() => setPhoenixGlowIds(prev => prev.filter(id => id !== card.id)), 5000);

                  // ⑤ 次のカードを200ms間隔ですぐ飛ばす
                  setTimeout(() => flyNext(i + 1), 200);
                });
              };

              flyNext(0);
            }, 1200); // シャッフル演出1.2s
          }, 3400); // カットイン終了後に開始
        }

        const playRank = cards[0].rank;
        const isEffectSelecting = (playRank === '7' || playRank === '10' || playRank === 'Q' || playRank === 'K');

        // 演出時間: カットイン(3300ms) + シャッフル(1200ms) + 枚数×飛翔+間隔
        const PHOENIX_FLIGHT_MS = 750;  // 飛翔アニメ時間
        const PHOENIX_GAP_MS   = 200;  // カード間隔（短めでサラッと）
        const phoenixTotalTime = effectRes.phoenixDrawn
          ? 3400 + 1200 + effectRes.phoenixDrawn.drawn.length * (PHOENIX_FLIGHT_MS + PHOENIX_GAP_MS) + 500
          : 0;
        let totalAnimTime = isPlus5Combo ? 9000 : (phoenixTotalTime > 0 ? phoenixTotalTime : (effectRes.isAsync ? (playRank === 'Q' ? 5500 : (playRank === 'K' ? 5000 : 3000)) : (isEffectSelecting && playerIndex === 0 ? 4000 : 2800)));
        if (isRevToggle) totalAnimTime += 2200;
        if (isFastForwardRef.current) totalAnimTime = 50;

        if (playerIndex === 0) setIsActionLoading(true);

        setTimeout(() => {
          const stepsToUse = effectRes.isAsync ? 1 : steps;

          // 遅延エフェクト（2等）で手札が0枚になったプレイヤーを追加チェック
          handsRef.current.forEach((h, idx) => {
            if (h.length === 0 && !updatedRanks.includes(idx)) {
              updatedRanks.push(idx);
            }
          });
          setRanksDiscovered([...updatedRanks]);

          // 残り1人になったかチェック (updatedRanksを使用)
          const remaining = [0, 1, 2, 3].filter(p => !updatedRanks.includes(p));
          if (updatedRanks.length >= 3) {
            let finalRanks = [...updatedRanks];
            if (remaining.length === 1) {
              const lastP = remaining[0];
              setRevealedDaihinmin(lastP);
              setTurn(-1);
              if (sm.playJBackSE) sm.playJBackSE();
              setTimeout(() => {
                finalRanks.push(lastP);
                setRanksDiscovered(finalRanks);
                setRoundResults(finalRanks);
                setIsGameOver(true);
                setRevealedDaihinmin(null);
              }, 3000);
              return;
            }

          const nextTarget = getNextPlayer(playerIndex, stepsToUse, effectRes.pDir, updatedRanks);
          if (multiplayerMode === 'active' && isHost) {
            broadcastState(effectRes.phoenixDrawn ? handsRef.current : newHands, nextTarget);
          }
          // Ability Log for TCG (Simplified Japanese)
          const tcg = TCG_DATA[effectiveVisualRank];
          if (tcg && tcg.name) {
            triggerAbilityLog(`${tcg.name}`);
          }
          executeNextTurn(playerIndex, stepsToUse, effectRes.pDir, updatedRanks);
        }, totalAnimTime);
      };

      const executeServiceAEffect = (rank) => {
        if (!serviceAState) return;
        const { playerIndex, count } = serviceAState;
        setServiceAState(null);

        // Fake cards to evaluate effects
        let fakeCards = [];
        for (let i = 0; i < count; i++) {
           fakeCards.push({ id: `fakeA_${Math.random()}`, rank: rank, suit: '♠' });
        }
        
        let newHands = [...hands];
        let currentGraveyard = [...graveyard];
        const effectRes = evaluateSpecialEffects(playerIndex, fakeCards, newHands, currentGraveyard, { isServiceA: true });

        // Calculate visual rank and trigger cut-in
        const resTcg = TCG_DATA[rank];
        const aura = resTcg?.auraColor || '#b8860b';
        if (sm.playEffectSE) sm.playEffectSE(rank);
        setCutIn({ name: resTcg?.name, effect: resTcg?.desc, url: resTcg?.url, rank: rank, auraColor: aura, comboData: null });
        setTimeout(() => setCutIn(null), 2500);

        // Sync State updates
        newHands = effectRes.h.map(h => sortHand(h, effectRes.isRev, effectRes.is11B));
        setHands(newHands);
        setGraveyard(effectRes.gy);
        setIsShielded(effectRes.shieldStates);

        // Start turn logic: should execute after animations
        const PHOENIX_FLIGHT_MS = 750;
        const PHOENIX_GAP_MS = 200;
        const phoenixTotalTime = effectRes.phoenixDrawn ? 3400 + 1200 + effectRes.phoenixDrawn.drawn.length * (PHOENIX_FLIGHT_MS + PHOENIX_GAP_MS) + 500 : 0;
        let totalAnimTime = phoenixTotalTime > 0 ? phoenixTotalTime : (effectRes.isAsync ? (rank === 'Q' ? 5500 : (rank === 'K' ? 5000 : 3000)) : 2800);
        if (isFastForwardRef.current) totalAnimTime = 50;
        
        if (playerIndex === 0) setIsActionLoading(true);

        // 6フェニックス: 墓地シャッフル演出 (copied from executePlay)
        if (effectRes.phoenixDrawn) {
          const { drawn, playerIndex: pIdx } = effectRes.phoenixDrawn;
          setTimeout(() => {
            setGyShuffling(true);
            setTimeout(() => {
              setGyShuffling(false);
              const flyNext = (i) => {
                if (i >= drawn.length) {
                  setIsAnimating(false);
                  setTimeout(() => setIsAltarActive(false), 500);
                  return;
                }
                const card = drawn[i];
                const newFly = { from: 'graveyard', to: pIdx, card: { ...card, rank: '?' }, type: 'phoenix', id: Math.random(), delay: 0 };
                setFlyingCards(prev => [...prev, newFly]);
                setIsAnimating(true);
                if (sm.playSlamSE) sm.playSlamSE();
                setTimeout(() => {
                  setFlyingCards(prev => prev.filter(f => f.id !== newFly.id));
                  setHands(prev => {
                     const updated = [...prev];
                     updated[pIdx] = sortHand([...updated[pIdx], card], effectRes.isRev, effectRes.is11B);
                     return updated;
                  });
                  if (pIdx === 0) {
                     setHighlightedCardIds(prev => [...prev, card.id]);
                     setTimeout(() => setHighlightedCardIds(prev => prev.filter(id => id !== card.id)), 4000);
                  }
                  flyNext(i + 1);
                }, PHOENIX_FLIGHT_MS);
              };
              flyNext(0);
            }, 1200);
          }, 3300);
        }

        // Wait for animations, then set Turn to the player who played A
        setTimeout(() => {
           // Skip advancing turn if waiting for target select (K, 7, Q)
           if (effectRes.steps === 0) return; 
           
           // Otherwise, setTurn back to the player
           setTurn(-1);
           setIsActionLoading(false);
           setTimeout(() => setTurn(playerIndex), 50);
        }, totalAnimTime);
      };

      const playCpuTurn = () => {
        let hand = sortHand([...(hands[turn] || [])]);
        if (!hand || hand.length === 0) { cpuThinkingRef.current = false; return; }
        if (tableCards.length === 0) { executePlay(turn, [hand[0]]); cpuThinkingRef.current = false; return; }
        const tableEffectiveCount = getEffectiveCount(tableCards.map(tc => tc.card));
        const tableStrength = tableCards[0].card.strength;

        const groups = {};
        hand.forEach(c => {
          if (!groups[c.strength]) groups[c.strength] = [];
          groups[c.strength].push(c);
        });

        const strengthsKeys = Object.keys(groups).map(Number).sort((a, b) => {
          if (a === 13) return 1; if (b === 13) return -1;
          return is11Back ? b - a : a - b;
        });

        let foundPlay = null;
        for (let s of strengthsKeys) {
          if (compareStrength(s, tableStrength) && groups[s].length >= tableEffectiveCount) {
            foundPlay = groups[s].slice(0, tableEffectiveCount); break;
          }
        }

        if (foundPlay) {
          executePlay(turn, foundPlay);
          if (multiplayerMode === 'active' && isHost) broadcastEvent({ event: 'PLAY', playerIndex: turn, cards: foundPlay });
        } else {
          // Plus 5 Fallback for CPU
          const tableEffectiveCount = getEffectiveCount(tableCards.map(tc => tc.card));
          if (tableEffectiveCount === 1) {
            const five = hand.find(c => c.rank === '5');
            if (five) {
              const allowed = ['A', '2', '3', '4', '6', '7', '8'];
              const others = hand.filter(c => c.id !== five.id && allowed.includes(c.rank));
              for (let o of others) {
                const total = rankToValue(o.rank) + 5;
                const resRank = valueToRank(total);
                const s = RANKS.indexOf(resRank);
                if (compareStrength(s, tableStrength)) {
                  foundPlay = [five, o];
                  break;
                }
              }
            }
          }
          
          if (foundPlay) {
            executePlay(turn, foundPlay);
            if (multiplayerMode === 'active' && isHost) broadcastEvent({ event: 'PLAY', playerIndex: turn, cards: foundPlay });
          } else {
            const passWait = tableCards.length === 0 ? 500 : 100;
            setTimeout(() => {
              executePass(turn);
              if (multiplayerMode === 'active' && isHost) broadcastEvent({ event: 'PASS', playerIndex: turn });
            }, passWait);
          }
        }
        // 思考完了後はreset（次のsetTurn変化に委ねる）
        // cpuThinkingRef.current = false; // This will be reset by the useEffect when turn changes
      };

      const completeSpecialEffect = (choice, remotePlayerIdx = null, remoteSelectionInfo = null, remoteSelectionMode = null) => {
        const info = remoteSelectionInfo || selectionInfo;
        const mode = remoteSelectionMode || selectionMode;
        if (!info || !mode) return; // Fallback for safety
        const { playerIndex, nextP, count } = info;
        const actingIdx = remotePlayerIdx !== null ? remotePlayerIdx : playerIndex;
        const isServiceA = info.isServiceA || watchTarget?.isServiceA;
        if (multiplayerMode === 'active' && !isHost && remotePlayerIdx === null) {
          sendActionToHost({ action: 'COMPLETE_EFFECT', choice, selectionInfo, selectionMode: mode });
          // return せずにローカルでも Optimistic に実行する
        }
        if (actingIdx === myPlayerIndex) setIsActionLoading(true);

        if (mode === 'K') {
          const watchDuration = 5000;
          setWatchTarget({
            targetIndexes: choice,
            activatorIndex: actingIdx,
            endTime: Date.now() + watchDuration
          });
          setWatchSelecting(false);
          setWatchSelectedTargets([]);
          triggerAbilityLog(`Kウォッチ: Player${choice.join(',')}`);
          setSelectionMode(null);
          setSelectionInfo(null);
          setIsAnimating(true);
          sm.playEffectSE('kwatch_start.mp3');
          setTimeout(() => {
            setWatchTarget(null);
            setIsAnimating(false);
            if (isServiceA) {
              setTurn(-1);
              setIsActionLoading(false);
              setTimeout(() => setTurn(actingIdx), 50);
            } else {
              executeNextTurn(actingIdx, 1);
            }
            if (isHost) {
              broadcastState(hands);
            }
          }, watchDuration);
          return;
        }

        // Host uses a consistent seed or broadcasts the randomness if needed, but for now we'll just broadcast the final state.
        let h = [...hands]; let gy = [...graveyard];

        if (mode === '7' || mode === '10') {
          const chosenCards = choice;
          if (chosenCards.length !== count) return;

          // 7渡し：次のプレイヤーがシールド中なら弾き返す
          if (mode === '7' && isShielded[nextP]) {
            triggerMiss(nextP);
            setSelectionMode(null); setSelectionInfo(null); setSelectedCards([]);
            if (!watchSelecting) {
              setTimeout(() => {
                if (isServiceA) {
                  setTurn(-1);
                  setIsActionLoading(false);
                  setTimeout(() => setTurn(actingIdx), 50);
                } else {
                  executeNextTurn(actingIdx, 1, null, ranksDiscovered);
                }
              }, 1000);
            }
            return;
          }

          chosenCards.forEach((c, idx) => {
            const hIdx = h[playerIndex].findIndex(hc => hc.id === c.id);
            if (hIdx !== -1) {
              const card = h[playerIndex].splice(hIdx, 1)[0];
              if (mode === '7') {
                const newFly = { from: playerIndex, to: nextP, card: { ...card, rank: '?' }, type: 'pass', id: Math.random(), delay: idx * 0.5 };
                setFlyingCards(prev => [...prev, newFly]);
                setIsAnimating(true);
                setTimeout(() => {
                  setFlyingCards(prev => prev.filter(f => f.id !== newFly.id));
                  h[nextP].push(card);
                  if (nextP === 0) {
                    setHighlightedCardIds(prev => [...prev, card.id]);
                    setTimeout(() => setHighlightedCardIds(prev => prev.filter(id => id !== card.id)), 4000);
                  }
                  setHands([...h]);
                  sm.playPaperSE();
                  setReceivedHighlight(nextP);
                  setTimeout(() => {
                    setReceivedHighlight(null);
                    setIsAnimating(false);
                  }, 1500); // 延長
                }, 1800 + idx * 500); // 延長
              } else {
                setDiscardingToGy(prev => [...prev, { card: card, fromPlayer: playerIndex }]);
                setIsAnimating(true);
                setIsAltarActive(true); // 祭壇を活性化
                setTimeout(() => {
                  setDiscardingToGy(prev => prev.filter(item => item.card.id !== card.id));
                  setGraveyard(prev => [...prev, card]);
                  if (idx === chosenCards.length - 1) {
                    setGyShuffling(true);
                    setTimeout(() => {
                      setGyShuffling(false);
                      setIsAnimating(false);
                      setTimeout(() => setIsAltarActive(false), 800);
                    }, 1200);
                  }
                }, 1300 + idx * 120);
              }
            }
          });
        }
        if (mode === 'Q') {
          // Qは複数ランクの配列を受け取れるように
          const targetRanks = Array.isArray(choice) ? choice : [choice];
          triggerTempEffect(setBomberActive, 1800);
          setIsAnimating(true);
          let totalBombCount = 0; let tempH = [...h];
          let affectedPlayers = [];
          let shieldedQPlayers = [];
          let bombedCards = [];

          targetRanks.forEach(targetRank => {
            for (let i = 0; i < 4; i++) {
              const drop = h[i].filter(c => targetRank === 'Joker' ? (c.suit === 'Joker' || c.rank === 'Joker') : c.rank === targetRank);
              if (drop.length > 0) {
                if (isShielded[i]) {
                  // シールド所持者は自身であっても爆破されず弾き演出
                  triggerMiss(i);
                  if (!shieldedQPlayers.includes(i)) shieldedQPlayers.push(i);
                  continue;
                }
                totalBombCount += drop.length;
                bombedCards.push(...drop);
                // gy.push(...drop); // delayed
                tempH[i] = tempH[i].filter(c => targetRank === 'Joker' ? !(c.suit === 'Joker' || c.rank === 'Joker') : c.rank !== targetRank);
                if (!affectedPlayers.includes(i)) affectedPlayers.push(i);
              }
            }
          });

          setExplodingCards(affectedPlayers.map(pIdx => ({ playerIndex: pIdx, rank: targetRanks[0] })));
          setCentralBombCards(bombedCards);
          setIsAltarActive(true); // 爆発を収納
          setTimeout(() => {
            setExplodingCards([]);
            setCentralBombCards([]);
            setGraveyard(prev => [...prev, ...bombedCards]);
            setGyShuffling(true);
            setTimeout(() => {
              setGyShuffling(false);
              setIsAnimating(false);
              setTimeout(() => setIsAltarActive(false), 800);
            }, 1200);
          }, 3500);
          h = tempH;
          const shieldNote = shieldedQPlayers.length > 0 ? ` (シールドにより${shieldedQPlayers.length}人は無効)` : '';
          // showMessage(`Ｑボンバー [${targetRanks.join(',')}]`, `全領域から${totalBombCount}枚が消滅${shieldNote}`);
        }
        setHands(h); setGraveyard(gy); setSelectionMode(null); setSelectionInfo(null); setSelectedCards([]);
        if (isHost) {
          if (remotePlayerIdx === null && multiplayerMode === 'active') {
            broadcastEvent({ event: 'COMPLETE_EFFECT', playerIndex: actingIdx, choice, selectionInfo: info, selectionMode: mode });
          }
          broadcastState(h);
        }
        
        if (!watchSelecting) {
          // アニメーション完了（約2s）待機してから次へ進む
          if (actingIdx === myPlayerIndex) setIsActionLoading(true);
          setTimeout(() => {
            // 遅延エフェクト（Q等）で手札が0枚になったプレイヤーを追加チェック
            let updatedRanks = ranksDiscovered ? [...ranksDiscovered] : [];
            handsRef.current.forEach((h, idx) => {
              if (h.length === 0 && !updatedRanks.includes(idx)) {
                updatedRanks.push(idx);
              }
            });
            if (updatedRanks.length > ranksDiscovered.length) {
              setRanksDiscovered([...updatedRanks]);
            }

            // 残り1人になったかチェック (updatedRanksを使用)
            const remaining = [0, 1, 2, 3].filter(p => !updatedRanks.includes(p));
            if (updatedRanks.length >= 3) {
              let finalRanks = [...updatedRanks];
              if (remaining.length === 1) {
                const lastP = remaining[0];
                setRevealedDaihinmin(lastP);
                setTurn(-1);
                if (sm.playJBackSE) sm.playJBackSE();
                setTimeout(() => {
                  finalRanks.push(lastP);
                  setRanksDiscovered(finalRanks);
                  setRoundResults(finalRanks);
                  setIsGameOver(true);
                  setRevealedDaihinmin(null);
                }, 3000);
                return;
              }

            if (isServiceA) {
              setTurn(-1);
              setIsActionLoading(false);
              setTimeout(() => setTurn(actingIdx), 50);
            } else {
              executeNextTurn(actingIdx, 1, null, updatedRanks);
            }
          }, 2000);
        }
      };

      const handleFlickPlay = (cardsToPlay) => {
        if (turn !== myPlayerIndex || selectionMode || isAnimating || watchTarget || watchSelecting || isActionLoading) return;
        const canPlay = cardsToPlay.length > 0;
        if (!canPlay) return;

        setIsActionLoading(true);
        if (isValidPlay(cardsToPlay)) {
          if (multiplayerMode === 'active' && !isHost) {
            sendActionToHost({ action: 'PLAY', cards: cardsToPlay });
            executePlay(myPlayerIndex, cardsToPlay);
            setSelectedCards([]);
            return;
          }
          executePlay(myPlayerIndex, cardsToPlay); 
          if (isHost) broadcastEvent({ event: 'PLAY', playerIndex: myPlayerIndex, cards: cardsToPlay });
          setSelectedCards([]);
        } else {
          setIsActionLoading(false);
          showMessage('INVALID SACRIFICE', 'そのカードは場に出せない');
        }
      };

      const handlePlay = () => {
        if (turn !== myPlayerIndex || selectionMode || isAnimating || watchTarget || watchSelecting || isActionLoading) {
          return;
        }
        const canPlay = selectedCards.length > 0;
        if (!canPlay) {
          return;
        }
        
        setIsActionLoading(true);
        if (isValidPlay(selectedCards)) {
          if (multiplayerMode === 'active' && !isHost) {
            sendActionToHost({ action: 'PLAY', cards: selectedCards });
            executePlay(myPlayerIndex, selectedCards);
            setSelectedCards([]);
            return;
          } else {
            executePlay(myPlayerIndex, selectedCards); 
            if (isHost) broadcastEvent({ event: 'PLAY', playerIndex: myPlayerIndex, cards: selectedCards });
            setSelectedCards([]);
          }
        } else {
          setIsActionLoading(false);
          showMessage('INVALID SACRIFICE', 'そのカードは場に出せない');
        }
      };

      const handlePass = () => {
        if (turn !== myPlayerIndex || isAnimating || watchTarget || watchSelecting || isActionLoading) return;
        
        if (multiplayerMode === 'active' && !isHost) {
          sendActionToHost({ action: 'PASS' });
          executePass(myPlayerIndex);
          setSelectedCards([]);
          return;
        }

        setIsActionLoading(true);
        executePass(myPlayerIndex); setSelectedCards([]);
        if (isHost) broadcastState(hands);
      };

      const toggleRankSelect = (rank) => {
        const max = selectionInfo?.count || 1;
        if (selectedCards.includes(rank)) {
          setSelectedCards(prev => prev.filter(r => r !== rank));
        } else {
          if (selectedCards.length < max) {
            setSelectedCards(prev => [...prev, rank]);
          } else if (max === 1) {
            setSelectedCards([rank]);
          }
        }
      };

      const toggleSelect = (card) => {
        if (selectedCards.find(c => c.id === card.id)) setSelectedCards(selectedCards.filter(c => c.id !== card.id));
        else setSelectedCards([...selectedCards, card]);
      };

      // 動的なオーラと色付け
      // --- ゲーム終了・再開・交換 ロジック ---
      const startGame = (customHands = null, firstTurn = 0) => {
        setIsTransitioning(true);
        const startTime = Date.now();

        preloadImages(['game_bg.png', 'ruined_casino_bg.jpg'], () => {
          const elapsed = Date.now() - startTime;
          const remainingTime = Math.max(0, 800 - elapsed); // 800ms minimum fade

          setTimeout(() => {
            setTableCards([]);
            setPreviousTableCards([]);
            setPassCount(0);
            setLastPlayPlayer(null);
            setRanksDiscovered([]);
            setGraveyard([]);
            setIsShielded([false, false, false, false]);
            setIs11Back(false);
            setIsRevolution(false);
            setPlayDirection(1);
            setPassedPlayers([]);
            setIsGameOver(false);
            setExchangePhase(null);
            setExchangeDecisions({});
            setIsFastForward(false);

            if (customHands) {
              setHands(customHands);
              setTurn(firstTurn);
              if (multiplayerMode === 'active' && isHost) broadcastState(customHands, firstTurn);
            } else {
              const deck = shuffle(createDeck());
              const newHands = [[], [], [], []];
              let i = 0;
              while (deck.length > 0) {
                newHands[i % 4].push(deck.pop());
                i++;
              }
              const sortedHands = newHands.map(h => sortHand(h));
              setHands(sortedHands);
              setTurn(0);
              if (multiplayerMode === 'active' && isHost) broadcastState(sortedHands, 0);
            }
            setIsDealing(true);
            setTimeout(() => setIsDealing(false), 2000);
            setGameStarted(true);
            sm.playGameBGM();
            setTimeout(() => setIsTransitioning(false), 50);
          }, remainingTime);
        });
      };

      const checkRestartVotes = (votes) => {
        if (multiplayerMode !== 'active') {
          executeRestart();
          return;
        }
        if (!isHost) return;
        
        // 接続されている人間プレイヤーの数
        let humanCount = 0;
        let voteCount = 0;
        
        for (let i = 0; i < remotePlayers.length; i++) {
          if (remotePlayers[i] && !(remotePlayers[i].id && remotePlayers[i].id.startsWith('cpu'))) {
            humanCount++;
            if (votes[i]) voteCount++;
          }
        }
        
        if (voteCount >= humanCount) {
          executeRestart();
        }
      };

      const handleRestart = () => {
        setRestartVotes(prev => {
          const next = { ...prev, [myPlayerIndex]: true };
          if (isHost || multiplayerMode !== 'active') {
            checkRestartVotes(next);
          }
          return next;
        });

        if (multiplayerMode === 'active' && !isHost) {
          sendActionToHost({ action: 'RESTART' });
        }
      };
      const executeRestart = () => {
        const deck = shuffle(createDeck());
        const newHands = [[], [], [], []];
        let i = 0;
        while (deck.length > 0) {
          newHands[i % 4].push(deck.pop());
          i++;
        }
        const sortedHands = newHands.map(h => sortHand(h));

        // 交換フェーズへ
        setHands(sortedHands);
        setTableCards([]);
        setPreviousTableCards([]);
        setPassCount(0);
        setLastPlayPlayer(null);
        setRanksDiscovered([]);
        setGraveyard([]);
        setIsShielded([false, false, false, false]);
        setIs11Back(false);
        setIsRevolution(false);
        setPlayDirection(1);
        setPassedPlayers([]);
        setIsGameOver(false);
        setExchangePhase('selecting');
        setSelectedCards([]);
        setIsFastForward(false);

        // NPCの交換カードを即座に決定
        const decisions = {};
        [0, 1, 2, 3].forEach(pIdx => {
          const rankPos = roundResults.indexOf(pIdx) + 1; // 1:大富豪, 2:富豪, 3:貧民, 4:大貧民
          // マルチプレイ時は、接続プレイヤー以外のスロットをCPUとして扱う
          const isCpu = pIdx !== myPlayerIndex && (multiplayerMode === 'active' ? (remotePlayers[pIdx] && remotePlayers[pIdx].id && remotePlayers[pIdx].id.startsWith('cpu')) : true);
          if (isCpu) {
            if (rankPos === 1) decisions[pIdx] = sortedHands[pIdx].slice(0, 2);
            if (rankPos === 2) decisions[pIdx] = sortedHands[pIdx].slice(0, 1);
            if (rankPos === 3) decisions[pIdx] = sortedHands[pIdx].slice(-1);
            if (rankPos === 4) decisions[pIdx] = sortedHands[pIdx].slice(-2);
          }
        });
        setExchangeDecisions(decisions);
        if (isHost) broadcastState(sortedHands);
        setRestartVotes({});
      };

      const confirmExchange = () => {
        if (exchangePhase !== 'selecting') return;

        if (multiplayerMode === 'active' && !isHost) {
          const p0Rank = roundResults.indexOf(myPlayerIndex) + 1;
          let exchangeCards = [];
          if (p0Rank <= 2) exchangeCards = selectedCards;
          else if (p0Rank === 3) exchangeCards = hands[myPlayerIndex].slice(-1);
          else if (p0Rank === 4) exchangeCards = hands[myPlayerIndex].slice(-2);
          
          sendActionToHost({ action: 'CONFIRM_EXCHANGE', cards: exchangeCards });
          setExchangePhase('animating'); // Wait for host to execute
          return;
        }

        setExchangePhase('animating');

        const h = [...hands];
        const newFlying = [];
        const finalDecisions = { ...exchangeDecisions };

        // プレイヤー0の決定
        const p0Rank = roundResults.indexOf(myPlayerIndex) + 1;
        if (p0Rank === 1 || p0Rank === 2) {
          finalDecisions[0] = selectedCards;
        } else if (p0Rank === 3) {
          finalDecisions[0] = h[0].slice(-1);
        } else if (p0Rank === 4) {
          finalDecisions[0] = h[0].slice(-2);
        }

        // 交換実行
        const daifugo = roundResults[0];
        const fugo = roundResults[1];
        const hinmin = roundResults[2];
        const daihinmin = roundResults[3];

        const pairs = [
          { from: daifugo, to: daihinmin, cards: finalDecisions[daifugo] },
          { from: daihinmin, to: daifugo, cards: finalDecisions[daihinmin] },
          { from: fugo, to: hinmin, cards: finalDecisions[fugo] },
          { from: hinmin, to: fugo, cards: finalDecisions[hinmin] }
        ];

        pairs.forEach(pair => {
          pair.cards.forEach(c => {
            const idx = h[pair.from].findIndex(hc => hc.id === c.id);
            if (idx !== -1) {
              h[pair.from].splice(idx, 1);
              newFlying.push({ from: pair.from, to: pair.to, card: c, type: 'pass', id: Math.random() });
            }
          });
        });

        setFlyingCards(newFlying);
        sm.playPaperSE();

        setTimeout(() => {
          pairs.forEach(pair => {
            pair.cards.forEach(c => {
              h[pair.to].push(c);
            });
            h[pair.to] = sortHand(h[pair.to]);
          });
          setHands([...h]);
          setFlyingCards([]);
          setExchangePhase(null);
          setSelectedCards([]);
          // 大貧民から開始
          setTurn(daihinmin);
          setIsDealing(true);
          setTimeout(() => setIsDealing(false), 1000);
        }, 2000);
      };

      const getCardClass = (c) => {
        if (c.hidden) return "card back";
        let cls = `card ${c.suit === '♥' || c.suit === '♦' ? 'red' : (c.suit === 'Joker' ? 'joker' : '')}`;
        // Aura effect mapping loosely based on ability
        if (c.rank === '4') cls += ' aura-shield';
        if (c.rank === '6' || c.rank === '10' || c.rank === 'Q') cls += ' aura-fire';
        if (c.rank === '8') cls += ' aura-dark';
        if (c.rank === 'A' || c.rank === 'K') cls += ' aura-gold';
        return cls;
      };

      const getAvatarUrl = (avatarKey) => {
        // base64画像データ、またはwebpなどの画像パスが直接入っている場合はそのまま返す
        if (avatarKey && (avatarKey.startsWith('data:image') || avatarKey.endsWith('.webp'))) {
          return avatarKey;
        }
        // 古い設定が残っている場合や未設定の場合はデフォルトアイコンとしてjokerを返す
        return 'joker.webp';
      };

      const getAvatarStyle = (avatarKey) => {
        const url = getAvatarUrl(avatarKey);
        if (url.endsWith('.webp')) {
          // カードデザインの場合：キャラの顔部分にズームする（例：上部20%付近、サイズ150%）
          return {
            backgroundImage: `url(${url})`,
            backgroundSize: '150%',
            backgroundPosition: 'center 20%'
          };
        }
        // カスタムアップロード画像等の場合：通常通り中央をカバー
        return {
          backgroundImage: `url(${url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        };
      };

      const getPlayerAvatar = (pIdx) => {
        if (pIdx === 0) return myProfile?.avatar || 'joker.webp';
        // CPUにはランダム感のある固定カードを割り当て（必要に応じて変更可）
        if (pIdx === 1) return 'Kimage.webp';
        if (pIdx === 2) return 'Qimage.webp';
        if (pIdx === 3) return 'Jimage.webp';
        return 'joker.webp';
      };

      const renderFanHand = (handContent, playerIdx, isFaceUp = false) => {
        const total = handContent.length;
        const isBeingWatchedByMe = watchTarget?.targetIndexes?.includes(playerIdx) && watchTarget?.activatorIndex === myPlayerIndex;
        // Kウォッチ時は横に広がりすぎないようさらに角度を制限
        let maxAngle = isBeingWatchedByMe ? Math.min(25, total * 2.5) : Math.min(60, total * 4);
        if (isMobile && isBeingWatchedByMe) {
          maxAngle = Math.min(40, total * 4); // スマホ監視時はタイトにしない（視認性優先）
        }
        const angleStep = total > 1 ? maxAngle / (total - 1) : 0;
        const startAngle = -maxAngle / 2;

        const rankIdx = ranksDiscovered.indexOf(playerIdx);
        const hierarchy = rankIdx !== -1 ? getHierarchyTitle(rankIdx + 1) : null;
        const isDead = rankIdx !== -1;

        return (
          <div key={playerIdx}
            data-player-hand={playerIdx}
            className={`player-area player-${playerIdx} ${turn === playerIdx ? 'active-turn' : ''} ${watchSelecting && playerIdx !== myPlayerIndex && !isDead && !isShielded[playerIdx] ? 'watch-clickable' : ''} ${watchSelecting && playerIdx !== myPlayerIndex && !isDead && isShielded[playerIdx] ? 'watch-shielded' : ''} ${slashEffectTarget === playerIdx ? 'slash-hit' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={(e) => handlePointerMove(e, playerIdx)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: 'none' }}
            onClick={() => {
              if (isSwipingRef.current) return; // スワイプ後の誤爆防止
              if (watchSelecting && playerIdx !== myPlayerIndex && !isDead) {
                // 4シールド所持者はKウォッチ選択不可
                if (isShielded[playerIdx]) {
                  triggerMiss(playerIdx);
                  return;
                }
                if (watchSelectedTargets.includes(playerIdx)) return;
                
                const newSelected = [...watchSelectedTargets, playerIdx];
                const availableTargetsCount = [0, 1, 2, 3].filter(p => p !== myPlayerIndex && !ranksDiscovered.includes(p) && !isShielded[p]).length;
                const maxTargets = selectionInfo?.count || 1;

                if (newSelected.length >= maxTargets || newSelected.length >= availableTargetsCount) {
                  completeSpecialEffect(newSelected, null, { playerIndex: myPlayerIndex }, 'K');
                } else {
                  setWatchSelectedTargets(newSelected);
                  sm.playEffectSE('select.mp3');
                }
              }
            }}
          >
            {skipTarget === playerIdx && <div className="skip-chains"></div>}
            {explodingCards.find(ec => ec.playerIndex === playerIdx) && (
              <div className="exploding-card" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200px', height: '200px', background: 'radial-gradient(circle, #f00, transparent)', borderRadius: '50%', zIndex: 600 }}></div>
            )}
            {!(isMobile && playerIdx !== myPlayerIndex && !isBeingWatchedByMe) ? (
              handContent.map((c, i) => {
              const rot = startAngle + i * angleStep;
              const trY = Math.abs(rot) * 0.8;
              const isSelected = selectedCards.find(sc => sc.id === c.id);
              const tcg = !c.hidden ? TCG_DATA[c.rank] : null;
              const aura = tcg?.auraColor || '#b8860b';
              const dealDelay = isDealing ? `${(i + playerIdx * 10) * 0.04}s` : '0s';
              let varStyle = {};
              
              if (passedPlayers.includes(playerIdx)) {
                varStyle.filter = 'brightness(0.3)';
              }

              if (isFaceUp && !c.hidden) {
                const isHighlighted = highlightedCardIds.includes(c.id);
                const isPhoenixGlow = phoenixGlowIds.includes(c.id);
                let transformStyle = `translateX(calc(-50% + var(--spread-x, 0px))) rotate(${rot}deg) translateY(${trY}px)`;
                let marginLeftStyle = `${(i - total / 2) * 40}px`;
                
                if (isMobile && (playerIdx === 0 || isBeingWatchedByMe)) {
                  // 監視中または自分の手札：画面幅を広く使って視認性を確保
                  const maxLocalWidth = (playerIdx === myPlayerIndex || isBeingWatchedByMe) ? window.innerWidth * 0.95 : (isMobile ? 180 : 300); 
                  const cardWidth = (isMobile && playerIdx === myPlayerIndex) ? 85 : 65; 
                  const cap = isBeingWatchedByMe ? 50 : 45;
                  const spacing = Math.min(cap, (maxLocalWidth - cardWidth) / Math.max(1, total - 1));
                  const offset = (i - (total - 1) / 2) * spacing;
                  
                  let ty = isSelected ? trY - 15 : trY;
                  transformStyle = `translateX(calc(-50% + ${offset}px)) rotate(${rot}deg) translateY(${ty}px)`;
                  marginLeftStyle = `0px`;
                  // Enforce this style on mobile selection to avoid CSS !important overrides
                  varStyle = { ...varStyle, '--mobile-transform': transformStyle };
                } else {
                  // Fallback for non-mobile or unselected
                  varStyle = { ...varStyle, '--mobile-transform': transformStyle };
                }

                let zIndexStyle = i + 1;
                // zIndexStyle += 500; // 前後関係を維持するため選択時のブーストを廃止

                return (
                  <div key={c.id}
                    data-card-id={c.id}
                    className={`${getCardClass(c)} selectable ${isSelected ? (isMobile ? 'mobile-selected' : 'selected') : ''} ${isHighlighted ? 'received-highlight' : ''} ${isPhoenixGlow ? 'phoenix-glow' : ''} ${isDealing ? 'dealing' : ''} ${isShielded[playerIdx] ? 'shielded-card' : ''} ${isShielded[playerIdx] && missEffectTarget === playerIdx ? 'shield-miss' : ''}`}
                    style={{
                      '--rot': `${rot}deg`, '--trY': `${trY}px`,
                      '--card-aura': aura,
                      '--deal-delay': dealDelay,
                      ...varStyle,
                      transform: transformStyle,
                      left: `50%`, marginLeft: marginLeftStyle, zIndex: zIndexStyle,
                      borderColor: aura,
                      boxShadow: `0 0 10px ${aura}, 0 5px 12px rgba(0,0,0,0.9)`
                    }}
                    onClick={() => {
                      if (isDead) return;
                      const p0Rank = roundResults ? roundResults.indexOf(myPlayerIndex) + 1 : 0;
                      const canExchangeSelect = exchangePhase === 'selecting' && playerIdx === myPlayerIndex && (p0Rank === 1 || p0Rank === 2);
                      if ((turn === playerIdx && !selectionMode && !exchangePhase) || (selectionMode && playerIdx === myPlayerIndex) || canExchangeSelect) {
                        sm.playLightPaperSE();
                        toggleSelect(c);
                      }
                    }}
                    onMouseEnter={() => {
                      if (playerIdx === myPlayerIndex && !isDead) sm.playLightPaperSE();
                    }}
                  >
                    <div className="card-rank">{c.rank === 'Joker' ? 'J' : c.rank}</div>
                    <div className="tcg-art" style={{ backgroundImage: tcg?.url ? `url(${tcg.url})` : '', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '100%', height: '100%', borderRadius: '4px' }}></div>
                    {tcg?.desc && <div className="tcg-tooltip">{tcg.desc}</div>}
                    {isHighlighted && <div className="highlight-frame"></div>}
                  </div>
                );
              } else {
                return (
                  <div key={`back-${i}`}
                    className={`card back ${isDealing ? 'dealing' : ''} ${isShielded[playerIdx] ? 'shielded-card' : ''} ${isShielded[playerIdx] && missEffectTarget === playerIdx ? 'shield-miss' : ''}`}
                    style={{
                      '--deal-delay': dealDelay,
                      transform: `translateX(-50%) rotate(${rot}deg) translateY(${trY}px)`,
                      left: `50%`, marginLeft: `${(i - total / 2) * 15}px`, zIndex: i + 1,
                      filter: passedPlayers.includes(playerIdx) ? 'brightness(0.3)' : 'none'
                    }}
                  ></div>
                );
              }
            })
            ) : (
              <div className="cpu-decorative-cards">
                <div className="cpu-decorative-card" style={{ transform: 'rotate(-20deg) translateY(4px)', left: '5px' }}></div>
                <div className="cpu-decorative-card" style={{ transform: 'rotate(0deg)', left: '20px' }}></div>
                <div className="cpu-decorative-card" style={{ transform: 'rotate(20deg) translateY(4px)', left: '35px' }}></div>
              </div>
            )}

            {playerIdx !== myPlayerIndex ? (
              <div className="player-center-info">
                {passedPlayers.includes(playerIdx) && (
                  <div className="player-pass-wrapper" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', position: 'absolute', zIndex: 3000 }}>
                    <div className="player-pass-label">PASS</div>
                  </div>
                )}
                {watchTarget && watchTarget.activatorIndex === playerIdx && playerIdx !== myPlayerIndex && (
                  <div className="watch-activator-label">監視中</div>
                )}
                
                {/* ターンタイマーゲージ (オンライン対戦かつ進行中のみ。CPUは非表示) */}
                {multiplayerMode === 'active' && turn === playerIdx && !(remotePlayers[playerIdx] && remotePlayers[playerIdx].id && remotePlayers[playerIdx].id.startsWith('cpu')) && gameStarted && !isGameOver && !isAnimating && !watchTarget && !watchSelecting && (
                  <div className="turn-timer-gauge-container" style={{ filter: passedPlayers.includes(playerIdx) ? 'brightness(0.3)' : 'none' }}>
                    <div className={`turn-timer-gauge-bar ${turnTimeLeft <= 5 ? 'urgent' : ''}`} style={{ width: `${(turnTimeLeft / 15) * 100}%` }}></div>
                  </div>
                )}

                {/* 手札枚数はアイコンの上部に配置 */}
                <div className="hand-count-badge" style={{ filter: passedPlayers.includes(playerIdx) ? 'brightness(0.3)' : 'none' }}>{hands[playerIdx].length}</div>
                {/* アバターアイコン */}
                <div id={`avatar-${playerIdx}`} className={`player-avatar-icon ${hierarchy ? hierarchy.cls : ''}`} style={{ ...getAvatarStyle(getPlayerAvatar(playerIdx)), filter: passedPlayers.includes(playerIdx) ? 'brightness(0.3)' : 'none' }}>
                  {settledTurn === playerIdx && <div className="active-turn-ring-local"></div>}
                </div>
                {/* 名前はアイコンの下部に配置 */}
                <div className="player-status" style={{ filter: passedPlayers.includes(playerIdx) ? 'brightness(0.3)' : 'none' }}>
                  {playerIdx === myPlayerIndex ? 'YOU' : (remotePlayers[playerIdx]?.name || `CPU ${playerIdx}`)}
                  {hierarchy && <span className={`rank-badge ${hierarchy.cls}`}>{hierarchy.title}</span>}
                </div>
              </div>
            ) : (
              passedPlayers.includes(playerIdx) && (
                <div className="player-pass-wrapper">
                  <div className="player-pass-label">PASS</div>
                </div>
              )
            )}
          </div>
        );
      };

      useEffect(() => {
        if (isGameOver && isOnlineMatch && ratingChange === null) {
          const myRank = roundResults.indexOf(myPlayerIndex) + 1;
          let k = 32;
          let expectedScore = 0.5;
          let actualScore = myRank === 1 ? 1 : myRank === 2 ? 0.75 : myRank === 3 ? 0.25 : 0;
          let diff = Math.round(k * (actualScore - expectedScore));
          
          let newRating = playerRating + diff;
          setRatingChange({ old: playerRating, new: newRating, diff: diff });
          setPlayerRating(newRating);
          localStorage.setItem('local_rating', newRating.toString());
          
          if (isSupabaseReady && supabaseClient && myUid) {
            supabaseClient.from('users').upsert({
              id: myUid,
              display_name: myProfile.display_name,
              rating: newRating
            }).then(({error}) => {
              if (error) console.error("Supabase rating update failed", error);
            });
          }
        }
      }, [isGameOver, isOnlineMatch, roundResults, playerRating, ratingChange, myPlayerIndex, myProfile.display_name]);

      const startOnlineMatch = async () => {
        setIsOnlineMatch(true);
        setOnlineMatchStatus('searching');
        setMultiplayerMode('online'); // Switch mode for UI
        
        if (!isSupabaseReady || !myUid) {
          // モックの遅延でマッチング成功とする
          setTimeout(() => {
            setOnlineMatchStatus('found');
            setRemotePlayers([
              { id: 'local', name: myProfile.display_name, rating: playerRating },
              { id: 'cpu1', name: 'Player2', rating: playerRating + Math.floor(Math.random() * 50 - 25) },
              { id: 'cpu2', name: 'Player3', rating: playerRating + Math.floor(Math.random() * 50 - 25) },
              { id: 'cpu3', name: 'Player4', rating: playerRating + Math.floor(Math.random() * 50 - 25) }
            ]);
            setTimeout(() => {
              startGame();
            }, 2000);
          }, 3000);
          return;
        }

        // Supabase Matching Logic
        try {
          const { error } = await supabaseClient.from('matchmaking_queue').upsert({
            uid: myUid,
            name: myProfile.display_name,
            rating: playerRating
          });
          if (error) throw error;

          // Subscribe to matchmaking queue changes
          const channel = supabaseClient.channel('matchmaking');
          let isMatched = false;

          channel.on('postgres_changes', { event: '*', schema: 'public', table: 'matchmaking_queue' }, async (payload) => {
            if (isMatched) return;

            // Check if queue has enough players (2 players for testing)
            const { data } = await supabaseClient.from('matchmaking_queue').select('*').order('joined_at', { ascending: true });
            
            if (data && data.length >= 2) {
              const myIndex = data.findIndex(p => p.uid === myUid);
              if (myIndex === -1) return; // I'm no longer in queue
              
              const matchedPlayers = data.slice(0, 2);
              if (matchedPlayers.some(p => p.uid === myUid)) {
                isMatched = true;
                supabaseClient.removeChannel(channel);
                await supabaseClient.from('matchmaking_queue').delete().eq('uid', myUid);
                
                const hostUid = matchedPlayers[0].uid;
                const isMyHost = hostUid === myUid;
                const hostPeerId = "ultimate-daihugou-match-" + hostUid;
                
                setOnlineMatchStatus('found');
                
                if (isMyHost) {
                  startAsHost(hostPeerId);
                  // remote players will be added when they JOIN
                  setRemotePlayers([{ id: 'local', name: myProfile.display_name }]);
                } else {
                  // Guest logic
                  setTimeout(() => {
                    joinAsGuest(hostPeerId);
                  }, 2000); // Wait for host to create peer
                }
              }
            }
          }).subscribe();

        } catch (e) {
          console.error("Matchmaking error", e);
          setOnlineMatchStatus('idle');
          setMultiplayerMode(null);
          alert("マッチメイキングに失敗しました。");
        }
      };

      const cancelOnlineMatch = () => {
        setIsOnlineMatch(false);
        setOnlineMatchStatus('idle');
        setMultiplayerMode(null);
      };

      const fetchLeaderboard = async () => {
        if (!isSupabaseReady) {
          setLeaderboardData([
            { name: "King", rating: 2500 },
            { name: "Queen", rating: 2100 },
            { name: "Knight", rating: 1850 },
            { name: "Rogue", rating: 1550 },
            { name: "Peasant", rating: 1100 },
          ]);
          setShowLeaderboard(true);
          return;
        }
        try {
          const { data, error } = await supabase
            .from('users')
            .select('display_name, rating')
            .order('rating', { ascending: false })
            .limit(10);
            
          if (error) throw error;
          
          const formattedData = data.map(d => ({
            name: d.display_name || 'Unknown',
            rating: d.rating || 1500
          }));
          
          setLeaderboardData(formattedData);
          setShowLeaderboard(true);
        } catch(e) {
          console.error("Failed to fetch leaderboard", e);
        }
      };

      const startDealAnimation = () => {
        // 1人プレイ用の開始処理
        startGame();
      };

      // --- Latest Function Refs for Event Listeners ---
      useEffect(() => {
        executePlayRef.current = executePlay;
        executePassRef.current = executePass;
        completeSpecialEffectRef.current = completeSpecialEffect;
        handleRestartRef.current = handleRestart;
        isValidPlayRef.current = isValidPlay;
      }, [executePlay, executePass, completeSpecialEffect, handleRestart, isValidPlay]);

      // --- Online Turn Auto-Pass Timer ---
      // --- Online Turn Auto-Pass Timer ---
      // --- Online Turn Auto-Pass Timer ---
      const timerConditionsRef = useRef({
        isCpuTurn: false,
        isActionLoading: false,
        multiplayerMode: 'lobby',
        isAnimating: false,
        watchTarget: null,
        watchSelecting: false,
        isGameOver: false,
        turn: 0,
        myPlayerIndex: 0
      });

      // 最新の状態をRefに同期
      useEffect(() => {
        timerConditionsRef.current = {
          isCpuTurn: multiplayerMode === 'active' ? (remotePlayers[turn] && remotePlayers[turn].id && remotePlayers[turn].id.startsWith('cpu')) : true,
          isActionLoading,
          multiplayerMode,
          isAnimating,
          watchTarget,
          watchSelecting,
          selectionMode,
          selectionInfo,
          serviceAState,
          hands: handsRef.current,
          isShielded,
          ranksDiscovered,
          isGameOver,
          turn,
          myPlayerIndex
        };
      }, [turn, remotePlayers, isActionLoading, multiplayerMode, isAnimating, watchTarget, watchSelecting, selectionMode, selectionInfo, serviceAState, isShielded, ranksDiscovered, isGameOver, myPlayerIndex, hands]);

      // ターンが変わるごとに確実にタイマーを15秒にリセットし、setIntervalを開始
      useEffect(() => {
        setTurnTimeLeft(15);
        
        const interval = setInterval(() => {
          const c = timerConditionsRef.current;
          
          if (c.multiplayerMode !== 'active' || c.isCpuTurn || c.isAnimating || c.watchTarget || c.watchSelecting || c.isGameOver) {
             setTurnTimeLeft(15); // フリーズ & 15秒維持
             return;
          }
          if (c.isActionLoading) {
             return; // フリーズ (秒数維持)
          }

          setTurnTimeLeft(prev => {
            if (prev <= 0) return 0;
            return prev - 1;
          });
        }, 1000);

        return () => clearInterval(interval);
      }, [turn]);

      // 時間切れ時の自動パス処理
      useEffect(() => {
        if (turnTimeLeft === 0 && turn === myPlayerIndex) {
           const c = timerConditionsRef.current;
           if (!c.isActionLoading && !c.isAnimating && !c.isGameOver && c.multiplayerMode === 'active') {
             handlePass();
           }
        }
      }, [turnTimeLeft, turn, myPlayerIndex]);

      // 選択モード用 10秒タイマー
      useEffect(() => {
        if (!selectionMode && !watchSelecting && !serviceAState) {
          if (selectionTimeLeft !== 10) setSelectionTimeLeft(10);
          return;
        }

        if (selectionTimeLeft <= 0) {
          const c = timerConditionsRef.current;
          let currentCount = 1;
          if (c.selectionInfo && c.selectionInfo.count) {
            currentCount = c.selectionInfo.count;
          }
          
          if (c.serviceAState) {
            const options = ['6', '7', 'Q', 'K'];
            const choice = options[Math.floor(Math.random() * options.length)];
            executeServiceAEffect(choice);
          } else if (watchSelecting) {
            setWatchSelecting(false);
            const validTargets = [0, 1, 2, 3].filter(p => p !== turn && !c.ranksDiscovered.includes(p) && !c.isShielded[p]);
            if (validTargets.length > 0) {
              const randomTargets = [...validTargets].sort(() => Math.random() - 0.5).slice(0, currentCount);
              completeSpecialEffect(randomTargets, null, { playerIndex: turn }, 'K');
            } else {
              if (!c.isActionLoading) setTimeout(() => executeNextTurn(turn, 1, null, c.ranksDiscovered), 1000);
            }
          } else {
            if (selectionMode === '7' || selectionMode === '10') {
              const h = c.hands[turn];
              if (h && h.length > 0) {
                const count = Math.min(currentCount, h.length);
                const randomCards = [...h].sort(() => Math.random() - 0.5).slice(0, count);
                completeSpecialEffect(randomCards);
              } else {
                completeSpecialEffect([]);
              }
            } else if (selectionMode === 'Q') {
              const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'Joker'];
              const randomRanks = [...ranks].sort(() => Math.random() - 0.5).slice(0, currentCount);
              completeSpecialEffect(randomRanks);
            } else {
              completeSpecialEffect([]);
            }
          }
          return;
        }

        const timer = setTimeout(() => {
          setSelectionTimeLeft(prev => prev - 1);
        }, isFastForwardRef.current ? 10 : 1000);

        return () => clearTimeout(timer);
      }, [selectionMode, watchSelecting, serviceAState, selectionTimeLeft, turn]);

      return (
        <>
          {showLoadingUi && (
            <div className={`global-loading-overlay ${!isAppLoading ? 'fade-out' : ''}`}>
              <LoadingIndicator />
              <p style={{ letterSpacing: '4px', fontSize: '1.2rem' }}>LOADING...</p>
            </div>
          )}
          {isMobile && (
            <div className="mobile-margin-top">
              <div className="mobile-ad-banner">
                Ad Space (320x50)
              </div>
            </div>
          )}
          <div id="game-root" className={`game-container ${(!gameStarted && multiplayerMode !== 'lobby') ? 'title-bg' : ''} ${watchSelecting ? 'k-watch-active k-watch-selecting' : ''} ${watchTarget && watchTarget.targetIndexes && watchTarget.activatorIndex === myPlayerIndex ? 'k-watch-active k-watch-viewing' : ''}`} onContextMenu={(e) => e.preventDefault()}>
          {(watchSelecting || (watchTarget && watchTarget.activatorIndex === myPlayerIndex)) && <div className={`k-watch-overlay ${watchTarget ? 'viewing' : ''}`}></div>}
          {watchSelecting && (
            <div className="k-watch-select-prompt" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div>プレイヤーを選択してください。</div>
              <div className="turn-timer-gauge-container" style={{ width: '200px', marginTop: '10px' }}>
                 <div className={`turn-timer-gauge-bar ${selectionTimeLeft <= 3 ? 'urgent' : ''}`} style={{ width: `${(selectionTimeLeft / 10) * 100}%`, backgroundColor: '#e74c3c' }}></div>
              </div>
            </div>
          )}

          
          {(!gameStarted && multiplayerMode !== 'lobby') ? (
            <div className="title-screen">
              {titleStage === 1 && (
              <div className="title-card-fan">
                {/* 
                  ユーザー要望: 
                  左側: 2を起点として時計回りに20度ずつ角度が変わる螺旋隊列 (Joker除外)
                  右側: エフェクト削除、揺れのみ、Qを右にずらす、3D角度の強調
                */}
                {(() => {
                  // 重複ゼロ：全14種類のカード（Joker, 2〜A）を1枚ずつのみ使用
                  // 軽量化：スマホ版は枚数を削減
                  const allRanks = isMobile ? ['2', 'Q', 'A', 'Joker', '8', 'K', 'J'] : ['K', '2', 'J', 'Q', 'A', '10', 'Joker', '3', '4', '5', '6', '7', '8', '9'];

                  // 座標マップ（画面中央からのpxオフセット）
                  // 画面端に寄り過ぎず、かつ左上・右下などの余白を埋めるバランス配置 (Max offset ~570px)
                  const posMap = [
                    { tx: -380, ty: 180, layer: 0 }, { tx: 420, ty: -120, layer: 0 }, // Layer 0 (K と 2)
                    { tx: -450, ty: -300, layer: 1 }, { tx: 480, ty: 320, layer: 1 }, // Layer 1 (J: 左上)
                    { tx: -180, ty: 450, layer: 1 }, { tx: 200, ty: -380, layer: 1 },  // Layer 1
                    { tx: -580, ty: 80, layer: 2 }, { tx: 540, ty: 100, layer: 2 },   // Layer 2
                    { tx: -320, ty: -460, layer: 2 }, { tx: 300, ty: 460, layer: 2 },  // Layer 2
                    { tx: -540, ty: -240, layer: 3 }, { tx: 520, ty: 250, layer: 3 },  // Layer 3
                    { tx: 80, ty: -520, layer: 3 }, { tx: -120, ty: 520, layer: 3 }     // Layer 3
                  ];

                  return allRanks.map((rank, idx) => {
                    const tcg = TCG_DATA[rank];
                    const scaleX = isMobile ? 0.33 : 1.0;
                    const scaleY = isMobile ? 0.6 : 1.0;
                    const sizeScale = isMobile ? 0.6 : 1.0;
                    const cfg = { ...posMap[idx], tx: posMap[idx].tx * scaleX, ty: posMap[idx].ty * scaleY };

                    // レイヤーごとの物理特性 (全ての回転を0degに固定して正対させる)
                    let baseScale, zIndex, blur, bright, dur, swayX, swayY, circleOp;
                    if (cfg.layer === 0) { // 最前面
                      baseScale = 1.35 * sizeScale;
                      zIndex = 500;
                      blur = "0px";
                      bright = 1.0;
                      dur = "7s";
                      swayX = "15px"; swayY = "-20px";
                      circleOp = 1;
                    } else if (cfg.layer === 1) { // 前方
                      baseScale = 0.65 * sizeScale;
                      zIndex = 400;
                      blur = "0.7px";
                      bright = 0.8;
                      dur = "10s";
                      swayX = "8px"; swayY = "-12px";
                      circleOp = 0.8;
                    } else if (cfg.layer === 2) { // 後方
                      baseScale = 0.42 * sizeScale;
                      zIndex = 300;
                      blur = "1.6px";
                      bright = 0.65;
                      dur = "14s";
                      swayX = "5px"; swayY = "-8px";
                      circleOp = 0;
                    } else { // 最背面 (最奥)
                      baseScale = 0.22 * sizeScale;
                      zIndex = 100;
                      blur = "3.2px";
                      bright = 0.5;
                      dur = "18s";
                      swayX = "3px"; swayY = "-5px";
                      circleOp = 0;
                    }

                    return (
                      <div key={rank} className="fan-item deep-field"
                        style={{
                          backgroundImage: `url(${tcg.url})`,
                          '--tx': `${cfg.tx}px`,
                          '--ty': `${cfg.ty}px`,
                          '--rx': '0deg',
                          '--ry': '0deg',
                          '--rz': '0deg',
                          '--base-scale': baseScale,
                          '--bright': bright,
                          '--blur': blur,
                          '--dur': dur,
                          '--delay': `-${(idx * 1.5).toFixed(1)}s`,
                          '--sway-x': swayX,
                          '--sway-y': swayY,
                          '--circle-op': circleOp,
                          zIndex: zIndex
                        }}>
                      </div>
                    );
                  });
                })()}
              </div>
              )}
              <div className="title-overlay"></div>

                                          {/* 暗転トランジション用オーバーレイ */}
              <div className={`transition-overlay ${isTransitioning ? 'active' : ''}`}></div>


              {/* ロゴとボタンをグループ化 */}
              <div className={`title-main-group stage-${titleStage}`}>
                {titleStage === 1 && (
                  <div className="title-logo-container">
                    <img src="logo.webp" alt="アルティメット大富豪" className="title-logo" />
                  </div>
                )}

                {/* Stage 1: 初期状態 */}
                {titleStage === 1 && (
                  <>
                    {!isReady ? (
                      <div className={`touch-start-container animate-fade-in ${isReadyPressed ? 'start-pressed' : ''}`} onClick={handleReadyClick}>
                        <div className="touch-start-text" style={{color: '#E6C875', textShadow: '0 2px 15px rgba(212,175,55,0.6)'}}>READY</div>
                      </div>
                    ) : (
                      <div className={`touch-start-container animate-fade-in ${isStartPressed ? 'start-pressed' : ''}`} onClick={handleStartGameTransition}>
                        <div className="touch-start-text" style={{color: '#E6C875', textShadow: '0 2px 15px rgba(212,175,55,0.6)'}}>START GAME</div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Stage 2: モード選択状態 */}
              {titleStage === 2 && (
                <>
                  <div className="stage2-background animate-fade-in"></div>

                  {/* 広告枠コンテナ (Ad Space) - ルール選択画面以外で表示 */}
                  {multiplayerMode && (
                    <div className="ad-overlay-container animate-fade-in">
                      <div className="ad-side">
                        <div className="ad-box">AD SPACE</div>
                      </div>
                      <div className="ad-side">
                        <div className="ad-box">AD SPACE</div>
                      </div>
                    </div>
                  )}
                  
                  {!multiplayerMode && (
                  <>
                  {/* テーブル上の散らばったカード */}
                  <div className="scattered-cards-container animate-fade-in">
                    <img src="3image.webp" className="scattered-card" style={{top: '14vh', right: '20%', transform: 'rotate(-10deg)', zIndex: 12}} alt="" />
                    <img src="5image.webp" className="scattered-card" style={{top: '12vh', right: '22%', transform: 'rotate(15deg)', zIndex: 11}} alt="" />
                    <img src="7image.webp" className="scattered-card" style={{top: '25%', left: '5%', transform: 'rotate(-45deg)'}} alt="" />
                    <img src="9image.webp" className="scattered-card" style={{top: '50%', left: '3%', transform: 'rotate(15deg)'}} alt="" />
                    <img src="Jimage.webp" className="scattered-card" style={{top: '20%', right: '10%', transform: 'rotate(25deg)'}} alt="" />
                    <img src="Kimage.webp" className="scattered-card" style={{top: '55%', right: '5%', transform: 'rotate(-30deg)', zIndex: 11}} alt="" />
                    <img src="Aimage.webp" className="scattered-card" style={{bottom: '15%', left: '6%', transform: 'rotate(40deg)'}} alt="" />
                    <img src="2image.webp" className="scattered-card" style={{top: '58%', right: '7%', transform: 'rotate(-15deg)', zIndex: 12}} alt="" />
                    <img src="joker.webp" className="scattered-card" style={{top: '15%', left: '22%', transform: 'rotate(10deg)'}} alt="" />
                  </div>
                  
                  <div className="stage2-top-logo animate-fade-in">
                    <img src="logo.webp" alt="アルティメット大富豪" />
                  </div>

                  
                  {isMobile ? (
                    <div className="mode-select-carousel animate-fade-in"
                         onTouchStart={handleCarouselTouchStart}
                         onTouchMove={handleCarouselTouchMove}
                         onTouchEnd={handleCarouselTouchEnd}>
                      <div className="carousel-arrow left" onClick={() => setCarouselIndex((prev) => (prev + 1) % 3)}>◀</div>
                      
                      <div className="carousel-window">
                        <div className="carousel-track" style={{ transform: `translateX(-${carouselIndex * 33.3333}%)` }}>
                          
                          {/* Item 0: Online */}
                          <div className="carousel-item">
                            <img src="online.png" alt="Online Play" className="mode-image-button" onClick={() => { setMultiplayerMode('online'); setOnlineMatchStatus('idle'); }} />
                            <div className="mode-description-inline visible">全国のプレイヤーとレートを競う<br/>オンライン対戦</div>
                          </div>
                          {/* Item 1: Multi */}
                          <div className="carousel-item">
                            <img src="mulch.png" alt="Multi Play" className="mode-image-button" onClick={() => setMultiplayerMode('select')} />
                            <div className="mode-description-inline visible">合言葉を使って<br/>友達と一緒にプレイ</div>
                          </div>

                          {/* Item 2: CPU */}
                          <div className="carousel-item">
                            <img src="CPU.png" alt="CPU Play" className="mode-image-button" onClick={() => setMultiplayerMode('cpu_lobby')} />
                            <div className="mode-description-inline visible">強力なCPUと対戦して腕を磨く<br/>一人用モード</div>
                          </div>
                          
                        </div>
                      </div>

                      <div className="carousel-arrow right" onClick={() => setCarouselIndex((prev) => (prev - 1 + 3) % 3)}>▶</div>
                      
                      <div className="carousel-indicators">
                        <span className={`indicator-dot ${carouselIndex === 0 ? 'active' : ''}`} />
                        <span className={`indicator-dot ${carouselIndex === 1 ? 'active' : ''}`} />
                        <span className={`indicator-dot ${carouselIndex === 2 ? 'active' : ''}`} />
                      </div>
                    </div>
                  ) : (
                  <div className="mode-select-container three-columns animate-fade-in" style={{gap: '40px', alignItems: 'flex-start', position: 'absolute', top: '65%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%', justifyContent: 'center', zIndex: 50}}>
                    {/* Online Play */}
                    <div className="mode-btn-wrapper" 
                         onMouseEnter={() => setHoveredMode('online')} onMouseLeave={() => setHoveredMode(null)}>
                      <img src="online.png" alt="Online Play" className="mode-image-button" onClick={() => { setMultiplayerMode('online'); setOnlineMatchStatus('idle'); }} />
                      <div className={`mode-description-inline ${hoveredMode === 'online' ? 'visible' : ''}`} style={{opacity: hoveredMode === 'online' ? 1 : 0}}>
                        全国のプレイヤーとレートを競うオンライン対戦
                      </div>
                    </div>

                    {/* Multi Play */}
                    <div className="mode-btn-wrapper" 
                         onMouseEnter={() => setHoveredMode('multi')} onMouseLeave={() => setHoveredMode(null)}>
                      <img src="mulch.png" alt="Multi Play" className="mode-image-button" onClick={() => setMultiplayerMode('select')} />
                      <div className={`mode-description-inline ${hoveredMode === 'multi' ? 'visible' : ''}`} style={{opacity: hoveredMode === 'multi' ? 1 : 0}}>
                        合言葉を使って友達と一緒にプレイ
                      </div>
                    </div>

                    {/* CPU Play */}
                    <div className="mode-btn-wrapper" 
                         onMouseEnter={() => setHoveredMode('cpu')} onMouseLeave={() => setHoveredMode(null)}>
                      <img src="CPU.png" alt="CPU Play" className="mode-image-button" onClick={() => setMultiplayerMode('cpu_lobby')} />
                      <div className={`mode-description-inline ${hoveredMode === 'cpu' ? 'visible' : ''}`} style={{opacity: hoveredMode === 'cpu' ? 1 : 0}}>
                        強力なCPUと対戦して腕を磨く一人用モード
                      </div>
                    </div>
                  </div>
                  )}

                  <div className="mode-aux-buttons left-aligned animate-fade-in">
                    <button className="btn-back" onClick={() => { setTitleStage(1); sm.playTitleBGM(); }}>
                      <span>◀ 戻る</span>
                    </button>
                  </div>
                  </>
                  )}
                </>
              )}

{multiplayerMode === 'online' && (
  <>
  <div className="fullscreen-lobby-container">
    <div style={{color: 'var(--color-gold)', fontFamily: "'Cinzel', 'Noto Serif JP', serif", fontSize: '2.5rem', letterSpacing: '4px', textShadow: '0 0 20px rgba(0,0,0,1)'}}>ONLINE PLAY</div>
    
    <div style={{ background: 'rgba(20,0,0,0.8)', padding: '30px 50px', borderRadius: '15px', border: '1px solid var(--color-gold)', textAlign: 'center', boxShadow: '0 0 30px rgba(212,175,55,0.2)' }}>
      <div style={{ fontSize: '1.5rem', color: '#ccc', marginBottom: '15px' }}>{myProfile.display_name}</div>
      <div style={{ fontSize: '2.5rem', color: 'var(--color-gold)', fontWeight: 'bold', textShadow: '0 0 10px rgba(212,175,55,0.5)' }}>
        Rating: {playerRating}
      </div>
    </div>
    
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px' }}>
      {onlineMatchStatus === 'idle' && (
        <button className="action-btn btn-confirm mystic-btn" onClick={startOnlineMatch} style={{width: 'auto', padding: '15px 40px'}}>
          <span className="mystic-btn-text" style={{ fontSize: '1.4rem' }}>対戦相手を探す</span>
        </button>
      )}
      
      {onlineMatchStatus === 'searching' && (
        <>
          <div style={{ fontSize: '1.4rem', color: 'var(--color-gold)' }} className="blink-animation">
            対戦相手を探しています...
          </div>
          <button className="action-btn btn-pass mystic-btn" onClick={() => setOnlineMatchStatus('idle')} style={{width: 'auto', padding: '10px 30px'}}>
            <span className="mystic-btn-text" style={{ fontSize: '1.2rem' }}>キャンセル</span>
          </button>
        </>
      )}
      
      {onlineMatchStatus === 'found' && (
        <div style={{ fontSize: '1.5rem', color: 'var(--color-gold)' }} className="blink-animation">
          マッチング成功！
        </div>
      )}
    </div>

  </div>
  <div className="mode-aux-buttons left-aligned animate-fade-in">
    <button className="btn-back" onClick={cancelOnlineMatch}>
      <span>◀ 戻る</span>
    </button>
  </div>
  </>
)}

{multiplayerMode === 'cpu_lobby' && (
  <>
  <div className="fullscreen-lobby-container">
    <div style={{color: 'var(--color-gold)', fontFamily: "'Cinzel', 'Noto Serif JP', serif", fontSize: '2.5rem', letterSpacing: '4px', textShadow: '0 0 20px rgba(0,0,0,1)'}}>CPU PLAY</div>
    
    <div style={{ background: 'rgba(20,0,0,0.8)', padding: '30px 50px', borderRadius: '15px', border: '1px solid var(--color-gold)', textAlign: 'center', boxShadow: '0 0 30px rgba(212,175,55,0.2)' }}>
      <div style={{ fontSize: '1.5rem', color: '#ccc', marginBottom: '15px' }}>{myProfile.display_name}</div>
      <div style={{ fontSize: '1.5rem', color: '#888', fontWeight: 'bold' }}>
        VS CPU
      </div>
    </div>
    
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px' }}>
      <button className="action-btn btn-confirm mystic-btn" onClick={startDealAnimation} style={{width: 'auto', padding: '15px 40px'}}>
        <span className="mystic-btn-text" style={{ fontSize: '1.4rem' }}>対戦を始める</span>
      </button>
    </div>
  </div>
  <div className="mode-aux-buttons left-aligned animate-fade-in">
    <button className="btn-back" onClick={() => { setMultiplayerMode(null); sm.playHomeBGM(); }}>
      <span>◀ 戻る</span>
    </button>
  </div>
  </>
)}




{multiplayerMode === 'select' && (
                <>
                <div className="fullscreen-lobby-container">
                  <div style={{color: 'var(--color-gold)', fontFamily: "'Cinzel', 'Noto Serif JP', serif", fontSize: '2.5rem', letterSpacing: '4px', marginBottom: '30px', textShadow: '0 0 20px rgba(0,0,0,1)'}}>PRIVATE MATCH</div>
                  {isMobile ? (
                    <div className="mode-select-carousel lobby-carousel animate-fade-in"
                         onTouchStart={handlePrivateTouchStart}
                         onTouchMove={handlePrivateTouchMove}
                         onTouchEnd={handlePrivateTouchEnd}>
                      <div className="carousel-arrow left" onClick={() => setPrivateCarouselIndex((prev) => (prev + 1) % 2)}>◀</div>
                      
                      <div className="carousel-window">
                        <div className="carousel-track" style={{ width: '200%', transform: `translateX(-${privateCarouselIndex * 50}%)` }}>
                          
                          {/* Item 0: Create Room */}
                          <div className="carousel-item" style={{ width: '50%' }}>
                            <img src="room home.png" alt="Create Room" className="mode-image-button" onClick={createRoom} />
                            <div className="mode-description-inline visible">ルームを作成して<br/>ホストになる</div>
                          </div>
                          
                          {/* Item 1: Find Room */}
                          <div className="carousel-item" style={{ width: '50%' }}>
                            <img src="room2.png" alt="Find Room" className="mode-image-button" onClick={() => setMultiplayerMode('search')} />
                            <div className="mode-description-inline visible">ルーム番号を入力して<br/>入室する</div>
                          </div>
                          
                        </div>
                      </div>

                      <div className="carousel-arrow right" onClick={() => setPrivateCarouselIndex((prev) => (prev - 1 + 2) % 2)}>▶</div>
                      
                      <div className="carousel-indicators">
                        <span className={`indicator-dot ${privateCarouselIndex === 0 ? 'active' : ''}`} />
                        <span className={`indicator-dot ${privateCarouselIndex === 1 ? 'active' : ''}`} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '30px' }}>
                      <div className="mode-btn-wrapper"
                           onMouseEnter={() => setHoveredMode('create_room')} onMouseLeave={() => setHoveredMode(null)}>
                        <div className="private-match-card-btn" style={{backgroundImage: "url('room home.png')"}} onClick={createRoom}></div>
                        <div className={`mode-description-inline ${hoveredMode === 'create_room' ? 'visible' : ''}`} style={{opacity: hoveredMode === 'create_room' ? 1 : 0, marginTop: '20px'}}>
                          ルームを作成してホストになる
                        </div>
                      </div>

                      <div className="mode-btn-wrapper"
                           onMouseEnter={() => setHoveredMode('find_room')} onMouseLeave={() => setHoveredMode(null)}>
                        <div className="private-match-card-btn" style={{backgroundImage: "url('room2.png')"}} onClick={() => setMultiplayerMode('search')}></div>
                        <div className={`mode-description-inline ${hoveredMode === 'find_room' ? 'visible' : ''}`} style={{opacity: hoveredMode === 'find_room' ? 1 : 0, marginTop: '20px'}}>
                          ルーム番号を入力して入室する
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mode-aux-buttons left-aligned animate-fade-in">
                  <button className="btn-back" onClick={() => { setMultiplayerMode(null); sm.playHomeBGM(); }}>
                    <span>◀ 戻る</span>
                  </button>
                </div>
                </>
              )}

              {multiplayerMode === 'search' && (
                <div className="fullscreen-lobby-container">
                  <div className="selection-guide" style={{color: 'var(--color-gold)', textShadow: '0 0 15px rgba(212, 175, 55, 0.5)', fontSize: '1.8rem', marginBottom: '30px', letterSpacing: '2px'}}>ルーム番号を入力</div>
                  <input type="text" className="passphrase-input" placeholder="4桁の数字..." 
                    value={passphrase} onChange={(e) => setPassphrase(e.target.value)} style={{fontSize: '1.5rem', padding: '15px 20px', width: '280px', borderRadius: '10px', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8), 0 0 15px rgba(212, 175, 55, 0.3)', marginBottom: '40px'}} />
                  <div style={{ display: 'flex', gap: '30px' }}>
                    <button className="action-btn btn-confirm mystic-btn" onClick={() => initMultiplayer(passphrase)}>
                      <span className="mystic-btn-text">入室</span>
                    </button>
                    <button className="action-btn btn-pass mystic-btn" onClick={() => setMultiplayerMode('select')}>
                      <span className="mystic-btn-text">戻る</span>
                    </button>
                  </div>
                </div>
              )}
              {/* 法的情報フッター (タイトル画面共通) */}
              <div className="legal-footer">
                <a onClick={() => setShowLegalModal('privacy')}>プライバシーポリシー</a> | 
                <a onClick={() => setShowLegalModal('terms')}>利用規約</a> | 
                <a onClick={() => setShowLegalModal('contact')}>お問い合わせ</a>
              </div>
            </div>
          ) : (
            <>
            <div className="active-turn-ring" style={activeRingStyle}></div>
            <div className="table-container">
              {/* 自分自身（YOU）のアバター・名前 左下固定表示 */}
              <div className="player-you-info-fixed">
                
                {/* ターンタイマーゲージ (オンライン対戦かつ進行中のみ) */}
                {multiplayerMode === 'active' && turn === myPlayerIndex && gameStarted && !isGameOver && !exchangePhase && !isAnimating && !watchTarget && !watchSelecting && !selectionMode && (
                  <div className="turn-timer-gauge-container">
                    <div className={`turn-timer-gauge-bar ${turnTimeLeft <= 5 ? 'urgent' : ''}`} style={{ width: `${(turnTimeLeft / 15) * 100}%` }}></div>
                  </div>
                )}

                <div className="hand-count-badge">{hands[myPlayerIndex] ? hands[myPlayerIndex].length : 0}</div>
                <div id={`avatar-${myPlayerIndex}`} className={`player-avatar-icon ${ranksDiscovered.includes(myPlayerIndex) ? getHierarchyTitle(ranksDiscovered.indexOf(myPlayerIndex) + 1).cls : ''}`} style={getAvatarStyle(getPlayerAvatar(myPlayerIndex))}>
                  {settledTurn === myPlayerIndex && <div className="active-turn-ring-local"></div>}
                </div>
                <div className="player-status">
                  YOU
                  {ranksDiscovered.includes(myPlayerIndex) && (
                    <span className={`rank-badge ${getHierarchyTitle(ranksDiscovered.indexOf(myPlayerIndex) + 1).cls}`}>
                      {getHierarchyTitle(ranksDiscovered.indexOf(myPlayerIndex) + 1).title}
                    </span>
                  )}
                </div>
              </div>
              <button className="btn-exit-to-title mystic-btn" onClick={handleExitWithAd}>
                <span className="mystic-btn-text">退場</span>
              </button>

              {/* 早送り（スキップ）ボタン - 退場ボタンの右隣 */}
              {(() => {
                if (!gameStarted || isGameOver) return null;
                const allHumansFinished = multiplayerMode === 'active' 
                  ? remotePlayers.every((rp, i) => (rp && rp.id && rp.id.startsWith('cpu')) || ranksDiscovered.includes(i)) && ranksDiscovered.includes(myPlayerIndex)
                  : ranksDiscovered.includes(myPlayerIndex);
                
                if (!allHumansFinished) return null;

                return (
                  <button className="btn-fast-forward" style={{ 
                    position: 'absolute', top: '135px', left: '110px', zIndex: 10000,
                    background: 'transparent', boxShadow: 'none', border: 'none', border: '1px solid var(--color-gold)', borderRadius: '50%',
                    width: '36px', height: '36px', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    color: 'var(--color-gold)', 
                    cursor: allHumansFinished ? 'pointer' : 'default', 
                    opacity: allHumansFinished ? (isFastForward ? 1 : 0.6) : 0.15,
                    boxShadow: (allHumansFinished && isFastForward) ? '0 0 10px rgba(212,175,55,0.8)' : 'none',
                    pointerEvents: allHumansFinished ? 'auto' : 'none',
                    transition: 'opacity 0.3s ease'
                  }} onClick={() => {
                    if (!allHumansFinished) return;
                    setIsFastForward(!isFastForward);
                    if (multiplayerMode === 'active' && !isHost) {
                      sendActionToHost({ action: 'FAST_FORWARD' });
                    }
                  }}>
                    <span style={{ fontSize: '1.2rem', transform: 'translateX(2px)' }}>▶▶</span>
                  </button>
                );
              })()}

              {multiplayerMode === 'lobby' && (
                <div className="selection-overlay-ui" style={{ zIndex: 6000, background: 'transparent', boxShadow: 'none', border: 'none', padding: '40px', marginTop: '22vh', boxShadow: 'none', border: 'none' }}>
                  <div className="selection-guide" style={{color: 'var(--color-gold)', textShadow: '0 0 15px rgba(212, 175, 55, 0.5)', fontSize: '1.8rem', marginBottom: '10px', letterSpacing: '2px'}}>待機中</div>
                  <div style={{fontFamily: "'Courier New', monospace", fontSize: '1.4rem', color: '#fff', marginBottom: '20px', padding: '10px 20px', background: '#000', borderRadius: '8px', border: '1px solid #333'}}>ルーム番号: <span style={{color: 'var(--color-gold)', fontWeight: 'bold'}}>{passphrase}</span></div>
                  <div className="player-lobby-list" style={{ margin: '10px 0 30px', display: 'flex', flexDirection: 'column', gap: '10px', width: '300px' }}>
                    {remotePlayers.map((p, idx) => (
                      <div key={idx} style={{ padding: '12px 15px', background: 'rgba(255,255,255,0.05)', borderLeft: '4px solid var(--color-gold)', textAlign: 'left', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{fontSize: '1.2rem'}}>{idx === 0 ? "👑" : "💀"}</span> <span style={{fontWeight: 'bold', fontSize: '1.1rem'}}>{p.name}</span> <span style={{color: '#888', fontSize: '0.9rem'}}>{p.id === 'local' ? "(あなた)" : ""}</span>
                      </div>
                    ))}
                    {Array.from({ length: 4 - remotePlayers.length }).map((_, i) => (
                      <div key={`empty-${i}`} style={{ padding: '12px 15px', background: 'rgba(0,0,0,0.4)', color: '#666', borderLeft: '4px solid #333', textAlign: 'left', borderRadius: '4px' }}>
                        待機中... (CPU枠)
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '30px', justifyContent: 'center' }}>
                    {isHost ? (
                      <button className="action-btn btn-confirm mystic-btn" onClick={startMultiplayerGame}>
                        <span className="mystic-btn-text">ゲームを開始</span>
                      </button>
                    ) : (
                      <div style={{ color: 'var(--color-gold)', animation: 'pulse-gold 1s infinite alternate', display: 'flex', alignItems: 'center' }}>ホストの開始を待機しています...</div>
                    )}
                    <button className="action-btn btn-pass mystic-btn" onClick={() => { if(roomChannel) { roomChannel.unsubscribe(); setRoomChannel(null); setCurrentRoom(null); } setMultiplayerMode(null); sm.playHomeBGM(); }}>
                      <span className="mystic-btn-text">解散</span>
                    </button>
                  </div>
                </div>
              )}

              <div className={`screen-filter ${is11Back ? 'filter-11back' : ''}`}></div>


              {/* 強さの逆転と順序逆転の永続的インジケーター表示 */}
              {multiplayerMode !== 'lobby' && (
                <>
                  <div className={`bg-reverse-indicator ${playDirection === 1 ? 'spin-clockwise' : 'spin-counter-clockwise'}`}></div>
                  <div className={`bg-jback-indicator ${is11Back ? 'active' : ''}`}></div>
                  <div className={`bg-revolution-indicator ${isRevolution ? 'active' : ''}`}></div>
                </>
              )}

              {/* Flying Cards Animation Layer */}
          {abilityLog && <div className="ability-log-overlay">{abilityLog}</div>}
              {flyingCards.map(fc => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                
                // Start position
                let startX = w / 2; let startY = h / 2;
                if (fc.from === 'graveyard') { startX = w * 0.85; startY = h / 2; }
                else if (fc.from === 'deck') { startX = w / 2; startY = h / 2; }
                else {
                  const sourceIcon = document.getElementById(`avatar-${fc.from}`);
                  if (sourceIcon) {
                    const rect = sourceIcon.getBoundingClientRect();
                    startX = rect.left + rect.width / 2;
                    startY = rect.top + rect.height / 2;
                  } else {
                    const edge = getPlayerEdgePosition(fc.from);
                    startX = edge.left.includes('vw') || edge.left.includes('%') ? w/2 : parseInt(edge.left) || w/2;
                    startY = edge.top.includes('vh') || edge.top.includes('%') ? h/2 : parseInt(edge.top) || h/2;
                  }
                }

                // End position
                let endX = w / 2; let endY = h / 2;
                const targetIcon = document.getElementById(`avatar-${fc.to}`);
                if (targetIcon) {
                  const rect = targetIcon.getBoundingClientRect();
                  endX = rect.left + rect.width / 2;
                  endY = rect.top + rect.height / 2;
                } else {
                  const edge = getPlayerEdgePosition(fc.to);
                  endX = edge.left.includes('vw') || edge.left.includes('%') ? w/2 : parseInt(edge.left) || w/2;
                  endY = edge.top.includes('vh') || edge.top.includes('%') ? h/2 : parseInt(edge.top) || h/2;
                }
                
                const start = { top: startY + 'px', left: startX + 'px' };
                const end = { top: endY + 'px', left: endX + 'px' };
                
                const isDeal = fc.type === 'deal';
                const isPass = fc.type === 'pass';
                const isShieldRepel = fc.type === 'shield-repel';
                const animName = isShieldRepel ? 'shield-repel-fly' : 'card-fly-back';
                const animDuration = isShieldRepel ? '1.5s' : (isPass ? '0.5s' : '0.8s');
                return (
                  <div key={fc.id} className={`card back ${isDeal ? "deal-card-back" : "flying-card-back"}`} style={{
                    position: 'fixed',
                    zIndex: 9999,
                    '--start-top': start.top,
                    '--start-left': start.left,
                    '--end-top': end.top,
                    '--end-left': end.left,
                    '--start-scale': isDeal ? 1 : (isPass ? 0.35 : 0.5),
                    '--end-scale': isDeal ? 1 : (isPass ? 0.35 : 0.8),
                    '--end-rot': isPass ? '15deg' : '360deg',
                    animation: `${animName} ${animDuration} ${fc.delay || 0}s both cubic-bezier(0.4, 0, 0.2, 1)`
                  }}>
                  </div>
                );
              })}

              {phoenixActive && <div className="phoenix-fire"></div>}

              {/* 6フェニックス: 墓地→手札へ飛ぶカード（position:fixed, getBoundingClientRect座標） */}
              {phoenixFlyCards.map(fc => (
                <div
                  key={String(fc.id)}
                  className="phoenix-fly-card"
                  style={{
                    left: `${fc.sx}px`,
                    top:  `${fc.sy}px`,
                    '--dx': `${fc.ex - fc.sx}px`,
                    '--dy': `${fc.ey - fc.sy}px`,
                  animation: 'phoenix-fly-anim 0.75s linear forwards',
                  }}
                />
              ))}
              {guillotineActive && <div className="guillotine"></div>}
              {reverseActive && <div className="reverse-arrows"></div>}
              {bomberActive && <div className="bomber-explode"></div>}
              {passThreadActive && <div className="pass-thread"></div>}
              {/* Character cut-in overlay (Dynamic Overhaul) */}
              {cutIn && (() => {
                const aura = cutIn.auraColor || '#b8860b';
                // Convert hex to RGB for rgba usage
                const hexToRgb = (hex) => {
                  const r = parseInt(hex.slice(1, 3), 16);
                  const g = parseInt(hex.slice(3, 5), 16);
                  const b = parseInt(hex.slice(5, 7), 16);
                  return `${r},${g},${b}`;
                };
                const rgb = hexToRgb(aura);
                const r = cutIn.rank;
                return (
                  <div className="cutin-container" style={{ '--aura': aura, '--aura-dim': `rgba(${rgb},0.35)` }}>
                    {cutIn.comboData ? (() => {
                      const phase = cutIn.comboPhase || 1;
                      const resRank = cutIn.comboData.resultRank;
                      const otherRank = cutIn.comboData.otherRank;
                      const otherTcg = TCG_DATA[otherRank];
                      const resTcg = TCG_DATA[resRank];
                      return (
                        <div className={`plus5-combo-cutin p5c-phase${phase}`}>
                          {/* +5カード */}
                          <div
                            className="p5c-card p5c-card-5"
                            style={{
                              backgroundImage: `url(${TCG_DATA['5'].url})`,
                              '--card-aura': '#f1c40f'
                            }}
                          >
                            <div className="p5c-card-rank" style={{ borderColor: '#f1c40f', textShadow: '0 0 8px #f1c40f' }}>5</div>
                            <div className="p5c-card-text">
                              <div className="p5c-card-name" style={{ color: '#f1c40f' }}>プラス5</div>
                              <div className="p5c-card-desc">{TCG_DATA['5'].desc}</div>
                            </div>
                          </div>
                          {/* 足したカード */}
                          <div
                            className="p5c-card p5c-card-other"
                            style={{
                              backgroundImage: `url(${otherTcg?.url})`,
                              '--card-aura': otherTcg?.auraColor || '#b8860b'
                            }}
                          >
                            <div className="p5c-card-rank" style={{ borderColor: otherTcg?.auraColor, textShadow: `0 0 8px ${otherTcg?.auraColor}` }}>{otherRank}</div>
                            <div className="p5c-card-text">
                              <div className="p5c-card-name" style={{ color: otherTcg?.auraColor || '#b8860b' }}>{otherTcg?.name || otherRank}</div>
                              <div className="p5c-card-desc">{otherTcg?.desc || ''}</div>
                            </div>
                          </div>
                          {/* 合体後の結果カード */}
                          <div
                            className="p5c-card p5c-card-result"
                            style={{
                              backgroundImage: `url(${resTcg?.url})`,
                              '--card-aura': resTcg?.auraColor || '#b8860b'
                            }}
                          >
                            <div className="p5c-card-rank" style={{ borderColor: resTcg?.auraColor, textShadow: `0 0 8px ${resTcg?.auraColor}` }}>{resRank}</div>
                            <div className="p5c-card-text">
                              <div className="p5c-card-name" style={{ color: resTcg?.auraColor || '#b8860b' }}>{resTcg?.name || resRank}</div>
                              <div className="p5c-card-desc">{resTcg?.desc || ''}</div>
                            </div>
                          </div>
                          {/* 赤い爆発フラッシュ（Phase3） */}
                          <div className="p5c-merge-flash"></div>
                        </div>
                      );
                    })() : (
                      <>
                        {/* 個別エフェクト描画 */}
                        {r === 'A' && <div className="effect-a-slash"></div>}
                        {r === '2' && <div className="effect-2-quake"></div>}
                        {r === '3' && <div className="effect-3-dust"></div>}
                        {r === '4' && <div className="effect-4-shield"></div>}
                        {r === '5' && cutIn.name !== 'プラス5' && cutIn.name !== '🃏真・プラス5' && <div className="effect-5-chain"></div>}
                        {r === '6' && <div className="effect-6-fire"></div>}
                        {r === '7' && <div className="effect-7-gold"></div>}
                        {r === '8' && <div className="effect-8-cut"></div>}
                        {r === '9' && <div className="effect-9-gear"></div>}
                        {r === '10' && <div className="effect-10-rain"></div>}
                        {r === 'J' && <div className="effect-j-reverse"></div>}
                        {r === 'Q' && <div className="effect-q-bomb"></div>}
                        {r === 'K' && <div className="effect-k-magic"></div>}
                        {r === 'Joker' && <div className="effect-joker-mist"></div>}
                      </>
                    )}

                    {/* Phase4以外のコンボ時はカードポップアップ非表示。通常カットインのみ表示 */}
                    {!cutIn.comboData && (
                      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {/* 共通：パルスリング x2 */}
                        <div className="cutin-pulse-ring"></div>
                        <div className="cutin-pulse-ring"></div>

                        {/* 共通：上下スラッシュ */}
                        <div className="cutin-slash-top"></div>
                        <div className="cutin-slash-bottom"></div>

                        {/* カードポップアップ本体 */}
                        <div className="cutin-card-popup" style={r === '2' ? { animation: 'card-popup-in 0.5s forwards, screen-shake 0.5s ease-in-out' } : {}}>
                          <div className="cutin-card-art" style={{ backgroundImage: `url(${TCG_DATA[r]?.url})` }}></div>

                          <div className="cutin-card-rank">
                            {r === 'Joker' ? '🃏' : r}
                          </div>

                          <div className="cutin-card-text">
                            <div className="cutin-card-name" style={isMobile ? { letterSpacing: '0px', whiteSpace: 'nowrap', width: '100%', textAlign: 'center', lineHeight: 1 } : (r === 'A' || r === 'Joker' ? { textAlign: 'center' } : {})}>
                               {cutIn.name}
                            </div>
                            {cutIn.effect && <div className="cutin-card-desc">{cutIn.effect}</div>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 重複した墓地表示を削除 */}
              {/* メッセージオーバーレイ */}
              {animMessage.data && (
                <div className={`message-overlay ${animMessage.state}`}>
                  {animMessage.data.title}
                      {animMessage.data.desc && <p>{animMessage.data.desc}</p>}
                </div>
              )}

              {/* 革命豪華文字演出 */}
              {revAnimMessage && (
                <div className="rev-gorgeous-overlay">
                  {revAnimMessage}
                </div>
              )}

              {/* サービスA文字演出 */}
              {serviceAAnimMessage && (
                <div className="servicea-gorgeous-overlay">
                  {serviceAAnimMessage}
                </div>
              )}

              {/* ターンと方向表示 */}
              <div style={{ display: isMobile ? 'none' : 'block', position: 'absolute', top: '30px', left: '40px', zIndex: 200, color: '#ccc', fontFamily: "'Cinzel', serif", whiteSpace: 'nowrap' }}>
                TURN: <span style={{ color: turn === myPlayerIndex ? 'var(--color-blood)' : '#fff' }}>{turn === myPlayerIndex ? 'YOU' : turn === -1 ? 'ENDED' : (remotePlayers[turn]?.name || `CPU ${turn}`)}</span>
                {(is11Back || isRevolution) && (
                  <span className="revolution-label" style={{ marginLeft: '15px', color: '#ff4444', fontWeight: 'bold', textShadow: '0 0 10px rgba(255,0,0,0.8)', fontSize: '0.9em' }}>
                    {isRevolution ? "REVOLUTION!!" : "J-BACK"}
                  </span>
                )}
                <div>Direction: {playDirection === 1 ? '➡' : '⬅'}</div>
              </div>

              {/* 石造りの祭壇システム */}
              <div data-graveyard="true" className={`altar-container ${isAltarActive ? 'active' : ''}`}
                onClick={() => { alert('GRAVEYARD:\n' + graveyard.map(c => c.suit + c.rank).join(', ')) }}>
                <div className="altar-base">
                  <div className="altar-glow"></div>
                  {/* 墓地のカード：最新数枚を表面向きで重ねて表示（場と同様） */}
                  {graveyard.length > 0 && (
                    <div className="altar-card-pile" style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0 }}>
                      {graveyard.slice(-5).map((card, idx, arr) => {
                        const total = arr.length;
                        const age = total - 1 - idx; // 0=最新, 4=最古
                        const rot = (age * 7) * (idx % 2 === 0 ? 1 : -1);
                        const dx = age * 2 * (idx % 2 === 0 ? 1 : -1);
                        const dy = age * 1.5;
                        return (
                          <div
                            key={card.id || idx}
                            className="card back altar-pile-card"
                            style={{
                              transform: `translate(-50%, -50%) rotate(${rot}deg) translate(${dx}px, ${dy}px)`,
                              zIndex: idx + 1,
                              filter: `brightness(${Math.max(0.5, 1.0 - age * 0.12)})`,
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="altar-count">† {graveyard.length} †</div>
              </div>

              {resurrectCard && (
                <div className={`card ${resurrectCard.suit === '♥' || resurrectCard.suit === '♦' ? 'red' : ''} resurrection-card`}
                  style={{ '--target-pos': resurrectCard.targetPos }}>
                  <div className="tcg-art" style={{ backgroundImage: TCG_DATA[resurrectCard.rank]?.url ? `url(${TCG_DATA[resurrectCard.rank].url})` : '' }}></div>
                  <div className="tcg-rank-circle"><span>{resurrectCard.rank}</span></div>
                </div>
              )}

              {discardingToGy.map((item, idx) => {
                const c = item.card;
                const from = item.fromPlayer;
                
                // スタート地点を完全なpxで決定
                const w = window.innerWidth;
                const h = window.innerHeight;
                let sX = w / 2; let sY = h / 2;
                if (from === 0) { sX = w / 2; sY = h * 0.9; }
                else if (from === 1) { sX = isMobile ? 20 : 270; sY = h / 2; }
                else if (from === 2) { sX = w / 2; sY = isMobile ? 0 : 150; }
                else if (from === 3) { sX = isMobile ? w - 20 : w - 270; sY = h / 2; }

                // 墓地の絶対座標をDOMから動的に取得
                let gyX = isMobile ? w - 20 : w - 355;
                let gyY = isMobile ? h - 355 : 130;
                const gyEl = document.querySelector('[data-graveyard]');
                if (gyEl) {
                  const rect = gyEl.getBoundingClientRect();
                  gyX = rect.left + rect.width / 2;
                  gyY = rect.top + rect.height / 2 - 65; // もう少し上に調整
                }

                // 吸い込み相対座標をpxで決定
                let altarX = (gyX - sX) + 'px';
                let altarY = (gyY - sY) + 'px';
                
                const startX = sX + 'px';
                const startY = sY + 'px';
                const delay = idx * 0.12;
                const isFaceDown = from !== 'center';
                return (
                  <div key={`flying-${idx}`} className={`card ${isFaceDown ? 'back' : (c.suit === '♥' || c.suit === '♦' ? 'red' : '')} to-graveyard`}
                    style={{
                      position: 'fixed',
                      left: startX,
                      top: startY,
                      zIndex: 2000 + idx,
                      animationDelay: `${delay}s`,
                      '--altar-x': altarX,
                      '--altar-y': altarY,
                      transform: 'translate(-50%, -50%) scale(1)'
                    }}>
                    {!isFaceDown && (
                      <>
                        <div className="card-rank">{c.rank === 'Joker' ? 'J' : c.rank}</div>
                        <div className="tcg-art" style={{ backgroundImage: TCG_DATA[c.rank]?.url ? `url(${TCG_DATA[c.rank].url})` : '', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '100%', height: '100%', borderRadius: '4px' }}></div>
                      </>
                    )}
                  </div>
                );
              })}

              {centralBombCards && centralBombCards.length > 0 && (() => {
                const count = centralBombCards.length;
                let scaleFactor = 1;
                if (count <= 4) scaleFactor = 1.8;
                else if (count <= 8) scaleFactor = 1.2;
                else if (count <= 16) scaleFactor = 0.9;
                else scaleFactor = 0.6;
                
                if (isMobile) {
                  scaleFactor *= 0.5; // Scale down for mobile screens to fit 
                }
                
                const uniqueRanks = Array.from(new Set(centralBombCards.map(c => c.rank)));
                const containerWidth = isMobile ? '90vw' : (count <= 8 ? '500px' : '950px');
                const topPos = '50%';

                return (
                  <div style={{ position: 'fixed', top: topPos, left: '50%', transform: `translate(-50%, -50%) scale(${scaleFactor})`, zIndex: 3000, display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', width: containerWidth, pointerEvents: 'none' }}>
                    <div style={{ width: '100%', textAlign: 'center', marginBottom: '15px', color: '#fff', fontSize: '2.5rem', fontWeight: 'bold', fontFamily: '"Cinzel", serif', textShadow: '0 0 10px #f00, 0 0 20px #ff0', animation: 'bomb-cutin-text 3.2s forwards' }}>
                       消滅: {uniqueRanks.join(', ')}
                    </div>
                    {centralBombCards.map((c, idx) => (
                      <div key={`bomb-${c.id}-${idx}`} className={`card ${c.suit === '♥' || c.suit === '♦' ? 'red' : ''} central-bombed-card`} style={{ animationDelay: `${(idx % 5) * 0.08}s` }}>
                        <div className="tcg-art" style={{ backgroundImage: TCG_DATA[c.rank]?.url ? `url(${TCG_DATA[c.rank].url})` : '', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '100%', height: '100%', borderRadius: '4px' }}></div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {[0, 1, 2, 3].map(pIdx => {
                const dispIdx = getDisplayIndex(pIdx);
                const posClass = dispIdx === 0 ? 'pos-bottom' : dispIdx === 1 ? 'pos-left' : dispIdx === 2 ? 'pos-top' : 'pos-right';
                const isActive = turn === pIdx;
                const isMe = pIdx === myPlayerIndex;
                const targetIdxList = watchTarget?.targetIndexes || [];
                const isTarget = targetIdxList.includes(pIdx);
                const isClickable = watchSelecting && pIdx !== myPlayerIndex && !ranksDiscovered.includes(pIdx) && !isShielded[pIdx];
                const isAlreadySelected = watchSelectedTargets.includes(pIdx);
                const watchClasses = `${isClickable && !isAlreadySelected ? 'k-watch-focus' : ''} ${isTarget ? 'k-watch-target' : ''} ${isAlreadySelected ? 'k-watch-selected' : ''}`;

                let targetStyle = {};
                if (isTarget) {
                  const tIndex = targetIdxList.indexOf(pIdx);
                  const totalT = targetIdxList.length;
                  let topPercent = 50;
                  if (totalT === 2) topPercent = tIndex === 0 ? 30 : 70;
                  if (totalT === 3) topPercent = tIndex === 0 ? 20 : tIndex === 1 ? 50 : 80;
                  const scale = isMobile ? (totalT === 1 ? 0.85 : totalT === 2 ? 0.7 : 0.55) : (totalT === 1 ? 1.1 : totalT === 2 ? 0.9 : 0.75);
                  targetStyle = { '--target-top': `${topPercent}%`, '--target-scale': scale };
                }
                const myMargin = posClass === 'pos-bottom' ? '-60px' : (posClass === 'pos-top' ? '80px' : '0');
                const counterRotate = posClass === 'pos-top' ? 'rotate(180deg)' : posClass === 'pos-left' ? 'rotate(-90deg)' : posClass === 'pos-right' ? 'rotate(90deg)' : 'none';

                return (
                  <div key={pIdx} className={`player-pos ${posClass} ${isActive ? 'active-turn' : ''} ${watchClasses}`} style={targetStyle}>

                    {ranksDiscovered.includes(pIdx) ? (
                      <div className={`finished-aura-container ${getHierarchyTitle(ranksDiscovered.indexOf(pIdx) + 1).cls}`} style={{ marginTop: myMargin }}>
                        <div className="finished-aura-text" style={{ transform: counterRotate }}>{getHierarchyTitle(ranksDiscovered.indexOf(pIdx) + 1).title}</div>
                      </div>
                    ) : (
                      renderFanHand(hands[pIdx], pIdx, isMe || isGameOver || revealedDaihinmin === pIdx || (watchTarget?.targetIndexes?.includes(pIdx) && watchTarget?.activatorIndex === myPlayerIndex))
                    )}
                    {watchTarget && watchTarget.targetIndexes?.includes(pIdx) && (
                      <div className="watch-gauge-container">
                        <div className="watch-gauge-bar" style={{ animationDuration: `5000ms` }}></div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 中央のプレイエリア */}
              <div className="play-area">
                {clearingField && <div className="blackhole"></div>}

                {/* フィールド中央のステータス表示 */}
                {(isRevolution || is11Back) && (
                  <div className="field-status-label">{isRevolution ? "革命" : "Jバック"}</div>
                )}

                <div className="table-cards-container">
                  {[...(previousTableCards || []), ...(tableCards || [])].map((item, idx) => {
                    const tcg = TCG_DATA[item.card.rank];
                    const aura = tcg?.auraColor || '#b8860b';
                    return (
                      <div key={`${item.card.id}-${idx}`}
                        className={`${getCardClass(item.card)} on-table ${item.isSlammed ? 'slammed' : ''} ${item.isOld ? 'old-card' : ''}`}
                        style={{
                          ...(item.isAnimating ? item.initialStyle : item.targetStyle),
                          zIndex: idx,
                          '--card-aura': aura,
                          borderColor: aura,
                          boxShadow: item.isOld ? 'none' : `0 0 10px ${aura}, 0 5px 12px rgba(0,0,0,0.9)`,
                          filter: item.isOld ? 'brightness(0.5)' : 'none'
                        }}
                      >
                        <div className="tcg-art" style={{ backgroundImage: tcg?.url ? `url(${tcg.url})` : '' }}></div>
                        <div className="tcg-rank-circle" style={{ borderColor: aura, boxShadow: `0 0 8px ${aura}` }}>
                          <span>{item.card.rank}</span>
                        </div>
                        <div className="tcg-name">{tcg?.name || item.card.suit + item.card.rank}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* アクションパネル */}
              <div className="action-panel">
                {gameStarted && !selectionMode && !isGameOver && !exchangePhase && (
                  <>
                    <button className="action-btn btn-play mystic-btn"
                      disabled={turn !== myPlayerIndex || selectedCards.length === 0 || isActionLoading || !isValidPlay(selectedCards)}
                      onClick={handlePlay}
                      onTouchEnd={(e) => {
                        if (turn !== myPlayerIndex || selectedCards.length === 0 || isActionLoading || !isValidPlay(selectedCards)) return;
                        e.preventDefault();
                        handlePlay();
                      }}>
                      <span className="mystic-btn-text">出す</span>
                    </button>
                    <button className="action-btn btn-pass mystic-btn"
                      disabled={turn !== myPlayerIndex || isActionLoading}
                      onClick={handlePass}
                      onTouchEnd={(e) => {
                        if (turn !== myPlayerIndex || isActionLoading) return;
                        e.preventDefault();
                        handlePass();
                      }}>
                      <span className="mystic-btn-text">パス</span>
                    </button>
                  </>
                )}
              </div>

              {/* ゲーム終了UI */}
              {isGameOver && (
                <div className="game-over-overlay">
                  <h1 className="cinzel-title">試合結果</h1>
                  <div className="final-ranks">
                    {roundResults.map((pIdx, i) => (
                      <div key={i} className={`result-row ${pIdx === 0 ? 'highlight-p0' : ''}`}>
                        <span className="rank-num">{i + 1}位</span>
                        <span className="rank-title">{getHierarchyTitle(i + 1).title}</span>
                        <span className="rank-player">{pIdx === myPlayerIndex ? 'YOU' : (remotePlayers[pIdx]?.name || `CPU ${pIdx}`)}</span>
                        {pIdx === 0 && ratingChange && (
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', animation: 'fadeInUp 1s ease-out forwards' }}>
                            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: ratingChange.diff >= 0 ? '#4CAF50' : '#F44336' }}>
                              {ratingChange.diff > 0 ? `+${ratingChange.diff}` : ratingChange.diff}
                            </span>
                            <span style={{ fontSize: '1.2rem', color: 'var(--color-gold)' }}>
                              Rating: {ratingChange.new}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 広告枠 (リザルト画面) */}
                  <div className="ad-placeholder ad-result-screen">
                    Ad Space (300x250)
                  </div>

                  <div className="result-actions">
                    <button className={`gold-btn mystic-btn ${restartVotes[myPlayerIndex] ? 'disabled' : ''}`} onClick={() => {
                      if (!restartVotes[myPlayerIndex]) {
                        window.dispatchEvent(new CustomEvent('requestInterstitialAd', {
                          detail: { onComplete: () => handleRestart() }
                        }));
                      }
                    }} disabled={restartVotes[myPlayerIndex]}><span className="mystic-btn-text">
                      {restartVotes[myPlayerIndex] ? "待機中..." : "再戦"}
                    </span></button>
                    <button className="gold-btn mystic-btn" onClick={() => {
                      window.dispatchEvent(new CustomEvent('requestInterstitialAd', {
                        detail: { onComplete: () => location.reload() }
                      }));
                    }}><span className="mystic-btn-text">タイトルへ</span></button>
                  </div>
                </div>
              )}

              {/* カード交換UI */}
              {exchangePhase === 'selecting' && (
                <div className="exchange-overlay-ui">
                  <div className="selection-guide">
                    {(() => {
                      const p0Rank = roundResults.indexOf(0) + 1;
                      if (p0Rank === 1) return "大富豪：大貧民へ渡すカードを2枚選択";
                      if (p0Rank === 2) return "富豪：貧民へ渡すカードを1枚選択";
                      if (p0Rank === 3) return "貧民：富豪へ最強のカードを献上";
                      if (p0Rank === 4) return "大貧民：大富豪へ最強のカードを2枚献上";
                      return "";
                    })()}
                  </div>
                  {(roundResults.indexOf(myPlayerIndex) + 1 <= 2) ? (
                    <button className="action-btn btn-confirm mystic-btn"
                      disabled={selectedCards.length !== (roundResults.indexOf(myPlayerIndex) + 1 === 1 ? 2 : 1) || (isHost && Object.keys(exchangeDecisions).length < (multiplayerMode === 'active' ? (remotePlayers.length - 1) : 3))}
                      onClick={confirmExchange}>
                      <span className="mystic-btn-text">{isHost && Object.keys(exchangeDecisions).length < (multiplayerMode === 'active' ? (remotePlayers.length - 1) : 3) ? "待機中..." : "渡す"}</span>
                    </button>
                  ) : (
                    <button className="action-btn btn-confirm mystic-btn" onClick={confirmExchange} disabled={isHost && Object.keys(exchangeDecisions).length < (multiplayerMode === 'active' ? (remotePlayers.length - 1) : 3)}>
                      <span className="mystic-btn-text">{isHost && Object.keys(exchangeDecisions).length < (multiplayerMode === 'active' ? (remotePlayers.length - 1) : 3) ? "待機中..." : "確認"}</span>
                    </button>
                  )}
                </div>
              )}

              {/* QBomberなど選択用UI（action-panelから独立させ、中央固定を有効化） */}
              {selectionMode && (
                <div className="selection-overlay-ui">
                  <div className="selection-guide">
                    {selectionMode === '7' ? `渡すカード（${selectionInfo ? selectionInfo.count : 1}枚）を選択` :
                      selectionMode === '10' ? `捨てるカード（${selectionInfo ? selectionInfo.count : 1}枚）を選択` :
                        selectionMode === 'Q' ? `爆破する階級（${selectionInfo ? selectionInfo.count : 1}種類）を選択` :
                          "対象のプレイヤーを選択"}
                  </div>
                  
                  <div className="turn-timer-gauge-container" style={{ width: '80%', marginTop: '10px' }}>
                     <div className={`turn-timer-gauge-bar ${selectionTimeLeft <= 3 ? 'urgent' : ''}`} style={{ width: `${(selectionTimeLeft / 10) * 100}%`, backgroundColor: '#e74c3c' }}></div>
                  </div>
                  {selectionMode === 'Q' ? (
                    <>
                      <div className="rank-selector">
                        {[...RANKS, 'Joker'].map(r => (
                          <button key={r}
                            className={`rank-select-btn ${selectedCards.includes(r) ? 'selected' : ''}`}
                            style={selectedCards.includes(r) ? { backgroundColor: 'var(--color-blood)', color: '#fff' } : {}}
                            onClick={() => {
                              sm.playLightPaperSE();
                              toggleRankSelect(r);
                            }}>{r}</button>
                        ))}
                      </div>
                      <button className="action-btn btn-confirm mystic-btn"
                        disabled={selectedCards.length !== selectionInfo?.count}
                        onClick={() => completeSpecialEffect(selectedCards)}>
                        <span className="mystic-btn-text">ボンバー</span>
                      </button>
                    </>
                  ) : selectionMode === 'K' || watchSelecting ? (
                    <div className="selection-tip">他プレイヤーのエリアを直接タッチして選択してください</div>
                  ) : (
                    <button className="action-btn btn-confirm mystic-btn"
                      disabled={selectedCards.length !== selectionInfo?.count}
                      onClick={() => {
                        if (selectionMode === '10') sm.playCrumpleSE();
                        if (selectionMode === 'Q') sm.playExplosionSE();
                        if (selectionMode === '7') sm.playPaperSE();
                        completeSpecialEffect(selectedCards);
                      }}>
                      <span className="mystic-btn-text">{selectionMode === '7' ? '渡す' : selectionMode === '10' ? '捨てる' : '決定'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Service A UI */}
              {serviceAState && serviceAState.playerIndex === 0 && (
                <div className="selection-overlay-ui">
                  <div className="selection-guide">
                    サービスAの効果を選択してください<br/>
                    <small>（{serviceAState.count}枚出しの威力になります）</small>
                  </div>
                  
                  <div className="turn-timer-gauge-container" style={{ width: '80%', marginTop: '10px' }}>
                     <div className={`turn-timer-gauge-bar ${selectionTimeLeft <= 3 ? 'urgent' : ''}`} style={{ width: `${(selectionTimeLeft / 10) * 100}%`, backgroundColor: '#e74c3c' }}></div>
                  </div>
                  
                  <div className="rank-selector" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '20px' }}>
                    {['6', '7', 'Q', 'K'].map(r => (
                      <button key={r}
                        className="action-btn mystic-btn"
                        style={{ margin: 0, padding: '15px', height: 'auto', flexDirection: 'column' }}
                        onClick={() => {
                          if (sm.playLightPaperSE) sm.playLightPaperSE();
                          executeServiceAEffect(r);
                        }}>
                        <span className="mystic-btn-text" style={{ fontSize: '1.2rem', marginBottom: '5px' }}>{r}</span>
                        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{TCG_DATA[r]?.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
            </>
          )}
              {/* 右上の共通アイコン */}
              {!gameStarted && (<div className="top-right-icon-buttons animate-fade-in" style={{zIndex: 10000}}>
                <button className="icon-btn" onClick={fetchLeaderboard} title="ランキング">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 20h20"></path>
                    <path d="M19 17L22 7l-5 3-5-6-5 6-5-3 3 10"></path>
                  </svg>
                </button>
                <button className="icon-btn" onClick={() => { setTempProfileName(myProfile?.display_name || 'YOU'); setShowProfileSettings(true); }} title="プロフィール設定">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </button>
                <button className="icon-btn" onClick={() => setShowExplanation(true)} title="ルール説明">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                  </svg>
                </button>
              </div>)}

{showProfileSettings && (
  <div style={{position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
    <div style={{background: '#2A0510', border: '2px solid var(--color-gold)', borderRadius: '10px', padding: '30px', width: '80%', maxWidth: '400px', boxShadow: '0 0 30px rgba(212, 175, 55, 0.4)'}}>
      <h2 style={{color: 'var(--color-gold)', fontFamily: "'Cinzel', serif", margin: '0 0 20px', textAlign: 'center'}}>PROFILE</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ color: '#ccc', display: 'block', marginBottom: '10px' }}>Name:</label>
        <input 
          type="text" 
          maxLength="10"
          value={tempProfileName}
          onChange={(e) => setTempProfileName(e.target.value)}
          style={{ width: '100%', padding: '10px', background: '#000', color: '#fff', border: '1px solid #555', borderRadius: '5px', fontSize: '1.2rem', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '30px' }}>
        <label style={{ color: '#ccc', display: 'block', marginBottom: '10px' }}>Avatar:</label>
        
        {/* 現在のアバタープレビューとカスタムアップロードボタン */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
          <div style={{
            width: '60px', height: '60px', borderRadius: '5px', border: '2px solid var(--color-gold)',
            ...getAvatarStyle(myProfile?.avatar)
          }}></div>
          
          <label style={{ cursor: 'pointer', display: 'inline-block', padding: '8px 15px', background: '#333', color: 'var(--color-gold)', borderRadius: '5px', border: '1px solid var(--color-gold)', fontSize: '0.9rem' }}>
            📁 写真をアップロード
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    // リサイズ（最大150px）してデータ量を削減
                    const MAX_SIZE = 150;
                    let width = img.width;
                    let height = img.height;
                    // アスペクト比維持で縮小
                    if (width > height) {
                      if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                    } else {
                      if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    // 品質0.7のJPEGにしてBase64化
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    updateProfileAvatar(dataUrl);
                  };
                  img.src = event.target.result;
                };
                reader.readAsDataURL(file);
              }
            }} />
          </label>
        </div>

        {/* カードデザインから選択 (グリッド表示) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', maxHeight: '180px', overflowY: 'auto', padding: '5px', background: 'rgba(0,0,0,0.3)', borderRadius: '5px' }}>
          {['3image.webp', '4image.webp', '5image.webp', '6image.webp', '7image.webp', '8image.webp', '9image.webp', '10image.webp', 'Jimage.webp', 'Qimage.webp', 'Kimage.webp', 'Aimage.webp', '2image.webp', 'joker.webp'].map(avatarKey => (
            <div 
              key={avatarKey} 
              onClick={() => updateProfileAvatar(avatarKey)}
              style={{ 
                width: '100%', aspectRatio: '1/1', borderRadius: '5px', cursor: 'pointer',
                border: myProfile?.avatar === avatarKey ? '3px solid var(--color-gold)' : '1px solid #333',
                ...getAvatarStyle(avatarKey)
              }}
            ></div>
          ))}
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
        <button className="action-btn btn-pass mystic-btn" onClick={() => setShowProfileSettings(false)} style={{padding: '10px 20px', height: 'auto'}}>
          <span className="mystic-btn-text" style={{fontSize: '1rem'}}>キャンセル</span>
        </button>
        <button className="action-btn btn-confirm mystic-btn" onClick={updateProfileName} style={{padding: '10px 20px', height: 'auto'}}>
          <span className="mystic-btn-text" style={{fontSize: '1rem'}}>決定</span>
        </button>
      </div>
    </div>
  </div>
)}

{showLeaderboard && (
  <div style={{position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
    <div style={{background: '#2A0510', border: '2px solid var(--color-gold)', borderRadius: '10px', padding: '30px', width: '80%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(212, 175, 55, 0.4)'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
        <h2 style={{color: 'var(--color-gold)', fontFamily: "'Cinzel', serif", margin: 0}}>LEADERBOARD</h2>
        <button onClick={() => setShowLeaderboard(false)} style={{background: 'transparent', boxShadow: 'none', border: 'none', border: 'none', color: '#ccc', fontSize: '1.5rem', cursor: 'pointer'}}>×</button>
      </div>
      <table style={{width: '100%', color: '#fff', borderCollapse: 'collapse', textAlign: 'left'}}>
        <thead>
          <tr style={{borderBottom: '1px solid var(--color-gold)'}}>
            <th style={{padding: '10px'}}>Rank</th>
            <th style={{padding: '10px'}}>Player</th>
            <th style={{padding: '10px'}}>Rating</th>
          </tr>
        </thead>
        <tbody>
          {leaderboardData.map((data, idx) => (
            <tr key={idx} style={{borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
              <td style={{padding: '10px'}}>{idx + 1}</td>
              <td style={{padding: '10px'}}>{data.name}</td>
              <td style={{padding: '10px'}}>{data.rating}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}

              {showExplanation && (
                <div className="explanation-overlay" style={{zIndex: 10000}}>
                  <div className="explanation-header">
                    <h2>カード能力一覧</h2>
                  </div>
                  <div className="explanation-list">
                    {['3','4','5','6','7','8','9','10','J','Q','K','A','2','Joker'].map(rank => {
                      const data = TCG_DATA[rank];
                      if (!data) return null;
                      return (
                        <div key={rank} className="explanation-item">
                          <div className="explanation-card-view" style={{ backgroundImage: `url(${data.url})` }}></div>
                          <div className="explanation-text">
                            <div className="explanation-card-name">{data.name}</div>
                            <div className="explanation-card-desc">{data.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button className="action-btn btn-pass btn-close-explanation mystic-btn" onClick={() => setShowExplanation(false)}>
                    <span className="mystic-btn-text">閉じる</span>
                  </button>
                </div>
              )}

              {/* --- 法的情報・コンタクト モーダル --- */}
              {showLegalModal && (
                <div className="legal-modal-overlay" onClick={() => setShowLegalModal(null)}>
                  <div className="legal-modal-content" onClick={e => e.stopPropagation()}>
                    <button className="legal-modal-close" onClick={() => setShowLegalModal(null)}>×</button>
                    {showLegalModal === 'privacy' && (
                      <>
                        <h2>プライバシーポリシー</h2>
                        <p>本サイトでは、第三者配信の広告サービス（Google AdSense等）を利用する予定です。<br/>このような広告配信事業者は、ユーザーの興味に応じた商品やサービスの広告を表示するため、本サイトや他サイトへのアクセスに関する情報 「Cookie」(氏名、住所、メール アドレス、電話番号は含まれません) を使用することがあります。</p>
                        <p>またGoogleアドセンスに関して、このプロセスの詳細やこのような情報が広告配信事業者に使用されないようにする方法については、<a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener noreferrer" style={{color: '#ead683'}}>Googleのポリシーと規約ページ</a>をご覧ください。</p>
                      </>
                    )}
                    {showLegalModal === 'terms' && (
                      <>
                        <h2>利用規約</h2>
                        <p>本サイトのゲームおよび関連サービスは、個人的な娯楽の目的で提供されています。</p>
                        <ul>
                          <li>本サイトを利用したことにより生じたいかなる損害についても、運営者は責任を負いません。</li>
                          <li>不正アクセスやサーバーに過度な負担をかける行為は禁止します。</li>
                          <li>予告なくサービスの変更、停止、終了を行う場合があります。</li>
                        </ul>
                      </>
                    )}
                    {showLegalModal === 'contact' && (
                      <>
                        <h2>お問い合わせ</h2>
                        <p>ゲームに関するご意見、ご要望、不具合の報告、その他のお問い合わせにつきましては、以下の連絡先までお願いいたします。</p>
                        <p style={{textAlign: 'center', marginTop: '30px'}}>
                          <a href="mailto:akechany0122@gmail.com" style={{
                            display: 'inline-block',
                            padding: '10px 20px',
                            background: '#ead683',
                            color: '#111',
                            textDecoration: 'none',
                            fontWeight: 'bold',
                            borderRadius: '5px'
                          }}>akechany0122@gmail.com</a>
                        </p>
                        <p style={{fontSize: '0.8rem', color: '#888', textAlign: 'center', marginTop: '10px'}}>※仮のメールアドレスです。後ほどご自身のメールアドレスに変更してください。</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* --- 全面広告 (退場時など) --- */}
              {showInterstitialAd && (
                <div className="ad-fullscreen-overlay">
                  <div className="ad-fullscreen-placeholder">
                    Full Screen Ad Space (Interstitial)
                  </div>
                  <button className="ad-fullscreen-close" onClick={() => {
                    setShowInterstitialAd(false);
                    // モックのため、クリックでも閉じられるようにしておく
                    // 実際には handleExitWithAd 側で performExit() が呼ばれるか、ここから呼ぶかを統一する
                    // 今回はモックのため表示だけの制御
                  }}>
                    Skip Ad
                  </button>
                </div>
              )}

        </div>
        {isMobile && (
          <div className="mobile-margin-bottom"></div>
        )}
      </>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);

    // 最初のユーザー操作でAudioContextを開け、保留中BGMを再生
    const handleInit = () => {
      sm.flushPendingBGM();
    };
    window.addEventListener('mousedown', handleInit, { once: true });
    window.addEventListener('touchstart', handleInit, { once: true });
    window.addEventListener('keydown', handleInit, { once: true });

    // 即時BGM開始試行（ブラウザが許可すればそのまま再生、ブロックされれば最初のクリックで開始）
    sm.playTitleBGM();


