export interface LatLng {
  lat: number;
  lng: number;
}

export interface Il {
  id: number;
  ad: string;
  kod: number;
}

export interface Ilce {
  ilceKodu: number;
  ilceAdi: string;
  ilKodu: number;
}

export interface Mahalle {
  mahalleKodu: number;
  mahalleAdi: string;
  ilceKodu: number;
}

export interface ParselGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

export interface Parsel {
  mahalleKodu: number | null;
  ilKodu: number | null;
  ilceKodu: number | null;
  adaNo: number;
  parselNo: number;
  alan: number;
  nitelik: string;
  pafta: string;
  ilAd: string;
  ilceAd: string;
  mahalleAd: string;
  durum: string;
  gittigiParseller: string[];
  geometri: ParselGeometry;
  merkezNokta: LatLng;
  koordinatlar: LatLng[];
}

export interface Blok {
  blok: string;
  bagimsizBolumSayisi: number;
  zeminKmdurum: string;
  atZeminId: number | null;
  mahalleId: number;
  adaNo: string;
  parselNo: string;
  bagimsizBolumler?: BagimsizBolum[];
}

export interface BagimsizBolum {
  tip: string;
  kat: string;
  giris: string;
  nitelik: string;
  no: string;
  blok: string;
  durum: string;
}
