/* ФИНАЛЬНАЯ ВЕРСИЯ отчёта по арендатору — два листа.
   Собрана из вариантов A, B и C: логика «как торгует → может ли платить → где среди своих →
   сколько приносит метр → когда решать», плюс иерархия сегмент → категория → подкатегория.
   Выводы не пишутся: только факты и базы сравнения. */

/* компактный режим: крупный шрифт или мало места по высоте */
function isDense(){ return (window.CHART_FS || 1) >= 1.25 || !!window.CHART_DENSE; }
/* в компактном режиме матрица показывает последние два года — иначе лист не закрывается */
function matrixScope(M){
  if (!isDense() || M.years.length <= 2) return M;
  return { years:M.years.slice(-2) };
}
function matrixNote(M){
  return 'тыс. $ · заливка от худшего месяца (красный) к лучшему (зелёный), рекорд и провал в рамке' +
    (matrixScope(M).years.length < M.years.length ? ' · показаны последние 2 года' : '');
}
function H(v, min, max){        /* высота графика: тянется под лист, но не ниже min и не выше v×max */
  var h = v * (window.CHART_H || 1);
  if (max) h = Math.min(h, v * max);
  return Math.max(min || 0, Math.round(h));
}
var BENCH_MIN_N = 5;  /* меньше — группа непоказательна, поднимаемся на уровень выше */
var BENCH_OK_N = 8;    /* от 8 медиана устойчива; 5–7 помечаем как узкую выборку */

/* сравнение словами, а не голой стрелкой: «выше медианы базы ($388) на 1,7%» */
function vsWord(v, what){
  if (window.CHART_TIGHT) return (v >= 0 ? '+' : '−') + num1(Math.abs(v)) + '%';
  return (v >= 0 ? 'выше' : 'ниже') + (what ? ' ' + what : '') + ' на ' + num1(Math.abs(v)) + '%';
}
function baseWord(){ return window.CHART_TIGHT ? 'база ' : 'медиана базы '; }

/* цветной бейдж состояния в подзаголовке карточки */
function badge(st, word){ return '<b class="bdg ' + st + '">' + word + '</b> · '; }

/* цепочка классификации: пилюли со стрелками, группы разделяются увеличенным интервалом */
function parr(){ return '<i class="parr">→</i>'; }
function pgap(){ return '<i class="pgap"></i>'; }

/* цветная точка для легенды в подзаголовке карточки */
function dot(color){ return '<i class="lgd" style="background:' + color + '"></i>'; }

/* график во всю оставшуюся высоту карточки */
/* легенда графика: строка значков с подписями, как в стандартных диаграммах (Олег, 09.11).
   kind: box — столбец/заливка, line — линия, dash — пунктир, dot — точка, shelf — полочка */
function legend(list){
  return '<div class="clg">' + list.filter(function(x){ return x; }).map(function(it){
    var st = it.kind === 'box' ? 'background:' + it.color + (it.op != null ? ';opacity:' + it.op : '')
      : it.kind === 'dot' ? 'background:' + it.color
      : 'border-top-color:' + it.color;
    return '<span><i class="sw ' + it.kind + '" style="' + st + '"></i>' + it.label + '</span>';
  }).join('') + '</div>';
}

/* карточка с легендой в правом верхнем углу — на строке заголовка (Олег, 09.11) */
function cardL(title, unit, lg, body, cls){
  return '<div class="sh-card' + (cls ? ' ' + cls : '') + '"><div class="sh-h2">' + title +
    (unit ? ' <span>' + unit + '</span>' : '') + (lg || '') + '</div>' + body + '</div>';
}
function chFill(id){ return '<div class="chart-wrap fill"><div id="' + id + '"></div></div>'; }

/* шапка листа: реквизиты не строкой мелкого текста, а пилюлями справа от названия —
   строка из девяти фактов подряд не читалась */
function pill(txt, cls){ return '<span class="pill' + (cls ? ' ' + cls : '') + '">' + txt + '</span>'; }
function pills(list){
  return '<div class="sh-pills">' + list.filter(function(x){ return x; }).join('') + '</div>';
}
function sheetHead(kicker, title, list){
  return '<div class="sh-head">' +
    '<div class="sh-id"><div class="sh-k">' + kicker + '</div><div class="sh-t">' + title + '</div></div>' +
    pills(list) +
    '<img class="sh-logo" src="' + window.TCM_LOGO + '" alt=""></div>';
}

/* медианный сезонный профиль базы: по каждому месяцу медиана индексов арендаторов группы.
   Нужен, чтобы отличать «у него провальный февраль» от «февраль провальный у всех». */
/* ТО/м² базы по месяцам в долларах: медиана по группе от «средний ТО/м² × индекс месяца».
   Нужна, чтобы у сезонной формы была абсолютная привязка, а не только проценты. */
function baseMonthM2(peers){
  var withS = peers.filter(function(x){ return x.season; });
  if (withS.length < 3) return null;
  var out = [];
  for (var m = 0; m < 12; m++){
    var v = withS.map(function(x){ return x.m2 * x.season[m] / 100; }).sort(function(a, b){ return a - b; });
    var h = Math.floor(v.length / 2);
    out.push(v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2);
  }
  return out;
}

function baseSeason(peers){
  var withS = peers.filter(function(x){ return x.season; });
  if (withS.length < 3) return null;                  /* по двум арендаторам профиль не строим */
  var out = [];
  for (var m = 0; m < 12; m++){
    var v = withS.map(function(x){ return x.season[m]; }).sort(function(a, b){ return a - b; });
    var h = Math.floor(v.length / 2);
    out.push(v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2);
  }
  return out;
}

