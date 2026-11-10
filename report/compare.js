/* ЛИСТ 3 «Сравнение с коллегами» (Олег, 09.11): фильтры слева, справа четыре графика
   по брендам и годам — ТО, ТО на м², средний чек, превышение ТО над порогом договора.
   Наш арендатор везде медного цвета. Режимы: «месяц к месяцу по годам» и «с начала года».

   ДЕМО-ДАННЫЕ: у пула MALL есть только годовые итоги, поэтому помесячный оборот, чеки,
   менеджер и порог договора генерируются здесь детерминированно (одинаково при каждом открытии).
   В бою CMP_SERIES заполняется из выгрузки: помесячный ТО, число чеков, менеджер, порог. */

var CMP_MGRS = ['Алиева Д.', 'Каримов Р.', 'Соколова Е.', 'Юсупов Т.'];          /* вымышленные */
var CMP_CHECK = { FNB:11, FAS:46, HGL:32, BTY:24, ELC:120, ENT:14, SVC:19, KSK:6, SUP:17 };  /* средний чек, $ */
var CMP_SEGK = { 'Mass':0.7, 'Upper Mass':0.85, 'Contemporary':1, 'Premium':1.6, 'Bridge Luxury':2.6, 'Luxury':4 };

/* последний месяц с данными у демо-арендаторов — общий «сегодня» листа */
var CMP_LAST = (function(){
  var best = { y:0, m:0 };
  BRANDS.forEach(function(b){
    b.rows.forEach(function(r){ if (r.to != null && (r.y * 12 + r.m) > (best.y * 12 + best.m)) best = { y:r.y, m:r.m }; });
  });
  return best;
})();
var CMP_FIRST_Y = CMP_LAST.y - 2;                     /* три календарных года истории у пула */

/* ряды пула: { id, brand, cat, catName, seg, sub, sub2, area, mgr, me:false, rows:[{y,m,to,chk,ex}] } */
var CMP_POOL = MALL.map(function(x, idx){
  var rnd = lcg(5000 + idx * 37);
  var chk0 = (CMP_CHECK[x.cat] || 20) * (CMP_SEGK[x.seg] || 1) * (0.8 + rnd() * 0.4);
  var g = (x.growth || 0) / 100;
  var rows = [], bp = null;
  for (var y = CMP_FIRST_Y; y <= CMP_LAST.y; y++){
    for (var m = 1; m <= 12; m++){
      if (y === CMP_LAST.y && m > CMP_LAST.m) break;
      var t = y + (m - 1) / 12 - (CMP_LAST.y - 0.5);  /* годы от середины последнего года */
      var to = x.m2 * x.area * (x.season ? x.season[m - 1] / 100 : 1) * Math.pow(1 + g, t) * (0.93 + rnd() * 0.14);
      rows.push({ y:y, m:m, to:Math.round(to), chk:chk0 * Math.pow(1.03, t) * (0.96 + rnd() * 0.08) });
    }
  }
  /* порог процентной аренды — месячный, около среднего оборота: у части арендаторов превышен */
  var avg = rows.reduce(function(a, r){ return a + r.to; }, 0) / rows.length;
  bp = avg * (0.82 + rnd() * 0.4);
  rows.forEach(function(r){ r.ex = Math.max(0, r.to - bp); });
  return { id:x.id, brand:x.brand, cat:x.cat, catName:x.catName, seg:x.seg, sub:x.sub, sub2:x.sub2,
           area:x.area, mgr:CMP_MGRS[Math.floor(rnd() * CMP_MGRS.length)], rows:rows, me:false };
});

/* наш арендатор в том же виде: оборот — настоящий ряд отчёта, чек и порог — демо */
function cmpMe(b){
  var rnd = lcg(b.seed + 7), live = b.rows.filter(function(r){ return r.to != null; });
  var avg = live.reduce(function(a, r){ return a + r.to; }, 0) / Math.max(1, live.length);
  var bp = avg * 0.95;
  var rows = b.rows.map(function(r, i){
    return { y:r.y, m:r.m, to:r.to, chk:b.check * Math.pow(1 + (b.checkTrend || 0), i) * (0.97 + rnd() * 0.06),
             ex:r.to == null ? null : Math.max(0, r.to - bp) };
  });
  return { id:b.id, brand:b.brand, cat:b.catCode, catName:b.cat, seg:b.seg, sub:b.sub, sub2:b.sub2,
           area:b.area, mgr:CMP_MGRS[1], rows:rows, me:true };
}

