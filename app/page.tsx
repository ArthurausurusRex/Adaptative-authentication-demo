"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Model } from "../lib/auth";
import { calcUserReqUserAuthActions } from "../lib/auth";

const STORAGE_KEY = "alma-auth-sim:model:v3";

const defaultModel: Model = {
  amrs: [
    { id: "phone_otp", type: "weak_factor", category: "cat4" },
    { id: "password", type: "single_factor", category: "cat2" },
    { id: "phone_biometry", type: "multi_factor", category: "cat3" },
    { id: "mail_otp", type: "weak_factor", category: "cat1" },
  ],
  acr: {
    normal: [
      [{ type: "weak_factor", maxAge: 3600 }],
      [{ type: "single_factor", maxAge: 3600 }],
      [{ type: "multi_factor", maxAge: 3600 }],
    ],
    strong: [
      [{ type: "single_factor", maxAge: 93600 }, { type: "single_factor", maxAge: 300 }],
      [{ type: "weak_factor", maxAge: 93600 }, { type: "single_factor", maxAge: 300 }],
      [{ type: "multi_factor", maxAge: 300 }],
    ],
  },
  users: [
    { id: "arthur", enrolledMeans: ["phone_otp", "password", "phone_biometry"] },
    { id: "bigNoob", enrolledMeans: ["phone_otp", "password", "phone_biometry"] },
    { id: "otherNoob", enrolledMeans: ["phone_otp"] },
  ],
  sessions: [
    {
      id: "1",
      userId: "arthur",
      pastAuthenticationActions: [
        { id: "phone_otp", validatedAt: "1768999339620" },
        { id: "phone_biometry", validatedAt: "1768998339620" },
      ],
    },
    { id: "2", userId: "bigNoob", pastAuthenticationActions: [] },
    { id: "3", userId: "otherNoob", pastAuthenticationActions: [] },
  ],
};

function pretty(obj: unknown) {
  return JSON.stringify(obj, null, 2);
}

function safeJsonParse<T>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function formatParisDateTime(msString: string) {
  const ms = Number(msString);
  if (Number.isNaN(ms)) return msString;

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        {right}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        fontSize: 12,
        lineHeight: "18px",
      }}
    >
      {children}
    </span>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>{children}</table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        fontSize: 12,
        color: "#6b7280",
        fontWeight: 700,
        padding: "8px 8px",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }}>{children}</td>;
}

