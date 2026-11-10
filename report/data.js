/* Демо-данные для показа форматов отчёта.
   ВАЖНО: бренды и цифры ВЫМЫШЛЕННЫЕ, генерируются детерминированно
   (без случайности при каждом открытии) — заменить реальной выгрузкой. */

function lcg(seed){ let s = seed >>> 0; return function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* сезонные коэффициенты по месяцам (1 = янв ... 12 = дек), типичные для ТРЦ */
var SEASON = {
  base: [0.92, 0.86, 1.00, 0.96, 1.02, 0.95, 0.98, 1.00, 0.99, 1.03, 1.02, 1.32],
  fnb:  [0.95, 0.92, 1.00, 0.99, 1.05, 1.08, 1.10, 1.06, 0.98, 0.98, 0.96, 1.15],
  fas:  [0.88, 0.82, 1.02, 0.98, 1.00, 0.90, 0.86, 0.96, 1.06, 1.08, 1.06, 1.42]
};

/* id, бренд, категория, площадь, старт ряда, число месяцев, база ТО/м², тренд/мес, сезонность */
var BRANDS = [
  { id:'aura',    brand:'AURA HOME',      cat:'Home, Gifts & Lifestyle', catCode:'HGL', seg:'Upper Mass', sub:'Home', sub2:'Home decor', area:332, floor:'2 этаж', unit:'U2-014',
    start:{y:2025,m:10}, n:10, baseM2:232, trend:0.004,  season:'base', check:14.6, checkTrend:0.002, seed:20251, note:'Открылся в октябре 2025 — истории меньше года.' },
  { id:'velora',  brand:'VELORA',         cat:'Fashion & Accessories',   catCode:'FAS', seg:'Premium', sub:'Apparel', sub2:'Womenswear', area:214, floor:'1 этаж', unit:'U1-032',
    start:{y:2025,m:1},  n:19, baseM2:318, trend:0.006,  season:'fas',  check:38.4, checkTrend:0.004, seed:71933, note:'19 месяцев — второй год неполный.' },
  { id:'meridian',brand:'CAFE MERIDIAN',  cat:'Food & Beverage',         catCode:'FNB', seg:'Contemporary', sub:'Cafés', sub2:'Coffee shop / patisserie', area:148, floor:'3 этаж', unit:'U3-007',
    start:{y:2024,m:2},  n:31, baseM2:404, trend:-0.002, season:'fnb',  check:9.2,  checkTrend:0.006, seed:44107, note:'31 месяц — два полных года и часть третьего.' },
  { id:'lumier',  brand:'LUMIÈRE OR',     cat:'Fashion & Accessories',   catCode:'FAS', seg:'Luxury', sub:'Watches & Jewelry', sub2:'Fine jewelry', area:85, floor:'1 этаж', unit:'U1-005',
    start:{y:2024,m:6},  n:27, baseM2:640, trend:0.005,  season:'base', check:340,  checkTrend:0.003, seed:58221, note:'Люкс: высокий чек, редкие покупки, 27 мес. истории.' },
  { id:'wokgo',   brand:'WOK & GO',       cat:'Food & Beverage',         catCode:'FNB', seg:'Mass', sub:'QSR / Food court', sub2:'Fast food', area:46, floor:'4 этаж', unit:'U4-023',
    start:{y:2025,m:2},  n:18, baseM2:540, trend:0.007,  season:'fnb',  check:5.8,  checkTrend:0.004, seed:90911, note:'Фудкорт, масс-сегмент: 18 месяцев истории.' }
];

/* сборка помесячного ряда */
function buildSeries(b){
  var rnd = lcg(b.seed), out = [], y = b.start.y, m = b.start.m, s = SEASON[b.season];
  for (var i = 0; i < b.n; i++){
    var drift = Math.pow(1 + b.trend, i);
    var noise = 0.94 + rnd() * 0.13;
    var to = b.baseM2 * b.area * s[m-1] * drift * noise;
    out.push({ y:y, m:m, to:Math.round(to) });
    m++; if (m > 12){ m = 1; y++; }
  }
  return out;
}

BRANDS.forEach(function(b){ b.rows = buildSeries(b); });

/* реальный кейс «месяц не подан» перенесён на AURA HOME: у VELORA он рвал скользящий год.
   Месяц не ноль, а «нет данных» — так и должно приходить из выгрузки. */
(function(){
  var a = BRANDS.filter(function(b){ return b.id === 'aura'; })[0];
  if (a && a.rows[3]) a.rows[3].to = null;
})();


/* ================= данные для управленческого решения (вымышленные) =================
   Источники в реальной жизни: Yardi (договор, начисления, оплаты, долг),
   витрина оборотов (ТО, чеки), ANPR/счётчики (трафик), служба эксплуатации (замечания),
   отдел аренды (лист ожидания и ставка замены). */

/* медианы по категориям молла — нужны, чтобы понимать «много или мало» */
var BENCH = {
  FNB: { m2:355, occLo:15, occHi:18, label:'Food & Beverage' },
  FAS: { m2:296, occLo:12, occHi:16, label:'Fashion & Accessories' },
  HGL: { m2:214, occLo:10, occHi:14, label:'Home, Gifts & Lifestyle' }
};

/* договор + деньги ТРЦ по каждому арендатору */
var DEAL = {
  meridian: {
    contract:'01.04.2022 — 31.03.2027', endsIn:7, type:'фикс $/м²',
    rent:60, opex:10, mkt:4,                    /* $/м² в месяц */
    indexation:'5% в год', deposit:'2 мес. аренды',
    debt:18400, overdueDays:34, latePayments:3, /* просрочек за 12 мес. */
    rankCat:4, rankOf:19, shareCat:6.2,         /* место и доля в категории */
    zoneTraffic:118000,                          /* трафик этажа в месяц, чел. */
    issues:['Часы работы: 4 нарушения за квартал', 'Замечание по вытяжке — не устранено 41 день'],
    altRate:72, altBrand:'сетевая кофейня (лист ожидания, 2 претендента)', altReady:'готов войти с 01.02.2027',
    fitOut:12000, vacancyMonths:2,               /* подготовка и простой при ротации */
    offerPct:12, offerMinFix:45                  /* предлагаемые условия: % с оборота и мин. фикс */
  },
  velora: {
    contract:'01.01.2025 — 31.12.2026', endsIn:4, type:'фикс $/м²',
    rent:22, opex:5, mkt:2,
    indexation:'нет', deposit:'1 мес. аренды',
    debt:0, overdueDays:0, latePayments:0,
    rankCat:6, rankOf:34, shareCat:3.8,
    zoneTraffic:142000,
    issues:['Замечаний нет'],
    altRate:31, altBrand:'международный fashion-бренд (переговоры)', altReady:'вход не ранее 01.05.2027',
    fitOut:16000, vacancyMonths:3,
    offerPct:10, offerMinFix:27
  },
  aura: {
    contract:'01.10.2025 — 30.09.2028', endsIn:25, type:'фикс $/м² + каникулы 3 мес.',
    rent:28, opex:7, mkt:2.8,
    indexation:'7% в год с 2027', deposit:'2 мес. аренды',
    debt:4100, overdueDays:12, latePayments:1,
    rankCat:9, rankOf:21, shareCat:4.4,
    zoneTraffic:96000,
    issues:['Витрина не обновлялась с открытия', 'Долг 12 дней — первый случай'],
    altRate:30, altBrand:'кандидатов нет — локация на 2 этаже в слабом крыле', altReady:'—',
    fitOut:14000, vacancyMonths:4,
    offerPct:11, offerMinFix:24
  },
  lumier: {
    contract:'01.06.2024 — 31.05.2029', endsIn:33, type:'фикс $/м²',
    rent:98, opex:12, mkt:5,
    indexation:'4% в год', deposit:'3 мес. аренды',
    debt:0, overdueDays:0, latePayments:0,
    rankCat:2, rankOf:9, shareCat:8.1,
    zoneTraffic:152000,
    issues:['Замечаний нет'],
    altRate:110, altBrand:'международный ювелирный бренд (интерес)', altReady:'вход не ранее 2028',
    fitOut:60000, vacancyMonths:6,
    offerPct:13, offerMinFix:80
  },
  wokgo: {
    contract:'01.02.2025 — 31.01.2027', endsIn:5, type:'фикс $/м²',
    rent:88, opex:16, mkt:6,
    indexation:'нет', deposit:'1 мес. аренды',
    debt:2600, overdueDays:9, latePayments:2,
    rankCat:5, rankOf:14, shareCat:2.9,
    zoneTraffic:104000,
    issues:['Жалоба на вытяжку от соседнего юнита'],
    altRate:95, altBrand:'сетевой фастфуд (лист ожидания)', altReady:'готов войти с 01.04.2027',
    fitOut:9000, vacancyMonths:1,
    offerPct:14, offerMinFix:70
  }
};


/* ================= сегменты и пул арендаторов молла =================
   Классификатор (сегмент · категория · подкатегория · под-подкатегория) лежит
   в categories.js и грузится ПЕРЕД этим файлом. Здесь к каждой строке
   классификатора приписывается экономика: площадь, ТО/м², нагрузка, рост.

   Сегмент задаёт уровень цен и ожидаемую нагрузку, под-подкатегория — формат торговли.
   База сравнения выбирается лестницей benchLadder() в final.js:
   под-подкат+сегмент -> под-подкат+соседние сегменты -> подкат+сегмент ->
   подкат+соседние сегменты -> подкат -> категория+сегмент -> категория -> молл. */

/* поправка на сегмент: выше сегмент — выше отдача метра и ниже терпимая нагрузка */
var SEG_K = {
  'Mass':          { m2:0.80, occ:1.12 },
  'Upper Mass':    { m2:0.95, occ:1.04 },
  'Contemporary':  { m2:1.10, occ:0.98 },
  'Premium':       { m2:1.38, occ:0.90 },
  'Bridge Luxury': { m2:1.62, occ:0.84 },
  'Luxury':        { m2:1.95, occ:0.78 }
};

/* ================= пул арендаторов молла =================
   Структура категорий — РЕАЛЬНАЯ (229 строк классификатора).
   Обороты, площади и нагрузка — вымышленные, генерация с фиксированным seed.
   В бою этот блок заменяется чтением листа «Арендаторы» + листа «Обороты». */
var MALL = (function(){
  var setup = {                                                  /* базовая экономика категории */
    FNB: { m2:355, sd:0.34, occ:16.5, area:[90, 320] },
    FAS: { m2:296, sd:0.40, occ:14.0, area:[110, 640] },
    HGL: { m2:214, sd:0.36, occ:12.0, area:[140, 520] },
    BTY: { m2:268, sd:0.32, occ:13.5, area:[60, 240] },
    ELC: { m2:392, sd:0.30, occ:9.5,  area:[180, 900] },
    ENT: { m2:158, sd:0.28, occ:11.0, area:[300, 1600] },
    SVC: { m2:186, sd:0.30, occ:12.5, area:[35, 180] },
    KSK: { m2:410, sd:0.38, occ:17.0, area:[8, 40] },
    SUP: { m2:520, sd:0.12, occ:7.0,  area:[900, 2400] }
  };
  var syl1 = ['Ar','Ve','Lu','No','Ka','Mi','So','Te','Ru','Za','Ol','Pi','Da','Fe','Gi','He','Ja','Ko','Le','Ma'];
  var syl2 = ['mo','ra','li','ton','via','ska','nex','dor','mia','pol','tis','var','zen','kro','fina','loro','mira','sunt'];
  var rnd = lcg(90210);
  return TAXONOMY.map(function(t, i){
    var c = setup[t.cat] || setup.SVC;
    var k = SEG_K[t.seg] || { m2:1, occ:1 };
    var f = Math.exp((rnd() + rnd() + rnd() - 1.5) * c.sd);       /* лог-нормальный разброс */
    var area = Math.round(c.area[0] + rnd() * (c.area[1] - c.area[0]));
    var m2 = c.m2 * f * k.m2;
    var occ = c.occ * (0.62 + rnd() * 0.85) * (1 / Math.max(0.55, Math.min(1.7, f))) * k.occ;
    var growth = (rnd() + rnd() - 1) * 14;                        /* рост оборота г/г, % */
    /* сезонный профиль арендатора: шаблон категории + индивидуальный разброс.
       Индекс месяца, 100 = средний месяц. В бою считается из тех же помесячных оборотов. */
    var tpl = SEASON[t.cat === 'FNB' ? 'fnb' : t.cat === 'FAS' ? 'fas' : 'base'];
    var raw = tpl.map(function(v){ return v * (0.94 + rnd() * 0.12); });
    var avg = raw.reduce(function(a, v){ return a + v; }, 0) / 12;
    var season = raw.map(function(v){ return v / avg * 100; });
    return {
      id:'m' + (i + 1),
      brand:(syl1[Math.floor(rnd() * syl1.length)] + syl2[Math.floor(rnd() * syl2.length)]).toUpperCase(),
      cat:t.cat, catName:t.catName, seg:t.seg, sub:t.sub, sub2:t.sub2,
      area:area, m2:m2, occ:occ, toYear:m2 * area * 12, growth:growth, season:season,
      rentM2: m2 * occ / 100 * 0.81                               /* доход ТРЦ с м²: платёж минус эксплуатация и маркетинг */
    };
  });
})();

/* медиана произвольного набора */
function medianOf(list, key){
  var v = list.map(function(x){ return x[key]; }).filter(function(x){ return x != null; }).sort(function(a, b){ return a - b; });
  if (!v.length) return null;
  var h = Math.floor(v.length / 2);
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}

/* медианы по категории считаются из пула, а не задаются вручную */
function mallMedian(cat, key){
  var v = MALL.filter(function(x){ return x.cat === cat; }).map(function(x){ return x[key]; }).sort(function(a, b){ return a - b; });
  if (!v.length) return null;
  var h = Math.floor(v.length / 2);
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}
