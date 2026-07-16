/**
 * Vitest global setup — Dexie ve chrome API'lerini stub'la.
 *
 * tkgm-api.ts → db.ts → Dexie zinciri node ortamında çalışmaz (IndexedDB yok).
 * Bu setup dosyası Dexie modülünü minimal stub ile değiştirir.
 */
import { vi } from "vitest";

// Dexie stub — parselCache, aiFiyatCache vb. Dexie tablo çağrılarını yok say.
vi.mock("../src/lib/db", () => {
  const stubTable = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    where: vi.fn().mockReturnValue({ equals: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null), toArray: vi.fn().mockResolvedValue([]) }) }),
    toArray: vi.fn().mockResolvedValue([]),
    toCollection: vi.fn().mockReturnValue({ modify: vi.fn().mockResolvedValue(undefined) }),
  };
  return {
    db: {
      parselCache: stubTable,
      aiFiyatCache: stubTable,
      osmCevreCache: stubTable,
      depremRiskCache: stubTable,
      tucbsCdpCache: stubTable,
      ilanGozlem: stubTable,
      favoriler: stubTable,
      gecmis: stubTable,
      mahalleAlias: stubTable,
      detayKuyrugu: stubTable,
      fiyatTrendi: stubTable,
      bolgeTaramalari: stubTable,
      tkgmAnalizCache: stubTable,
      transaction: vi.fn().mockImplementation((_mode, _tables, fn) => fn()),
      on: vi.fn(),
    },
  };
});

// Chrome API stub — extension context yok
// @ts-expect-error global chrome stub
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
  },
};
