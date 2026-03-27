import { useState, useEffect, useCallback } from "react";

interface PromptTask {
  id: number;
  auditId: number;
  engine: string;
  query: string;
  systemPrompt: string;
  status: string;
  response: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface AuditGroup {
  auditId: number;
  tasks: PromptTask[];
  pendingCount: number;
  completedCount: number;
}

interface QueueResponse {
  audits: AuditGroup[];
  totalTasks: number;
}

const ENGINE_LINKS: Record<string, { label: string; url: string; color: string }> = {
  chatgpt: { label: "ChatGPT", url: "https://chat.openai.com", color: "#10a37f" },
  gemini: { label: "Gemini", url: "https://gemini.google.com", color: "#4285f4" },
  claude: { label: "Claude", url: "https://claude.ai", color: "#d97706" },
  grok: { label: "Grok", url: "https://x.com/i/grok", color: "#000000" },
  perplexity: { label: "Perplexity", url: "https://perplexity.ai", color: "#20b2aa" },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: "4px 12px",
        fontSize: "13px",
        background: copied ? "#22c55e" : "#3b82f6",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
      }}
    >
      {copied ? "Copied!" : "Copy Prompt"}
    </button>
  );
}

function TaskCard({
  task,
  onSubmitResponse,
}: {
  task: PromptTask;
  onSubmitResponse: (id: number, response: string) => Promise<void>;
}) {
  const [response, setResponse] = useState(task.response || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const engineInfo = ENGINE_LINKS[task.engine] || {
    label: task.engine,
    url: "#",
    color: "#666",
  };

  const fullPrompt = task.systemPrompt
    ? `System: ${task.systemPrompt}\n\nUser: ${task.query}`
    : task.query;

  const handleSubmit = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmitResponse(task.id, response);
    } catch (e: any) {
      setError(e.message || "Failed to submit");
    }
    setSubmitting(false);
  };

  const isCompleted = task.status === "completed";

  return (
    <div
      style={{
        border: `2px solid ${isCompleted ? "#22c55e" : engineInfo.color}`,
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "12px",
        background: isCompleted ? "#f0fdf4" : "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              background: engineInfo.color,
              color: "white",
              padding: "2px 10px",
              borderRadius: "12px",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            {engineInfo.label}
          </span>
          <span
            style={{
              background: isCompleted ? "#22c55e" : "#f59e0b",
              color: "white",
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: "11px",
            }}
          >
            {isCompleted ? "Done" : "Pending"}
          </span>
          <a
            href={engineInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "13px", color: engineInfo.color }}
          >
            Open {engineInfo.label} &rarr;
          </a>
        </div>
        <span style={{ fontSize: "12px", color: "#666" }}>#{task.id}</span>
      </div>

      <div
        style={{
          background: "#f8f9fa",
          borderRadius: "6px",
          padding: "10px",
          marginBottom: "8px",
          fontSize: "13px",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          maxHeight: "200px",
          overflow: "auto",
        }}
      >
        {fullPrompt}
      </div>

      <div style={{ marginBottom: "8px" }}>
        <CopyButton text={fullPrompt} />
      </div>

      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        disabled={isCompleted}
        placeholder="Paste the AI response here..."
        style={{
          width: "100%",
          minHeight: "120px",
          padding: "10px",
          border: "1px solid #ddd",
          borderRadius: "6px",
          fontFamily: "monospace",
          fontSize: "13px",
          resize: "vertical",
          boxSizing: "border-box",
          background: isCompleted ? "#f0fdf4" : "#fff",
        }}
      />

      {error && (
        <div style={{ color: "red", fontSize: "13px", marginTop: "4px" }}>
          {error}
        </div>
      )}

      {!isCompleted && (
        <button
          onClick={handleSubmit}
          disabled={submitting || !response.trim()}
          style={{
            marginTop: "8px",
            padding: "6px 16px",
            fontSize: "13px",
            background: submitting ? "#9ca3af" : "#22c55e",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit Response"}
        </button>
      )}
    </div>
  );
}

export default function AdminQueue() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completingAudit, setCompletingAudit] = useState<number | null>(null);
  const [completeResult, setCompleteResult] = useState<string>("");

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/queue");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleSubmitResponse = async (taskId: number, response: string) => {
    const res = await fetch(`/api/admin/queue/${taskId}/response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    // Refresh
    await fetchQueue();
  };

  const handleCompleteAudit = async (auditId: number) => {
    setCompletingAudit(auditId);
    setCompleteResult("");
    try {
      const res = await fetch(`/api/admin/queue/audit/${auditId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) {
        setCompleteResult(`Error: ${json.error}`);
      } else {
        setCompleteResult(json.message || `Audit ${auditId} completed! Score: ${json.score} (${json.grade})`);
        await fetchQueue();
      }
    } catch (e: any) {
      setCompleteResult(`Error: ${e.message}`);
    }
    setCompletingAudit(null);
  };

  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "24px" }}>Manual Prompt Queue</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={fetchQueue}
            style={{
              padding: "6px 16px",
              fontSize: "13px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
          <a
            href="/#/"
            style={{
              padding: "6px 16px",
              fontSize: "13px",
              background: "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "4px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Back to App
          </a>
        </div>
      </div>

      {loading && <p>Loading queue...</p>}
      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            padding: "12px",
            borderRadius: "6px",
            color: "#991b1b",
            marginBottom: "16px",
          }}
        >
          Error: {error}
        </div>
      )}

      {completeResult && (
        <div
          style={{
            background: completeResult.startsWith("Error") ? "#fef2f2" : "#f0fdf4",
            border: `1px solid ${completeResult.startsWith("Error") ? "#fca5a5" : "#86efac"}`,
            padding: "12px",
            borderRadius: "6px",
            color: completeResult.startsWith("Error") ? "#991b1b" : "#166534",
            marginBottom: "16px",
          }}
        >
          {completeResult}
        </div>
      )}

      {data && data.audits.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            color: "#6b7280",
            background: "#f9fafb",
            borderRadius: "8px",
          }}
        >
          <p style={{ fontSize: "18px", marginBottom: "8px" }}>No prompt tasks in queue</p>
          <p style={{ fontSize: "14px" }}>
            Submit an audit with <code>mode: "manual"</code> to generate prompt tasks.
          </p>
        </div>
      )}

      {data &&
        data.audits.map((group) => {
          const allCompleted = group.pendingCount === 0 && group.completedCount > 0;
          return (
            <div
              key={group.auditId}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "20px",
                marginBottom: "24px",
                background: "#fafafa",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                  borderBottom: "1px solid #e5e7eb",
                  paddingBottom: "12px",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: "18px" }}>
                    Audit #{group.auditId}
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "13px",
                      color: "#6b7280",
                    }}
                  >
                    {group.completedCount}/{group.tasks.length} completed
                    {group.pendingCount > 0 &&
                      ` | ${group.pendingCount} pending`}
                  </p>
                </div>

                {allCompleted && (
                  <button
                    onClick={() => handleCompleteAudit(group.auditId)}
                    disabled={completingAudit === group.auditId}
                    style={{
                      padding: "8px 20px",
                      fontSize: "14px",
                      fontWeight: "bold",
                      background:
                        completingAudit === group.auditId
                          ? "#9ca3af"
                          : "#8b5cf6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor:
                        completingAudit === group.auditId
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {completingAudit === group.auditId
                      ? "Processing..."
                      : "Complete Audit"}
                  </button>
                )}
              </div>

              {group.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onSubmitResponse={handleSubmitResponse}
                />
              ))}
            </div>
          );
        })}

      <div
        style={{
          marginTop: "32px",
          padding: "16px",
          background: "#f0f9ff",
          borderRadius: "8px",
          fontSize: "13px",
          color: "#1e40af",
        }}
      >
        <strong>How to use:</strong>
        <ol style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
          <li>Click "Copy Prompt" to copy the full prompt for a task</li>
          <li>Click the engine link to open the AI chat</li>
          <li>Paste the prompt and get the response</li>
          <li>Paste the response back in the textarea and click "Submit Response"</li>
          <li>When all tasks for an audit are done, click "Complete Audit" to run scoring</li>
        </ol>
      </div>
    </div>
  );
}