/* лестница баз сравнения: от самой близкой группы к самой широкой.
   Учитываются ВСЕ четыре уровня классификатора. Порядок сознательный:
   сначала спускаемся по глубине (под-подкатегория -> подкатегория), и лишь потом
   расширяемся до категории, потому что категория «Fashion & Accessories» — это
   119 арендаторов от женской одежды до часов, база из неё почти бессмысленна.
   Сегмент не отпускается, а РАСШИРЯЕТСЯ на соседнюю ступень цены (Premium ->
   Contemporary…Bridge Luxury): премиальный бренд нельзя мерить по масс-маркету,
   но по соседнему ценовому уровню — можно. */
function benchLadder(b, X){
  var me = X.me;
  var near = segNear(b.seg);                       /* сегмент ± 1 ступень */
  /* подпись «Contemporary и соседние», а не диапазон «Upper Mass–Premium»: из диапазона не видно,
     что свой сегмент входит в базу (Олег, 09.11) */
  var nearLbl = segNear(b.seg).length > 1 ? b.seg + ' и соседние' : b.seg;
  var inNear = function(x){ return near.indexOf(x.seg) >= 0; };

  var levels = [
    { key:'sub2-seg', label:esc(b.sub2) + ' · ' + esc(b.seg), short:'под-подкат. + сегмент',
      f:function(x){ return x.sub2 === b.sub2 && x.seg === b.seg; } },
    { key:'sub2-near', label:esc(b.sub2) + ' · ' + esc(nearLbl), short:'под-подкат. + соседние сегм.',
      f:function(x){ return x.sub2 === b.sub2 && inNear(x); } },
    { key:'sub-seg', label:esc(b.sub) + ' · ' + esc(b.seg), short:'подкатегория + сегмент',
      f:function(x){ return x.sub === b.sub && x.seg === b.seg; } },
    { key:'sub-near', label:esc(b.sub) + ' · ' + esc(nearLbl), short:'подкатегория + соседние сегм.',
      f:function(x){ return x.sub === b.sub && inNear(x); } },
    { key:'sub', label:esc(b.sub), note:'все сегменты', short:'подкатегория',
      f:function(x){ return x.sub === b.sub; } },
    { key:'cat-seg', label:esc(b.catCode) + ' · ' + esc(b.seg), short:'категория + сегмент',
      f:function(x){ return x.cat === b.catCode && x.seg === b.seg; } },
    { key:'cat', label:esc(b.catCode), note:'все сегменты', short:'категория',
      f:function(x){ return x.cat === b.catCode; } },
    { key:'mall', label:'весь молл', short:'молл', f:function(){ return true; } }
  ];
  /* сегмент целиком — в таблицу не выносим, нужен только опорной линией на графике */
  var segLevel = { key:'seg', label:'сегмент ' + esc(b.seg), short:'сегмент',
                   f:function(x){ return x.seg === b.seg; } };

  levels.concat([segLevel]).forEach(function(L){
    var peers = MALL.filter(L.f);
    var all = peers.concat([{ m2:me.m2, occ:me.occ, rentM2:X.rentM2, growth:X.growthMe, area:X.A, toYear:me.toYear, me:true }]);
    L.peers = peers; L.n = peers.length;
    /* состав по сегментам для баз с соседними сегментами: свой сегмент первым, нули не показываем */
    if (/-near$/.test(L.key)){
      var cnt = {};
      peers.forEach(function(x){ cnt[x.seg] = (cnt[x.seg] || 0) + 1; });
      L.mix = [b.seg].concat(near.filter(function(sg){ return sg !== b.seg; }))
        .filter(function(sg){ return cnt[sg]; }).map(function(sg){ return sg + ' ' + cnt[sg]; }).join(', ');
    }
    L.medM2 = medianOf(peers, 'm2');
    L.medOcc = medianOf(peers, 'occ');
    L.medRent = medianOf(peers, 'rentM2');
    L.medGrowth = medianOf(peers, 'growth');
    var sorted = all.slice().sort(function(a, c){ return c.m2 - a.m2; });
    L.rank = sorted.findIndex(function(x){ return x.me; }) + 1;
    L.total = all.length;
    L.pctile = L.n ? Math.round(peers.filter(function(x){ return x.m2 < me.m2; }).length / L.n * 100) : null;
  });
  /* 09.11 решение Олега: база СТРОГО своя — та же подкатегория и тот же сегмент, без расширения
     на соседние сегменты и уровни. Мало арендаторов — помечаем «узкая выборка», но базу не меняем.
     Лестница выше считается только для справки (опорные линии «сегмент», «весь молл»).
     Запасной путь — только если в своей группе нет ни одного арендатора */
  var base = levels.filter(function(L){ return L.key === 'sub-seg'; })[0];
  if (!base.n){
    base = levels.filter(function(L){ return L.n >= BENCH_MIN_N; })[0] || levels[levels.length - 1];
    base.fallback = true;
  }
  base.thin = base.n < BENCH_OK_N;                 /* база набралась, но выборка узкая — медиана шумит */
  return { levels:levels, base:base, seg:segLevel };
}

