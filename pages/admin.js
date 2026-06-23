import Head from "next/head";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/router";

const DEFAULT_FORM = {
  knowledgeText: "",
  embedModel: "nomic-embed-text",
  chunkSize: 700,
  overlap: 120,
};

function subscribeToUnlockState() {
  return () => {};
}

function getUnlockState() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem("iripple-admin-unlocked") === "true";
}

export default function AdminPage() {
  const router = useRouter();
  const isUnlocked = useSyncExternalStore(
    subscribeToUnlockState,
    getUnlockState,
    () => false,
  );
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState({
    chunkCount: 0,
    createdAt: null,
    knowledgePath: "",
    embeddingsPath: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadStatus = async () => {
    const response = await fetch("/api/admin/status");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load admin status");
    }

    setForm((current) => ({
      ...current,
      knowledgeText: data.knowledgeText || "",
      embedModel: data.embedModel || current.embedModel,
      chunkSize: data.chunkSize || current.chunkSize,
      overlap: data.overlap || current.overlap,
    }));

    setStatus({
      chunkCount: data.chunkCount || 0,
      createdAt: data.createdAt || null,
      knowledgePath: data.knowledgePath,
      embeddingsPath: data.embeddingsPath,
    });
  };

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!isUnlocked) {
      router.replace("/");
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      loadStatus().catch((error) => {
        setMessage(error.message || "Unable to load admin panel");
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isUnlocked, router]);

  const updateField = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: field === "chunkSize" || field === "overlap"
        ? Number(event.target.value)
        : event.target.value,
    }));
  };

  const saveKnowledge = async () => {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: form.knowledgeText }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save knowledge");
      }

      setMessage("knowledge.txt saved locally.");
    } catch (error) {
      setMessage(error.message || "Unable to save knowledge");
    } finally {
      setBusy(false);
    }
  };

  const rebuildEmbeddings = async () => {
    setBusy(true);
    setMessage("");

    try {
      const saveResponse = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: form.knowledgeText }),
      });
      const saveData = await saveResponse.json();

      if (!saveResponse.ok) {
        throw new Error(saveData.error || "Unable to save knowledge");
      }

      const response = await fetch("/api/admin/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embedModel: form.embedModel,
          chunkSize: form.chunkSize,
          overlap: form.overlap,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Embedding build failed");
      }

      await loadStatus();
      setMessage(`Embeddings rebuilt: ${data.chunkCount} chunks.`);
    } catch (error) {
      setMessage(error.message || "Embedding build failed");
    } finally {
      setBusy(false);
    }
  };

  if (!isUnlocked) {
    return null;
  }

  return (
    <>
      <Head>
        <title>iripple admin</title>
      </Head>

      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#27484b_0%,#0d171a_48%,#040708_100%)] px-4 py-8 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-[2.5rem] border border-white/10 bg-black/25 p-6 shadow-[0_0_120px_rgba(54,245,190,0.08)] backdrop-blur-sm sm:p-8">
          <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.38em] text-mint-100/55">
                Hidden Admin Layer
              </p>
              <h1 className="mt-3 font-display text-3xl text-mint-50">
                Offline Booth Control
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                This panel edits the local knowledge file and regenerates
                `data/embeddings.json` through the local llama.cpp embedding
                model configured in `.env`.
                Use `Ctrl + Shift + A` to return to the face.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
              <p>Chunks: {status.chunkCount}</p>
              <p>
                Last build: {status.createdAt ? new Date(status.createdAt).toLocaleString() : "never"}
              </p>
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between">
                <p className="text-[0.72rem] uppercase tracking-[0.36em] text-mint-100/55">
                  Knowledge Source
                </p>
                <p className="text-xs text-white/45">{status.knowledgePath}</p>
              </div>

              <textarea
                value={form.knowledgeText}
                onChange={updateField("knowledgeText")}
                spellCheck="false"
                className="mt-4 h-[28rem] w-full rounded-[1.4rem] border border-white/10 bg-[#071113] px-4 py-4 font-mono text-sm leading-6 text-mint-50 outline-none transition focus:border-mint-200/40"
              />
            </div>

            <div className="flex flex-col gap-6">
              <section className="rounded-[2rem] border border-white/10 bg-black/20 p-5">
                <p className="text-[0.72rem] uppercase tracking-[0.36em] text-mint-100/55">
                  Embedding Controls
                </p>

                <label className="mt-4 block text-sm text-white/75">
                  Embed model
                  <input
                    value={form.embedModel}
                    onChange={updateField("embedModel")}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-[#071113] px-4 py-3 font-mono text-sm text-mint-50 outline-none transition focus:border-mint-200/40"
                  />
                </label>

                <label className="mt-4 block text-sm text-white/75">
                  Chunk size
                  <input
                    type="number"
                    min="250"
                    step="10"
                    value={form.chunkSize}
                    onChange={updateField("chunkSize")}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-[#071113] px-4 py-3 font-mono text-sm text-mint-50 outline-none transition focus:border-mint-200/40"
                  />
                </label>

                <label className="mt-4 block text-sm text-white/75">
                  Overlap
                  <input
                    type="number"
                    min="40"
                    step="10"
                    value={form.overlap}
                    onChange={updateField("overlap")}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-[#071113] px-4 py-3 font-mono text-sm text-mint-50 outline-none transition focus:border-mint-200/40"
                  />
                </label>

                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={saveKnowledge}
                    disabled={busy}
                    className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:border-mint-200/40 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save knowledge text
                  </button>
                  <button
                    type="button"
                    onClick={rebuildEmbeddings}
                    disabled={busy}
                    className="rounded-2xl border border-mint-100/20 bg-mint-200/15 px-4 py-3 text-sm font-semibold text-mint-50 transition hover:border-mint-100/40 hover:bg-mint-200/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Rebuild embeddings
                  </button>
                </div>

                <p className="mt-4 text-xs leading-5 text-white/50">
                  Target output file: {status.embeddingsPath}
                </p>
                {message ? (
                  <p className="mt-4 text-sm leading-6 text-amber-100">
                    {message}
                  </p>
                ) : null}
              </section>

              <section className="rounded-[2rem] border border-white/10 bg-black/20 p-5 text-sm leading-6 text-white/70">
                <p className="text-[0.72rem] uppercase tracking-[0.36em] text-mint-100/55">
                  Production Notes
                </p>
                <p className="mt-4">
                  The visitor-facing screen stays on `/` and this page is only
                  reachable through the global macro. All inference remains
                  local through Whisper, llama.cpp, and in-process Kokoro ONNX.
                </p>
              </section>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
