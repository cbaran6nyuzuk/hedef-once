export function replayTrustReport({ mode, diagnostics, integrityChecks, dataQuality }) {
  const passed = integrityChecks.filter((check) => check.passed).length;
  const total = integrityChecks.length;
  const fullPit = mode === "STRICT_POINT_IN_TIME_REPLAY";
  const hasFailedCheck = passed !== total;
  const title = fullPit ? "Tam canlı kayıt" : "Tarihsel canlandırma";
  const level = hasFailedCheck ? "BLOCKED" : fullPit ? "FULL_PIT" : "RECONSTRUCTED";
  const usableForOfficialForward = Boolean(dataQuality?.officialForwardCounterEligible);
  const plainStatus = hasFailedCheck
    ? "Sonuç yayımlanmamalı; bir bütünlük kontrolü başarısız."
    : fullPit
      ? "Bu test canlıda o anda yakalanmış veri katmanlarıyla çalıştı."
      : "Bu test fiyatı gerçek tarihsel mumdan okur; bazı katmanlar proxy ile tamamlanır.";

  const warnings = [];
  if (!fullPit) {
    warnings.push("Gerçek tarihsel bid/ask yok; giriş fiyatı muhafazakar spread proxy ile kuruldu.");
    warnings.push("Haberin sistemde ilk görülme anı bilinmiyor; yayın zamanı kullanıldı.");
    warnings.push("Bu mod resmi forward başarı sayacına katılmaz.");
  }
  if (diagnostics?.duplicateDecisionBars) warnings.push(`${diagnostics.duplicateDecisionBars} tekrar eden karar anı tekilleştirildi.`);

  return {
    title,
    level,
    plainStatus,
    usableForOfficialForward,
    passedChecks: passed,
    totalChecks: total,
    sourceLines: [
      ["Fiyat mumları", dataQuality?.marketBars ?? "Bilinmiyor"],
      ["Giriş fiyatı", dataQuality?.execution ?? "Bilinmiyor"],
      ["Haber", dataQuality?.news ?? "Bilinmiyor"],
      ["SEC", dataQuality?.filings ?? "Bilinmiyor"],
      ["Takvim", dataQuality?.calendar ?? "Bilinmiyor"]
    ],
    warnings,
    checks: integrityChecks
  };
}