function finalCtx(b, M){
  var X = ecoCtx(b, M);
  var L = benchLadder(b, X);
  X.levels = L.levels; X.base = L.base; X.segLevel = L.seg;
  X.matGaps = M.rows.filter(function(r){ return r.to == null; }).map(mLabel);

  X.bench = ocrBench(b);                 /* мировой коридор OCR по подкатегории */
  /* плановая ставка из физибилити, приведённая к году отчёта */
  X.planYears = planLadder(b, X.d);                    /* план по годам договора от его старта */
  X.curYear = contractYear(X.d, new Date(Date.now() + 5 * 3600e3));   /* UTC+5 */
  X.factYears = factLadder(X.d, X.curYear);
  X.plan = null;
  if (X.planYears){
    var pc = X.planYears[X.curYear - 1];
    /* ЕДИНАЯ опорная величина: план ТЕКУЩЕГО года договора — во всех местах листа */
    X.plan = { rate:pc.plan, year:PLAN_YEAR, calYear:pc.cal, ctYear:X.curYear };
    X.planPayM2 = pc.plan + X.d.opex + X.d.mkt;
    X.occIfPlan = X.planPayM2 * X.A * X.perN / netTO(X.perTo) * 100;
    X.rateGap = (X.d.rent / pc.plan - 1) * 100;          /* факт против плана текущего года, % */
    X.rateGapNow = X.d.rent - pc.plan;                   /* $/м² */
    X.rateGapYear = X.rateGapNow * X.A * 12;             /* $ в год */
  }
  X.tb = toBench(b, medianOf(MALL, 'm2'),
    MALL.filter(function(x){ return x.sub === b.sub; }));   /* сегмент нормируется на средний по подкатегории */
  /* зона арендатора на пересечении бенчмарков: red | amber | green */
  /* основной коридор для графика нагрузки: мировой бенчмарк, без формата — коридор базы */
  X.occBand = X.bench ? { lo2:X.bench.lo, hi2:X.bench.hi } : { lo2:num1(X.band[0]), hi2:num1(X.band[1]) };
  /* светофор по графику нагрузки: доля месяцев выше бенчмарка + направление тренда */
  X.occHealth = (function(){
    /* по последним 12 месяцам: статус должен говорить о сегодняшнем состоянии, а не обо всей истории */
    var lim = X.occBand.hi2, live = X.occSeries.filter(function(v){ return v != null; }).slice(-12);
    if (!live.length) return null;
    var over = live.filter(function(v){ return v > lim; }).length, share = over / live.length;
    var rising = X.occTrend != null && X.occTrend > 0.3;
    var st = share > 0.7 ? 'red' : ((share >= 0.3 || rising) ? 'amber' : 'green');
    var word = st === 'red' ? 'перегружен' : (st === 'amber' ? 'под давлением' : 'в норме');
    return { st:st, word:word, over:over, n:live.length,
             note:over + ' из ' + live.length + ' мес. выше ' + lim + '%' +
                  (X.occTrend == null ? '' : ', тренд ' + (X.occTrend >= 0 ? '+' : '−') +
                   num1(Math.abs(X.occTrend)) + ' п.п.') };
  })();
  X.meZone = (function(){
    if (!X.tb || !X.bench) return 'green';
    if (X.occ > X.bench.alarm || X.m2 < X.tb.crit) return 'red';
    if (X.occ > X.bench.hi || X.m2 < X.tb.lo) return 'amber';
    return 'green';
  })();
  X.baseSeason = baseSeason(L.base.peers);
  X.baseMonthM2 = baseMonthM2(L.base.peers);
  X.band = [L.base.medOcc * 0.85, L.base.medOcc * 1.15];
  X.baseM2 = L.base.medM2; X.baseOcc = L.base.medOcc; X.baseRent = L.base.medRent; X.baseGrowth = L.base.medGrowth;
  X.m2Gap = (X.m2 / X.baseM2 - 1) * 100;
  X.rentGapBase = (X.rentM2 / X.baseRent - 1) * 100;
  X.growthGapBase = (X.growthMe != null && X.baseGrowth != null) ? X.growthMe - X.baseGrowth : null;
  var occ12 = X.occSeriesLive;
  X.occAbove = occ12.filter(function(v){ return v > X.band[1]; }).length;
  X.occBelow = occ12.filter(function(v){ return v < X.band[0]; }).length;
  /* нагрузка при том же платеже, но обороте на уровне базы: payM2 / baseM2 */
  X.occIfBase = X.baseM2 ? X.payM2 / X.baseM2 * 100 : null;
  X.occVerdict = (function(){
    if (X.occIfBase == null) return 'Нет базы для сравнения оборота.';
    var hi = X.band[1], overNow = X.occ > hi, overBase = X.occIfBase > hi;
    if (overNow && overBase)
      return 'OCR выше коридора и остался бы выше (' + num1(X.occIfBase) + '%), даже если бы арендатор ' +
             'торговал как база — дело в ставке, а не в обороте.';
    if (overNow && !overBase)
      return 'OCR выше коридора из-за оборота: при обороте на уровне базы он был бы ' +
             num1(X.occIfBase) + '% и уложилась бы в коридор. Снижение ставки проблему торговли не решит.';
    if (!overNow && overBase)
      return 'OCR в коридоре только потому, что арендатор торгует лучше базы: при обороте базы было бы ' +
             num1(X.occIfBase) + '%. Запас держится на его выручке, а не на условиях договора.';
    return 'OCR в коридоре и остался бы в нём (' + num1(X.occIfBase) + '%) при обороте на уровне базы — ' +
           'условия договора устойчивы.';
  })();
  /* сводный статус листа: худшее из трёх — нагрузка по месяцам, зона «отдача × OCR», долг */
  /* ключевые цифры: один буллет — один показатель, ok=true даёт зелёный маркер */
  X.keyFacts = (function(){
    var f = [];
    /* язык простой, без тире: что за цифра и что она значит (Олег, 09.11) */
    if (X.tb)
      f.push({ ok:X.m2 >= X.tb.lo, t:'Выручка с 1 м² ' + money(X.m2) + ' в месяц, это ' +
        (X.m2 > X.tb.hi ? 'выше нормы' : (X.m2 >= X.tb.lo ? 'в пределах нормы' : (X.m2 >= X.tb.crit ? 'ниже нормы' : 'намного ниже нормы'))) +
        ' для формата (норма от ' + money(X.tb.lo) + ' до ' + money(X.tb.hi) + ').' });
    if (X.bench)
      f.push({ ok:X.occ <= X.bench.hi, t:'Платежи забирают ' + num1(X.occ) + '% выручки, ' +
        (X.occ > X.bench.alarm ? 'это выше тревожного порога ' + X.bench.alarm + '%' :
          (X.occ > X.bench.hi ? 'это больше нормы' : 'это в пределах нормы')) +
        ' (норма от ' + X.bench.lo + ' до ' + X.bench.hi + '%).' });
    if (X.plan)
      f.push({ ok:X.rateGap >= 0, t:'Ставка $' + num1(X.d.rent) + ' за м², это на ' + Math.round(Math.abs(X.rateGap)) + '% ' +
        (X.rateGap >= 0 ? 'выше' : 'ниже') + ' плана на ' + X.curYear + '-й год договора ($' + Math.round(X.plan.rate) + ').' });
    if (M.ltmYoY != null)
      f.push({ ok:M.ltmYoY >= 0, t:'Оборот за последние 12 месяцев ' + (M.ltmYoY >= 0 ? 'вырос' : 'снизился') + ' на ' +
        num1(Math.abs(M.ltmYoY)) + '% к предыдущим 12 месяцам.' });
    f.push({ ok:!(X.d.debt > 0), t:X.d.debt > 0
      ? 'Долг ' + money(X.d.debt) + ', это ' + num1(X.debtMonths) + ' мес. аренды, просрочка ' + X.d.overdueDays + ' дн.'
      : 'Долга нет, арендатор платит вовремя.' });
    return f;
  })();
  X.health = (function(){
    var rank = { green:0, amber:1, red:2 }, words = ['в норме', 'под давлением', 'зона риска'];
    var lv = Math.max(X.occHealth ? rank[X.occHealth.st] : 0, rank[X.meZone] || 0,
                      X.d.debt > 0 ? (X.debtMonths >= 2 ? 2 : 1) : 0);
    var why = [];
    if (X.occHealth && X.occHealth.st === 'red') why.push('OCR выше нормы формата');
    else if (X.occHealth && X.occHealth.st === 'amber') why.push('OCR под давлением');
    /* причину по зоне добавляем, только если она НЕ дублирует OCR-причину выше */
    if (X.meZone !== 'green' && X.tb && X.m2 < X.tb.lo) why.push('ТО на м² ниже нормы формата');
    if (X.d.debt > 0) why.push('долг ' + num1(X.debtMonths) + ' мес. аренды');
    return { st:['green', 'amber', 'red'][lv], word:words[lv], why:why.join(' · ') };
  })();


  /* вывод и рекомендации: правила детерминированные, язык — человеческий.
     Вывод — мысль о ситуации (1–2 отклонения цифрами), не пересказ графиков.
     Рекомендации — три, из РАЗНЫХ зон, по убыванию важности. */
  X.summary = (function(){
    var o = {};
    var toLow = X.tb && X.m2 < X.tb.lo, toHigh = X.tb && X.m2 > X.tb.hi;
    var ocrHigh = X.bench && X.occ > X.bench.hi, ocrAlarm = X.bench && X.occ > X.bench.alarm;
    var ocrLow = X.bench && X.occ < X.bench.lo;
    var rateLow = X.plan && X.rateGap < 0, matDown = M.ltmYoY != null && M.ltmYoY < 0;
    var debtBig = X.d.debt > 0 && X.debtMonths >= 1, debtAny = X.d.debt > 0;

    /* ---- вывод: 3–4 предложения, мысль + пара цифр ---- */
    var s1 = toHigh ? 'Арендатор продаёт больше, чем обычно продают магазины его формата'
      : toLow ? 'Арендатор продаёт меньше нормы для своего формата: выручка с метра на ' +
        num1((1 - X.m2 / X.tb.lo) * 100) + '% ниже нижней границы нормы'
      : 'Арендатор продаёт на обычном для своего формата уровне';
    if (ocrAlarm)
      s1 += ', но платежи ТРЦ забирают ' + num1(X.occ) + '% его выручки, хотя для формата нормально не больше ' +
        X.bench.hi + '%. Значит, проблема в цене договора, а не в торговле';
    else if (ocrHigh)
      s1 += ', но платежи забирают ' + num1(X.occ) + '% выручки при норме до ' + X.bench.hi +
        '%, поэтому запаса прочности у него нет';
    else if (ocrLow)
      s1 += ', а платежи забирают заметно меньше обычного, поэтому ставку можно поднять';
    else
      s1 += ', и платежи ему по силам';
    var p = [s1];
    var tail = [];
    if (debtBig) tail.push('долг на ' + num1(X.debtMonths) + ' мес. аренды');
    else if (debtAny) tail.push('небольшой долг');
    if (matDown) tail.push('оборот за год снизился на ' + num1(Math.abs(M.ltmYoY)) + '%');
    if (tail.length) p.push('Есть риски: ' + tail.join(', '));
    if (rateLow && !ocrHigh)
      p.push('Ставка ниже плана, заложенного в модели ТРЦ, поэтому ТРЦ недополучает ' + money(Math.abs(X.rateGapYear)) + ' в год');
    /* главная проблема называется словами (Олег, 09.11): по тяжести — нагрузка, долг, продажи */
    var fitR = X.bench ? Math.max(0, X.bench.hi / 100 * netTO(X.perTo) / X.A / X.perN - X.d.opex - X.d.mkt) : null;
    var ocrTxt = ocrAlarm
      ? 'платежи слишком велики для его выручки, и ставку нужно снизить примерно до $' + num1(fitR) + ' за м²'
      : 'платежи немного выше посильного уровня, и ставку стоит снизить примерно до $' + num1(fitR) + ' за м²';
    var main = (ocrAlarm || (ocrHigh && !debtBig && !toLow)) ? ocrTxt
      : debtBig ? 'долг ' + money(X.d.debt) + ' нужно погасить или согласовать график его погашения'
      : toLow ? 'продажи ниже нормы формата, и арендатор должен показать, как он их поднимет'
      : ocrHigh ? ocrTxt
      : '';
    p.push(X.health.st === 'red'
      ? 'Продлевать договор стоит только после того, как будет решена главная проблема' + (main ? ': ' + main : '')
      : X.health.st === 'amber'
        ? 'Продлевать договор можно, но на новых условиях' + (main ? ': ' + main : '')
        : 'Арендатор устойчивый, при продлении остаётся договориться об условиях на следующий срок');
    o.text = p.join('. ') + '.';

    /* ---- рекомендации: кандидаты из разных зон со своим весом ---- */
    var cand = [];
    if (debtAny)
      cand.push({ zone:'debt', w:debtBig ? 100 : 60,
        t:'Долг: согласовать график погашения ' + money(X.d.debt) + ' до ' + X.T.deadlineTxt + '.' });
    if (ocrAlarm || ocrHigh){
      var fit = Math.max(0, X.bench.hi / 100 * netTO(X.perTo) / X.A / X.perN - X.d.opex - X.d.mkt);
      cand.push({ zone:'rate', w:ocrAlarm ? 90 : 70,
        t:'Ставка: чтобы платежи были арендатору по силам (не больше ' + X.bench.hi + '% выручки), ставка должна быть около $' +
          num1(fit) + ' за м². Сейчас она $' + num1(X.d.rent) + '.' });
    } else if (rateLow)
      cand.push({ zone:'rate', w:80,
        t:'Ставка: поднять до плана, то есть на $' + num1(Math.abs(X.rateGapNow)) + ' за м². ТРЦ получит ещё ' +
          money(Math.abs(X.rateGapYear)) + ' в год, платежи составят ' + num1(X.occIfPlan) + '% выручки.' });
    else if (ocrLow)
      cand.push({ zone:'rate', w:50,
        t:'Ставка: у арендатора есть запас, при продлении можно обсуждать повышение.' });
    if (toLow)
      cand.push({ zone:'trade', w:85,
        t:'Оборот: чтобы выйти на норму формата, выручку нужно поднять на ' + num1((X.tb.lo / X.m2 - 1) * 100) +
          '%. Разобрать с арендатором, почему продажи отстают.' });
    else if (matDown)
      cand.push({ zone:'trade', w:55,
        t:'Оборот: за год продажи упали на ' + num1(Math.abs(M.ltmYoY)) + '%. Попросить у арендатора план, как он вернёт рост.' });
    if (X.T.monthsToDecision <= 6)
      cand.push({ zone:'term', w:45,
        t:'Сроки: решение о продлении нужно принять до ' + X.T.deadlineTxt + ', поэтому переговоры лучше начать уже сейчас.' });
    if (X.plan && X.curYear < PLAN_TERM && !rateLow && !ocrAlarm)
      cand.push({ zone:'plan', w:30,
        t:'План: со следующего года модель ТРЦ рассчитывает на ставку $' + Math.round(X.planYears[X.curYear].plan) + ' за м².' });
    cand.push({ zone:'watch', w:10, t:'Контроль: проверить показатели ещё раз через три месяца по новой выгрузке.' });
    /* по одной из зоны, по убыванию веса, максимум три */
    cand.sort(function(a, c){ return c.w - a.w; });
    var used = {}, recs = [];
    cand.forEach(function(c){
      if (recs.length >= 3 || used[c.zone]) return;
      used[c.zone] = 1; recs.push(c.t);
    });
    o.recs = recs;
    return o;
  })();

  return X;
}

