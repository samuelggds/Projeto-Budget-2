import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

const isTauri = () =>
  !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

export function AppNotifications() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/plugin-updater")
      .then(({ check }) => check())
      .then((u) => {
        if (u?.available) setUpdate(u);
      })
      .catch((error) => {
        console.error("[Updater] Falha ao verificar atualizações:", error);
      });
  }, []);

  const handleUpdate = async () => {
    if (!update || installing) return;
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      console.error("[Updater] Falha ao instalar atualização:", error);
      setInstalling(false);
    }
  };

  return (
    <>
      {!isOnline && (
        <div style={styles.offlineBanner}>
          ⚠️ Sem conexão com a internet — mantenha o aplicativo sempre conectado
          para salvar dados e receber atualizações.
        </div>
      )}
      {update && (
        <div style={styles.updateBanner}>
          <span>
            🚀 Nova versão <strong>v{update.version}</strong> disponível!
          </span>
          <button
            onClick={handleUpdate}
            disabled={installing}
            style={styles.updateBtn}
          >
            {installing ? "Atualizando..." : "Atualizar agora"}
          </button>
        </div>
      )}
    </>
  );
}

const styles = {
  offlineBanner: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    background: "#c0392b",
    color: "#fff",
    textAlign: "center" as const,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 500,
    zIndex: 10000,
    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
    letterSpacing: 0.2,
  },
  updateBanner: {
    position: "fixed" as const,
    bottom: 20,
    right: 20,
    background: "#1565c0",
    color: "#fff",
    padding: "12px 16px",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    gap: 14,
    fontSize: 14,
    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
    zIndex: 10000,
  },
  updateBtn: {
    background: "#fff",
    color: "#1565c0",
    border: "none",
    borderRadius: 4,
    padding: "6px 14px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
};
