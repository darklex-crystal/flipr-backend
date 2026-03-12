import { useState, useEffect, useRef } from "react";

// ── Config ──────────────────────────────────────────────────────
// En dev local : "http://localhost:8000"
// En production : remplace par ton URL Railway/Render
const API_BASE = import.meta.env?.VITE_API_URL ?? "http://localhost:8000";

// ── Constantes UI ───────────────────────────────────────────────
const CONDITIONS = [
  { id: "poor",    label: "Mauvais",   emoji: "💀" },
  { id: "fair",    label: "Acceptable",emoji: "😐" },
  { id: "good",    label: "Bon",       emoji: "👍" },
  { id: "likenew", label: "Très bon",  emoji: "✨" },
  { id: "new",     label: "Neuf",      emoji: "🏷️" },
];

const SPEEDS = [
  { id: "fast",    label: "Rapide",   sublabel: "1–3 jours"     },
  { id: "normal",  label: "Normal",   sublabel: "~1 semaine"    },
  { id: "patient", label: "Patient",  sublabel: "2–4 semaines"  },
];

const PLATFORM_NAMES = {
  ebay:     "eBay",
  facebook: "Facebook Marketplace",
  whatnot:  "Whatnot",
};

// ── API calls ────────────────────────────────────────────────────

async function apiPrice({ query, condition, speed, paid_price }) {
  const resp = await fetch(`${API_BASE}/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, condition, speed, paid_price }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail ?? `Erreur serveur ${resp.status}`);
  }
  return resp.json();
}

async function apiIdentify({ image_base64, media_type }) {
  const resp = await fetch(`${API_BASE}/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64, media_type }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail ?? `Erreur identification ${resp.status}`);
  }
  return resp.json();
}

// ── Composant : prix animé ───────────────────────────────────────

function AnimatedPrice({ value }) {
  const [display, setDisplay] = useState(value);
  const raf = useRef(null);
  useEffect(() => {
    const start = display, end = value, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / 550, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <span>{display}$</span>;
}

// ── Composant : badge confiance ──────────────────────────────────

function ConfidenceBadge({ level, note }) {
  const colors = {
    high:   { bg: "#1a2a0a", border: "#3d5c10", text: "#c8f135" },
    medium: { bg: "#2a200a", border: "#5c4010", text: "#f1a835" },
    low:    { bg: "#2a0a0a", border: "#5c1010", text: "#f13535" },
  };
  const c = colors[level] ?? colors.medium;
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: "8px 12px",
      fontSize: 11, color: c.text, letterSpacing: "0.5px",
      marginTop: 10,
    }}>
      {level === "high" ? "✓" : level === "medium" ? "~" : "⚠"} {note}
    </div>
  );
}

// ── App principale ───────────────────────────────────────────────

