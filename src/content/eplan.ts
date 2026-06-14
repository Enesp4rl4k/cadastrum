import {
  EPLAN_STORAGE_KEY,
  EPLAN_URL,
  type EPlanImarVerisi,
  ePlanParselKey,
} from "../lib/eplan";

function textOf(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function valueOfInput(patterns: string[]): string | null {
  const lowerPatterns = patterns.map((p) => p.toLocaleLowerCase("tr"));
  const nodes = Array.from(document.querySelectorAll("input, textarea, select"));
  for (const node of nodes) {
    const html = [
      node.getAttribute("id"),
      node.getAttribute("name"),
      node.getAttribute("placeholder"),
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      textOf(node.closest("label")),
      textOf(node.previousElementSibling),
      textOf(node.parentElement?.previousElementSibling ?? null),
    ]
      .join(" ")
      .toLocaleLowerCase("tr");
    if (!lowerPatterns.some((p) => html.includes(p))) continue;
    if (node instanceof HTMLSelectElement) {
      const option = node.selectedOptions[0];
      const value = option?.textContent?.trim() ?? node.value.trim();
      return value || null;
    }
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      const value = node.value.trim();
      return value || null;
    }
  }
  return null;
}

function selectedTextByIndex(index: number): string | null {
  const select = document.querySelectorAll("select")[index];
  if (!(select instanceof HTMLSelectElement)) return null;
  const text = select.selectedOptions[0]?.textContent?.trim() ?? select.value.trim();
  return text || null;
}

function sayiAyikla(pattern: RegExp, line: string): number | null {
  const match = line.match(pattern);
  if (!match) return null;
  const raw = match[1]?.replace(",", ".").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function gorunurSatirlar(): string[] {
  const bodyText = document.body.innerText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const anahtarlar = [
    "imar",
    "plan",
    "kullanım",
    "kullanim",
    "konut",
    "ticaret",
    "sanayi",
    "turizm",
    "tarım",
    "tarim",
    "sit",
    "koruma",
    "taks",
    "kaks",
    "emsal",
    "yençok",
    "yencok",
    "kat",
    "nizam",
    "lejant",
  ];

  return bodyText.filter((line) =>
    anahtarlar.some((anahtar) => line.toLocaleLowerCase("tr").includes(anahtar)),
  );
}

function parseEPlan(): EPlanImarVerisi | null {
  const ilAd =
    valueOfInput(["il"]) ??
    selectedTextByIndex(0);
  const ilceAd =
    valueOfInput(["ilçe", "ilce"]) ??
    selectedTextByIndex(1);
  const mahalleAd =
    valueOfInput(["mahalle"]) ??
    selectedTextByIndex(2);
  const adaText = valueOfInput(["ada"]);
  const parselText = valueOfInput(["parsel"]);
  const pin = valueOfInput(["pin"]);
  const adaNo = adaText ? Number(adaText.replace(/[^\d]/g, "")) : null;
  const parselNo = parselText ? Number(parselText.replace(/[^\d]/g, "")) : null;
  const satirlar = gorunurSatirlar();

  if (!adaNo || !parselNo) return null;
  if (satirlar.length === 0) return null;

  const lineOf = (keywords: string[]) =>
    satirlar.find((line) =>
      keywords.some((keyword) => line.toLocaleLowerCase("tr").includes(keyword)),
    ) ?? null;

  const kullanimKarari =
    lineOf(["konut", "villa", "ticaret", "sanayi", "turizm", "tarım", "tarim", "sit", "koruma"]) ??
    null;
  const planKarari =
    lineOf(["plan kararı", "plan karari", "lejant", "uygulama imar", "nazım imar", "nazim imar"]) ??
    null;
  const yapiNizami =
    lineOf(["nizam", "ayrık", "ayrik", "bitişik", "bitisik", "blok nizam"]) ??
    null;
  const planNotu = satirlar.slice(0, 6).join(" · ");
  const emsal = satirlar.map((s) => sayiAyikla(/(?:kaks|emsal)\s*[:=]?\s*(\d+[.,]?\d*)/i, s)).find((v) => v != null) ?? null;
  const taks = satirlar.map((s) => sayiAyikla(/taks\s*[:=]?\s*(\d+[.,]?\d*)/i, s)).find((v) => v != null) ?? null;
  const maksKat =
    satirlar.map((s) => sayiAyikla(/(?:maks(?:imum)?\s*kat|yençok|yencok|kat adedi)\s*[:=]?\s*(\d+[.,]?\d*)/i, s)).find((v) => v != null) ??
    satirlar.map((s) => sayiAyikla(/(\d+[.,]?\d*)\s*kat/i, s)).find((v) => v != null) ??
    null;

  const guvenSkoru = Math.min(
    95,
    25 +
      (kullanimKarari ? 20 : 0) +
      (planKarari ? 15 : 0) +
      (yapiNizami ? 10 : 0) +
      (emsal != null ? 10 : 0) +
      (taks != null ? 10 : 0) +
      (maksKat != null ? 10 : 0),
  );

  return {
    parselKey: ePlanParselKey({ ilAd, ilceAd, mahalleAd, adaNo, parselNo }),
    kaynakUrl: EPLAN_URL,
    yakalandiAt: Date.now(),
    ilAd,
    ilceAd,
    mahalleAd,
    adaNo,
    parselNo,
    pin,
    kullanimKarari,
    planKarari,
    planNotu,
    yapiNizami,
    emsal,
    taks,
    maksKat,
    hamMetin: satirlar.slice(0, 12),
    guvenSkoru,
  };
}

let sonHash = "";

async function yakalaVeKaydet() {
  const veri = parseEPlan();
  if (!veri) return;
  const hash = JSON.stringify(veri);
  if (hash === sonHash) return;
  sonHash = hash;
  await chrome.storage.local.set({ [EPLAN_STORAGE_KEY]: veri });
  console.log("[arsa:eplan] resmi imar verisi yakalandı", veri);
}

const debounced = (() => {
  let timer: number | null = null;
  return () => {
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void yakalaVeKaydet();
    }, 600);
  };
})();

debounced();
new MutationObserver(() => debounced()).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
});
