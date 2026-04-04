import React, { useState } from "react"

interface LanguagePreview {
    system_prompt: string
    user_message: string
    strings_in_language: number
    batches: number
}

interface TranslationPreview {
    total_strings: number
    total_batches: number
    batch_size: number
    provider: string
    previews: Record<string, LanguagePreview>
}

interface TranslationConfirmModalProps {
    preview: TranslationPreview
    onConfirm: () => void
    onCancel: () => void
}

const TranslationConfirmModal: React.FC<TranslationConfirmModalProps> = ({ preview, onConfirm, onCancel }) => {
    const languages = Object.keys(preview.previews)
    const [activeLang, setActiveLang] = useState(languages[0] || "")
    const [activeTab, setActiveTab] = useState<"system" | "user">("system")
    const langPreview = preview.previews[activeLang]

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}
            onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
        >
            <div className="glass-card" style={{ width: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column", padding: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h2 style={{ margin: 0 }}>Confirm Translation</h2>
                    <button className="btn btn-outline" onClick={onCancel} style={{ padding: "0.25rem 0.75rem" }}>Close</button>
                </div>

                <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Provider</span>
                        <div style={{ fontWeight: 600 }}>{preview.provider}</div>
                    </div>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Strings</span>
                        <div style={{ fontWeight: 600 }}>{preview.total_strings}</div>
                    </div>
                    <div>
                        <span style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>Batches</span>
                        <div style={{ fontWeight: 600 }}>{preview.total_batches} (size {preview.batch_size})</div>
                    </div>
                </div>

                {languages.length > 1 && (
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                        {languages.map((lang) => (
                            <button
                                key={lang}
                                className={`btn ${activeLang === lang ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setActiveLang(lang)}
                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                            >
                                {lang} ({preview.previews[lang].strings_in_language})
                            </button>
                        ))}
                    </div>
                )}

                {langPreview && (
                    <>
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                            <button
                                className={`btn ${activeTab === "system" ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setActiveTab("system")}
                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                            >
                                System Prompt
                            </button>
                            <button
                                className={`btn ${activeTab === "user" ? "btn-primary" : "btn-outline"}`}
                                onClick={() => setActiveTab("user")}
                                style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                            >
                                User Message (Batch 1 of {langPreview.batches})
                            </button>
                        </div>

                        <div style={{
                            flex: 1,
                            overflow: "auto",
                            background: "rgba(0,0,0,0.3)",
                            borderRadius: "8px",
                            border: "1px solid var(--glass-border)",
                            padding: "1rem",
                            marginBottom: "1rem",
                            minHeight: "300px",
                        }}>
                            <pre style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                fontSize: "0.85rem",
                                lineHeight: "1.6",
                                color: "var(--text-main)",
                                fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                            }}>
                                {activeTab === "system" ? langPreview.system_prompt : langPreview.user_message}
                            </pre>
                        </div>
                    </>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                    <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary" onClick={onConfirm}>
                        Translate {preview.total_strings} strings
                    </button>
                </div>
            </div>
        </div>
    )
}

export default TranslationConfirmModal