export default function ResellPricer() {
  const [query, setQuery]         = useState("");
  const [condition, setCondition] = useState("good");
  const [speed, setSpeed]         = useState("normal");
  const [paidPrice, setPaidPrice] = useState("");
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [showComps, setShowComps] = useState(false);
  const [activeTab, setActiveTab] = useState("ebay");

  // Image upload
  const [imagePreview, setImagePreview] = useState(null);
  const [identifying, setIdentifying]   = useState(false);
  const fileRef = useRef(null);

  const canSearch = query.trim().length > 1 && !loading;

  // ── Handlers ────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!canSearch) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowComps(false);
    try {
      const data = await apiPrice({
        query: query.trim(),
        condition,
        speed,
        paid_price: paidPrice ? parseFloat(paidPrice) : null,
      });
      setResult(data);
      setActiveTab("ebay");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") handleSearch(); };

  const handleImageUpload = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      setImagePreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const media_type = file.type || "image/jpeg";
      setIdentifying(true);
      setError(null);
      try {
        const id = await apiIdentify({ image_base64: base64, media_type });
        if (id.confidence >= 0.5 && id.product_name) {
          setQuery(id.product_name);
        } else {
          setError(`Identification incertaine : ${id.notes ?? "essaie de taper le nom manuellement"}`);
        }
      } catch (e) {
        setError("Erreur d'identification image : " + e.message);
      } finally {
        setIdentifying(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Données résultat ─────────────────────────────────────────────

  const recommended = result?.platforms?.find(p => p.recommended) ?? result?.platforms?.[0];
  const alternatives = result?.platforms?.filter(p => !p.recommended) ?? [];
  const profit = result?.profit;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div style={S.root}>
      <style>{css}</style>

      {/* Header */}
      <header style={S.header}>
        <div style={S.logo}>
          <span style={S.logoMark}>↑$</span>
          <span style={S.logoText}>FLIPR</span>
        </div>
        <span style={S.tagline}>Quel prix demander ?</span>
      </header>

      {/* Recherche */}
      <div style={S.section}>
        <div style={S.searchBox} className="search-box">
          <input
            style={S.input}
            placeholder="Nom du produit ou modèle…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            spellCheck={false}
          />
          <button
            style={S.cameraBtn}
            title="Identifier depuis une photo"
            onClick={() => fileRef.current?.click()}
            disabled={identifying}
          >
            {identifying ? <span className="spinner-dark" /> : "📷"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={e => handleImageUpload(e.target.files?.[0])}
          />
          <button
            style={{ ...S.searchBtn, ...(canSearch ? S.searchBtnActive : {}) }}
            onClick={handleSearch}
            disabled={!canSearch}
          >
            {loading ? <span className="spinner" /> : "→"}
          </button>
        </div>

        {/* Aperçu image */}
        {imagePreview && (
          <div style={S.imagePreview} className="fade-in">
            <img src={imagePreview} alt="produit" style={S.previewImg} />
            <button style={S.clearImg} onClick={() => { setImagePreview(null); setQuery(""); }}>✕</button>
          </div>
        )}
      </div>

      {/* État */}
      <div style={S.section}>
        <div style={S.label}>ÉTAT</div>
        <div style={S.condRow}>
          {CONDITIONS.map(c => (
            <button key={c.id}
              style={{ ...S.condBtn, ...(condition === c.id ? S.condActive : {}) }}
              className="pill-btn"
              onClick={() => setCondition(c.id)}
            >
              <span style={S.condEmoji}>{c.emoji}</span>
              <span style={S.condLabel}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Vitesse */}
      <div style={S.section}>
        <div style={S.label}>DÉLAI DE VENTE</div>
        <div style={S.speedRow}>
          {SPEEDS.map(s => (
            <button key={s.id}
              style={{ ...S.speedBtn, ...(speed === s.id ? S.speedActive : {}) }}
              className="pill-btn"
              onClick={() => setSpeed(s.id)}
            >
              <span style={S.speedLabel}>{s.label}</span>
              <span style={S.speedSub}>{s.sublabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prix payé */}
      <div style={S.section}>
        <div style={S.label}>J'AI PAYÉ (optionnel)</div>
        <div style={S.paidBox}>
          <input
            style={S.paidInput}
            type="number"
            placeholder="0"
            value={paidPrice}
            onChange={e => setPaidPrice(e.target.value)}
            min="0"
          />
          <span style={S.paidCur}>$</span>
        </div>
      </div>

      {/* Chargement */}
      {loading && (
        <div style={S.loadWrap} className="fade-in">
          <div style={S.loadBar} className="load-bar" />
          <div style={S.loadText}>Analyse du marché eBay…</div>
        </div>
      )}

      {/* Erreur */}
      {error && !loading && (
        <div style={S.errorBox} className="fade-in">⚠ {error}</div>
      )}

      {/* Résultat */}
      {result && !loading && recommended && (
        <div style={S.resultWrap} className="fade-in">

          {/* Carte principale */}
          <div style={S.card}>
            <div style={S.platformBadge}>
              {PLATFORM_NAMES[recommended.platform]} · {recommended.days_to_sell}
            </div>
            <div style={S.productName}>{result.query}</div>

            <div style={S.priceRow}>
              <div>
                <div style={S.netLabel}>Tu empoches</div>
                <div style={S.netPrice} className="price-pop">
                  <AnimatedPrice value={recommended.net_price} />
                </div>
              </div>
              <div style={S.divider} />
              <div>
                <div style={S.listLabel}>Prix affiché</div>
                <div style={S.listPrice}>
                  <AnimatedPrice value={recommended.list_price} />
                </div>
                <div style={S.feeNote}>Frais : {recommended.fee_amount}$</div>
              </div>
            </div>

            {profit && (
              <div style={{ ...S.profitBanner, ...(profit.is_positive ? S.profitPos : S.profitNeg) }} className="fade-in">
                {profit.is_positive
                  ? `🔥 Profit : +${profit.profit}$ · ROI ${profit.roi_pct}%`
                  : `⚠️ Perte estimée : ${profit.profit}$`}
              </div>
            )}

            <ConfidenceBadge level={result.confidence} note={result.confidence_note} />
          </div>

          {/* Onglets plateformes */}
          <div style={S.tabs}>
            <div style={S.tabBar}>
              {result.platforms.map(p => (
                <button key={p.platform}
                  style={{ ...S.tab, ...(activeTab === p.platform ? S.tabActive : {}), ...(p.disabled ? S.tabDisabled : {}) }}
                  onClick={() => !p.disabled && setActiveTab(p.platform)}
                >
                  {PLATFORM_NAMES[p.platform]}{p.recommended ? " ★" : ""}
                </button>
              ))}
            </div>
            {result.platforms.map(p => activeTab === p.platform && (
              <div key={p.platform} style={S.tabContent} className="fade-in">
                {p.disabled ? (
                  <p style={S.tabNote}>⚠️ {p.note}</p>
                ) : (
                  <>
                    <div style={S.tabStats}>
                      {[
                        ["Prix affiché", `${p.list_price}$`],
                        ["Net encaissé", `${p.net_price}$`],
                        ["Frais",        p.fee_rate],
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={S.tabStat}>
                          <div style={S.tabStatVal}>{val}</div>
                          <div style={S.tabStatLbl}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                    <p style={S.tabNote}>{p.note}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Ventes comparables */}
          <div style={S.compsWrap}>
            <button style={S.compsToggle} onClick={() => setShowComps(v => !v)}>
              {showComps ? "▲ Masquer" : "▼ Ventes comparables eBay"}
            </button>
            {showComps && result.comps?.length > 0 && (
              <div className="fade-in">
                {result.comps.map((c, i) => (
                  <div key={i} style={S.compRow}>
                    <span style={S.compTitle}>{c.title}</span>
                    <span style={S.compCond}>{c.condition}</span>
                    <span style={S.compPrice}>{c.price}$</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const S = {
  root: {
    minHeight: "100vh",
    background: "#0d0d0f",
    color: "#f0ece4",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    padding: "0 0 80px",
    maxWidth: 480,
    margin: "0 auto",
  },
  header: {
    padding: "32px 24px 20px",
    borderBottom: "1px solid #1e1e24",
    display: "flex",
    alignItems: "baseline",
    gap: 16,
  },
  logo:      { display: "flex", alignItems: "center", gap: 8 },
  logoMark:  { fontSize: 22, fontWeight: 700, color: "#c8f135", letterSpacing: "-1px" },
  logoText:  { fontSize: 22, fontWeight: 700, letterSpacing: "4px" },
  tagline:   { fontSize: 11, color: "#444", letterSpacing: "1px", textTransform: "uppercase" },

  section: { padding: "24px 24px 0" },
  label:   { fontSize: 10, letterSpacing: "2px", color: "#444", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" },

  searchBox: {
    display: "flex",
    background: "#16161a",
    border: "1px solid #2a2a32",
    borderRadius: 4,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    padding: "16px 18px",
    fontSize: 15,
    color: "#f0ece4",
    fontFamily: "inherit",
  },
  cameraBtn: {
    background: "transparent",
    border: "none",
    borderLeft: "1px solid #2a2a32",
    padding: "0 14px",
    fontSize: 17,
    cursor: "pointer",
  },
  searchBtn: {
    background: "#2a2a32",
    border: "none",
    color: "#555",
    padding: "0 20px",
    fontSize: 20,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
    borderLeft: "1px solid #1e1e24",
  },
  searchBtnActive: { background: "#c8f135", color: "#0d0d0f" },

  imagePreview: {
    position: "relative",
    marginTop: 10,
    display: "inline-block",
  },
  previewImg: {
    width: 72,
    height: 72,
    objectFit: "cover",
    borderRadius: 4,
    border: "1px solid #2a2a32",
    display: "block",
  },
  clearImg: {
    position: "absolute",
    top: -6,
    right: -6,
    background: "#333",
    border: "none",
    color: "#aaa",
    width: 18,
    height: 18,
    borderRadius: "50%",
    fontSize: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  condRow: { display: "flex", gap: 6 },
  condBtn: {
    flex: 1,
    background: "#16161a",
    border: "1px solid #2a2a32",
    borderRadius: 4,
    padding: "10px 4px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    color: "#666",
    transition: "all 0.15s",
  },
  condActive: { background: "#1a1f0a", border: "1px solid #c8f135", color: "#c8f135" },
  condEmoji:  { fontSize: 16 },
  condLabel:  { fontSize: 9, letterSpacing: "0.5px", textTransform: "uppercase", fontWeight: 600 },

  speedRow: { display: "flex", gap: 8 },
  speedBtn: {
    flex: 1,
    background: "#16161a",
    border: "1px solid #2a2a32",
    borderRadius: 4,
    padding: "12px 8px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    color: "#666",
    transition: "all 0.15s",
  },
  speedActive: { background: "#1a1f0a", border: "1px solid #c8f135", color: "#c8f135" },
  speedLabel:  { fontSize: 13, fontWeight: 700 },
  speedSub:    { fontSize: 10, opacity: 0.6 },

  paidBox: {
    display: "flex",
    alignItems: "center",
    background: "#16161a",
    border: "1px solid #2a2a32",
    borderRadius: 4,
    width: 140,
    overflow: "hidden",
  },
  paidInput: {
    background: "transparent",
    border: "none",
    outline: "none",
    padding: "12px 14px",
    fontSize: 16,
    color: "#f0ece4",
    fontFamily: "inherit",
    width: 100,
  },
  paidCur: { color: "#555", paddingRight: 14, fontSize: 14 },

  loadWrap: { padding: "40px 24px 0", textAlign: "center" },
  loadBar:  { height: 2, background: "#c8f135", borderRadius: 2, marginBottom: 16 },
  loadText: { fontSize: 11, color: "#555", letterSpacing: "2px", textTransform: "uppercase" },

  errorBox: {
    margin: "20px 24px 0",
    background: "#2a0a0a",
    border: "1px solid #5c1010",
    borderRadius: 4,
    padding: "12px 16px",
    fontSize: 12,
    color: "#f13535",
    letterSpacing: "0.3px",
  },

  resultWrap: { padding: "24px 24px 0" },

  card: {
    background: "#16161a",
    border: "1px solid #2a2a32",
    borderRadius: 6,
    padding: "22px 20px",
  },
  platformBadge: { fontSize: 10, letterSpacing: "2px", color: "#c8f135", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 },
  productName:   { fontSize: 14, color: "#666", marginBottom: 18, letterSpacing: "0.3px" },

  priceRow:  { display: "flex", alignItems: "center", gap: 20, marginBottom: 14 },
  netLabel:  { fontSize: 10, color: "#555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 4 },
  netPrice:  { fontSize: 50, fontWeight: 700, color: "#c8f135", letterSpacing: "-2px", lineHeight: 1 },
  divider:   { width: 1, height: 55, background: "#2a2a32" },
  listLabel: { fontSize: 10, color: "#555", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 4 },
  listPrice: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px" },
  feeNote:   { fontSize: 11, color: "#3a3a44", marginTop: 4 },

  profitBanner: { borderRadius: 4, padding: "10px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px", marginTop: 12 },
  profitPos:    { background: "#1a2a0a", border: "1px solid #3d5c10", color: "#c8f135" },
  profitNeg:    { background: "#2a0a0a", border: "1px solid #5c1010", color: "#f13535" },

  tabs: { marginTop: 12, background: "#16161a", border: "1px solid #2a2a32", borderRadius: 6, overflow: "hidden" },
  tabBar: { display: "flex", borderBottom: "1px solid #2a2a32" },
  tab: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "12px 6px",
    fontSize: 10,
    color: "#555",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    fontWeight: 600,
    transition: "all 0.15s",
  },
  tabActive:   { color: "#c8f135", borderBottom: "2px solid #c8f135" },
  tabDisabled: { opacity: 0.35, cursor: "not-allowed" },
  tabContent:  { padding: "16px 18px 14px" },
  tabStats:    { display: "flex", gap: 8, marginBottom: 10 },
  tabStat:     { flex: 1, textAlign: "center" },
  tabStatVal:  { fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" },
  tabStatLbl:  { fontSize: 9, color: "#555", letterSpacing: "1px", textTransform: "uppercase", marginTop: 2 },
  tabNote:     { fontSize: 11, color: "#555", margin: 0, lineHeight: 1.6 },

  compsWrap:   { marginTop: 10 },
  compsToggle: {
    width: "100%",
    background: "transparent",
    border: "1px solid #2a2a32",
    borderRadius: 4,
    padding: 11,
    fontSize: 10,
    color: "#555",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  compRow:   { display: "flex", alignItems: "center", padding: "9px 2px", borderBottom: "1px solid #1a1a1e", gap: 8 },
  compTitle: { flex: 1, fontSize: 11, color: "#888" },
  compCond:  { fontSize: 10, color: "#444", minWidth: 60 },
  compPrice: { fontSize: 13, fontWeight: 700, minWidth: 48, textAlign: "right" },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d0d0f; }
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
  .search-box:focus-within { border-color: #c8f135 !important; }
  .pill-btn:hover { border-color: #3a3a44 !important; color: #aaa !important; }
  .price-pop { animation: popIn 0.4s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes popIn { from { transform:scale(0.85); opacity:0 } to { transform:scale(1); opacity:1 } }
  .fade-in { animation: fadeUp 0.3s ease; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
  .load-bar { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity:0.3; transform:scaleX(0.5) } 50% { opacity:1; transform:scaleX(1) } }
  .spinner { display:inline-block; width:16px; height:16px; border:2px solid #0d0d0f; border-top-color:transparent; border-radius:50%; animation:spin .7s linear infinite; }
  .spinner-dark { display:inline-block; width:14px; height:14px; border:2px solid #555; border-top-color:transparent; border-radius:50%; animation:spin .7s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg) } }
`;
