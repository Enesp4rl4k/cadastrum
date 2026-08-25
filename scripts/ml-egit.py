#!/usr/bin/env python3
"""
Cadastrum ML Fiyat Modeli Eğitimi

Gereksinimler:
    pip install scikit-learn xgboost onnx skl2onnx pandas numpy

Kullanım:
    python scripts/ml-egit.py data/ml-egitim-verisi.csv

Çıktı:
    data/cadastrum-fiyat-v1.onnx   ← Cloudflare Workers AI'ya yüklenecek model
    data/ml-model-rapor.json       ← MAPE, R², feature importance

Workers AI deploy:
    wrangler ai models upload cadastrum-fiyat-v1 data/cadastrum-fiyat-v1.onnx
"""

import sys
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_percentage_error, r2_score
from sklearn.pipeline import Pipeline

try:
    import xgboost as xgb
    XGB_MEVCUT = True
except ImportError:
    XGB_MEVCUT = False
    print("⚠️  XGBoost yüklü değil — LightGBM veya RandomForest fallback")

try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    ONNX_MEVCUT = True
except ImportError:
    ONNX_MEVCUT = False
    print("⚠️  skl2onnx yüklü değil — ONNX export yapılamayacak")

# ── Sabitler ─────────────────────────────────────────────────────────────────

FEATURE_ISIMLERI = [
    "log_alan_m2",
    "imar_sinifi",
    "il_kod",
    "ilce_kod",
    "nufus_yogunluk",
    "deprem_pga",
    "sahil_var",
    "yil",
    "ay",
]
TARGET = "log_fiyat_per_m2"


def veri_yukle(dosya_yolu: str) -> pd.DataFrame:
    """CSV yükle ve temel temizleme yap."""
    print(f"📥 Veri yükleniyor: {dosya_yolu}")
    df = pd.read_csv(dosya_yolu)
    print(f"   {len(df):,} satır yüklendi")

    # Eksik değer kontrolü
    eksik = df.isnull().sum().sum()
    if eksik > 0:
        print(f"   ⚠️  {eksik} eksik değer — satırlar atlanıyor")
        df = df.dropna()

    # Hedef sütun kontrolü
    if TARGET not in df.columns:
        raise ValueError(f"Hedef sütun '{TARGET}' bulunamadı!")

    for f in FEATURE_ISIMLERI:
        if f not in df.columns:
            raise ValueError(f"Feature sütunu '{f}' bulunamadı!")

    return df


def model_egit(df: pd.DataFrame) -> tuple:
    """Model eğit ve değerlendir."""
    X = df[FEATURE_ISIMLERI].values.astype(np.float32)
    y = df[TARGET].values.astype(np.float32)

    # Train/test split — %80/%20
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"\n📊 Veri bölme: {len(X_train):,} eğitim, {len(X_test):,} test")

    baslangic = time.time()

    if XGB_MEVCUT:
        print("\n🤖 XGBoost eğitimi başlıyor...")
        model = xgb.XGBRegressor(
            n_estimators=500,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            reg_alpha=0.1,
            reg_lambda=1.0,
            n_jobs=-1,
            random_state=42,
            verbosity=0,
        )
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=50,
        )

        # sklearn Pipeline wrapper — ONNX export için
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("model", xgb.XGBRegressor(
                n_estimators=model.best_iteration if hasattr(model, "best_iteration") else 500,
                max_depth=6, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8,
                n_jobs=-1, random_state=42, verbosity=0,
            ))
        ])
        pipeline.fit(X_train, y_train)
    else:
        # Fallback: RandomForestRegressor (daha yavaş ama xgboost gerektirmez)
        print("\n🤖 RandomForest eğitimi başlıyor (XGBoost yüklü değil)...")
        from sklearn.ensemble import RandomForestRegressor
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("model", RandomForestRegressor(
                n_estimators=200, max_depth=12,
                min_samples_leaf=5, n_jobs=-1, random_state=42,
            ))
        ])
        pipeline.fit(X_train, y_train)

    sure = time.time() - baslangic
    print(f"⏱️  Eğitim süresi: {sure:.1f} saniye")

    return pipeline, X_train, X_test, y_train, y_test