/* ---------- финальный отчёт ---------- */
function repF(b, M){
  var X = finalCtx(b, M), B = X.base;

  /* ---------- лист 1 ---------- */
  var kp1 =
    kpiS('Оборот · ' + X.perLabel, money(X.perTo),
        X.perYoY != null && X.prevLabel ? arrow(X.perYoY) + ' к ' + X.prevLabel
          : (window.CHART_TIGHT ? 'нет базы г/г' : 'год назад этого периода нет'),
        toneBy(X.perYoY)) +
    kpiS('ТО на м² в мес.', money(X.m2),
        baseWord() + money(X.baseM2) + ' · ' + vsWord(X.m2Gap, ''), toneBy(X.m2Gap)) +
    kpiS('Рост к прошлому году', X.growthMe == null ? '—' : pct(X.growthMe),
        X.growthMe == null ? 'нужен тот же период год назад'
          : X.growthGapBase == null ? 'у базы нет данных о росте'
          : 'база ' + pct(X.baseGrowth) + ' · ' +
            (X.growthGapBase >= 0 ? 'быстрее на ' : 'медленнее на ') + num1(Math.abs(X.growthGapBase)) + ' п.п.',
        toneBy(X.growthMe)) +
    kpiS('Оборот за 12 мес.', M.ltm != null ? money(M.ltm) : '—',
        M.ltm == null ? 'нужно 12 мес. подряд'
          : (M.ltmYoY != null ? arrow(M.ltmYoY) + ' к предыдущим 12 мес.' : 'скользящий год'),
        toneBy(M.ltmYoY)) +
    kpiS('Просадка от пика', X.drawdown == null ? '—' : pct(X.drawdown),
        X.matPeak ? 'скользящий год к максимуму ' + money(X.matPeak) : 'нужно 12 мес. подряд',
        toneBy(X.drawdown)) +
    kpiS('Сезонность', 'пик ' + MON[M.seasonTop.m - 1] + ' ' + pct(M.seasonTop.idx - 100),
        'разброс по месяцам ' + num1(M.cv) + '%');


  /* классификация читается как цепочка: сегмент → категория → подкатегория → под-подкатегория */
  var idChain = [pill(esc(b.seg), 'seg'), pill(esc(b.cat)), pill(esc(b.sub)), pill(esc(b.sub2))].join(parr());
  var idPlace = [pill(b.floor + ' · ' + b.unit), pill(sp(b.area) + ' м²')];
  var head1 = sheetHead('Арендатор и его торговля', esc(b.brand), [
    idChain, pgap(),
    idPlace[0], idPlace[1], pgap(),
    pill('договор ' + X.d.contract), pgap(),
    pill('история ' + M.n + ' мес. · ' + mLabel(M.rows[0]) + ' — ' + mLabel(M.rows[M.rows.length - 1])),
    M.nLive < M.n ? pill((M.n - M.nLive) + ' мес. не подано', 'warn') : pill('пропусков нет'),
    pgap(),
    pill('период отчёта: ' + X.perLabel, 'acc'),
    /* база сравнения — на листе 1 (Олег, 09.11): с листа 2 шапка-реквизиты убрана */
    pill('база: ' + B.label + (B.note ? ', ' + B.note : '') + ' · ' +
         plural(B.n, 'арендатор', 'арендатора', 'арендаторов') + (B.mix ? ' (' + B.mix + ')' : ''), 'seg'),
    B.thin ? pill('узкая выборка', 'warn') : '',
    pill('стр. 1 из 3', 'gh')
  ]);

  var p1 = head1 +
    '<div class="sh-kpis six">' + kp1 + '</div>' +
    '<div class="sh-body r7">' +
      cardL('Товарооборот по месяцам', 'тыс. $', legend([
          { kind:'box', color:C.green, op:0.72, label:'Оборот за месяц' },
          { kind:'dash', color:C.copper, label:'Тренд' }]), chFill('f-bars')) +
      /* подзаголовок — только единица: сумма и изменение за год показаны на самом графике (Олег, 09.11) */
      cardL('Скользящий год', M.ltm != null ? 'тыс. $' : 'сумма за 12 мес. подряд, тыс. $',
        M.ltm != null ? legend([
            { kind:'line', color:'#6B4226', label:'Сумма за последние 12 месяцев' },
            { kind:'dot', color:'#3F6FD1', label:'Сейчас и 12 месяцев назад' },
            M.mat.filter(function(v){ return v != null; }).length > 12 ? { kind:'arrow', color:'#9AA3AF', label:'Изменение за год' } : null
          ]) : '',
        M.ltm != null ? chFill('f-mat')
          : '<div class="mn2">Ряд из 12 месяцев подряд не набирается. ' +
            (X.matGaps.length ? 'Не подан оборот за ' + X.matGaps.join(', ') +
              ' — окно скользящего года разрывается на этом месяце, хотя истории ' + M.n + ' мес. ' +
              'График появится, как только пропуск закроется.'
              : 'Истории пока ' + M.n + ' мес.') + '</div>') +
      cardL('ТО на м² по месяцам', '$ с м² в месяц', legend([
          { kind:'box', color:'#1B2A4A', op:0.42, label:esc(b.brand) },
          { kind:'dash', color:C.copper, label:'Медиана базы «' + B.label + '» (' + money(X.baseM2) + ')' }]), chFill('f-m2')) +
      cardL('Сезонный профиль', '$ с м² в месяц за последние ' + M.seasonN + ' мес. (' + mLabel(M.seasonFrom) + ' — ' + mLabel(M.seasonTo) +
        ')' + (X.baseMonthM2 ? '' : ' · у базы мало арендаторов, помесячного профиля нет'),
        legend(X.baseMonthM2 ? [
          { kind:'shelf', color:'#1B2A4A', label:'База: продажи в этот месяц' },
          { kind:'box', color:'#2FA36B', op:0.45, label:esc(b.brand) + ' продаёт больше базы' },
          { kind:'box', color:'#E2553D', op:0.45, label:'Продаёт меньше базы' }]
          : [{ kind:'shelf', color:'#C0703A', label:esc(b.brand) }]), chFill('f-season')) +
      card('Оборот по месяцам и годам', matrixNote(M), matrixTable(matrixScope(M), M.gTo, function(v){ return num1(v / 1000); }, 'sum', '', { heat:true, mark:true })) +
      card('Итоги по годам', '', yearTable(b, M, X)) +
    '</div>' +
    '<div class="sh-foot">Источник — лист «Арендаторы» и лист «Обороты» (демо-данные). ' +
      'Логика листа: факт → динамика → сезон. Сформировано ' + today() + ' · Hyper Partners</div>';

  /* ---------- лист 2 ---------- */
  var occTone = X.occ > X.band[1] ? 'down' : 'up';          /* выше коридора — риск для платежей */
  var kp2 =
    kpiS('Арендный доход, 12 мес.', money(X.rentYear), 'ставка $' + X.d.rent + '/м² в месяц', 'acc') +
    kpiS('Доход ТРЦ с м² в мес.', money(X.rentM2),
        baseWord() + money(X.baseRent) + ' · ' + vsWord(X.rentGapBase, ''), toneBy(X.rentGapBase)) +
    kpiS('OCR арендатора', num1(X.occ) + '%',
        'коридор базы ' + num1(X.band[0]) + '–' + num1(X.band[1]) + '%', occTone) +
    (X.plan ? kpiS('Ставка к плану физибилити', (X.rateGap >= 0 ? '+' : '−') + num1(Math.abs(X.rateGap)) + '%',
        '$' + num1(X.d.rent) + ' против $' + num1(X.plan.rate) + '/м² · ' + X.curYear + '-й год договора',
        X.rateGap >= 0 ? 'up' : 'down')
      : kpiS('Месяцев выше коридора', X.occAbove + ' из ' + X.occN, 'в периоде отчёта',
        X.occAbove === 0 ? 'up' : 'down')) +
    kpiS('Место в базе по ТО/м²', B.rank + ' из ' + B.total, 'выше ' + B.pctile + '% группы «' + B.label + '»',
        B.pctile != null && B.pctile >= 50 ? 'up' : 'down') +
    kpiS(X.d.debt > 0 ? 'Долг' : 'Долга нет', X.d.debt > 0 ? money(X.d.debt) : '—',
        X.d.debt > 0 ? num1(X.debtMonths) + ' мес. аренды · ' + X.d.overdueDays + ' дн.' : 'платит в срок',
        X.d.debt > 0 ? 'down' : 'up');

  /* 09.11 по решению Олега: реквизиты (период, база, состояние, классификация, место) с листа 2 убраны —
     они есть на листе 1; состояние показывает бейдж у графика OCR */
  var head2 = sheetHead('Деньги ТРЦ, позиция и сроки', esc(b.brand), [pill('стр. 2 из 3', 'gh')]);

  var p2 = head2 +
    '<div class="sh-kpis six">' + kp2 + '</div>' +
    '<div class="ceo-body">' +

      '<div class="cl">' +
        card('OCR по месяцам', (X.occHealth ? badge(X.occHealth.st, X.occHealth.word) : '') +
          '% от оборота без НДС · пунктир — бенчмарк «' + esc(b.sub) + '» (' +
          X.occBand.lo2 + '–' + X.occBand.hi2 + '%), выше верхнего — красные точки' +
          ' · полоса — коридор базы (' + Math.round(X.band[0]) + '–' + Math.round(X.band[1]) + '%)' +
          (X.occTrend == null ? '' : ' · тренд ' + (X.occTrend >= 0 ? '+' : '−') + num1(Math.abs(X.occTrend)) +
            ' п.п. за полгода'),
          chFill('f-occ'), 'grow') +
        card('ТО на м² и OCR',
          dot('#1B2A4A') + esc(b.sub2) + ' · ' + dot('#5B8DEF') + 'прочие ' + esc(b.sub) + ' · ' + esc(b.seg) +
          (X.tb ? ' · зоны: ТО×OCR' : ''),
          chFill('f-scatter'), 'grow') +
      '</div>' +

      /* 09.11.2026 по решению Олега: «Может ли арендатор платить» убрана, левая колонка шире (~+70%);
         справа сверху ряд «Ставка | Доход ТРЦ»; из «Условий и замены» убрана таблица из 4 строк */
      '<div class="cl">' +
        '<div class="cl-row">' +
          (X.planYears ? card('Ставка: план физибилити и факт',
            '$/м² в месяц по годам договора · ' + X.curYear + '-й год' +
            (X.rateGapNow == null ? '' : ' · факт ' + (X.rateGapNow >= 0 ? 'выше' : 'ниже') + ' плана на $' +
              num1(Math.abs(X.rateGapNow)) + '/м² = ' + money(Math.abs(X.rateGapYear)) + ' в год'),
            chFill('f-rate'), 'wide') : '') +
          card('Доход ТРЦ с м² в месяц', '', chFill('f-rent')) +
        '</div>' +
        card('Календарь договора', '', ch('f-time', H(46, 42, 1.2))) +
        card('Условия и замена', '',
          '<ul class="sh-sum tight kf">' + X.keyFacts.map(function(f){
            return '<li class="' + (f.ok ? 'ok' : 'bad') + '">' + f.t + '</li>';
          }).join('') + '</ul>' +
          '<div class="sl-h">Вывод</div><div class="sl-t">' + X.summary.text + '</div>' +
          '<div class="sl-h">Рекомендации</div>' +
          '<ol class="recs">' + X.summary.recs.map(function(r){ return '<li>' + r + '</li>'; }).join('') + '</ol>', 'cond') +
      '</div>' +
    '</div>' +
    '<div class="sh-foot">База — арендаторы той же подкатегории и того же сегмента' + (B.fallback ? ' (своих нет, взята ближайшая группа)' : '') + '; медианы и коридоры листа — по ней. Сформировано ' + today() + ' · Hyper Partners</div>';

  var dense = (isDense() ? ' dense' : '') + (window.CHART_TIGHT ? ' tighter' : '');
  /* лист 3 «Сравнение с коллегами» — compare.js (Олег, 09.11) */
  return sheetWrap(p1, 'f-1' + dense) + sheetWrap(p2, 'f-2' + dense) + sheetWrap(repCmp(b), 'f-3' + dense) +
    '<div class="sheet-hint">Три листа A3 (альбомные). «Печать / PDF» выдаёт ровно три страницы.</div>';
}

