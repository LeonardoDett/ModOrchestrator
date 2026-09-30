import { useEffect, useState } from "react";
import { useBackend } from "./backend-context";
import type { AppInfo } from "./types";

export function useAppInfo(): AppInfo | null {
  const backend = useBackend();
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    if (!backend.connected) return;
    let alive = true;
    backend.getAppInfo().then((value) => alive && setInfo(value), () => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [backend]);
  return info;
}