/* ---------- состояние фильтров (сбрасывается при смене арендатора) ---------- */
var CMP = null;
function cmpInit(b){
  if (CMP && CMP.brand === b.id) return;
  /* по умолчанию — последний месяц, за который арендатор подал оборот, и год до него */
  var live = b.rows.filter(function(r){ return r.to != null; }), lm = live[live.length - 1] || CMP_LAST;
  var years = [lm.y - 1, lm.y].filter(function(y){ return y >= CMP_FIRST_Y; });
  CMP = { brand:b.id, mode:'month', month:lm.m, years:years,
          cat:b.catCode, sub:b.sub, sub2:'', segs:[], mgrs:[] };       /* пустой список = «все» */
}

function cmpPeers(me){
  return CMP_POOL.filter(function(x){
    return (!CMP.cat || x.cat === CMP.cat) && (!CMP.sub || x.sub === CMP.sub) && (!CMP.sub2 || x.sub2 === CMP.sub2) &&
           (!CMP.segs.length || CMP.segs.indexOf(x.seg) >= 0) && (!CMP.mgrs.length || CMP.mgrs.indexOf(x.mgr) >= 0);
  }).concat([me]);                                     /* наш арендатор показывается всегда */
}

/* значение показателя за год: месяц или январь…месяц */
function cmpVal(x, y, key){
  var rs = x.rows.filter(function(r){
    return r.y === y && (CMP.mode === 'month' ? r.m === CMP.month : r.m <= CMP.month) && r.to != null;
  });
  if (!rs.length) return null;
  if (CMP.mode === 'ytd'){                            /* с начала года нужен полный набор месяцев */
    var need = x.rows.filter(function(r){ return r.y === y && r.m <= CMP.month; }).length;
    if (rs.length < CMP.month || need < CMP.month) return null;
  }
  var to = rs.reduce(function(a, r){ return a + r.to; }, 0);
  if (key === 'to') return to;
  if (key === 'm2') return to / x.area / rs.length;                     /* в среднем за месяц */
  if (key === 'chk'){                               /* TCM: месяцы без числа чеков не участвуют, иначе чек = 0 */
    var rc = rs.filter(function(r){ return r.chk > 0; });
    if (!rc.length) return null;
    var tc = rc.reduce(function(a, r){ return a + r.to; }, 0);
    var n = rc.reduce(function(a, r){ return a + r.to / r.chk; }, 0);   /* число чеков */
    return n ? tc / n : null;
  }
  if (key === 'ex') return rs.reduce(function(a, r){ return a + (r.ex || 0); }, 0);
  return null;
}

/* ---------- разметка листа ---------- */
function cmpOptions(list, cur, allLabel){
  return '<option value="">' + allLabel + '</option>' + list.map(function(v){
    var val = typeof v === 'string' ? v : v[0], lab = typeof v === 'string' ? v : v[1];
    return '<option value="' + esc(val) + '"' + (val === cur ? ' selected' : '') + '>' + esc(lab) + '</option>';
  }).join('');
}
function cmpChecks(name, list, cur){
  var lab = !cur.length ? 'Все' : (cur.length === 1 ? cur[0] : 'Выбрано: ' + cur.length);
  return '<details class="f3-dd"><summary>' + esc(String(lab)) + '</summary><div class="f3-ddl">' +
    list.map(function(v){
      return '<label><input type="checkbox" data-f="' + name + '" value="' + esc(String(v)) + '"' +
        (cur.indexOf(v) >= 0 ? ' checked' : '') + '> ' + esc(String(v)) + '</label>';
    }).join('') + '</div></details>';
}
function uniq(a){ return a.filter(function(v, i){ return v != null && a.indexOf(v) === i; }).sort(); }