function repFDraw(b, M){
  JOBS.push(function(){
    var X = finalCtx(b, M), B = X.base;
    /* оси X графиков в одном ряду — на одном уровне (Олег, 09.11): общий нижний отступ */
    var AX = fs(20);
    barChart(document.getElementById('f-bars'), {
      rows:M.rows.map(function(r){ return { y:r.y, m:r.m, val:r.to == null ? null : r.to / 1000 }; }),
      h:document.getElementById('f-bars').clientHeight, fmt:function(v){ return num1(v); }, minSlot:0, hardMin:180, trend:true, padB:AX });
    barChart(document.getElementById('f-m2'), {
      rows:M.rows.map(function(r){ return { y:r.y, m:r.m, val:r.m2 }; }),
      h:document.getElementById('f-m2').clientHeight, fmt:function(v){ return sp(Math.round(v)); }, minSlot:0, hardMin:180,
      barColor:'#1B2A4A', op:0.42,                  /* светлее (Олег, 09.11): было 0.55 */
      ref:{ val:X.baseM2 }, padB:AX });
    var sBase = X.baseMonthM2 ? M.season12.map(function(r){ return X.baseMonthM2[r.m - 1]; }) : null;
    seasonChart2(document.getElementById('f-season'), M.season12, { base:sBase, padB:AX });
    var matEl = document.getElementById('f-mat');
    if (matEl) matChart(matEl, M.rows, M.mat.map(function(v){ return v == null ? null : v / 1000; }),
      { hardMin:180, fmt:function(v){ return num1(v); }, markBlue:true, bracket:true, bracketMul:1000, padB:AX });
    /* по требованию Олега: «OCR по месяцам» и ряд «Ставка | Доход ТРЦ» — одной высоты,
       нижние границы на одном уровне. Высоту задаёт правая колонка (календарь и условия — по содержимому) */
    var occCard = document.getElementById('f-occ').parentNode.parentNode,
        rateRow = document.querySelector('#report .f-2 .cl-row');
    occCard.style.flex = '';
    if (rateRow){ rateRow.style.flex = ''; rateRow.parentNode.lastElementChild.style.flex = ''; }  /* перерисовка — мерить с нуля */
    if (rateRow &&Math.abs(rateRow.getBoundingClientRect().top - occCard.getBoundingClientRect().top) < 2){
      var rowH = rateRow.offsetHeight;
      /* ряд ниже на 28% (Олег, 09.11: −40%, затем +20%): место уходит матрице ТО×OCR слева и «Условиям и замене» справа.
         Печать на A3, поэтому действует и в режиме «как на печати» */
      if (!document.body.classList.contains('autoheight')){
        /* не ниже минимума карточек ряда (шапка + график 96px), иначе ряд переполнится */
        var rowMin = 0;
        [].forEach.call(rateRow.children, function(c){
          var cw = c.querySelector('.chart-wrap');
          rowMin = Math.max(rowMin, c.offsetHeight - (cw ? cw.offsetHeight : 0) + 96);
        });
        rowH = Math.max(rowMin, Math.round(rowH * 0.72));
        rateRow.style.flex = '0 0 ' + rowH + 'px';
        rateRow.parentNode.lastElementChild.style.flex = '1 1 auto';
      }
      for (var k = 0; k < 2; k++) occCard.style.flex = '0 0 ' + rowH + 'px';
    }
    /* ставку рисуем раньше OCR: её нижний отступ (подписи лет + пометка) задаёт уровень оси X и для OCR */
    var rateEl = document.getElementById('f-rate'), ax2 = null;
    if (rateEl && X.planYears && X.factYears)
      ax2 = rateChart(rateEl, X.planYears, X.factYears, X.curYear,
        { h:rateEl.clientHeight, hardMin:200,
          note:'план ' + PLAN_YEAR + ' г., индексация ' + num1(PLAN_INDEX * 100) + '% в год · старт договора ' + contractStartYear(X.d) });
    matChart(document.getElementById('f-occ'), M.rows, X.occSeries,
      { h:document.getElementById('f-occ').clientHeight, hardMin:180, band:[X.band[0], X.band[1]], bandColor:'passive',
        bench:{ lo:X.occBand.lo2, hi:X.occBand.hi2 }, hot:X.occBand.hi2, invert:true,
        fmt:function(v){ return Math.round(v) + '%'; }, padB:ax2 });

    /* распределения строятся по БАЗЕ сравнения — те же арендаторы, что и в медианах листа */

    /* только своя подкатегория: вся категория смешала бы кофейню с ресторанами и фудкортом */
    /* точки — строго база (подкатегория + сегмент), те же арендаторы, что в медианах листа */
    var pts = B.peers.map(function(x){
      return { x:x.m2, y:x.occ, name:x.brand, tone: x.sub2 === b.sub2 ? 'sub2' : 'sub' };
    }).concat([{ x:X.m2, y:X.occ, name:b.brand, me:true }]);
    /* зоны = пересечение бенчмарков: норма ТО/м² (подкатегория × сегмент × медиана молла) и OCR */
    var zones = (X.tb && X.bench)
      ? { tLo:X.tb.lo, tCrit:X.tb.crit, oLo:X.bench.lo, oHi:X.bench.hi, oAlarm:X.bench.alarm }
      : null;
    scatterChart(document.getElementById('f-scatter'), pts, {
      h:document.getElementById('f-scatter').clientHeight, zones:zones, meZone:X.meZone,
      xLab:'ТО/м², $ в месяц', yLab:'OCR, %', xFmt:money,
      yFmt:function(v){ return Math.round(v) + '%'; } });


    var rentItems = [{ name:b.brand, val:X.rentM2, color:'#C0703A' },   /* T() экранирует сам */
                     { name:'Медиана базы', val:X.baseRent, color:'#C7CFDC' }];
    /* план — сразу за арендатором: длинные подписи «План физибилити» и «Сегмент …» не стоят рядом */
    if (X.plan) rentItems.splice(1, 0, { name:'План физибилити', val:X.plan.rate * 0.81, color:'#C7CFDC' });
    var segLvl = X.segLevel;
    var mallLvl = X.levels.filter(function(L){ return L.key === 'mall'; })[0];
    if (segLvl && segLvl.medRent != null && B.key !== 'seg')
      rentItems.push({ name:'Сегмент ' + b.seg, val:segLvl.medRent, color:'#C7CFDC' }   /* все сравнения одним цветом, арендатор выделен (Олег, 09.11) */);
    if (mallLvl && mallLvl.medRent != null && B.key !== 'mall')
      rentItems.push({ name:'Весь молл', val:mallLvl.medRent, color:'#C7CFDC' });
    /* вертикальные столбцы, ось X на уровне оси «Ставки» (Олег, 09.11) */
    benchCols(document.getElementById('f-rent'), rentItems, { padB:ax2 != null ? ax2 : fs(30) });
    /* по требованию Олега: шаги на равном расстоянии (не пропорционально времени) — все даты читаются */
    stepBar(document.getElementById('f-time'), [
      { ms:X.T.start, label:'старт', sub:X.T.startTxt, color:'#6B7280' },
      { ms:X.T.now, label:'сегодня', sub:X.T.nowTxt, color:'#1B2A4A', big:true, now:true },
      { ms:X.T.deadline, label:'решение', sub:X.T.deadlineTxt, color:'#C0703A', big:true },
      { ms:X.T.end, label:'окончание', sub:X.T.endTxt, color:'#6B7280' }
    ], { h:H(46, 42, 1.2) });
    cmpDraw(b); cmpBind(b);                         /* лист 3 */
    fitSheet();
  });
}
