import {
  Sun as SunIcon,
  Moon as MoonIcon,
  Monitor as MonitorIcon,
} from "lucide-react";
import { useTema, type Tema } from "../../lib/tema";

export function TemaSecici() {
  const { tema, ayarla } = useTema();

  const opts: { v: Tema; ikon: React.ReactNode; label: string }[] = [
    { v: "acik", ikon: <SunIcon className="h-3.5 w-3.5" />, label: "Açık" },
    { v: "koyu", ikon: <MoonIcon className="h-3.5 w-3.5" />, label: "Koyu" },
    { v: "sistem", ikon: <MonitorIcon className="h-3.5 w-3.5" />, label: "Sistem" },
  ];

  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => ayarla(o.v)}
          title={o.label}
          className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-3xs transition-colors ${
            tema === o.v
              ? "bg-white text-tkgm-primary shadow-sm dark:bg-slate-700 dark:text-blue-400"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {o.ikon}
        </button>
      ))}
    </div>
  );
}
