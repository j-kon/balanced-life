import { useEffect, useState } from "react";
import { api } from "../api";

export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    setData(null);
    api<T>(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [path, version]);

  return { data, error, reload: () => setVersion((v) => v + 1) };
}

