import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export const BackofficeDashboard = () => {
  const [wsStatus, setWsStatus] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [reversals, setReversals] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [allowedCompanies, setAllowedCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ fortnox_database_number: "", description: "" });
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_BASE_URL || "");

  const fetchData = () => {
    // Verifiera att vi är admin
    fetch(`${api}/api/backoffice/me`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) navigate("/backoffice/login");
        return res.json();
      })
      .catch(() => navigate("/backoffice/login"));

    // Hämta data
    Promise.all([
      fetch(`${api}/api/ws/status`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${api}/api/companies`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${api}/api/reversals/all`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${api}/api/settings/all`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${api}/api/allowed-companies`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([ws, comp, rev, sett, allowed]) => {
        setWsStatus(ws);
        setCompanies(comp.companies || []);
        setReversals(rev.reversals || []);
        setSettings(sett.settings || []);
        setAllowedCompanies(allowed.companies || []);
      })
      .catch((err) => {
        console.error("Error fetching data:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // Uppdatera data var 30:e sekund
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [navigate, api]);

  const handleLogout = async () => {
    await fetch(`${api}/api/backoffice/logout`, {
      method: "POST",
      credentials: "include",
    });
    navigate("/backoffice/login");
  };

  const handleAddAllowedCompany = async () => {
    if (!formData.fortnox_database_number || !formData.description) return;

    try {
      const res = await fetch(`${api}/api/allowed-companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fortnox_database_number: parseInt(formData.fortnox_database_number),
          description: formData.description,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.message || "Kunde inte lägga till företag");
        return;
      }

      setFormData({ fortnox_database_number: "", description: "" });
      setShowAddForm(false);
      fetchData();
    } catch (err) {
      alert("Fel vid tillägg av företag");
    }
  };

  const handleUpdateAllowedCompany = async (id: string) => {
    if (!formData.description) return;

    try {
      const res = await fetch(`${api}/api/allowed-companies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          description: formData.description,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.message || "Kunde inte uppdatera företag");
        return;
      }

      setEditingId(null);
      setFormData({ fortnox_database_number: "", description: "" });
      fetchData();
    } catch (err) {
      alert("Fel vid uppdatering av företag");
    }
  };

  const handleDeleteAllowedCompany = async (id: string) => {
    if (!confirm("Är du säker på att du vill ta bort detta företag från whitelisten?")) return;

    try {
      const res = await fetch(`${api}/api/allowed-companies/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        alert("Kunde inte ta bort företag");
        return;
      }

      fetchData();
    } catch (err) {
      alert("Fel vid borttagning av företag");
    }
  };

  const startEdit = (company: any) => {
    setEditingId(company.id);
    setFormData({
      fortnox_database_number: company.fortnox_database_number.toString(),
      description: company.description,
    });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ fortnox_database_number: "", description: "" });
    setShowAddForm(false);
  };

  if (loading) {
    return (
      <div style={{ padding: "16px" }}>Laddar...</div>
    );
  }

  const connectedCompanies = wsStatus?.debug?.companies || [];

  return (
    <div style={{ minHeight: "100vh", background: "#f6f8fa", padding: "32px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 700, margin: 0 }}>Backoffice</h1>
          <button
            onClick={handleLogout}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #d0d7de",
              background: "#fff",
              color: "#334155",
              cursor: "pointer",
              fontSize: "14px"
            }}
          >
            Logga ut
          </button>
        </div>

        {/* WebSocket Status */}
        <div style={{ background: "#fff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "16px", marginTop: 0 }}>WebSocket Status</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>Status</div>
              <div style={{ fontSize: "16px", fontWeight: 500, color: wsStatus?.status?.connected ? "#22c55e" : "#ef4444" }}>
                {wsStatus?.status?.connected ? "Ansluten" : "Frånkopplad"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>Anslutna företag</div>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>
                {wsStatus?.debug?.companiesCount || 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>Tenants</div>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>
                {wsStatus?.debug?.tenants || 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>Mottagna meddelanden</div>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>
                {wsStatus?.debug?.receivedMessages?.length || 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>Totala events</div>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>
                {wsStatus?.debug?.totalEvents || 0}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>Topics tillagda</div>
              <div style={{ fontSize: "16px", fontWeight: 500 }}>
                {wsStatus?.debug?.topicsAdded ? "Ja" : "Nej"}
              </div>
            </div>
            {wsStatus?.debug?.lastOpenAt && (
              <div>
                <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>Senaste öppning</div>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>
                  {new Date(wsStatus.debug.lastOpenAt).toLocaleString("sv-SE")}
                </div>
              </div>
            )}
            {wsStatus?.debug?.lastError && (
              <div>
                <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>Senaste fel</div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "#ef4444" }}>
                  {wsStatus.debug.lastError}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Företagslista */}
        <div style={{ background: "#fff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "16px", marginTop: 0 }}>Företag ({companies.length})</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Namn</th>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Org.nr</th>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Tenant ID</th>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>WS Status</th>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Auto Reverse</th>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Skapad</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const companySettings = settings.find((s: any) => s.company_id === c.id);
                  const isConnected = connectedCompanies.includes(c.id);
                  return (
                    <tr key={c.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>{c.name}</td>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>{c.org_number || "-"}</td>
                      <td style={{ padding: "12px 0", fontSize: "14px", fontFamily: "monospace" }}>
                        {c.external_db_number || "-"}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>
                        {isConnected ? (
                          <span style={{ color: "#22c55e" }}>Ansluten</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>Ej ansluten</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>
                        {companySettings ? (
                          companySettings.auto_reverse_active ? (
                            <span style={{ color: "#22c55e" }}>
                              Aktiv ({companySettings.auto_reverse_trigger_series} → {companySettings.auto_reverse_target_series})
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>Inaktiv</span>
                          )
                        ) : (
                          <span style={{ color: "#94a3b8" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px", color: "#64748b" }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString("sv-SE") : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reversals-historik */}
        {reversals.length > 0 && (
          <div style={{ background: "#fff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: "24px", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "16px", marginTop: 0 }}>Reversals-historik ({reversals.length})</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Tid</th>
                    <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Företag</th>
                    <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Status</th>
                    <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Från</th>
                    <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Till</th>
                    <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>År</th>
                    <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Fel</th>
                  </tr>
                </thead>
                <tbody>
                  {reversals.slice(0, 50).map((r: any) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "12px 0", fontSize: "14px", color: "#64748b" }}>
                        {new Date(r.created_at).toLocaleString("sv-SE")}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>
                        {r.company_name || r.company_id?.slice(0, 8) || "-"}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>
                        {r.action === "reversal_created" ? (
                          <span style={{ color: "#22c55e" }}>Skapad</span>
                        ) : r.action === "reversal_failed" ? (
                          <span style={{ color: "#ef4444" }}>Misslyckad</span>
                        ) : (
                          <span style={{ color: "#f59e0b" }}>Hoppad över</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px", fontFamily: "monospace" }}>
                        {r.payload_json?.source_series} {r.payload_json?.source_number}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px", fontFamily: "monospace" }}>
                        {r.payload_json?.target_series} {r.payload_json?.target_number || "-"}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>
                        {r.payload_json?.financial_year || "-"}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px", color: "#ef4444", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.payload_json?.error_message || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Senaste WebSocket-meddelanden */}
        {wsStatus?.debug?.receivedMessages && wsStatus.debug.receivedMessages.length > 0 && (
          <div style={{ background: "#fff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: "24px", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "16px", marginTop: 0 }}>Senaste WebSocket-meddelanden ({wsStatus.debug.receivedMessages.length})</h2>
            <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {wsStatus.debug.receivedMessages.slice(-20).reverse().map((msg: any, i: number) => (
                <div key={i} style={{ fontSize: "12px", fontFamily: "monospace", background: "#f6f8fa", padding: "8px", borderRadius: "4px" }}>
                  <span style={{ color: "#64748b" }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>{" "}
                  {msg.topic && <span style={{ color: "#0ea5e9", fontWeight: 500 }}>[{msg.topic}]</span>}
                  {msg.type && <span style={{ color: "#8b5cf6", fontWeight: 500 }}> {msg.type}</span>}
                  {msg.tenantId && <span style={{ color: "#64748b" }}> Tenant: {msg.tenantId}</span>}
                  {msg.series && msg.id && (
                    <span style={{ color: "#475569" }}>
                      {" "}{msg.series} #{msg.id}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Whitelist - Tillåtna företag */}
        <div style={{ background: "#fff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: "24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, marginTop: 0 }}>Tillåtna företag ({allowedCompanies.length})</h2>
            {!showAddForm && !editingId && (
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #d0d7de",
                  background: "#0ea5e9",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "14px"
                }}
              >
                Lägg till företag
              </button>
            )}
          </div>

          {/* Formulär för att lägga till/redigera */}
          {(showAddForm || editingId) && (
            <div style={{ background: "#f6f8fa", padding: "16px", borderRadius: "6px", marginBottom: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "12px", alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#334155" }}>
                    Databasnummer
                  </label>
                  <input
                    type="number"
                    value={formData.fortnox_database_number}
                    onChange={(e) => setFormData({ ...formData, fortnox_database_number: e.target.value })}
                    disabled={!!editingId}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #d0d7de",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                    placeholder="123456"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 500, marginBottom: "4px", color: "#334155" }}>
                    Beskrivning
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #d0d7de",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                    placeholder="Beskrivning av företaget"
                  />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => editingId ? handleUpdateAllowedCompany(editingId) : handleAddAllowedCompany()}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "none",
                      background: "#22c55e",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    {editingId ? "Spara" : "Lägg till"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid #d0d7de",
                      background: "#fff",
                      color: "#334155",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tabell med tillåtna företag */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Databasnummer</th>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Beskrivning</th>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Skapad</th>
                  <th style={{ paddingBottom: "8px", fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {allowedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                      Inga tillåtna företag ännu
                    </td>
                  </tr>
                ) : (
                  allowedCompanies.map((ac: any) => (
                    <tr key={ac.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "12px 0", fontSize: "14px", fontFamily: "monospace" }}>
                        {ac.fortnox_database_number}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>
                        {editingId === ac.id ? (
                          <input
                            type="text"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              border: "1px solid #d0d7de",
                              fontSize: "14px"
                            }}
                          />
                        ) : (
                          ac.description
                        )}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px", color: "#64748b" }}>
                        {new Date(ac.created_at).toLocaleDateString("sv-SE")}
                      </td>
                      <td style={{ padding: "12px 0", fontSize: "14px" }}>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {editingId === ac.id ? (
                            <>
                              <button
                                onClick={() => handleUpdateAllowedCompany(ac.id)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "none",
                                  background: "#22c55e",
                                  color: "#fff",
                                  cursor: "pointer",
                                  fontSize: "12px"
                                }}
                              >
                                Spara
                              </button>
                              <button
                                onClick={cancelEdit}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "1px solid #d0d7de",
                                  background: "#fff",
                                  color: "#334155",
                                  cursor: "pointer",
                                  fontSize: "12px"
                                }}
                              >
                                Avbryt
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(ac)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "1px solid #d0d7de",
                                  background: "#fff",
                                  color: "#334155",
                                  cursor: "pointer",
                                  fontSize: "12px"
                                }}
                              >
                                Redigera
                              </button>
                              <button
                                onClick={() => handleDeleteAllowedCompany(ac.id)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "none",
                                  background: "#ef4444",
                                  color: "#fff",
                                  cursor: "pointer",
                                  fontSize: "12px"
                                }}
                              >
                                Ta bort
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Event Log */}
        {wsStatus?.debug?.eventLog && wsStatus.debug.eventLog.length > 0 && (
          <div style={{ background: "#fff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: "24px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "16px", marginTop: 0 }}>Event Log ({wsStatus.debug.eventLog.length})</h2>
            <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {wsStatus.debug.eventLog.slice(-50).reverse().map((e: any, i: number) => (
                <div key={i} style={{ fontSize: "12px", fontFamily: "monospace", background: "#f6f8fa", padding: "8px", borderRadius: "4px" }}>
                  <span style={{ color: "#64748b" }}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>{" "}
                  <span style={{ color: "#0ea5e9", fontWeight: 500 }}>{e.event}</span>
                  {e.data && (
                    <span style={{ color: "#475569" }}>
                      {" "}- {JSON.stringify(e.data).slice(0, 100)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