function cmpFilters(me){
  var all = CMP_POOL.concat([me]);
  var cats = uniq(all.map(function(x){ return x.cat; })).map(function(c){
    var n = all.filter(function(x){ return x.cat === c; })[0]; return [c, n.catName || c];
  });
  var subs = uniq(all.filter(function(x){ return !CMP.cat || x.cat === CMP.cat; }).map(function(x){ return x.sub; }));
  var sub2s = uniq(all.filter(function(x){ return (!CMP.cat || x.cat === CMP.cat) && (!CMP.sub || x.sub === CMP.sub); })
                 .map(function(x){ return x.sub2; }));
  var segs = SEG_ORDER.filter(function(s){ return all.some(function(x){ return x.seg === s; }); });
  var years = [];
  for (var y = CMP_FIRST_Y; y <= CMP_LAST.y; y++) years.push(y);
  var f = function(lab, html){ return '<div class="f3-f"><div class="f3-l">' + lab + '</div>' + html + '</div>'; };
  return '<div class="f3-side">' +
    f('Сравнение', '<div class="f3-mode">' +
      '<button data-mode="month"' + (CMP.mode === 'month' ? ' class="on"' : '') + '>Месяц к месяцу</button>' +
      '<button data-mode="ytd"' + (CMP.mode === 'ytd' ? ' class="on"' : '') + '>С начала года</button></div>') +
    f('Менеджер', cmpChecks('mgrs', CMP_MGRS.slice(), CMP.mgrs)) +
    f('Сегмент', cmpChecks('segs', segs, CMP.segs)) +
    f('Категория', '<select data-f="cat">' + cmpOptions(cats, CMP.cat, 'Все') + '</select>') +
    f('Подкатегория', '<select data-f="sub">' + cmpOptions(subs, CMP.sub, 'Все') + '</select>') +
    f('Под-подкатегория', '<select data-f="sub2">' + cmpOptions(sub2s, CMP.sub2, 'Все') + '</select>') +
    f('Месяц', '<select data-f="month">' + MON.map(function(mn, i){
      return '<option value="' + (i + 1) + '"' + (i + 1 === CMP.month ? ' selected' : '') + '>' + mn + '</option>'; }).join('') + '</select>') +
    f('Годы', cmpChecks('years', years, CMP.years)) +
  '</div>';
}

var CMP_METRICS = [
  /* обороты — в тыс. $: короткая цифра помещается над каждым столбцом (Олег, 09.11) */
  { key:'to',  title:'ТО бренда, тыс. $', fmt:function(v){ return k1(v); } },
  { key:'m2',  title:'ТО на м², $', unitYtd:'в среднем за месяц', fmt:function(v){ return sp(Math.round(v)); } },
  { key:'chk', title:'Средний чек, $', fmt:function(v){ return v < 50 ? num1(v) : sp(Math.round(v)); } },
  { key:'ex',  title:'Превышение ТО без НДС над порогом договора, тыс. $', note:'только арендаторы, у которых порог превышен',
    fmt:function(v){ return k1(v); } }
];
function k1(v){ var t = v / 1000; return t >= 100 ? sp(Math.round(t)) : num1(t); }

function cmpPeriodLabel(){
  var yrs = CMP.years.slice().sort();
  return (CMP.mode === 'month' ? MON[CMP.month - 1] : 'янв–' + MON[CMP.month - 1]) + ' ' + yrs.join(' и ');
}

function repCmp(b){
  cmpInit(b);
  var me = cmpMe(b);
  var head = sheetHead('Сравнение с коллегами', esc(b.brand), [
    pill((CMP.mode === 'month' ? 'месяц к месяцу: ' : 'с начала года: ') + cmpPeriodLabel(), 'acc'),
    pill('арендаторов в выборке: ' + cmpPeers(me).length, 'seg'),
    pill('медным — ' + esc(b.brand)), pgap(), pill('стр. 3 из 3', 'gh')]);
  return head +
    '<div class="f3-body">' + cmpFilters(me) +
      '<div class="f3-charts">' + CMP_METRICS.map(function(k){
        return cardL(k.title, (CMP.mode === 'ytd' && k.unitYtd ? k.unitYtd : '') + (k.note ? (k.unitYtd && CMP.mode === 'ytd' ? ' · ' : '') + k.note : ''),
          '', chFill('f3-' + k.key), 'grow');
      }).join('') + '</div>' +
    '</div>' +
    '<div class="sh-foot">Демо: помесячный оборот коллег, чеки, менеджеры и пороги договоров сгенерированы. ' +
      'В бою — из выгрузки оборотов и договоров. Сформировано ' + today() + ' · Hyper Partners</div>';
}

