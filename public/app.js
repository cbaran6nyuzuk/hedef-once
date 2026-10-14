const state = {
  symbol: "MU",
  model: "quick",
  snapshot: null,
  loading: false,
  replayAvailability: null
};

const elements = Object.fromEntries([
  "connectionDot", "marketState", "sourceNotice", "decisionTitle", "decisionReason", "selectedSymbol",
  "livePrice", "dayChange", "lastMarketTime", "dataDelay", "dataCoverage", "entryValue", "targetValue",
  "timeValue", "decisionScore", "probabilityStatus", "quoteSubtitle", "metricChange", "metricVwap", "metricRange", "metricVolume", "memoryState",
  "metricBidAsk", "metricSpread", "sectorState", "vetoText", "priceLayer", "newsLayer", "calendarLayer",
  "executionLayer", "stopValue", "netTargetValue", "modelLayer", "signalTime", "scoreGrid", "hardVetoList",
  "softVetoList", "observedAt", "quoteGrid", "newsObservedAt", "newsList", "eventList", "refreshButton",
  "guidancePanel", "guidanceTitle", "guidanceSummary", "guidanceWaitFor", "metricChangeMeaning",
  "metricVwapMeaning", "metricRangeMeaning", "metricVolumeMeaning", "metricBidAskMeaning",
  "metricSpreadMeaning", "stopMeaning", "netTargetMeaning", "memoryMeaning", "sectorMeaning",
  "timingStatus", "riskStatus", "cycleNumber", "cyclePhaseSummary", "cycleRail", "cycleEvidence",
  "cycleNext", "cycleInvalidation", "motorEvidence", "scoreAuditList", "dataCorrectness",
  "calculationCorrectness", "predictionCorrectness", "backtestStatus", "backtestDays", "backtestLabels",
  "backtestActionable", "backtestExcluded", "backtestNote", "replayAvailability", "replayStart", "replayEnd",
  "replayButton", "replayPresetButton", "replayExplain", "replaySummary", "replayFullMoments", "replayCandidates", "replayIndependent",
  "replayTargetRate", "replayNetReturn", "replayDiagnostics", "replayResults", "systemAssurance",
  "systemAssuranceTitle", "systemAssuranceExplanation", "systemTrustInstruction", "assuranceMarketIcon",
  "assuranceMarket", "assuranceMarketDetail", "assuranceContextIcon", "assuranceContext", "assuranceContextDetail",
  "assuranceEngineIcon", "assuranceEngine", "assuranceEngineDetail", "assuranceParityIcon", "assuranceParity", "assuranceParityDetail",
  "paperCapital", "paperRisk", "paperAllocation", "paperConcurrent", "paperReport", "paperReturn",
  "paperInitial", "paperFinal", "paperProfit", "paperTrades", "paperDrawdown", "paperExplanation", "paperLedger",
  "paperReviews", "replayDay", "archiveCoverage", "historicalDate", "historicalReplayButton", "replayModeNotice",
  "replayTrust", "replayTrustTitle", "replayTrustBadge", "replayTrustPlain", "replayTruthList", "replayWarningList", "replayCheckList",
  "journalPanel", "journalTitle", "journalSaved", "journalRange", "journalRangeDetail", "journalParams", "journalParamDetail",
  "journalFunnel", "journalFunnelDetail", "journalCases", "journalCaseDetail", "journalCaseList", "savedRunList"
].map((id) => [id, document.getElementById(id)]));

