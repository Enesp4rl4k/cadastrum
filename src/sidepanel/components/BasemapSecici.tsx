import { useState } from "react";
import { listBasemaps, type BasemapId } from "../../lib/basemaps";

interface Props {
  active: BasemapId;
  onChange: (id: BasemapId) => void;
}

export function BasemapSecici({ active, onChange }: Props) {
  const [acik, setAcik] = useState(false);
  const aktif = listBasemaps().find((b) => b.id === active) ?? listBasemaps()[0]!;

  return (
    <div className="absolute right-2 top-2 z-10">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="rounded border border-slate-300 bg-white/95 px-2 py-1 text-[11px] font-medium shadow hover:bg-white"
        title="Harita türü"
      >
        {aktif.ikon} {aktif.ad}
      </button>
      {acik && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setAcik(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded border border-slate-300 bg-white shadow-lg">
            {listBasemaps().map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onChange(b.id);
                  setAcik(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-slate-50 ${
                  b.id === active ? "bg-tkgm-primary/10 font-medium" : ""
                }`}
              >
                <span>{b.ikon}</span>
                <span>{b.ad}</span>
                {b.id === active && (
                  <span className="ml-auto text-tkgm-primary">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
