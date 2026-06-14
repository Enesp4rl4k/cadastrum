/**
 * Açık/koyu tema yönetimi.
 * Tailwind class-based dark mode + localStorage persist + sistem tercihi.
 */

import { useEffect, useState } from "react";

export type Tema = "acik" | "koyu" | "sistem";

const STORAGE_KEY = "tema";

export function temayiUygula(tema: Tema): void {
  const html = document.documentElement;
  let isDark: boolean;
  if (tema === "sistem") {
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } else {
    isDark = tema === "koyu";
  }
  html.classList.toggle("dark", isDark);
}

export function temayiYukle(): Tema {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "acik" || v === "koyu" || v === "sistem") return v;
  } catch {}
  return "sistem";
}

export function temayiSakla(tema: Tema): void {
  try {
    localStorage.setItem(STORAGE_KEY, tema);
  } catch {}
}

export function useTema(): {
  tema: Tema;
  ayarla: (t: Tema) => void;
  efektifKoyu: boolean;
} {
  const [tema, setTema] = useState<Tema>(() => temayiYukle());
  const [efektifKoyu, setEfektifKoyu] = useState(false);

  useEffect(() => {
    temayiUygula(tema);
    temayiSakla(tema);
    const html = document.documentElement;
    setEfektifKoyu(html.classList.contains("dark"));
  }, [tema]);

  // Sistem tercih değişimini dinle
  useEffect(() => {
    if (tema !== "sistem") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      temayiUygula("sistem");
      setEfektifKoyu(document.documentElement.classList.contains("dark"));
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [tema]);

  return {
    tema,
    ayarla: setTema,
    efektifKoyu,
  };
}
