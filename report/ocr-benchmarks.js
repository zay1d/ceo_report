/* ================= Бенчмарки нагрузки на арендатора (OCR) =================
   OCR = (аренда + эксплуатация + маркетинг) / товарооборот.
   Числитель совпадает с международным Total Occupancy Cost (base rent + CAM +
   marketing + property tax), поэтому цифры ниже сопоставимы напрямую.

   ВАЖНО: мировые бенчмарки строятся на обороте БЕЗ НДС. Если арендаторы подают
   оборот с НДС, его нужно очистить — см. VAT_RATE и TO_INCLUDES_VAT ниже.

   Источники: ICSC / Wall Street Prep, Adventures in CRE (retail underwriting),
   RockStep (enclosed mall metrics), Coldwell Banker Commercial, Realized1031.
   Общий коридор для сопоставимых магазинов молла — 9–16% от оборота.
   Правило, объясняющее разброс: чем выше наценка, тем выше переносимый OCR.

   lo/hi — рабочий коридор, alarm — порог, после которого продления срываются.
   Таблица правится независимо от остального кода. */

var VAT_RATE = 0.12;              /* НДС, Узбекистан */
var TO_INCLUDES_VAT = false;      /* true — в выгрузке оборот с НДС, очищаем при расчётах */

/* оборот без НДС: единая точка, чтобы не делить на 1.12 по всему коду */
function netTO(v){
  if (v == null) return null;
  return TO_INCLUDES_VAT ? v / (1 + VAT_RATE) : v;
}

/* по подкатегории классификатора (второй уровень) */
var OCR_BENCH = {
  'Apparel':                         { lo:10, hi:14, alarm:18, note:'опорная категория молла' },
  'Footwear':                        { lo:10, hi:15, alarm:18, note:'ниже оборот с метра, чем у одежды' },
  'Accessories & Travel':            { lo:12, hi:18, alarm:20, note:'высокая маржа, малые площади' },
  'Watches & Jewelry':               { lo:14, hi:20, alarm:24, note:'самая высокая переносимость в молле' },
  'Beauty retail':                   { lo:10, hi:16, alarm:18, note:'моно-бренды ближе к верхней границе' },
  'Pharmacy':                        { lo:4,  hi:8,  alarm:10, note:'регулируемые цены, низкая маржа' },
  'Consumer electronics':            { lo:4,  hi:8,  alarm:10, note:'низкая маржа, высокий средний чек' },
  'Mobile & Personal devices':       { lo:6,  hi:12, alarm:14, note:'малые площади поднимают ставку с метра' },
  'Home':                            { lo:8,  hi:13, alarm:16, note:'крупные площади, низкая ставка с метра' },
  'Gifts/Lifestyle/Hobby':           { lo:10, hi:16, alarm:18, note:'импульсный спрос, высокая наценка' },
  'Cafés':                           { lo:10, hi:16, alarm:18, note:'десерты и джелато — к верхней границе' },
  'QSR / Food court':                { lo:12, hi:18, alarm:20, note:'фудкорт — самый дорогой формат аренды' },
  'Restaurants':                     { lo:8,  hi:13, alarm:15, note:'большие площади, тонкая маржа' },
  'FnB retail':                      { lo:8,  hi:14, alarm:16, note:'выпечка и кондитерские навынос' },
  'Financial services':              { lo:4,  hi:10, alarm:12, note:'банки платят за присутствие, не за оборот' },
  'Personal & operational services': { lo:8,  hi:14, alarm:16, note:'бытовые услуги, ремонт, химчистка' },
  'Entertainment & Leisure':         { lo:12, hi:20, alarm:25, note:'кино и детские зоны — верхняя граница' },
  'Supermarket & Essentials':        { lo:2,  hi:5,  alarm:6,  note:'якорь: огромный оборот, низкая ставка' }
};

/* киоски и островки живут по своим правилам — площадь минимальна, ставка с метра высокая */
var OCR_BENCH_KIOSK = { lo:15, hi:25, alarm:28, note:'островки и киоски: минимальная площадь' };

/* бенчмарк для арендатора: по подкатегории, для киосков — по категории */
function ocrBench(b){
  if (b.catCode === 'KSK') return OCR_BENCH_KIOSK;
  return OCR_BENCH[b.sub] || null;
}