/* ---------- график: бренды группами, внутри группы столбцы по годам ---------- */
function cmpChart(host, groups, years, fmt){
  var w = Math.max(host.clientWidth || 600, 300), h = host.clientHeight || 160;
  if (!groups.length){ host.innerHTML = '<div class="mn2">Нет арендаторов с данными по выбранным фильтрам.</div>'; return; }
  var ny = years.length, padL = 2, padR = 2, padB = fs(44);
  var gw = (w - padL - padR) / groups.length, bw = Math.min(fs(40), (gw - fs(6)) / ny);
  /* подпись у края графика прижимается внутрь, а не обрезается */
  var edge = function(cx, hw){
    var p = cx - hw < 1 ? { x:1, a:'start' } : (cx + hw > w - 1 ? { x:w - 1, a:'end' } : { x:cx, a:'middle' });
    p.l = p.a === 'start' ? 1 : (p.a === 'end' ? w - 1 - 2 * hw : cx - hw); p.r = p.l + 2 * hw;   /* фактический отрезок подписи */
    return p;
  };
  /* % к прошлому году — отдельной строкой над всеми столбцами, у КАЖДОГО бренда (Олег, 09.11):
     раньше процент пропускался, если рядом стояла цифра соседа. Тесно — второй ряд строки */
  var lastCx = function(gi){ return padL + gw * gi + (gw - bw * ny) / 2 + bw * (ny - 1) + bw / 2; };
  var pcts = [], rowEnd = [-1e9, -1e9];
  groups.forEach(function(g, gi){
    var v = g.vals[ny - 1], pv = ny > 1 ? g.vals[ny - 2] : null;
    if (v == null || !pv) return;
    var d = (v / pv - 1) * 100, up = d >= 0, t = (up ? '▲ +' : '▼ −') + num1(Math.abs(d)) + '%';
    var pe = edge(lastCx(gi), tw(t, 10.5, 700) / 2 + 2);
    var row = pe.l >= rowEnd[0] + 3 ? 0 : 1;
    rowEnd[row] = Math.max(rowEnd[row], pe.r);
    pcts.push({ t:t, up:up, pe:pe, row:row, gi:gi, d:d });
  });
  var rows = pcts.some(function(p){ return p.row === 1; }) ? 2 : 1;
  var rowY = function(r){ return fs(12) + fs(13) * r; };
  var padT = rowY(rows - 1) + fs(19);
  var y0 = h - padB, ih = y0 - padT;
  var mx = 0;
  groups.forEach(function(g){ g.vals.forEach(function(v){ if (v != null && v > mx) mx = v; }); });
  mx = mx || 1;
  /* палитра (Олег, 09.11: спокойнее): коллеги — нейтральный серый, последний год — сланцевый;
     наш арендатор — те же ступени в медной гамме. Фон вокруг арендатора не заливаем */
  var shade = function(me, k){
    var peer = ['#E5E8ED', '#C9CFD8', '#8A96A8'], mine = ['#F2DCC9', '#E2AE88', '#C0703A'];
    var pal = me ? mine : peer, off = Math.max(0, pal.length - ny);
    return pal[Math.min(pal.length - 1, off + k)];
  };
  var labW = Math.max.apply(null, groups.map(function(g){
    return Math.max.apply(null, g.vals.map(function(v){ return v == null ? 0 : tw(fmt(v), 10.5, 600); })); }));
  var showVal = labW <= bw + fs(4);                    /* не помещается — подписываем только последний год */
  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';
  var used = [];                                   /* занятые места цифр: при тесноте лишнюю не пишем */
  pcts.forEach(function(p){
    s += T(p.pe.x, rowY(p.row), p.t, { size:10.5, w:700, fill:p.up ? '#2E7D5B' : '#C0392B', a:p.pe.a });
  });
  /* золотая звезда — у кого самый большой прирост к прошлому периоду (Олег, 09.11), только при росте */
  var best = -1, bestD = 0;
  pcts.forEach(function(p){ if (p.d > bestD){ bestD = p.d; best = p.gi; } });
  var sid = 'gst' + (host.id || '').replace(/[^a-z0-9]/gi, '');
  s += '<defs><radialGradient id="' + sid + '" cx="0.38" cy="0.32" r="0.75">' +
       '<stop offset="0" stop-color="#FFF8D2"/><stop offset="0.45" stop-color="#F5C518"/><stop offset="1" stop-color="#B07D0A"/>' +
       '</radialGradient>' +
       /* тень под звездой — чтобы она отделялась от столбца */
       '<filter id="' + sid + 'sh" x="-50%" y="-50%" width="200%" height="200%">' +
       '<feDropShadow dx="0" dy="1.4" stdDeviation="1.3" flood-color="#1B2A4A" flood-opacity="0.45"/></filter>' +
       /* блик в центре звезды */
       '<radialGradient id="' + sid + 'hl"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
       '<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>';
  var star = function(cx, cy, R){
    var p = [];
    for (var i = 0; i < 10; i++){
      var r = i % 2 ? R * 0.45 : R, a = -Math.PI / 2 + i * Math.PI / 5;
      p.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
    }
    /* объём: градиент + блик на верхнем луче; лёгкая пульсация — класс gstar (стили) */
    return '<g class="gstar"><polygon points="' + p.join(' ') + '" fill="url(#' + sid + ')" stroke="#9A6B00" stroke-width="0.7"' +
      ' stroke-linejoin="round" filter="url(#' + sid + 'sh)"/>' +
      '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (R * 0.38).toFixed(1) + '" fill="url(#' + sid + 'hl)"/></g>';
  };
  var free = function(x1, x2, y){ return !used.some(function(q){ return x2 > q[0] && x1 < q[1] && Math.abs(y - q[2]) < fs(12); }); };
  /* наш арендатор обрабатывается первым — его цифры не вытесняются соседями */
  var order = groups.map(function(g, i){ return i; }).sort(function(a, c){ return (groups[c].me ? 1 : 0) - (groups[a].me ? 1 : 0) || a - c; });
  order.forEach(function(gi){
    var g = groups[gi];
    var gx = padL + gw * gi, inner = bw * ny, x0 = gx + (gw - inner) / 2;
    g.vals.forEach(function(v, k){
      var x = x0 + bw * k, cx = x + bw / 2;
      if (v != null){
        var bh = Math.max(1, v / mx * ih);
        s += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (y0 - bh).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) +
             '" height="' + bh.toFixed(1) + '" fill="' + shade(g.me, k) + '"/>';
        var lt = fmt(v), lw2 = tw(lt, 10.5, 700) / 2 + 2, ly = y0 - bh - fs(4);
        /* значение у КАЖДОГО столбца: если место занято соседней цифрой — поднимаем на строку выше */
        var pe = edge(cx, lw2), lim = rowY(rows - 1) + fs(14);
        for (var tries = 0; tries < 2 && !free(pe.l, pe.r, ly) && ly - fs(12) >= lim; tries++) ly -= fs(12);
        s += T(pe.x, ly, lt, { size:10.5, w:g.me ? 700 : 600, fill:g.me ? '#8F4E22' : '#4B5563', a:pe.a });
        used.push([pe.l, pe.r, ly]);
        /* звезда лежит на верхнем крае столбца лучшего бренда */
        if (gi === best && k === ny - 1){
          var R = Math.max(fs(6), Math.min(fs(11), bw / 2 + 2));
          s += star(cx, bh > 2 * R + 6 ? y0 - bh + R + 3 : y0 - bh - R - 1, R);
        }
      } else if (free(cx - 9, cx + 9, y0 - fs(4))){
        s += T(cx, y0 - fs(4), 'нет', { size:9, fill:'#B9C0CA' });
        used.push([cx - 9, cx + 9, y0 - fs(4)]);
      }
      if (bw >= tw('2026', 10, 400) + 2) s += T(cx, y0 + fs(13), years[k], { size:10, fill:C.mut });
    });
    /* название бренда под группой, при нехватке места — перенос по словам в 2 строки */
    var words = String(g.name).split(' '), lines = [], cur = '';
    words.forEach(function(wd){ var t2 = cur ? cur + ' ' + wd : wd;
      if (!cur || tw(t2, 10, 600) <= gw - 4) cur = t2; else { lines.push(cur); cur = wd; } });
    if (cur) lines.push(cur);
    lines.slice(0, 2).forEach(function(ln, li){
      var t3 = ln;
      while (tw(t3, 10, g.me ? 700 : 600) > gw - 2 && t3.length > 3) t3 = t3.slice(0, -2) + '…';
      s += T(gx + gw / 2, y0 + fs(28) + fs(12) * li, t3, { size:10, w:g.me ? 700 : 600, fill:g.me ? '#8F4E22' : C.ink });
    });
    if (gi) s += '<line x1="' + gx.toFixed(1) + '" y1="' + (y0 + 2) + '" x2="' + gx.toFixed(1) + '" y2="' + h +
                 '" stroke="#DDE1E7" stroke-dasharray="2 2"/>';
  });
  s += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + (w - padR) + '" y2="' + y0 + '" stroke="#B5BAC2"/>';
  host.innerHTML = s + '</svg>';
}

