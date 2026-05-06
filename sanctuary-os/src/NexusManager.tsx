import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useLexicon } from "./LexiconContext";

export default function NexusManager() {
  const { t } = useLexicon();
  const[ghosts, setGhosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modA, setModA] = useState("");
  const [modB, setModB] = useState("");
  const[severity, setSeverity] = useState(4);
  const [note, setNote] = useState("");

  const fetchGhosts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('logical_conflicts').select('*').order('created_at', { ascending: false });
    if (!error && data) setGhosts(data);
    setLoading(false);
  };

  useEffect(() => { fetchGhosts(); },[]);

  const handleAddGhost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modA || !modB) return;
    const { error } = await supabase.from('logical_conflicts').insert([{ mod_a: modA, mod_b: modB, severity_rank: severity, resolution_note: note }]);
    if (!error) { setModA(""); setModB(""); setNote(""); fetchGhosts(); }
  };

  const handleDeleteGhost = async (id: number) => {
    const { error } = await supabase.from('logical_conflicts').delete().eq('id', id);
    if (!error) fetchGhosts();
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '12px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text)', borderRadius: '4px', outline: 'none', fontFamily: 'monospace'
  };

  const selectStyle: React.CSSProperties = {
    padding: '12px', background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--warning)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
  };

  const submitBtnStyle: React.CSSProperties = {
    padding: '15px', background: 'var(--accent)', color: 'var(--bg)', border: 'none',
    borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem', letterSpacing: '1px'
  };

  const purgeBtnStyle: React.CSSProperties = {
    padding: '8px 16px', background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)',
    borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', marginTop: '10px'
  };

  return (
    <div style={{ color: 'var(--text)', fontFamily: 'monospace' }}>
      <h2 style={{ color: 'var(--accent)', marginBottom: '5px' }}>{t("nexus_title")}</h2>
      <p style={{ color: 'var(--subtext)', marginBottom: '30px', fontSize: '0.9rem' }}>{t("nexus_subtitle")}</p>

      {/* --- THE FORGE --- */}
      <div style={{ background: 'var(--sidebar)', padding: '25px', borderRadius: '12px', marginBottom: '40px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 style={{ marginTop: 0, color: 'var(--warning)', fontSize: '1rem', marginBottom: '20px' }}>
          {t("nexus_forge_title")}
        </h3>
        <form onSubmit={handleAddGhost} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '15px' }}>
            <input placeholder={t("nexus_enemy_a")} value={modA} onChange={(e) => setModA(e.target.value)} required style={inputStyle} />
            <div style={{ alignSelf: 'center', color: 'var(--subtext)', fontWeight: 'bold' }}>{t("nexus_icon_vs")}</div>
            <input placeholder={t("nexus_enemy_b")} value={modB} onChange={(e) => setModB(e.target.value)} required style={inputStyle} />
            <select value={severity} onChange={(e) => setSeverity(Number(e.target.value))} style={selectStyle}>
              <option value={4}>{t("nexus_tier4")}</option>
              <option value={3}>{t("nexus_tier3")}</option>
            </select>
          </div>
          <textarea placeholder={t("nexus_resolution")} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, height: '80px', resize: 'none' }} />
          <button type="submit" style={submitBtnStyle}>{t("nexus_inject")}</button>
        </form>
      </div>

      {/* --- THE ROSTER --- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--accent)' }}>{t("nexus_syncing")}</div>
        ) : (
          ghosts.map((g) => (
            <div key={g.id} style={{ background: 'var(--sidebar)', borderRadius: '8px', borderLeft: `4px solid ${g.severity_rank === 4 ? 'var(--danger)' : 'var(--warning)'}`, overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  <span style={{ color: 'var(--text)' }}>{g.mod_a}</span>
                  <span style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{t("nexus_vs")}</span>
                  <span style={{ color: 'var(--text)' }}>{g.mod_b}</span>
                </div>
                <div style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: g.severity_rank === 4 ? 'var(--danger)' : 'var(--warning)', color: 'white' }}>
                  {t("nexus_rank")}{g.severity_rank}
                </div>
              </div>

              <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '30px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--subtext)', marginBottom: '8px', letterSpacing: '1px' }}>{t("nexus_sys_directive")}</div>
                  <div style={{ color: 'var(--success)', lineHeight: '1.5', fontSize: '0.95rem' }}>{g.resolution_note}</div>
                </div>
                <button onClick={() => handleDeleteGhost(g.id)} style={purgeBtnStyle}>{t("nexus_purge")}</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
