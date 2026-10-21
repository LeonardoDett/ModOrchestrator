import { useEffect, useState } from "react";
import { useBackend } from "../../bridge/backend-context";
import type { SaveEntry } from "../../bridge/types";
import type { Translator } from "../../i18n/i18n";

/** "Save 142", "Rápido" or "Automático". */
export function saveKindText(i18n: Translator, s: SaveEntry): string {
  if (s.kind === "quick") return i18n.t("saves.kind.quick");
  if (s.kind === "auto") return i18n.t("saves.kind.auto");
  return s.number > 0 ? i18n.t("saves.kind.manual", { number: s.number }) : i18n.t("saves.kind.manualPlain");
}

/** The date inside the game: "Dia 41" (short) or "Dia 41, 14h20". */
export function gameTimeText(i18n: Translator, s: SaveEntry, short: boolean): string {
  if (s.gameDay <= 0) return s.gameTime;
  if (short) return i18n.t("saves.gameDay", { day: s.gameDay });
  const time = `${String(s.gameHour).padStart(2, "0")}:${String(s.gameMinute).padStart(2, "0")}`;
  return i18n.t("saves.gameTime", { day: s.gameDay, hour: s.gameHour, minute: String(s.gameMinute).padStart(2, "0"), time });
}

// Screenshots by save: a save never changes once written, so the picture of
// a name and time is kept for the session.
const shots = new Map<string, Promise<string>>();

/** The screenshot of a save as a data URL, or "" while loading or when none. */
export function useScreenshot(instance: string, s: SaveEntry): string {
  const backend = useBackend();
  const [src, setSrc] = useState("");
  const key = `${instance}|${s.name}|${s.modTime}`;
  useEffect(() => {
    if (!s.hasScreenshot) {
      setSrc("");
      return;
    }
    let live = true;
    let p = shots.get(key);
    if (!p) {
      p = backend.saveScreenshot(instance, s.name).catch(() => "");
      shots.set(key, p);
    }
    void p.then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [backend, instance, key, s.hasScreenshot, s.name]);
  return src;
}
