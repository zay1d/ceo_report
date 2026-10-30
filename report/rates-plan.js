/* ================= Плановые ставки аренды (физибилити) =================
   Ставки из финансовой модели молла: базовая аренда, $/м² в месяц, БЕЗ опекса
   и маркетинга — то есть сопоставимо со статьёй «Аренда» в отчёте.

   ВАЖНО: модель написана на PLAN_YEAR и напрямую с сегодняшней ставкой
   несравнима. Ставка приводится к году отчёта индексацией PLAN_INDEX —
   в отчёте это помечено («план 2022, приведён к 2026»).

   ЦИФРЫ НИЖЕ ВЫМЫШЛЕННЫЕ — заменить выгрузкой из физибилити. Структура
   разреза (категория × этаж) типовая для таких моделей; если в вашем файле
   разрез иной (зона, размер юнита), меняется только PLAN_RATE и floorOf(). */

var PLAN_YEAR = 2022;             /* год финансовой модели */
var PLAN_INDEX = 0.05;            /* индексация, заложенная в модель, в год */

/* базовая аренда по категории и этажу, $/м² в месяц на PLAN_YEAR */
var PLAN_RATE = {
  FAS: { '-1':22, '1':62, '2':48, '3':38, '4':30 },
  FNB: { '-1':26, '1':70, '2':54, '3':44, '4':52 },   /* фудкорт на 4 этаже дороже профильных */
  HGL: { '-1':18, '1':46, '2':34, '3':28, '4':22 },
  BTY: { '-1':24, '1':68, '2':50, '3':40, '4':32 },
  ELC: { '-1':20, '1':52, '2':40, '3':32, '4':26 },
  ENT: { '-1':12, '1':28, '2':22, '3':18, '4':16 },
  SVC: { '-1':16, '1':44, '2':32, '3':26, '4':20 },
  KSK: { '-1':40, '1':120, '2':95, '3':78, '4':64 },  /* островки: ставка с метра кратно выше */
  SUP: { '-1':10, '1':20, '2':16, '3':14, '4':12 }
};

/* этаж арендатора из строки вида «3 этаж» / «−1 этаж» */
function floorOf(b){
  var m = String(b.floor || '').match(/-?\d+/);
  return m ? m[0] : '1';
}

/* плановая ставка, приведённая к году отчёта: {base, rate, year, toYear} или null */
function planRate(b, toYear){
  var byFloor = PLAN_RATE[b.catCode];
  if (!byFloor) return null;
  var base = byFloor[floorOf(b)];
  if (base == null) return null;
  var years = Math.max(0, (toYear || PLAN_YEAR) - PLAN_YEAR);
  return { base:base, rate:base * Math.pow(1 + PLAN_INDEX, years),
           year:PLAN_YEAR, toYear:toYear || PLAN_YEAR };
}

/* ================= план по годам договора =================
   Физибилити задаёт ставку на 5 лет: год 1 — базовая, дальше индексация.
   ФАКТИЧЕСКАЯ история ставок в демо восстанавливается от текущей ставки назад
   с меньшим темпом — заменить реальными данными по годам договора. */
var PLAN_TERM = 5;                /* горизонт модели, лет */
var FACT_INDEX_DEMO = 0.03;       /* демо-темп фактической индексации */

/* календарный год старта договора из строки «01.06.2024 — ...» */
function contractStartYear(d){
  var m = String(d && d.contract || '').match(/\d{2}\.\d{2}\.(\d{4})/);
  return m ? +m[1] : PLAN_YEAR;
}

/* [{ y:1..5, plan:$/м² }] — план по годам ДОГОВОРА: базовая ставка модели,
   проиндексированная от PLAN_YEAR до календарного года каждого года договора */
function planLadder(b, d){
  var byFloor = PLAN_RATE[b.catCode];
  if (!byFloor) return null;
  var base = byFloor[floorOf(b)];
  if (base == null) return null;
  var startY = contractStartYear(d);
  var out = [];
  for (var i = 0; i < PLAN_TERM; i++){
    var calYears = Math.max(0, startY + i - PLAN_YEAR);
    out.push({ y:i + 1, cal:startY + i, plan:base * Math.pow(1 + PLAN_INDEX, calYears) });
  }
  return out;
}

/* какой год договора идёт сейчас: 1..PLAN_TERM (по дате начала из строки договора) */
function contractYear(d, today){
  var m = String(d && d.contract || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return 1;
  var start = new Date(+m[3], +m[2] - 1, +m[1]);
  var years = Math.floor((today - start) / (365.25 * 24 * 3600 * 1000)) + 1;
  return Math.max(1, Math.min(PLAN_TERM, years));
}

/* фактические ставки по годам договора: до текущего года включительно */
function factLadder(d, curY){
  if (!d) return null;
  var out = [];
  for (var i = curY; i >= 1; i--)
    out.unshift({ y:i, fact:d.rent / Math.pow(1 + FACT_INDEX_DEMO, curY - i) });
  return out;
}