function Button({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  const styles =
    variant === "default"
      ? { background: "#111827", color: "white", border: "1px solid #111827" }
      : { background: "white", color: "#111827", border: "1px solid #e5e7eb" };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles,
        padding: "8px 12px",
        borderRadius: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export default function Page() {
  const [model, setModel] = useState<Model>(defaultModel);
  const [editMode, setEditMode] = useState(false);

  const [amrsText, setAmrsText] = useState(pretty(defaultModel.amrs));
  const [acrText, setAcrText] = useState(pretty(defaultModel.acr));
  const [usersText, setUsersText] = useState(pretty(defaultModel.users));
  const [sessionsText, setSessionsText] = useState(pretty(defaultModel.sessions));

  const [selectedSessionId, setSelectedSessionId] = useState(defaultModel.sessions[0]?.id ?? "");
  const [selectedAcr, setSelectedAcr] = useState(Object.keys(defaultModel.acr)[0] ?? "normal");

  const [enrollAmrId, setEnrollAmrId] = useState("");
  const [validateAmrId, setValidateAmrId] = useState("");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = safeJsonParse<Model>(raw);
    if (!parsed.ok) return;

    setModel(parsed.value);
    setAmrsText(pretty(parsed.value.amrs));
    setAcrText(pretty(parsed.value.acr));
    setUsersText(pretty(parsed.value.users));
    setSessionsText(pretty(parsed.value.sessions));

    if (parsed.value.sessions[0]?.id) setSelectedSessionId(parsed.value.sessions[0].id);
    if (Object.keys(parsed.value.acr)[0]) setSelectedAcr(Object.keys(parsed.value.acr)[0]);

    setError(null);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  }, [model]);

  const acrKeys = useMemo(() => {
    const keys = [...Object.keys(model.acr)];
    if (!keys.includes("strong_if_available")) {
      keys.push("strong_if_available");
    }
    return keys;
  }, [model.acr]);

  const selectedSession = useMemo(
    () => model.sessions.find((s) => s.id === selectedSessionId) ?? null,
    [model.sessions, selectedSessionId]
  );

  const selectedUser = useMemo(() => {
    if (!selectedSession) return null;
    return model.users.find((u) => u.id === selectedSession.userId) ?? null;
  }, [model.users, selectedSession]);

  const checkResult = useMemo(() => {
    if (!selectedSessionId || !selectedAcr) return null;
    try {
      return calcUserReqUserAuthActions(model, selectedSessionId, selectedAcr);
    } catch (e) {
      return { status: "error", message: e instanceof Error ? e.message : String(e) } as const;
    }
  }, [model, selectedSessionId, selectedAcr]);

  const availableEnrollAmrs = useMemo(() => {
    if (!selectedUser) return [];
    const enrolled = new Set(selectedUser.enrolledMeans);
    return model.amrs.map((a) => a.id).filter((id) => !enrolled.has(id));
  }, [model.amrs, selectedUser]);

  const availableValidateAmrs = useMemo(() => {
    if (!selectedUser) return [];
    return [...selectedUser.enrolledMeans];
  }, [selectedUser]);

  useEffect(() => {
    setEnrollAmrId(availableEnrollAmrs[0] ?? "");
  }, [availableEnrollAmrs]);

  useEffect(() => {
    setValidateAmrId(availableValidateAmrs[0] ?? "");
  }, [availableValidateAmrs]);

  function startEdit() {
    setError(null);
    setAmrsText(pretty(model.amrs));
    setAcrText(pretty(model.acr));
    setUsersText(pretty(model.users));
    setSessionsText(pretty(model.sessions));
    setEditMode(true);
  }

  function cancelEdit() {
    setError(null);
    setEditMode(false);
  }

  function applyEditors() {
    setError(null);

    const p1 = safeJsonParse<Model["amrs"]>(amrsText);
    if (!p1.ok) return setError(`AMRs JSON error: ${p1.error}`);

    const p2 = safeJsonParse<Model["acr"]>(acrText);
    if (!p2.ok) return setError(`ACRs JSON error: ${p2.error}`);

    const p3 = safeJsonParse<Model["users"]>(usersText);
    if (!p3.ok) return setError(`Users JSON error: ${p3.error}`);

    const p4 = safeJsonParse<Model["sessions"]>(sessionsText);
    if (!p4.ok) return setError(`Sessions JSON error: ${p4.error}`);

    const next: Model = {
      amrs: p1.value,
      acr: p2.value,
      users: p3.value,
      sessions: p4.value,
    };

    setModel(next);
    setEditMode(false);

    const firstSession = next.sessions[0]?.id ?? "";
    if (!next.sessions.some((s) => s.id === selectedSessionId)) setSelectedSessionId(firstSession);

    const firstAcr = Object.keys(next.acr)[0] ?? "normal";
    if (!Object.prototype.hasOwnProperty.call(next.acr, selectedAcr)) setSelectedAcr(firstAcr);
  }

  function resetToDefault() {
    setError(null);
    setModel(defaultModel);
    setEditMode(false);
    setSelectedSessionId(defaultModel.sessions[0]?.id ?? "");
    setSelectedAcr(Object.keys(defaultModel.acr)[0] ?? "normal");
  }

  function enrollSelectedAmr() {
    if (!selectedUser || !enrollAmrId) return;

    setModel((prev) => {
      const users = prev.users.map((u) => {
        if (u.id !== selectedUser.id) return u;
        if (u.enrolledMeans.includes(enrollAmrId)) return u;
        return { ...u, enrolledMeans: [...u.enrolledMeans, enrollAmrId] };
      });
      return { ...prev, users };
    });
  }

  function validateSelectedAmrNow() {
    if (!selectedSession || !validateAmrId) return;

    const now = Date.now().toString();

    setModel((prev) => {
      const sessions = prev.sessions.map((s) => {
        if (s.id !== selectedSession.id) return s;
        return {
          ...s,
          pastAuthenticationActions: [...s.pastAuthenticationActions, { id: validateAmrId, validatedAt: now }],
        };
      });
      return { ...prev, sessions };
    });
  }

  function removeEnrolledMean(amrId: string) {
    if (!selectedUser) return;

    setModel((prev) => {
      const users = prev.users.map((u) => {
        if (u.id !== selectedUser.id) return u;
        return {
          ...u,
          enrolledMeans: u.enrolledMeans.filter((id) => id !== amrId),
        };
      });
      return { ...prev, users };
    });
  }

  function removePastAuthenticationAction(index: number) {
    if (!selectedSession) return;

    setModel((prev) => {
      const sessions = prev.sessions.map((s) => {
        if (s.id !== selectedSession.id) return s;
        return {
          ...s,
          pastAuthenticationActions: s.pastAuthenticationActions.filter((_, i) => i !== index),
        };
      });
      return { ...prev, sessions };
    });
  }

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Alma ACR Simulator</div>
            <div style={{ color: "#4b5563", marginTop: 4 }}>
              Display mode for readability, JSON edit mode for power edits.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!editMode ? (
              <>
                <Button variant="outline" onClick={startEdit}>
                  Edit JSON
                </Button>
                <Button variant="outline" onClick={resetToDefault}>
                  Reset
                </Button>
              </>
            ) : (
              <>
                <Button onClick={applyEditors}>Apply</Button>
                <Button variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "#fee2e2",
              border: "1px solid #fecaca",
              color: "#7f1d1d",
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {/* LEFT */}
          <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
            {!editMode ? (
              <>
                <Panel title="AMRs">
                  <Table>
                    <thead>
                      <tr>
                        <Th>id</Th>
                        <Th>type</Th>
                        <Th>category</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.amrs.map((a) => (
                        <tr key={a.id}>
                          <Td>
                            <code>{a.id}</code>
                          </Td>
                          <Td>
                            <Badge>{a.type}</Badge>
                          </Td>
                          <Td>
                            <Badge>{a.category}</Badge>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>

                <Panel title="ACRs">
                  {Object.entries(model.acr).map(([acrName, options]) => (
                    <div key={acrName} style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>{acrName}</div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {options.map((opt, i) => (
                          <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
                              Option {i + 1} (OR)
                            </div>
                            <Table>
                              <thead>
                                <tr>
                                  <Th>requirement #</Th>
                                  <Th>type</Th>
                                  <Th>maxAge (s)</Th>
                                </tr>
                              </thead>
                              <tbody>
                                {opt.map((req, j) => (
                                  <tr key={j}>
                                    <Td>{j + 1}</Td>
                                    <Td>
                                      <Badge>{req.type}</Badge>
                                    </Td>
                                    <Td>
                                      <code>{req.maxAge}</code>
                                    </Td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </Panel>

                <Panel title="Users">
                  <Table>
                    <thead>
                      <tr>
                        <Th>id</Th>
                        <Th>enrolledMeans</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.users.map((u) => (
                        <tr key={u.id}>
                          <Td>
                            <code>{u.id}</code>
                          </Td>
                          <Td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {u.enrolledMeans.map((m) => (
                                <Badge key={m}>
                                  <code>{m}</code>
                                </Badge>
                              ))}
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>

                <Panel title="Sessions">
                  {model.sessions.map((s) => (
                    <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, marginBottom: 10 }}>
                      <div style={{ fontWeight: 800 }}>
                        Session <code>{s.id}</code> <span style={{ color: "#6b7280", fontWeight: 600 }}>(user: {s.userId})</span>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>pastAuthenticationActions</div>
                        {s.pastAuthenticationActions.length === 0 ? (
                          <div style={{ color: "#6b7280" }}>None</div>
                        ) : (
                          <Table>
                            <thead>
                              <tr>
                                <Th>amrId</Th>
                                <Th>validatedAt</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.pastAuthenticationActions.map((a, idx) => (
                                <tr key={`${a.id}-${idx}`}>
                                  <Td>
                                    <code>{a.id}</code>
                                  </Td>
                                  <Td>
                                    <div style={{ display: "grid", gap: 2 }}>
                                      <code>{formatParisDateTime(a.validatedAt)}</code>
                                      <span style={{ fontSize: 12, color: "#6b7280" }}>{a.validatedAt}</span>
                                    </div>
                                  </Td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        )}
                      </div>
                    </div>
                  ))}
                </Panel>
              </>
            ) : (
              <>
                <Panel title="Edit AMRs (JSON)">
                  <textarea
                    value={amrsText}
                    onChange={(e) => setAmrsText(e.target.value)}
                    style={{ width: "100%", minHeight: 160, fontFamily: "ui-monospace, Menlo, monospace" }}
                  />
                </Panel>

                <Panel title="Edit ACRs (JSON)">
                  <textarea
                    value={acrText}
                    onChange={(e) => setAcrText(e.target.value)}
                    style={{ width: "100%", minHeight: 200, fontFamily: "ui-monospace, Menlo, monospace" }}
                  />
                </Panel>

                <Panel title="Edit Users (JSON)">
                  <textarea
                    value={usersText}
                    onChange={(e) => setUsersText(e.target.value)}
                    style={{ width: "100%", minHeight: 160, fontFamily: "ui-monospace, Menlo, monospace" }}
                  />
                </Panel>

                <Panel title="Edit Sessions (JSON)">
                  <textarea
                    value={sessionsText}
                    onChange={(e) => setSessionsText(e.target.value)}
                    style={{ width: "100%", minHeight: 220, fontFamily: "ui-monospace, Menlo, monospace" }}
                  />
                </Panel>
              </>
            )}
          </div>

          {/* RIGHT */}
          <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>User session</div>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    style={{ padding: 8, borderRadius: 10 }}
                    disabled={editMode}
                  >
                    {model.sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} (user: {s.userId})
                      </option>
                    ))}
                  </select>
                </div>
            <Panel title="Selected session">
              {selectedSession && selectedUser ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge>
                      session: <code style={{ marginLeft: 6 }}>{selectedSession.id}</code>
                    </Badge>
                    <Badge>
                      user: <code style={{ marginLeft: 6 }}>{selectedUser.id}</code>
                    </Badge>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#6b7280" }}>Enrolled means</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {selectedUser.enrolledMeans.length === 0 ? (
                        <span style={{ color: "#6b7280" }}>None</span>
                      ) : (
                        selectedUser.enrolledMeans.map((m) => (
                          <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Badge>
                              <code>{m}</code>
                            </Badge>
                            <button
                              onClick={() => removeEnrolledMean(m)}
                              disabled={editMode}
                              title="Remove enrolled mean"
                              style={{
                                border: "1px solid #e5e7eb",
                                background: "white",
                                borderRadius: 999,
                                width: 22,
                                height: 22,
                                lineHeight: "20px",
                                cursor: editMode ? "not-allowed" : "pointer",
                                color: "#6b7280",
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#6b7280" }}>Past authentication actions</div>
                    {selectedSession.pastAuthenticationActions.length === 0 ? (
                      <div style={{ color: "#6b7280" }}>None</div>
                    ) : (
                      <Table>
                        <thead>
                          <tr>
                            <Th>amrId</Th>
                            <Th>validatedAt</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSession.pastAuthenticationActions.map((a, idx) => (
                            <tr key={`${a.id}-${idx}`}>
                              <Td>
                                <code>{a.id}</code>
                              </Td>
                              <Td>
                                <div style={{ display: "grid", gap: 2 }}>
                                  <code>{formatParisDateTime(a.validatedAt)}</code>
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>{a.validatedAt}</span>
                                </div>
                              </Td>
                              <Td>
                                <button
                                  onClick={() => removePastAuthenticationAction(idx)}
                                  disabled={editMode}
                                  title="Delete authentication action"
                                  style={{
                                    border: "1px solid #e5e7eb",
                                    background: "white",
                                    borderRadius: 10,
                                    padding: "6px 10px",
                                    cursor: editMode ? "not-allowed" : "pointer",
                                    color: "#6b7280",
                                  }}
                                >
                                  Delete
                                </button>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ color: "#6b7280" }}>No session selected.</div>
              )}
            </Panel>

            <Panel title="Simulator">
              <div style={{ display: "grid", gap: 10 }}>
                

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Required ACR</div>
                  <select
                    value={selectedAcr}
                    onChange={(e) => setSelectedAcr(e.target.value)}
                    style={{ padding: 8, borderRadius: 10 }}
                    disabled={editMode}
                  >
                    {acrKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Result</div>
                  <pre
                    style={{
                      margin: 0,
                      padding: 10,
                      borderRadius: 12,
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      overflowX: "auto",
                    }}
                  >
                    {pretty(checkResult)}
                  </pre>
                </div>
              </div>
            </Panel>

            <Panel title="Actions">
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Enroll AMR (for session user)</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={enrollAmrId}
                      onChange={(e) => setEnrollAmrId(e.target.value)}
                      style={{ padding: 8, borderRadius: 10, flex: 1 }}
                      disabled={editMode}
                    >
                      {availableEnrollAmrs.length === 0 ? <option value="">No AMR to enroll</option> : null}
                      {availableEnrollAmrs.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                    <Button onClick={enrollSelectedAmr} disabled={editMode || !enrollAmrId} variant="outline">
                      Enroll
                    </Button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Validate AMR now (authentication event)</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={validateAmrId}
                      onChange={(e) => setValidateAmrId(e.target.value)}
                      style={{ padding: 8, borderRadius: 10, flex: 1 }}
                      disabled={editMode}
                    >
                      {availableValidateAmrs.length === 0 ? <option value="">No enrolled AMR</option> : null}
                      {availableValidateAmrs.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                    <Button onClick={validateSelectedAmrNow} disabled={editMode || !validateAmrId}>
                      Validate now
                    </Button>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <div style={{ color: "#6b7280", marginTop: 12, fontSize: 12 }}>
          Tip: categories are now used to enforce strong authentication with two different single-factor categories.
        </div>
      </div>
    </div>
  );
}