def degerlendirme_raporu(pipeline, X_test, y_test, X_train, y_train) -> dict:
    """Model performansını değerlendir."""
    # Test tahminleri (log alanında)
    y_pred_log = pipeline.predict(X_test)

    # Gerçek fiyat alanına dön (exp transform)
    y_gercek = np.exp(y_test)
    y_tahmin = np.exp(y_pred_log)

    mape = mean_absolute_percentage_error(y_gercek, y_tahmin) * 100
    r2 = r2_score(y_test, y_pred_log)  # log alanında R²

    # Medyan mutlak yüzde hata (MAPE'den daha kararlı)
    mutlak_yuzde_hatalar = np.abs((y_gercek - y_tahmin) / y_gercek) * 100
    medyan_mape = float(np.median(mutlak_yuzde_hatalar))

    # Train MAPE (overfitting kontrolü)
    y_train_pred = np.exp(pipeline.predict(X_train))
    y_train_gercek = np.exp(y_train)
    train_mape = mean_absolute_percentage_error(y_train_gercek, y_train_pred) * 100

    print(f"\n📈 Model Performansı:")
    print(f"   Test MAPE      : %{mape:.1f}")
    print(f"   Medyan MAPE    : %{medyan_mape:.1f}")
    print(f"   Train MAPE     : %{train_mape:.1f}")
    print(f"   R² (log alan)  : {r2:.3f}")
    print(f"   Overfitting    : {'⚠️' if (train_mape < mape * 0.5) else '✅'}")

    if mape > 30:
        print(f"\n   ⚠️  MAPE %{mape:.0f} yüksek — daha fazla veri veya feature engineering önerilir")
    elif mape < 15:
        print(f"\n   ✅ MAPE %{mape:.0f} hedef aralıkta (<15%)")

    # Feature importance (XGBoost varsa)
    son_model = pipeline.named_steps.get("model")
    fi = {}
    if hasattr(son_model, "feature_importances_"):
        for isim, onem in zip(FEATURE_ISIMLERI, son_model.feature_importances_):
            fi[isim] = float(onem)
        sirali = sorted(fi.items(), key=lambda x: x[1], reverse=True)
        print("\n   Feature Importance:")
        for isim, onem in sirali[:5]:
            print(f"     {isim:25s}: {onem:.3f}")

    return {
        "test_mape": round(mape, 2),
        "medyan_mape": round(medyan_mape, 2),
        "train_mape": round(train_mape, 2),
        "r2": round(r2, 3),
        "test_orneklem": len(X_test),
        "train_orneklem": len(X_train),
        "feature_importance": fi,
        "hedef_saglandı": mape < 25,
    }


def onnx_export(pipeline, cikti_yolu: str) -> bool:
    """Modeli ONNX formatına dönüştür."""
    if not ONNX_MEVCUT:
        print("\n⚠️  ONNX export atlandı (skl2onnx yüklü değil)")
        print("   pip install onnx skl2onnx")
        return False

    print(f"\n💾 ONNX export: {cikti_yolu}")
    try:
        initial_types = [("float_input", FloatTensorType([None, len(FEATURE_ISIMLERI)]))]
        onnx_model = convert_sklearn(pipeline, initial_types=initial_types, target_opset=17)

        with open(cikti_yolu, "wb") as f:
            f.write(onnx_model.SerializeToString())

        boyut_kb = Path(cikti_yolu).stat().st_size / 1024
        print(f"   ✅ Kaydedildi ({boyut_kb:.0f} KB)")

        if boyut_kb > 5000:
            print(f"   ⚠️  Model {boyut_kb:.0f}KB — Cloudflare Workers AI 5MB limiti var")

        return True
    except Exception as e:
        print(f"   ❌ ONNX export hatası: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Kullanım: python scripts/ml-egit.py data/ml-egitim-verisi.csv")
        sys.exit(1)

    veri_dosyasi = sys.argv[1]
    root = Path(veri_dosyasi).parent

    # 1. Veri yükle
    df = veri_yukle(veri_dosyasi)

    # 2. Model eğit
    pipeline, X_train, X_test, y_train, y_test = model_egit(df)

    # 3. Değerlendirme raporu
    rapor = degerlendirme_raporu(pipeline, X_test, y_test, X_train, y_train)

    # 4. ONNX export
    onnx_yolu = str(root / "cadastrum-fiyat-v1.onnx")
    onnx_basarili = onnx_export(pipeline, onnx_yolu)
    rapor["onnx_export"] = onnx_basarili

    # 5. Raporu kaydet
    rapor_yolu = str(root / "ml-model-rapor.json")
    with open(rapor_yolu, "w", encoding="utf-8") as f:
        json.dump(rapor, f, ensure_ascii=False, indent=2)
    print(f"\n📋 Rapor: {rapor_yolu}")

    # 6. Sonraki adımlar
    print("\n🚀 Sonraki adımlar:")
    if onnx_basarili:
        print(f"   1. wrangler ai models upload cadastrum-fiyat-v1 {onnx_yolu}")
        print("   2. wrangler.toml'a [ai] binding = \"AI\" ekle")
        print("   3. backend/api/src/lib/ml-model.ts implement et")
        print("   4. fiyat.ts'e mlTahmin() entegre et")
    else:
        print("   1. pip install onnx skl2onnx")
        print("   2. Bu scripti tekrar çalıştır")

    # Hedef kontrolü
    if rapor["hedef_saglandı"]:
        print(f"\n✅ Model hazır: MAPE %{rapor['test_mape']:.1f} < %25 hedef")
    else:
        print(f"\n⚠️  Hedef sağlanamadı: MAPE %{rapor['test_mape']:.1f} > %25")
        print("   Öneri: Daha fazla ilan verisi ekle (min 50k satır önerilir)")


if __name__ == "__main__":
    main()