function cmpDraw(b){
  var me = cmpMe(b), peers = cmpPeers(me), years = CMP.years.slice().sort();
  CMP_METRICS.forEach(function(k){
    var host = document.getElementById('f3-' + k.key);
    if (!host) return;
    var groups = peers.map(function(x){
      return { name:x.brand, me:x.me, vals:years.map(function(y){ return cmpVal(x, y, k.key); }) };
    }).filter(function(g){
      if (g.me) return true;
      if (k.key === 'ex') return g.vals.some(function(v){ return v > 0; });
      return g.vals.some(function(v){ return v != null; });
    });
    var last = years.length - 1;
    groups.sort(function(a, c){ return (c.vals[last] || 0) - (a.vals[last] || 0); });
    /* сколько групп помещается: минимум ~16px на столбец; наш арендатор остаётся всегда */
    var cap = Math.max(4, Math.floor(host.clientWidth / Math.max(fs(44), years.length * fs(17) + fs(8))));
    var shown = groups.slice(0, cap);
    if (!shown.some(function(g){ return g.me; })){
      var mine = groups.filter(function(g){ return g.me; })[0];
      if (mine) shown[shown.length - 1] = mine;
    }
    var unit = host.parentNode.parentNode.querySelector('.sh-h2 span');
    if (groups.length > shown.length && unit && !unit.getAttribute('data-cut')){
      unit.textContent += (unit.textContent ? ' · ' : '') + 'показаны ' + shown.length + ' из ' + groups.length + ' по убыванию';
      unit.setAttribute('data-cut', '1');
    }
    cmpChart(host, shown, years, k.fmt);
  });
}

