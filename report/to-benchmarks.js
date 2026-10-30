/* ================= Бенчмарки отдачи площади (ТО/м² в месяц) =================
   Абсолютные $/м² между рынками несравнимы (США ≠ Эр-Рияд ≠ Ташкент), поэтому
   норма строится ОТНОСИТЕЛЬНО собственного молла:

     норма ТО/м² = медиана молла × индекс подкатегории × коэффициент сегмента.

   Из мировой статистики берутся только соотношения (sales density по категориям:
   ювелирка ≈ 2× от средней по моллу, дом ≈ 0,75×, фудкорт ≈ 1,6× и т.д.) —
   источники: Wikipedia sales per unit area (ICSC), StyleMatrix retail guide,
   Shopify retail benchmarks, Ken Research (Riyadh mall market).
   Медиана молла пересчитывается сама при каждой загрузке свежей выгрузки.

   lo/hi — коридор нормы (индекс × 0.8 … × 1.2), crit — критическая граница
   (25% ниже нормы): ниже неё отдача площади считается провалом формата. */

/* индекс подкатегории: во сколько раз типичная отдача формата отличается
   от средней по моллу (1.0 = средний магазин молла) */
var TO_INDEX = {
  'Apparel':                         1.00,
  'Footwear':                        0.95,
  'Accessories & Travel':            1.25,
  'Watches & Jewelry':               2.00,
  'Beauty retail':                   1.30,
  'Pharmacy':                        1.10,
  'Consumer electronics':            1.60,
  'Mobile & Personal devices':       1.70,
  'Home':                            0.75,
  'Gifts/Lifestyle/Hobby':           0.90,
  'Cafés':                           1.30,
  'QSR / Food court':                1.60,
  'Restaurants':                     0.90,
  'FnB retail':                      1.20,
  'Financial services':              0.70,
  'Personal & operational services': 0.65,
  'Entertainment & Leisure':         0.45,
  'Supermarket & Essentials':        1.40
};
var TO_INDEX_KIOSK = 1.50;            /* киоски: малая площадь, высокая отдача метра */

/* коэффициент сегмента: люкс даёт с метра в 1,5–2,5 раза больше масс-маркета
   (растянуто по нашим шести ступеням SEG_ORDER) */
var SEG_TO_K = {
  'Mass':          0.80,
  'Upper Mass':    0.95,
  'Contemporary':  1.10,
  'Premium':       1.40,
  'Bridge Luxury': 1.65,
  'Luxury':        2.00
};

/* норма ТО/м² для арендатора: {lo, hi, crit, mid} или null, если формат неизвестен.
   Сегмент применяется ОТНОСИТЕЛЬНО среднего сегмента подкатегории в пуле (peers):
   индекс ювелирки уже собран по премиум-люкс ювелирам, и умножать его на люкс
   ещё раз — двойной счёт. Люкс-ювелир среди люкс-ювелиров получает k ≈ 1. */
function toBench(b, mallMedM2, peers){
  var idx = b.catCode === 'KSK' ? TO_INDEX_KIOSK : TO_INDEX[b.sub];
  if (!idx || !mallMedM2) return null;
  var k = SEG_TO_K[b.seg] || 1;
  if (peers && peers.length){
    var ks = peers.map(function(x){ return SEG_TO_K[x.seg] || 1; });
    var avg = ks.reduce(function(a, v){ return a + v; }, 0) / ks.length;
    if (avg > 0) k = k / avg;
  }
  var mid = mallMedM2 * idx * k;
  return { mid:mid, lo:mid * 0.8, hi:mid * 1.2, crit:mid * 0.8 * 0.75 };
}