function formatPrice(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " $"
    : "—";
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

function formatVolume(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatUsd(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : "—";
}

function formatClock(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

function stateLabel(value) {
  return ({ POSITIVE: "Pozitif", NEGATIVE: "Negatif", MIXED: "Karışık", UNKNOWN: "Bilinmiyor" })[value] ?? value ?? "—";
}

function layerState(element, connected, readyLabel = "Bağlı") {
  element.textContent = connected ? readyLabel : "Eksik";
  element.className = connected ? "positive" : "warning-text";
}

function ageText(seconds) {
  if (!Number.isFinite(seconds)) return "zaman bilinmiyor";
  if (seconds < 60) return `${Math.max(0, seconds)} saniye önce`;
  return `${Math.floor(seconds / 60)} dakika önce`;
}

function setAssuranceCheck(icon, title, passed, readyText, failedText) {
  icon.textContent = passed ? "✓" : "!";
  icon.className = passed ? "passed" : "failed";
  title.textContent = passed ? readyText : failedText;
  title.className = passed ? "positive" : "negative";
}

function renderSystemAssurance(system) {
  if (!system) {
    elements.systemAssurance.className = "system-assurance degraded";
    elements.systemAssuranceTitle.textContent = "Sistem durumu alınamadı";
    elements.systemAssuranceExplanation.textContent = "Canlı katmanları doğrulayamıyorum.";
    elements.systemTrustInstruction.textContent = "SİNYALE GÜVENME";
    return;
  }
  const degraded = system.state === "DEGRADED";
  elements.systemAssurance.className = `system-assurance ${degraded ? "degraded" : system.state === "LIVE_AND_SCORING" ? "live" : "waiting"}`;
  elements.systemAssuranceTitle.textContent = system.label;
  elements.systemAssuranceExplanation.textContent = system.plainExplanation;
  elements.systemTrustInstruction.textContent = degraded ? "SİNYALE GÜVENME" : system.state === "LIVE_AND_SCORING" ? "MOTOR KARAR ARIYOR" : "SİNYAL BEKLEME";

  const checks = system.checks ?? {};
  setAssuranceCheck(elements.assuranceMarketIcon, elements.assuranceMarket, checks.market?.passed, "Güncel ve tam", "Eksik veya eski");
  elements.assuranceMarketDetail.textContent = `${checks.market?.series ?? 0}/${checks.market?.requiredSeries ?? 19} seri · ${ageText(checks.market?.ageSeconds)}`;
  setAssuranceCheck(elements.assuranceContextIcon, elements.assuranceContext, checks.context?.passed, "Üçü de bağlı", "Bağlantı eksik");
  elements.assuranceContextDetail.textContent = `Haber ${checks.context?.news ? "✓" : "×"} · SEC ${checks.context?.filings ? "✓" : "×"} · Takvim ${checks.context?.calendar ? "✓" : "×"} · ${ageText(checks.context?.ageSeconds)}`;
  setAssuranceCheck(elements.assuranceEngineIcon, elements.assuranceEngine, checks.predictor?.passed, `Çalışıyor · v${system.engineVersion}`, "Güncel çalışmadı");
  elements.assuranceEngineDetail.textContent = `${ageText(checks.predictor?.ageSeconds)} · ${checks.predictor?.candidates ?? 0} aday`;
  setAssuranceCheck(elements.assuranceParityIcon, elements.assuranceParity, checks.replayParity?.passed, "Aynı motor ve kurallar", "Eşitlik doğrulanamadı");
  elements.assuranceParityDetail.textContent = `Motor kimliği ${system.engineFingerprint ?? "—"}`;
}

const vetoLabels = {
  INSUFFICIENT_HISTORY: "Yeterli 5 dk geçmişi yok",
  STALE_OR_MISSING_QUOTE: "Bid/ask eksik veya eski",
  OUTSIDE_REGULAR_SESSION: "Normal seans dışında",
  DELAYED_DECISION_CAPTURE: "Karar fiyatı geç yakalandı",
  TOO_LATE_FOR_TARGET_WINDOW: "Hedef için yeterli seans süresi kalmadı",
  OPEN_CHAOS_WINDOW: "Açılışın ilk 10 dakikası",
  SPREAD_TOO_WIDE: "Spread fazla geniş",
  INVALID_STOP: "Geçerli stop kurulamadı",
  STOP_TOO_WIDE: "Gerekli stop fazla uzak",
  RISK_REWARD_TOO_LOW: "Risk/getiri yetersiz",
  SECTOR_BREAKDOWN: "Sektör ETF'leri kırılıyor",
  NONPOSITIVE_NET_TARGET: "Maliyet sonrası hedef anlamsız",
  CONTEXT_DATA_MISSING: "Haber/takvim verisi eksik",
  NEWS_SENTIMENT_UNCLASSIFIED: "Yeni haberin yönü henüz sınıflanmadı",
  HIGH_IMPACT_EVENT_TODAY: "Bugün yüksek etkili olay var",
  MIXED_MEMORY_BASKET: "Memory grubu karışık",
  NO_VWAP_RECLAIM: "VWAP geri alımı yok",
  NEGATIVE_MEMORY_BASKET: "Memory grubu negatif",
  NO_ENTRY_TRIGGER: "Yakın giriş tetiği oluşmadı",
  ENTRY_TRIGGER_FORMING: "Yakın giriş tetiği hazırlanıyor",
  CHASING_PRICE: "Fiyat giriş için fazla uzadı"
};

const scoreLabels = {
  priceVolume: "Giriş zamanlaması",
  volatilityTime: "Hedef süresi",
  sectorBasket: "Memory/sektör",
  newsEvent: "Haber/olay",
  targetStop: "Hedef/stop",
  macro: "Genel piyasa",
  execution: "Giriş kalitesi",
  crowdedRisk: "Yorgunluk riski"
};

const scoreQuestions = {
  priceVolume: "Önümüzdeki kısa pencere için tetik oluştu mu?",
  volatilityTime: "Hedef beklenen sürede gelebilir mi?",
  sectorBasket: "Benzer hisseler destekliyor mu?",
  newsEvent: "Haber ve olay ortamı güvenli mi?",
  targetStop: "Alınan riske değer mi?",
  macro: "Genel piyasa long için uygun mu?",
  execution: "Giriş maliyeti uygun mu?",
  crowdedRisk: "Hisse fazla yorulmuş mu?"
};

function basketMeaning(stateValue, subject) {
  if (stateValue === "POSITIVE") return `${subject} bu long fikrini destekliyor.`;
  if (stateValue === "NEGATIVE") return `${subject} şu anda long fikrine karşı.`;
  if (stateValue === "MIXED") return `${subject} ortak bir yön göstermiyor; temkinli ol.`;
  return `${subject} için yeterli veri yok.`;
}

function renderGuidance(candidate) {
  const guidance = candidate?.userGuidance;
  const tone = (guidance?.tone ?? "WAIT").toLowerCase();
  elements.guidancePanel.className = `guidance-panel ${tone}`;
  elements.guidanceTitle.textContent = guidance?.action ?? "Verinin tamamlanmasını bekle";
  elements.guidanceSummary.textContent = guidance?.summary ?? "Karar motoru hazır bir yön üretmedi; şu anda işlem açma.";
  const items = guidance?.waitFor?.length ? guidance.waitFor : ["Canlı veri ve karar motoru bekleniyor."];
  elements.guidanceWaitFor.replaceChildren(...items.map((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }));
}

function renderCycle(candidate) {
  const cycle = candidate?.cycleAnalysis;
  elements.cycleNumber.textContent = cycle?.phase === "DATA_BUILDING" ? "…" : Number.isInteger(cycle?.phaseIndex) ? String(cycle.phaseIndex + 1) : "—";
  document.getElementById("cycleTitle").textContent = cycle?.label ?? "Döngü hesaplanıyor";
  elements.cyclePhaseSummary.textContent = cycle?.summary ?? "Tamamlanmış 5 dakikalık mumlar bekleniyor.";
  elements.cycleNext.textContent = cycle?.nextCondition ?? "—";
  elements.cycleInvalidation.textContent = cycle?.invalidation ?? "—";
  elements.cycleEvidence.replaceChildren(...((cycle?.evidence?.length ? cycle.evidence : ["Veri bekleniyor."]).map((message) => {
    const chip = document.createElement("small");
    chip.textContent = message;
    return chip;
  })));
  elements.cycleRail.querySelectorAll("[data-cycle-index]").forEach((step) => {
    const index = Number(step.dataset.cycleIndex);
    step.classList.toggle("active", cycle?.phase !== "DATA_BUILDING" && index === cycle?.phaseIndex);
    step.classList.toggle("passed", cycle?.phase !== "DATA_BUILDING" && index < cycle?.phaseIndex);
  });
}

function evidenceMeaning(key, value, candidate) {
  const meanings = {
    ret5m: Number.isFinite(value) ? (value > 0 ? "Son mum yukarı kapandı." : value < 0 ? "Son mum aşağı kapandı." : "Son mum yatay.") : "Ölçülemedi.",
    ret15m: Number.isFinite(value) ? (value > 0 ? "Kısa yön yukarı." : value < 0 ? "Kısa yön aşağı." : "Kısa yön dengede.") : "Ölçülemedi.",
    ema: Number.isFinite(candidate?.evidence?.ema3) && Number.isFinite(candidate?.evidence?.ema8)
      ? candidate.evidence.ema3 > candidate.evidence.ema8 ? "Hızlı ortalama önde; momentum olumlu." : "Hızlı ortalama geride; dönüş tamamlanmadı."
      : "Ölçülemedi.",
    rebound: Number.isFinite(value) ? (value > 0.008 ? "Hedefin büyük bölümü geçmiş; kovalamaya dikkat." : value >= 0.002 ? "Dipten anlamlı tepki var." : "Dipten tepki zayıf.") : "Ölçülemedi.",
    higherLow: value ? "Son dip bir öncekinden yukarıda." : "Yükselen dip henüz yok.",
    breakout3: value ? "Fiyat yakın tepeyi geçti." : "Yakın tepe henüz aşılmadı.",
    vwap: Number.isFinite(value) ? (value > 0 ? "Fiyat seans ortalamasının üzerinde." : "Fiyat seans ortalamasının altında.") : "Ölçülemedi.",
    volume: Number.isFinite(value) ? (value >= 1.2 ? "Son mum olağandan hacimli." : value >= 0.7 ? "Hacim normal aralıkta." : "Katılım zayıf.") : "Hacim oranı ölçülemedi.",
    atr: Number.isFinite(value) ? "Bir 5 dakikalık mumun olağan hareket kapasitesi." : "Ölçülemedi.",
    spread: Number.isFinite(value) ? (value <= 3 ? "Giriş maliyeti düşük." : value <= 10 ? "Maliyet kabul edilebilir." : "Giriş maliyeti fazla yüksek.") : "Ölçülemedi.",
    riskReward: Number.isFinite(value) ? (value >= 1.5 ? "Hedef stopa göre avantajlı." : value >= 1.2 ? "Asgari oran sağlanıyor." : "Alınan risk ödüle göre yüksek.") : "Ölçülemedi."
  };
  return meanings[key];
}

function renderMotorEvidence(candidate) {
  elements.motorEvidence.querySelectorAll(".evidence-row, .empty-state").forEach((item) => item.remove());
  if (!candidate) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Aday verisi bekleniyor.";
    elements.motorEvidence.append(empty);
    return;
  }
  const evidence = candidate.evidence ?? {};
  const rows = [
    ["Son 5 dakika", formatPercent(evidence.ret5m * 100), evidenceMeaning("ret5m", evidence.ret5m, candidate), "Dönüş mumunun ilk işareti"],
    ["Son 15 dakika", formatPercent(evidence.ret15m * 100), evidenceMeaning("ret15m", evidence.ret15m, candidate), "Satış mı toparlanma mı?"],
    ["EMA 3 / EMA 8", `${formatPrice(evidence.ema3)} / ${formatPrice(evidence.ema8)}`, evidenceMeaning("ema", null, candidate), "Kısa momentum teyidi"],
    ["Yakın dipten tepki", formatPercent(evidence.reboundFromRecentLowPct * 100), evidenceMeaning("rebound", evidence.reboundFromRecentLowPct, candidate), "Erken miyiz, geç mi kaldık?"],
    ["Yükselen dip", evidence.higherLow ? "Var" : "Yok", evidenceMeaning("higherLow", evidence.higherLow, candidate), "Dönüş yapısının teyidi"],
    ["3 mumluk tepe aşımı", evidence.breakout3 ? "Var" : "Yok", evidenceMeaning("breakout3", evidence.breakout3, candidate), "Yakın direnç kırılımı"],
    ["VWAP uzaklığı", formatPercent(evidence.vwapDistancePct * 100), evidenceMeaning("vwap", evidence.vwapDistancePct, candidate), "Seans ortalamasına göre konum"],
    ["Göreli hacim", Number.isFinite(evidence.volumeRatio) ? `${evidence.volumeRatio.toLocaleString("tr-TR")}×` : "—", evidenceMeaning("volume", evidence.volumeRatio, candidate), "Harekete katılım var mı?"],
    ["5 dk ATR", Number.isFinite(evidence.atr5mPct) ? formatPercent(evidence.atr5mPct * 100) : "—", evidenceMeaning("atr", evidence.atr5mPct, candidate), `Hedef süresi · ${evidence.atrPeriods ?? "—"} mum`],
    ["Spread", Number.isFinite(evidence.spreadBps) ? `${evidence.spreadBps.toLocaleString("tr-TR")} bps` : "—", evidenceMeaning("spread", evidence.spreadBps, candidate), "Uygulanabilir giriş maliyeti"],
    ["Hedef / stop oranı", Number.isFinite(candidate.riskReward) ? candidate.riskReward.toLocaleString("tr-TR") : "—", evidenceMeaning("riskReward", candidate.riskReward, candidate), "Hedef önce senaryosunun matematiği"]
  ];
  elements.motorEvidence.append(...rows.map(([name, current, meaning, role]) => {
    const row = document.createElement("div");
    row.className = "evidence-row";
    for (const value of [name, current, meaning, role]) {
      const cell = document.createElement("span");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
}

function formatAuditInput(component) {
  const value = component.input;
  if (!Number.isFinite(value)) return value ?? "—";
  if (["VWAP konumu", "Net hedef", "Stop sınırı"].includes(component.label)) return formatPercent(value * 100);
  if (["QQQ günlük yön", "SPY günlük yön", "VIX günlük değişim", "Aşırı hareket cezası", "Göreli güç"].includes(component.label)) return `${value.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}%`;
  if (component.label === "Göreli hacim") return `${value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}×`;
  if (component.label === "Spread cezası") return `${value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} bps`;
  if (component.label.includes("hedef/stop")) return value.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

function renderScoreAudit(candidate) {
  elements.scoreAuditList.replaceChildren();
  if (!candidate?.scoreAudit) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Puan denetimi bekleniyor.";
    elements.scoreAuditList.append(empty);
    elements.dataCorrectness.textContent = "Kontrol ediliyor";
    elements.calculationCorrectness.textContent = "Kontrol ediliyor";
    elements.predictionCorrectness.textContent = "Kanıt birikiyor";
    return;
  }

  for (const [key, audit] of Object.entries(candidate.scoreAudit)) {
    const details = document.createElement("details");
    details.className = "score-audit-item";
    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.innerHTML = `<b>${scoreLabels[key] ?? key}</b><small>${Math.round(audit.score)}/100 ham puan · ağırlık %${audit.weight}</small>`;
    const contribution = document.createElement("strong");
    contribution.textContent = `+${audit.weightedContribution.toLocaleString("tr-TR")} toplam puan`;
    summary.append(title, contribution);
    const status = document.createElement("p");
    status.className = "audit-status";
    status.textContent = "Formül ve matematik kontrol edilebilir · tahmin gücü forward doğrulama bekliyor";
    const parts = document.createElement("div");
    parts.className = "audit-parts";
    for (const component of audit.components ?? []) {
      const row = document.createElement("div");
      const points = Number.isFinite(component.points) ? `${component.points > 0 ? "+" : ""}${component.points}` : "—";
      row.innerHTML = `<span><b>${component.label}</b><small>${component.rule}</small></span><span>${formatAuditInput(component)}</span><strong class="${component.effect === "PENALTY" ? "negative" : component.points > 0 ? "positive" : "muted-text"}">${points}</strong>`;
      parts.append(row);
    }
    details.append(summary, status, parts);
    elements.scoreAuditList.append(details);
  }

  const lineage = candidate.dataLineage ?? {};
  const dataValid = lineage.pointInTimeOrderValid && Boolean(lineage.priceSource);
  const calculationValid = Number.isFinite(candidate.scoreAuditTotal) && Math.abs(candidate.scoreAuditTotal - candidate.decisionScore) <= 0.11;
  elements.dataCorrectness.textContent = dataValid ? (lineage.quoteQuality === "VALID" ? "Zaman sırası ve kaynak uygun" : "Zaman sırası uygun · kotasyon işlem için eksik") : "Veri izi eksik";
  elements.dataCorrectness.className = dataValid ? lineage.quoteQuality === "VALID" ? "positive" : "warning-text" : "negative";
  elements.calculationCorrectness.textContent = calculationValid ? `Tutarlı · ${candidate.scoreAuditTotal.toLocaleString("tr-TR")} puan` : "Toplam uyuşmuyor";
  elements.calculationCorrectness.className = calculationValid ? "positive" : "negative";
  elements.predictionCorrectness.textContent = Number.isFinite(candidate.pTargetFirst) ? "Kalibre edildi" : "Forward kalibrasyon bekliyor";
  elements.predictionCorrectness.className = Number.isFinite(candidate.pTargetFirst) ? "positive" : "warning-text";
}

function renderPrediction(predictions) {
  const candidate = predictions?.candidates?.find((item) => item.symbol === state.symbol && item.modelKey === state.model);
  if (!candidate) {
    elements.decisionScore.textContent = "—";
    elements.probabilityStatus.textContent = "Kalibrasyon bekliyor";
    elements.signalTime.textContent = "Sinyal bekleniyor";
    elements.timingStatus.textContent = "Bekleniyor";
    elements.riskStatus.textContent = "—";
    elements.scoreGrid.replaceChildren();
    renderGuidance(null);
    renderCycle(null);
    renderMotorEvidence(null);
    renderScoreAudit(null);
    return;
  }
  const decisionText = ({ NO_TRADE: "Uzak dur", WATCH: "İzle", PAPER_RESEARCH: "Kağıt araştırma adayı" })[candidate.finalDecision] ?? candidate.finalDecision;
  elements.decisionTitle.textContent = decisionText;
  elements.decisionReason.textContent = candidate.hardVetos.length
    ? vetoLabels[candidate.hardVetos[0]] ?? candidate.hardVetos[0]
    : candidate.signalWindow === "NOW" ? candidate.timingReasons?.[0] ?? "Kısa vadeli giriş tetiği oluştu."
      : candidate.softVetos.length ? vetoLabels[candidate.softVetos[0]] ?? candidate.softVetos[0] : "Araştırma kuralları olumlu.";
  elements.decisionScore.textContent = `${candidate.decisionScore}/100`;
  elements.probabilityStatus.textContent = "Henüz üretilmiyor";
  elements.timingStatus.textContent = ({ NOW: "Açık", PREPARE: "Hazırlanıyor", WAIT: "Kapalı", BLOCKED: "Engelli" })[candidate.signalWindow] ?? "—";
  elements.riskStatus.textContent = ({ LOW: "Düşük", MEDIUM: "Orta", HIGH: "Yüksek" })[candidate.riskLevel] ?? "—";
  elements.timingStatus.className = candidate.signalWindow === "NOW" ? "positive" : candidate.signalWindow === "BLOCKED" ? "negative" : "warning-text";
  elements.riskStatus.className = candidate.riskLevel === "LOW" ? "positive" : candidate.riskLevel === "HIGH" ? "negative" : "warning-text";
  elements.entryValue.textContent = formatPrice(candidate.entryPrice);
  elements.targetValue.textContent = formatPrice(candidate.targetPrice);
  elements.stopValue.textContent = formatPrice(candidate.stopPrice);
  elements.timeValue.textContent = Number.isFinite(candidate.expectedMinutes) ? `~${candidate.expectedMinutes} dk kapasite` : "Belirsiz";
  elements.netTargetValue.textContent = formatPercent(candidate.netTargetPctFeeCaseB * 100);
  elements.vetoText.textContent = candidate.hardVetos.length ? (vetoLabels[candidate.hardVetos[0]] ?? candidate.hardVetos[0]) : "Model henüz doğrulanmadı";
  elements.signalTime.textContent = `Karar zamanı ${formatClock(candidate.decisionAt)}`;
  elements.hardVetoList.textContent = candidate.hardVetos.length ? candidate.hardVetos.map((code) => vetoLabels[code] ?? code).join(" · ") : "Yok";
  elements.softVetoList.textContent = candidate.softVetos.length ? candidate.softVetos.map((code) => vetoLabels[code] ?? code).join(" · ") : "Yok";
  renderGuidance(candidate);
  renderCycle(candidate);
  renderMotorEvidence(candidate);
  renderScoreAudit(candidate);
  elements.scoreGrid.replaceChildren(...Object.entries(candidate.scores).map(([key, value]) => {
    const item = document.createElement("article");
    item.className = "score-item";
    item.innerHTML = `<div><span>${scoreLabels[key] ?? key}</span><strong>${Math.round(value)}</strong></div><small>${scoreQuestions[key] ?? "Bu katmanın katkısı."}</small><div class="score-track"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>`;
    return item;
  }));
}

function renderBacktest(backtest) {
  if (!backtest) return;
  elements.backtestStatus.textContent = backtest.plainStatus;
  elements.backtestStatus.className = backtest.status === "READY_FOR_LOCKED_TEST" ? "positive" : "warning-text";
  elements.backtestDays.textContent = `${backtest.gate.forwardTradingDays.current} / ${backtest.gate.forwardTradingDays.required}`;
  elements.backtestLabels.textContent = `${backtest.gate.maturedValidLabels.current} / ${backtest.gate.maturedValidLabels.required}`;
  elements.backtestActionable.textContent = `${backtest.gate.maturedActionableLabels.current} / ${backtest.gate.maturedActionableLabels.required}`;
  elements.backtestExcluded.textContent = `${backtest.current.excludedSignals + backtest.legacy.invalidLabelsExcluded}`;
  elements.backtestNote.textContent = `${backtest.note} Aktif sürüm: ${backtest.engineVersion}`;
}

function localInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

function applyAvailableReplayRange() {
  const availability = state.replayAvailability;
  if (!availability?.fullPitStart) return;
  const selectedDay = availability.fullPitDays?.find((day) => day.date === elements.replayDay.value);
  const startAt = selectedDay?.startAt ?? availability.fullPitStart;
  const endAt = selectedDay?.endAt ?? availability.fullPitEnd;
  elements.replayStart.min = localInputValue(startAt);
  elements.replayStart.max = localInputValue(endAt);
  elements.replayEnd.min = localInputValue(startAt);
  elements.replayEnd.max = localInputValue(endAt);
  elements.replayStart.value = localInputValue(startAt);
  elements.replayEnd.value = localInputValue(endAt);
}

function replayOutcomeLabel(result) {
  if (result.status === "PENDING") return "Sonuç bekliyor";
  if (result.status === "EXCLUDED") return "Test dışı";
  return ({ TARGET_FIRST: "Hedef önce", STOP_FIRST: "Stop önce", TIMEOUT: "Süre doldu" })[result.outcome] ?? "—";
}

const replayReasonLabels = {
  CONTEXT_NOT_CAPTURED: "Haber/SEC/takvim kaydı yok",
  CONTEXT_LAYER_INCOMPLETE: "Bağlam katmanı eksik",
  CONTEXT_TOO_OLD: "Bağlam 45 dakikadan eski",
  MARKET_LAYER_INCOMPLETE: "Piyasa sepeti eksik",
  OUTSIDE_REGULAR_SESSION: "Normal seans dışında",
  EXECUTION_LAYER_INCOMPLETE: "Bid/ask veya spread eksik",
  FEATURE_BARS_INCOMPLETE: "5 dakikalık mum geçmişi eksik"
};

function renderReplayTrust(report) {
  const trust = report.trustReport;
  if (!trust) {
    elements.replayTrust.hidden = true;
    return;
  }
  elements.replayTrust.hidden = false;
  const trustClass = trust.level === "FULL_PIT" ? "full-pit" : trust.level === "BLOCKED" ? "blocked" : "reconstructed";
  elements.replayTrust.className = `replay-trust ${trustClass}`;
  elements.replayTrustTitle.textContent = trust.title;
  elements.replayTrustBadge.textContent = trust.usableForOfficialForward ? "Resmi sayaca girer" : "Resmi sayaca girmez";
  elements.replayTrustPlain.textContent = `${trust.plainStatus} Bütünlük kontrolü: ${trust.passedChecks}/${trust.totalChecks}.`;
  elements.replayTruthList.replaceChildren(...(trust.sourceLines ?? []).map(([label, value]) => {
    const article = document.createElement("article");
    const title = document.createElement("span");
    const body = document.createElement("strong");
    title.textContent = label;
    body.textContent = value;
    article.append(title, body);
    return article;
  }));
  elements.replayWarningList.replaceChildren(...(trust.warnings?.length ? trust.warnings : ["Bu test için ek veri uyarısı yok."]).map((warning) => {
    const item = document.createElement("p");
    item.textContent = warning;
    return item;
  }));
  elements.replayCheckList.replaceChildren(...(trust.checks ?? []).map((check) => {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const result = document.createElement("b");
    name.textContent = check.name;
    result.textContent = check.passed ? "Geçti" : "Kaldı";
    if (!check.passed) result.className = "failed";
    row.append(name, result);
    return row;
  }));
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("tr-TR") : "—";
}

function caseClassLabel(value) {
  return ({
    DOGRU_OKUDU: "Doğru okudu",
    YANLIS_OKUDU: "Yanlış okudu",
    SUREYI_YANLIS_OKUDU: "Süreyi yanlış okudu"
  })[value] ?? value ?? "—";
}

function renderBacktestJournal(report) {
  const journal = report.backtestJournal;
  if (!journal) {
    elements.journalPanel.hidden = true;
    return;
  }
  elements.journalPanel.hidden = false;
  const params = journal.runParameters;
  const requested = params.requested ?? {};
  const funnel = journal.decisionFunnel;
  const cases = journal.learningCases ?? [];
  const classCounts = cases.reduce((result, item) => ({ ...result, [item.correctClass]: (result[item.correctClass] ?? 0) + 1 }), {});
  const start = requested.startAt ? formatDateTime(requested.startAt) : requested.date ?? "—";
  const end = requested.endAt ? formatDateTime(requested.endAt) : requested.date ?? "—";
  elements.journalTitle.textContent = `Kayıt ${report.runId ?? "—"}`;
  elements.journalSaved.textContent = report.savedAt ? `Kaydedildi · ${formatClock(report.savedAt)}` : "Kaydedildi";
  elements.journalRange.textContent = params.mode === "HISTORICAL_RECONSTRUCTION" ? "Tarihsel canlandırma" : "Tam canlı kayıt";
  elements.journalRangeDetail.textContent = `${start} → ${end}`;
  elements.journalParams.textContent = `${params.mechanics?.decisionCadenceMinutes ?? 5} dk · ${params.mechanics?.featureBarSeconds / 60 ?? 5} dk mum`;
  elements.journalParamDetail.textContent = `Kasa ${formatUsd(params.portfolio?.initialCapital)} · risk %${params.portfolio?.riskPct ?? "—"} · tek pozisyon %${params.portfolio?.maxPositionPct ?? "—"} · kayma ${params.mechanics?.slippageStressBpsPerSide ?? "—"} bps`;
  elements.journalFunnel.textContent = `${funnel.decisionMoments} an → ${funnel.paperExecutedTrades} işlem`;
  elements.journalFunnelDetail.textContent = `${funnel.generatedCandidates} aday · ${funnel.paperEligibleSignals} para adayı · ${funnel.paperSkippedSignals} pas. ${funnel.whyFewDecisions?.[0] ?? ""}`;
  elements.journalCases.textContent = `${cases.length} vaka`;
  elements.journalCaseDetail.textContent = `Doğru ${classCounts.DOGRU_OKUDU ?? 0} · Yanlış ${classCounts.YANLIS_OKUDU ?? 0} · Süre ${classCounts.SUREYI_YANLIS_OKUDU ?? 0}`;
  elements.journalCaseList.replaceChildren(...(cases.length ? cases.slice(0, 8).map((item) => {
    const card = document.createElement("article");
    card.className = "case-card";
    const className = item.correctClass === "DOGRU_OKUDU" ? "win" : item.correctClass === "YANLIS_OKUDU" ? "loss" : "timeout";
    const left = document.createElement("div");
    left.innerHTML = `<b>${item.symbol} · ${item.modelLabel}</b><span>${formatDateTime(item.entryAt)} · ${item.signalWindow}</span>`;
    const middle = document.createElement("span");
    middle.textContent = `${item.beforeDecision?.timingState ?? "—"} · ${item.beforeDecision?.strongestScores?.map((score) => `${score.name} ${score.score}`).join(" / ") ?? "puan yok"}`;
    const right = document.createElement("strong");
    right.className = className;
    right.textContent = `${caseClassLabel(item.correctClass)} · ${Number.isFinite(item.netReturn) ? formatPercent(item.netReturn * 100) : "—"}`;
    card.append(left, middle, right);
    return card;
  }) : [Object.assign(document.createElement("p"), { className: "empty-state", textContent: "Bu testte olgunlaşmış “Şimdi” vakası yok; WAIT/PREPARE adayları ileride ayrı tabloya alınacak." })]));
}

function renderSavedRuns(runs) {
  elements.savedRunList.replaceChildren(...(runs.length ? runs.map((run) => {
    const row = document.createElement("div");
    row.className = "saved-run-row";
    const values = [
      [`${run.mode === "HISTORICAL_RECONSTRUCTION" ? "Tarihsel" : "Canlı"} · ${run.runId}`, formatDateTime(run.savedAt)],
      [`${run.decisionMoments} karar anı`, `${run.generatedCandidates} aday · ${run.independentSignals} bağımsız`],
      [`${run.executedTrades} işlem`, Number.isFinite(run.totalReturn) ? formatPercent(run.totalReturn * 100) : "—"],
      [run.trustLevel, run.officialForwardCounterEligible ? "Resmi sayaca girer" : "Araştırma kaydı"]
    ];
    for (const [title, detail] of values) {
      const cell = document.createElement("div");
      const strong = document.createElement("b");
      const span = document.createElement("span");
      strong.textContent = title;
      span.textContent = detail;
      cell.append(strong, span);
      row.append(cell);
    }
    return row;
  }) : [Object.assign(document.createElement("p"), { className: "empty-state", textContent: "Henüz kayıt yok." })]));
}

async function loadSavedRuns() {
  try {
    const response = await fetch("/api/backtest-runs");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    renderSavedRuns(payload.runs ?? []);
  } catch {
    elements.savedRunList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty-state", textContent: "Kaydedilen testler yüklenemedi." }));
  }
}

async function loadReplayAvailability() {
  try {
    const response = await fetch("/api/replay/availability");
    const availability = await response.json();
    if (!response.ok) throw new Error(availability.error);
    if (!availability.fullPitStart) {
      elements.replayAvailability.textContent = "Henüz tam katmanlı aralık yok";
      elements.replayButton.disabled = true;
      return;
    }
    state.replayAvailability = availability;
    const days = availability.fullPitDays ?? [];
    elements.replayAvailability.textContent = `${days.length} tam verili gün · ${availability.fullPitSnapshots} kayıt`;
    elements.replayDay.replaceChildren(...days.map((day) => {
      const option = document.createElement("option");
      option.value = day.date;
      option.textContent = `${new Date(`${day.date}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })} · ${day.snapshots} kayıt`;
      return option;
    }));
    elements.replayDay.disabled = false;
    elements.archiveCoverage.textContent = `${days.length} ABD işlem gününde bütün canlı katmanlar birlikte kaydedilmiş. Listede olmayan bir gün için canlıyla aynı test üretilemez; sistem açık kaldıkça yeni günler eklenir.`;
    applyAvailableReplayRange();
    elements.replayButton.disabled = false;
    elements.replayPresetButton.disabled = false;
    elements.replayExplain.textContent = availability.notice;
  } catch (error) {
    elements.replayAvailability.textContent = "Aralık alınamadı";
    elements.replayExplain.textContent = error.message;
  }
}

function renderReplay(report) {
  if (report.mode === "HISTORICAL_RECONSTRUCTION") {
    elements.replayModeNotice.className = "replay-mode-notice reconstructed";
    elements.replayModeNotice.textContent = "TARİHSEL CANLANDIRMA · Motor seçilen günün verisini saat saat gördü. 1 dakikalık fiyatlar tarihsel; bid/ask 5 bps muhafazakâr proxy, haber erişimi yayın zamanı proxy'sidir. Resmî forward sayacına eklenmez.";
  } else {
    elements.replayModeNotice.className = "replay-mode-notice full-pit";
    elements.replayModeNotice.textContent = "TAM POINT-IN-TIME · O anda gerçekten yakalanmış fiyat, bid/ask, haber, SEC ve takvim görüntüleri kullanıldı.";
  }
  renderReplayTrust(report);
  renderBacktestJournal(report);
  elements.replaySummary.hidden = false;
  elements.replayFullMoments.textContent = report.diagnostics.fullPointInTimeSnapshots.toLocaleString("tr-TR");
  elements.replayCandidates.textContent = report.candidates.toLocaleString("tr-TR");
  elements.replayIndependent.textContent = report.summary.independentSignals.toLocaleString("tr-TR");
  elements.replayTargetRate.textContent = Number.isFinite(report.summary.targetFirstRate) ? formatPercent(report.summary.targetFirstRate * 100) : "Henüz yok";
  elements.replayNetReturn.textContent = Number.isFinite(report.summary.averageNetReturn) ? formatPercent(report.summary.averageNetReturn * 100) : "Henüz yok";
  const exclusions = Object.entries(report.diagnostics.excludedByReason);
  const passedChecks = report.integrityChecks.filter((check) => check.passed).length;
  const exclusionText = exclusions.length
    ? `Dışarıda tutulan anlar: ${exclusions.map(([reason, count]) => `${replayReasonLabels[reason] ?? reason}: ${count}`).join(" · ")}`
    : "Seçilen aralıktaki bütün anlar point-in-time kontrollerinden geçti.";
  elements.replayDiagnostics.textContent = `${passedChecks}/${report.integrityChecks.length} bütünlük kontrolü geçti. ${exclusionText}`;
  renderPaperPortfolio(report.portfolio);
  elements.replayResults.replaceChildren();
  const rows = report.rows.filter((row) => row.signalWindow === "NOW" || row.result.status === "MATURED").slice(-100);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = report.candidates ? "Kararlar üretildi fakat bu aralıkta olgunlaşmış veya ‘şimdi’ durumunda bir örnek yok." : "Bu aralıkta tam verili bir karar üretilemedi.";
    elements.replayResults.append(empty);
    elements.replaySummary.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const header = document.createElement("div");
  header.className = "replay-result replay-result-head";
  for (const label of ["Karar zamanı", "Hisse / model", "Pencere", "Skor", "Sonuç", "Net sonuç"]) {
    const cell = document.createElement("span"); cell.textContent = label; header.append(cell);
  }
  elements.replayResults.append(header);
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "replay-result";
    const values = [
      new Date(row.entryAt).toLocaleString("tr-TR"), `${row.symbol} · ${row.modelLabel}`,
      ({ NOW: "Şimdi", PREPARE: "Hazırlanıyor", WAIT: "Bekle", BLOCKED: "Engelli" })[row.signalWindow] ?? row.signalWindow,
      `${row.decisionScore}/100`, replayOutcomeLabel(row.result),
      Number.isFinite(row.result.netReturn) ? formatPercent(row.result.netReturn * 100) : "—"
    ];
    for (const value of values) { const cell = document.createElement("span"); cell.textContent = value; item.append(cell); }
    const trace = row.replayDataTrace;
    if (trace) item.title = `Veri izi: ${trace.mode} · son özellik mumu ${formatClock(trace.latestFeatureBarEndAt)} · giriş kaynağı ${trace.executionSource ?? "—"}`;
    elements.replayResults.append(item);
  }
  elements.replaySummary.scrollIntoView({ behavior: "smooth", block: "center" });
}

function paperSettings() {
  return {
    initialCapital: Number(elements.paperCapital.value),
    riskPct: Number(elements.paperRisk.value),
    maxPositionPct: Number(elements.paperAllocation.value),
    maxConcurrent: Number(elements.paperConcurrent.value)
  };
}

async function runHistoricalDate() {
  if (!elements.historicalDate.value) {
    elements.replayDiagnostics.textContent = "İnternetten yüklenecek tarihi seçmelisin.";
    return;
  }
  elements.historicalReplayButton.disabled = true;
  elements.historicalReplayButton.textContent = "19 seri ve bağlam yükleniyor…";
  elements.replayDiagnostics.textContent = "Seçilen günün 19 piyasa serisi, haberleri, SEC kayıtları ve olay takvimi yükleniyor; motor zamanı 5'er dakika ilerletecek.";
  try {
    const response = await fetch("/api/historical-replay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: elements.historicalDate.value, portfolio: paperSettings() })
    });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error);
    renderReplay(report);
    await loadSavedRuns();
  } catch (error) {
    elements.replayDiagnostics.textContent = error.message;
  } finally {
    elements.historicalReplayButton.disabled = false;
    elements.historicalReplayButton.textContent = "Tarihi yükle ve canlandır";
  }
}

const paperSkipLabels = {
  SAME_SYMBOL_ALREADY_OPEN: "Aynı hissede işlem zaten açıktı",
  MAX_CONCURRENT_REACHED: "Açık işlem sınırı doluydu",
  INSUFFICIENT_CASH_OR_RISK_BUDGET: "Kasa veya risk bütçesi yetersizdi"
};

function renderPaperPortfolio(portfolio) {
  elements.paperReport.hidden = false;
  elements.paperInitial.textContent = formatUsd(portfolio?.initialCapital);
  elements.paperFinal.textContent = formatUsd(portfolio?.finalCapital);
  elements.paperProfit.textContent = formatUsd(portfolio?.netProfit);
  elements.paperProfit.className = portfolio?.netProfit > 0 ? "positive" : portfolio?.netProfit < 0 ? "negative" : "muted-text";
  elements.paperReturn.textContent = Number.isFinite(portfolio?.totalReturn) ? formatPercent(portfolio.totalReturn * 100) : "—";
  elements.paperReturn.className = portfolio?.totalReturn > 0 ? "positive" : portfolio?.totalReturn < 0 ? "negative" : "muted-text";
  elements.paperTrades.textContent = `${portfolio?.executedTrades ?? 0} açıldı · ${portfolio?.skippedSignals ?? 0} pas geçildi`;
  elements.paperDrawdown.textContent = Number.isFinite(portfolio?.maxRealizedDrawdown) ? formatPercent(-portfolio.maxRealizedDrawdown * 100) : "—";
  elements.paperExplanation.textContent = `${portfolio?.cadenceMinutes ?? 5} dakikada bir karar kontrolü · işlem başına %${portfolio?.settings?.riskPct ?? "—"} risk · tek pozisyonda en fazla %${portfolio?.settings?.maxPositionPct ?? "—"} kasa · ücret ve kayma dahil.`;
  elements.paperLedger.replaceChildren();
  elements.paperReviews.replaceChildren();
  if (!portfolio?.trades?.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Bu aralıkta motorun parayla girebileceği olgunlaşmış bir “Şimdi” kararı yok.";
    elements.paperLedger.append(empty);
    return;
  }
  const header = document.createElement("div");
  header.className = "paper-ledger-row paper-ledger-head";
  for (const label of ["Giriş", "İşlem", "Ayrılan para", "Adet", "Sonuç", "Net", "Kasa"]) {
    const cell = document.createElement("span"); cell.textContent = label; header.append(cell);
  }
  elements.paperLedger.append(header);
  for (const trade of portfolio.trades) {
    const row = document.createElement("div");
    row.className = "paper-ledger-row";
    const values = [
      new Date(trade.entryAt).toLocaleString("tr-TR"),
      `${trade.symbol} · ${trade.modelLabel} · ${trade.decisionScore}/100`,
      formatUsd(trade.notional),
      trade.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 4 }),
      ({ TARGET_FIRST: "Hedef önce", STOP_FIRST: "Stop önce", TIMEOUT: "Süre doldu" })[trade.outcome] ?? trade.outcome,
      formatUsd(trade.netPnlUsd),
      formatUsd(trade.balanceAfter)
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("span"); cell.textContent = value;
      if (index === 5) cell.className = trade.netPnlUsd > 0 ? "positive" : "negative";
      row.append(cell);
    });
    row.title = trade.reason;
    elements.paperLedger.append(row);
    const review = document.createElement("details");
    review.className = "trade-review";
    const summary = document.createElement("summary");
    summary.textContent = `${trade.symbol} · ${new Date(trade.entryAt).toLocaleString("tr-TR")} · Motor neyi okudu?`;
    const grid = document.createElement("div");
    grid.className = "trade-review-grid";
    const sections = [
      ["Neden pozisyona girdi?", trade.review?.entryReasons?.join(" · ") || trade.reason],
      ["Önceden görülen riskler", trade.review?.warnings?.length ? trade.review.warnings.join(" · ") : "Belirgin ek uyarı yoktu."],
      ["Neyi doğru okudu?", trade.review?.understood ?? "—"],
      ["Neyi yanlış veya eksik okudu?", trade.review?.missed ?? "—"],
      ["Geliştirmede sınanacak soru", trade.review?.developmentQuestion ?? "—"],
      ["Motor güncellendi mi?", trade.review?.modelUpdateExplanation ?? "Hayır."]
    ];
    for (const [title, description] of sections) {
      const article = document.createElement("article");
      const heading = document.createElement("b"); heading.textContent = title;
      const text = document.createElement("p"); text.textContent = description;
      article.append(heading, text); grid.append(article);
    }
    review.append(summary, grid);
    elements.paperReviews.append(review);
  }
  if (portfolio.skipped?.length) {
    const reasons = Object.entries(portfolio.skipped.reduce((result, item) => ({ ...result, [item.reason]: (result[item.reason] ?? 0) + 1 }), {}));
    const note = document.createElement("p");
    note.className = "paper-skipped";
    note.textContent = `Pas geçilenler: ${reasons.map(([reason, count]) => `${paperSkipLabels[reason] ?? reason}: ${count}`).join(" · ")}`;
    elements.paperLedger.append(note);
  }
}

async function runReplay() {
  if (!elements.replayStart.value || !elements.replayEnd.value) {
    elements.replayDiagnostics.textContent = "Başlangıç ve bitiş zamanını seçmelisin.";
    return;
  }
  const startTime = new Date(elements.replayStart.value).getTime();
  const endTime = new Date(elements.replayEnd.value).getTime();
  const availableStart = Math.floor(new Date(state.replayAvailability?.fullPitStart).getTime() / 1000) * 1000;
  const availableEnd = Math.ceil(new Date(state.replayAvailability?.fullPitEnd).getTime() / 1000) * 1000;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    elements.replayDiagnostics.textContent = "Bitiş zamanı başlangıçtan sonra olmalı.";
    return;
  }
  if (startTime < availableStart || endTime > availableEnd) {
    elements.replayDiagnostics.textContent = "Seçtiğin saat tam canlı kayıt sınırının dışında. Üstteki tam verili günü çalıştır veya başka bir tarihi internetten yükle.";
    return;
  }
  if (endTime - startTime < 30 * 60_000) {
    elements.replayDiagnostics.textContent = "Anlamlı bir deneme için en az 30 dakikalık aralık seç.";
    return;
  }
  elements.replayButton.disabled = true;
  elements.replayButton.textContent = "Test çalışıyor…";
  elements.replayDiagnostics.textContent = "Her karar anının veri katmanları ve gelecekten bilgi sızıntısı kontrol ediliyor.";
  try {
    const response = await fetch("/api/replay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startAt: new Date(elements.replayStart.value).toISOString(),
        endAt: new Date(new Date(elements.replayEnd.value).getTime() + 999).toISOString(),
        portfolio: paperSettings()
      })
    });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error);
    renderReplay(report);
    await loadSavedRuns();
  } catch (error) {
    elements.replayDiagnostics.textContent = error.message;
  } finally {
    elements.replayButton.disabled = false;
    elements.replayButton.textContent = "Sanal kasayla testi çalıştır";
  }
}

function renderContext(context) {
  const connected = context?.readiness ?? {};
  layerState(elements.newsLayer, connected.newsConnected && connected.filingsConnected);
  layerState(elements.calendarLayer, connected.calendarConnected);
  elements.newsObservedAt.textContent = context?.observedAt ? `Son kontrol ${formatClock(context.observedAt)}` : "—";

  if (!context) {
    elements.newsList.innerHTML = '<p class="empty-state">Haber verisi alınamadı.</p>';
    elements.eventList.innerHTML = '<p class="empty-state">Takvim verisi alınamadı.</p>';
    return;
  }

  const selectedNews = context.news.filter((item) => item.topic === state.symbol || item.topic === "MEMORY").slice(0, 4);
  const selectedFilings = context.filings.filter((item) => item.symbol === state.symbol).slice(0, 2);
  const combined = [
    ...selectedNews.map((item) => ({ kind: "HABER", time: item.publishedAt, title: item.title, meta: `${item.sourceName ?? "Haber"} · ilk görülme ${formatClock(item.firstSeenAt)}`, url: item.link })),
    ...selectedFilings.map((item) => ({ kind: `SEC ${item.form}`, time: item.acceptedAt, title: item.description || `${item.symbol} ${item.form} bildirimi`, meta: `Resmi kabul: ${item.acceptedAt ? new Date(item.acceptedAt).toLocaleDateString("tr-TR") : "—"}`, url: item.url }))
  ].sort((a, b) => (b.time ?? "").localeCompare(a.time ?? "")).slice(0, 6);
  elements.newsList.replaceChildren(...(combined.length ? combined.map((item) => {
    const row = document.createElement("article");
    row.className = "context-item";
    const time = document.createElement("span");
    time.textContent = item.time ? formatClock(item.time) : item.kind;
    const body = document.createElement("div");
    const title = item.url ? document.createElement("a") : document.createElement("strong");
    title.textContent = item.title;
    if (item.url) { title.href = item.url; title.target = "_blank"; title.rel = "noreferrer"; }
    const meta = document.createElement("small");
    meta.textContent = `${item.kind} · ${item.meta}`;
    body.append(title, meta);
    row.append(time, body);
    return row;
  }) : [Object.assign(document.createElement("p"), { className: "empty-state", textContent: "Son iki günde eşleşen haber bulunamadı." })]));

  const events = context.events.filter((item) => item.type === "EARNINGS" ? item.symbol === state.symbol : item.impact === "HIGH").slice(0, 7);
  elements.eventList.replaceChildren(...(events.length ? events.map((item) => {
    const row = document.createElement("article");
    row.className = "context-item";
    const date = document.createElement("span");
    date.textContent = new Date(`${item.date}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.type === "EARNINGS" ? `${item.symbol} bilançosu` : item.name;
    if (item.impact === "HIGH") title.className = "high-impact";
    const meta = document.createElement("small");
    meta.textContent = item.type === "EARNINGS" ? (item.timing ?? "Saat açıklanmadı") : `${item.timeGmt ?? "—"} GMT · Beklenti ${item.consensus ?? "—"}`;
    body.append(title, meta);
    row.append(date, body);
    return row;
  }) : [Object.assign(document.createElement("p"), { className: "empty-state", textContent: "Önümüzdeki 8 günde yüksek etkili eşleşme bulunamadı." })]));
}

function setDirectionClass(element, value) {
  element.classList.remove("positive", "negative", "warning-text", "muted-text");
  if (Number.isFinite(value)) element.classList.add(value > 0 ? "positive" : value < 0 ? "negative" : "muted-text");
}

function renderSelection() {
  document.querySelectorAll("[data-symbol]").forEach((button) => button.classList.toggle("active", button.dataset.symbol === state.symbol));
  document.querySelectorAll("[data-model]").forEach((button) => button.classList.toggle("active", button.dataset.model === state.model));
  elements.selectedSymbol.textContent = state.symbol;
  elements.targetValue.textContent = state.model === "quick" ? "+%1" : "+%1,5";
  elements.timeValue.textContent = state.model === "quick" ? "Aynı seans" : "1–3 seans";
}

function renderQuoteGrid(snapshot) {
  const order = ["MU", "SNDK", "WDC", "STX", "SMH", "SOXX", "QQQ", "SPY", "^VIX", "^TNX", "DX-Y.NYB", "NQ=F", "ES=F"];
  elements.quoteGrid.replaceChildren(...order.map((symbol) => {
    const quote = snapshot.quotes[symbol];
    const card = document.createElement("article");
    card.className = "quote-card";
    if (!quote) {
      card.innerHTML = `<div><b>${symbol}</b><em class="warning-text">Eksik</em></div><strong>—</strong><small>Veri alınamadı</small>`;
      return card;
    }
    const directionClass = quote.changePct > 0 ? "positive" : quote.changePct < 0 ? "negative" : "muted-text";
    card.innerHTML = `<div><b>${symbol}</b><em class="${directionClass}">${formatPercent(quote.changePct)}</em></div><strong>${formatPrice(quote.price)}</strong><small>${quote.marketState} · ${formatClock(quote.marketTimestamp)}</small>`;
    return card;
  }));
}

function render() {
  renderSelection();
  const snapshot = state.snapshot;
  if (!snapshot) return;
  renderSystemAssurance(snapshot.system);
  const quote = snapshot.quotes[state.symbol];
  const execution = snapshot.execution?.[state.symbol];
  const ready = snapshot.readiness.status === "MARKET_LAYER_READY";
  const contextReady = Boolean(snapshot.context?.readiness?.newsConnected && snapshot.context?.readiness?.filingsConnected && snapshot.context?.readiness?.calendarConnected);
  const executionReady = execution?.qualityStatus === "VALID";
  const connectedAll = ready && contextReady && executionReady;
  elements.connectionDot.className = `status-dot${ready ? "" : " warning"}`;
  elements.marketState.textContent = quote ? `${state.symbol} · ${quote.marketState}` : "Veri eksik";
  elements.sourceNotice.querySelector("span").textContent = snapshot.sourceNotice;
  elements.decisionTitle.textContent = connectedAll ? "Canlı veri bağlantıları hazır" : "Veri eksik";
  elements.decisionReason.textContent = connectedAll
    ? "Skor motoru, objektif backtest ve kalibrasyon tamamlanana kadar kilitli."
    : snapshot.readiness.reason;
  elements.livePrice.textContent = formatPrice(quote?.price);
  elements.dayChange.textContent = formatPercent(quote?.changePct);
  setDirectionClass(elements.dayChange, quote?.changePct);
  elements.lastMarketTime.textContent = `Piyasa zamanı: ${formatClock(quote?.marketTimestamp)}`;
  elements.dataDelay.textContent = `Gecikme: ${Number.isFinite(quote?.staleSeconds) ? quote.staleSeconds + " sn" : "—"}`;
  elements.dataCoverage.textContent = `Fiyat kapsamı: ${Math.round(snapshot.readiness.priceLayerCoverage * 100)}%`;
  elements.quoteSubtitle.textContent = `${state.symbol} için son erişilebilir veri`;
  elements.metricChange.textContent = formatPercent(quote?.changePct);
  setDirectionClass(elements.metricChange, quote?.changePct);
  elements.metricChangeMeaning.textContent = Number.isFinite(quote?.changePct)
    ? quote.changePct > 0.15 ? "Hisse bugün yükseliyor; yön long fikrine yardımcı olabilir."
      : quote.changePct < -0.15 ? "Hisse bugün düşüyor; long için ekstra teyit gerekir."
        : "Hisse bugün belirgin bir yön göstermiyor."
    : "Hissenin bugünkü yönü henüz bilinmiyor.";
  elements.metricVwap.textContent = formatPrice(quote?.vwap);
  elements.metricVwapMeaning.textContent = Number.isFinite(quote?.price) && Number.isFinite(quote?.vwap)
    ? quote.price >= quote.vwap ? "Fiyat gün içi ortalama maliyetin üzerinde; alıcılar daha güçlü."
      : "Fiyat gün içi ortalama maliyetin altında; VWAP geri alınmadan dikkat."
    : "Gün içindeki ortalama maliyet seviyesi hesaplanamadı.";
  elements.metricRange.textContent = `${formatPrice(quote?.sessionHigh)} / ${formatPrice(quote?.sessionLow)}`;
  const rangePosition = Number.isFinite(quote?.price) && Number.isFinite(quote?.sessionHigh) && Number.isFinite(quote?.sessionLow) && quote.sessionHigh > quote.sessionLow
    ? (quote.price - quote.sessionLow) / (quote.sessionHigh - quote.sessionLow) : null;
  elements.metricRangeMeaning.textContent = rangePosition === null ? "Fiyatın gün içindeki yeri hesaplanamadı."
    : rangePosition > 0.67 ? "Fiyat günün üst bölgesinde; güçlü fakat yorulmuş olabilir."
      : rangePosition < 0.33 ? "Fiyat günün alt bölgesinde; alıcı teyidi henüz zayıf."
        : "Fiyat günün orta bölgesinde; belirgin uç noktada değil.";
  elements.metricVolume.textContent = formatVolume(quote?.sessionVolume);
  elements.metricVolumeMeaning.textContent = "Bugünkü toplam işlem miktarı; tek başına yükseliş ya da düşüş sinyali değildir.";
  elements.metricBidAsk.textContent = `${formatPrice(execution?.bid)} / ${formatPrice(execution?.ask)}`;
  elements.metricBidAskMeaning.textContent = "Soldaki alıcıların verdiği, sağdaki satıcıların istediği fiyattır.";
  elements.metricSpread.textContent = Number.isFinite(execution?.spreadBps) ? `${execution.spreadBps.toLocaleString("tr-TR")} bps` : "—";
  elements.metricSpreadMeaning.textContent = !Number.isFinite(execution?.spreadBps) ? "Giriş maliyeti ölçülemiyor."
    : execution.spreadBps <= 3 ? "Alış-satış farkı dar; giriş maliyeti düşük."
      : execution.spreadBps <= 10 ? "Alış-satış farkı kabul edilebilir ama maliyet yaratır."
        : "Alış-satış farkı fazla geniş; işlem için uygun değil.";
  elements.memoryState.textContent = `${stateLabel(snapshot.baskets.memory.state)} · ${formatPercent(snapshot.baskets.memory.averageChangePct)}`;
  elements.sectorState.textContent = `${stateLabel(snapshot.baskets.sector.state)} · ${formatPercent(snapshot.baskets.sector.averageChangePct)}`;
  elements.memoryMeaning.textContent = basketMeaning(snapshot.baskets.memory.state, "Benzer memory hisseleri");
  elements.sectorMeaning.textContent = basketMeaning(snapshot.baskets.sector.state, "Çip sektörü");
  elements.vetoText.textContent = connectedAll ? "Model henüz doğrulanmadı" : "Eksik veri katmanları";
  elements.priceLayer.textContent = ready ? "Hazır" : "Eksik";
  elements.priceLayer.className = ready ? "positive" : "warning-text";
  layerState(elements.executionLayer, execution?.qualityStatus === "VALID", execution?.isRealTime ? "Bağlı · gerçek zamanlı" : "Bağlı");
  elements.observedAt.textContent = `Son toplama: ${formatClock(snapshot.observedAt)}`;
  renderQuoteGrid(snapshot);
  renderContext(snapshot.context);
  renderPrediction(snapshot.predictions);
  renderBacktest(snapshot.backtest);
  const selectedCandidate = snapshot.predictions?.candidates?.find((item) => item.symbol === state.symbol && item.modelKey === state.model);
  elements.stopMeaning.textContent = Number.isFinite(selectedCandidate?.stopPrice)
    ? "Fiyat buranın altına inerse işlem fikri geçersiz sayılır."
    : "Geçerli bir korunma seviyesi henüz kurulamadı.";
  elements.netTargetMeaning.textContent = Number.isFinite(selectedCandidate?.netTargetPctFeeCaseB)
    ? "3 USD ücret ve stres kayması çıktıktan sonra kalan tahmini hareket."
    : "Ücret ve kayma sonrası kalan hareket henüz hesaplanamadı.";
}

async function loadSnapshot(force = false) {
  if (state.loading) return;
  state.loading = true;
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "…";
  try {
    const response = await fetch(force ? "/api/collect" : "/api/snapshot", { method: force ? "POST" : "GET" });
    if (!response.ok) throw new Error((await response.json()).error ?? `HTTP ${response.status}`);
    state.snapshot = await response.json();
    render();
  } catch (error) {
    elements.connectionDot.className = "status-dot error";
    elements.marketState.textContent = "Bağlantı hatası";
    elements.decisionTitle.textContent = "Veri alınamadı";
    elements.decisionReason.textContent = error.message;
  } finally {
    state.loading = false;
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "↻";
  }
}

document.addEventListener("click", (event) => {
  const symbol = event.target.closest("[data-symbol]");
  if (symbol) { state.symbol = symbol.dataset.symbol; render(); }
  const model = event.target.closest("[data-model]");
  if (model) { state.model = model.dataset.model; render(); }
});

elements.refreshButton.addEventListener("click", () => loadSnapshot(true));
elements.replayButton.addEventListener("click", runReplay);
elements.replayPresetButton.addEventListener("click", async () => { applyAvailableReplayRange(); await runReplay(); });
elements.replayDay.addEventListener("change", applyAvailableReplayRange);
elements.historicalReplayButton.addEventListener("click", runHistoricalDate);
const historicalToday = new Date();
const historicalMin = new Date(historicalToday); historicalMin.setUTCDate(historicalMin.getUTCDate() - 29);
const historicalDefault = new Date(historicalToday); historicalDefault.setUTCDate(historicalDefault.getUTCDate() - 1);
while ([0, 6].includes(historicalDefault.getUTCDay())) historicalDefault.setUTCDate(historicalDefault.getUTCDate() - 1);
elements.historicalDate.max = historicalDefault.toISOString().slice(0, 10);
elements.historicalDate.min = historicalMin.toISOString().slice(0, 10);
elements.historicalDate.value = historicalDefault.toISOString().slice(0, 10);
renderSelection();
await Promise.all([loadSnapshot(), loadReplayAvailability(), loadSavedRuns()]);
setInterval(() => loadSnapshot(), 60_000);