/* фильтры работают без пересборки листов 1–2: меняется только лист 3 */
function cmpBind(b){
  var side = document.querySelector('#report .f3-side');
  if (!side) return;
  var redraw = function(){
    var wrap = side.closest('.sheet');
    var tmp = document.createElement('div');
    tmp.innerHTML = repCmp(b);
    wrap.innerHTML = tmp.innerHTML;
    cmpDraw(b); cmpBind(b);
  };
  side.querySelectorAll('select').forEach(function(el){
    el.onchange = function(){
      var f = el.getAttribute('data-f');
      if (f === 'month') CMP.month = +el.value;
      else {
        CMP[f] = el.value;
        if (f === 'cat'){ CMP.sub = ''; CMP.sub2 = ''; }
        if (f === 'sub') CMP.sub2 = '';
      }
      redraw();
    };
  });
  side.querySelectorAll('input[type=checkbox]').forEach(function(el){
    el.onchange = function(){
      var f = el.getAttribute('data-f'), v = f === 'years' ? +el.value : el.value, list = CMP[f];
      var i = list.indexOf(v);
      if (el.checked && i < 0) list.push(v);
      if (!el.checked && i >= 0) list.splice(i, 1);
      if (f === 'years' && !list.length) list.push(CMP_LAST.y);   /* хотя бы один год */
      redraw();
      var dd = document.querySelector('#report .f3-side input[data-f="' + f + '"]');
      if (dd) dd.closest('details').open = true;                  /* список остаётся открытым */
    };
  });
  side.querySelectorAll('button[data-mode]').forEach(function(el){
    el.onclick = function(){ CMP.mode = el.getAttribute('data-mode'); redraw(); };
  });
}
