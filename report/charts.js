/* SVG-графики в реальных пикселях (без CDN, без viewBox-масштабирования).
   Стандарт tcm-design: ось Y скрыта, значения у точек/столбцов, ось X тонкая с засечками. */

var MON = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
var C = { navy:'#1B2A4A', copper:'#C0703A', ink:'#2D2D2D', mut:'#6B7280', line:'#E5E7EB',
          green:'#4E9B6F', ok:'#2E7D52', bad:'#C0392B', warn:'#C9862B', grey:'#A9B0BA' };

/* ---------- форматирование ---------- */
function sp(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function money(v){ return '$' + sp(Math.round(v)); }
function moneyC(v){ return v < 50 ? '$' + num1(v) : '$' + sp(Math.round(v)); }   /* средний чек: мелкие суммы с десятыми */
function num1(v){ return String(Math.round(v * 10) / 10).replace('.', ','); }
function num2(v){ return v.toFixed(2).replace('.', ','); }
function pct(v){ return (v >= 0 ? '+' : '−') + num1(Math.abs(v)) + '%'; }
function kUsd(v){ return num1(v / 1000); }                 /* тыс. $ */
function mLabel(r){ return MON[r.m - 1] + ' ' + r.y; }
function mShort(r){ return MON[r.m - 1] + ' ' + String(r.y).slice(2); }
function today(){ var d = new Date(Date.now() + 5 * 3600e3); /* UTC+5 */
  return ('0'+d.getUTCDate()).slice(-2)+'.'+('0'+(d.getUTCMonth()+1)).slice(-2)+'.'+d.getUTCFullYear(); }
function plural(n, one, few, many){
  var a = Math.abs(n) % 100, b = a % 10;
  return n + ' ' + (a > 10 && a < 20 ? many : b === 1 ? one : (b >= 2 && b <= 4 ? few : many));
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }


/* Определяет, поднимает ли браузер мелкие шрифты до минимума (настройка Chrome
   «Минимальный размер шрифта»). Если да — подписи рисуются крупнее, чем считает
   раскладка, и цифры налезают друг на друга. Возвращает эффективный минимум в px или 0. */
function detectFontFloor(){
  function widthAt(px){
    var e = document.createElement('span');
    e.textContent = 'MMMMMMMMMM';
    e.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;' +
      "font-family:'Segoe UI',sans-serif;font-weight:400;font-size:" + px + 'px';
    document.body.appendChild(e);
    var w = e.getBoundingClientRect().width;
    e.parentNode.removeChild(e);
    return w;
  }
  var big = widthAt(40), small = widthAt(8);
  if (!big) return 0;
  var ratio = small / (big / 5);
  return ratio > 1.15 ? Math.round(8 * ratio * 10) / 10 : 0;
}

/* ---------- измерение текста ---------- */
var _cv, _ctx;
function fs(v){ return Math.round(v * (window.CHART_FS || 1) * 10) / 10; }   /* общий масштаб подписей */
function tw(text, size, weight){
  if (!_cv){ _cv = document.createElement('canvas'); _ctx = _cv.getContext('2d'); }
  _ctx.font = (weight || 400) + ' ' + fs(size) + "px 'Segoe UI', sans-serif";
  return _ctx.measureText(text).width;
}
/* подпись у края: прижимаем к границе, чтобы не выходила за пределы графика */
function Tedge(x, y, text, w, o){
  o = o || {};
  var half = tw(text, o.size || 10, o.w || 400) / 2, a = 'middle', xx = x;
  if (x - half < 1){ a = 'start'; xx = 1; }
  else if (x + half > w - 1){ a = 'end'; xx = w - 1; }
  o.a = a;
  return T(xx, y, text, o);
}
function T(x, y, s, o){
  o = o || {};
  return '<text x="' + x + '" y="' + y + '" font-size="' + fs(o.size || 11) + '" font-weight="' + (o.w || 400) +
    '" fill="' + (o.fill || C.ink) + '" text-anchor="' + (o.a || 'middle') + '"' +
    (o.rot ? ' transform="rotate(' + o.rot + ' ' + x + ' ' + y + ')"' : '') +
    ' font-family="Segoe UI, sans-serif">' + esc(s) + '</text>';
}

/* ============ 1. Столбцы по месяцам (+ опц. линия второй серии) ============ */
/* opts: rows[{y,m,val}], h, fmt, line:{vals[], color, dash, name}, barColor */
function barChart(host, o){
  var w = Math.max(host.clientWidth || host.parentNode.clientWidth || 700, o.hardMin == null ? 320 : o.hardMin);
  var rows = o.rows, n = rows.length;
  var minW = n * (o.minSlot == null ? 26 : o.minSlot) + 40;
  if (w < minW) w = minW;                                  /* узкий экран → скролл внутри карточки */
  /* o.padB — общий нижний отступ: оси X соседних графиков на одном уровне (Олег, 09.11) */
  var h = o.h || 240, padT = 26, padB = o.padB != null ? o.padB : 34, padL = 6, padR = 6;
  var iw = w - padL - padR, slot = iw / n, bw = Math.min(slot * 0.72, 46);
  var vals = rows.map(function(r){ return r.val; }).filter(function(v){ return v != null; });
  var max = Math.max.apply(null, vals) * 1.12 || 1;
  var y0 = h - padB, ih = y0 - padT;
  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';

  /* разделители календарных лет (на низком графике год не подписываем) */
  var showYears = h >= 150;
  for (var i = 1; i < n; i++) if (rows[i].y !== rows[i-1].y){
    var xd = padL + slot * i;
    s += '<line x1="'+xd+'" y1="'+(padT-(showYears?14:8))+'" x2="'+xd+'" y2="'+y0+'" stroke="#DDE1E7" stroke-width="1" stroke-dasharray="3 3"/>';
    if (showYears) s += T(xd + 4, padT - 6, rows[i].y, { size:10.5, w:600, fill:C.mut, a:'start' });
  }
  if (n && showYears) s += T(padL + 4, padT - 6, rows[0].y, { size:10.5, w:600, fill:C.mut, a:'start' });

  /* шаг подписей значений и месяцев */
  var lblW = Math.max.apply(null, vals.map(function(v){ return tw(o.fmt(v), 10.5, 600); }));
  var vStep = Math.max(1, Math.ceil((lblW + 5) / slot));
  var mw = Math.max.apply(null, rows.map(function(r){ return tw(mShort(r), 10, 400); }));
  var mStep = Math.max(1, Math.ceil((mw + 6) / slot));

  rows.forEach(function(r, i){
    if (r.val == null){                                    /* месяц без данных — не ноль */
      var xg = padL + slot * i + (slot - bw) / 2;
      s += '<rect x="'+xg.toFixed(1)+'" y="'+(y0-18)+'" width="'+bw.toFixed(1)+'" height="18" fill="#FBFCFD" stroke="#DDE1E7" stroke-dasharray="2 2"/>';
      s += T(padL + slot * i + slot / 2, y0 - 24, 'нет', { size:9.5, fill:'#B9C0CA' });
      if ((n - 1 - i) % mStep === 0) s += Tedge(padL + slot * i + slot / 2, y0 + 13, mShort(r), w, { size:10, fill:C.mut });
      return;
    }
    var x = padL + slot * i + (slot - bw) / 2, bh = Math.max(1, r.val / max * ih), y = y0 - bh;
    s += '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+
         '" fill="'+(o.barColor || C.green)+'" fill-opacity="'+(o.op || 0.72)+'"/>';
    if ((n - 1 - i) % vStep === 0)
      s += T(padL + slot * i + slot / 2, y - 5, o.fmt(r.val), { size:10.5, w:600, fill:C.ink });
    if ((n - 1 - i) % mStep === 0)
      s += Tedge(padL + slot * i + slot / 2, y0 + 13, mShort(r), w, { size:10, fill:C.mut });
  });

  /* линия тренда: обычная регрессия по месяцам с данными */
  if (o.trend){
    var sx = 0, sy = 0, sxy = 0, sxx = 0, cnt = 0;
    rows.forEach(function(r, i){
      if (r.val == null) return;
      sx += i; sy += r.val; sxy += i * r.val; sxx += i * i; cnt++;
    });
    if (cnt >= 3){
      var den = cnt * sxx - sx * sx;
      if (den !== 0){
        var k = (cnt * sxy - sx * sy) / den, q = (sy - k * sx) / cnt;
        var tY = function(i){ return y0 - Math.max(0, Math.min(max, k * i + q)) / max * ih; };
        var x1 = padL + slot / 2, x2 = padL + slot * (n - 1) + slot / 2;
        s += '<line x1="' + x1.toFixed(1) + '" y1="' + tY(0).toFixed(1) + '" x2="' + x2.toFixed(1) +
             '" y2="' + tY(n - 1).toFixed(1) + '" stroke="' + C.copper + '" stroke-width="1.6" stroke-dasharray="6 3"/>';
        s += T(x2, tY(n - 1) - 6, 'тренд', { size:10, w:600, fill:C.copper, a:'end' });
      }
    }
  }

  /* вторая серия линией (скользящее среднее / прошлый год) */
  if (o.line){
    var lv = o.line.vals, pts = [];
    lv.forEach(function(v, i){ if (v == null) return;
      pts.push([padL + slot * i + slot / 2, y0 - v / max * ih]); });
    var d = '', prev = null;
    lv.forEach(function(v, i){
      if (v == null){ prev = null; return; }
      var x = padL + slot * i + slot / 2, y = y0 - v / max * ih;
      d += (prev === null ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' '; prev = 1;
    });
    s += '<path d="'+d+'" fill="none" stroke="'+(o.line.color || C.grey)+'" stroke-width="'+(o.line.wid||2)+
         '"'+(o.line.dash ? ' stroke-dasharray="'+o.line.dash+'"' : '')+' stroke-linejoin="round"/>';
    pts.forEach(function(p){ s += '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3" fill="'+(o.line.color||C.grey)+'"/>'; });
    if (pts.length){ var last = pts[pts.length-1];
      s += T(last[0], last[1] - 8, o.line.lastLabel || '', { size:10.5, w:600, fill:o.line.color || C.mut, a:'end' }); }
  }

  /* опорная линия (например, медиана базы сравнения) */
  if (o.ref && o.ref.val != null && o.ref.val <= max){
    var ry = y0 - o.ref.val / max * ih;
    s += '<line x1="'+padL+'" y1="'+ry.toFixed(1)+'" x2="'+(w-padR)+'" y2="'+ry.toFixed(1)+
         '" stroke="'+(o.ref.color || C.copper)+'" stroke-width="1.6" stroke-dasharray="6 4"/>';
    if (o.ref.label)
      s += T(w - padR - 2, ry - 4, o.ref.label, { size:9.5, w:600, fill:o.ref.color || C.copper, a:'end' });
  }

  /* ось X поверх столбцов */
  s += '<line x1="'+padL+'" y1="'+y0+'" x2="'+(w-padR)+'" y2="'+y0+'" stroke="#B5BAC2" stroke-width="1"/>';
  for (var k = 0; k <= n; k++){ var xt = padL + slot * k;
    s += '<line x1="'+xt.toFixed(1)+'" y1="'+y0+'" x2="'+xt.toFixed(1)+'" y2="'+(y0+4)+'" stroke="#B5BAC2" stroke-width="1"/>'; }
  host.innerHTML = s + '</svg>';
}

/* ============ 2. Линия (динамика + скользящий год) ============ */
/* opts: rows[{y,m}], series:[{vals, color, dash, wid, fill, labels:bool, fmt}], h */
function lineChart(host, o){
  var w = Math.max(host.clientWidth || 700, o.hardMin == null ? 320 : o.hardMin);
  var rows = o.rows, n = rows.length;
  if (!o.noMin && w < 560) w = 560;
  var h = o.h || 250, padT = 30, padB = 32, padL = 10, padR = 46;
  var iw = w - padL - padR, y0 = h - padB, ih = y0 - padT, step = n > 1 ? iw / (n - 1) : 0;
  var all = [];
  o.series.forEach(function(se){ se.vals.forEach(function(v){ if (v != null) all.push(v); }); });
  if (o.band){ all.push(o.band[0]); all.push(o.band[1]); }
  var mx = Math.max.apply(null, all), mn = Math.min.apply(null, all);
  var pad = (mx - mn) * (o.padK == null ? 0.35 : o.padK) || mx * 0.2 || 1;
  var hi = mx + pad, lo = Math.max(0, mn - pad);
  var Y = function(v){ return y0 - (v - lo) / (hi - lo) * ih; };
  var X = function(i){ return padL + step * i; };
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';

  if (o.band){                                   /* коридор нормы фоном */
    var by1 = Y(Math.max(o.band[0], o.band[1])), by2 = Y(Math.min(o.band[0], o.band[1]));
    s += '<rect x="'+padL+'" y="'+by1.toFixed(1)+'" width="'+(w-padL-padR)+'" height="'+
         Math.abs(by2 - by1).toFixed(1)+'" fill="#4E9B6F" fill-opacity="0.12"/>';
  }

  var showYears = h >= 170;                      /* на низком графике год не подписываем — он есть на оси X */
  for (var i = 1; i < n; i++) if (rows[i].y !== rows[i-1].y){
    var xd = X(i) - step / 2;
    s += '<line x1="'+xd.toFixed(1)+'" y1="'+(padT-(showYears?16:10))+'" x2="'+xd.toFixed(1)+'" y2="'+y0+'" stroke="#DDE1E7" stroke-dasharray="3 3"/>';
    if (showYears) s += T(xd + 4, padT - 6, rows[i].y, { size:10.5, w:600, fill:C.mut, a:'start' });
  }
  if (n && showYears) s += T(padL, padT - 6, rows[0].y, { size:10.5, w:600, fill:C.mut, a:'start' });

  o.series.forEach(function(se){
    var d = '', prev = null, first = null, lastX = null;
    se.vals.forEach(function(v, i){
      if (v == null){ prev = null; return; }
      var x = X(i), y = Y(v);
      if (first === null) first = x; lastX = x;
      d += (prev === null ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' '; prev = 1;
    });
    if (se.fill && first !== null)
      s += '<path d="'+d+'L'+lastX.toFixed(1)+' '+y0+' L'+first.toFixed(1)+' '+y0+' Z" fill="'+se.fill+'" stroke="none"/>';
    s += '<path d="'+d+'" fill="none" stroke="'+se.color+'" stroke-width="'+(se.wid||2.5)+'"'+
         (se.dash ? ' stroke-dasharray="'+se.dash+'"' : '')+' stroke-linejoin="round"/>';
    se.vals.forEach(function(v, i){ if (v == null) return;
      s += '<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="'+(se.dot||3)+'" fill="'+se.color+'"/>'; });
    /* подпись у последней точки серии */
    var li = -1; se.vals.forEach(function(v, i){ if (v != null) li = i; });
    if (li >= 0 && se.name)
      s += T(X(li) + 7, Y(se.vals[li]) + 4, se.name, { size:10.5, w:600, fill:se.color, a:'start' });
  });

  /* подписи значений главной серии (первая в списке), с прореживанием */
  var main = o.series[0];
  if (main.labels !== false && h >= 90){          /* на низком графике значения не подписываем */
    var lw = Math.max.apply(null, main.vals.filter(function(v){return v!=null;}).map(function(v){ return tw(main.fmt(v), 10.5, 600); }));
    var st = Math.max(1, Math.ceil((lw + 6) / (step || 1)));
    main.vals.forEach(function(v, i){ if (v == null) return;
      if ((n - 1 - i) % st === 0) s += T(X(i), Y(v) - 8, main.fmt(v), { size:10.5, w:600, fill:C.ink }); });
  }

  var mw = Math.max.apply(null, rows.map(function(r){ return tw(mShort(r), 10, 400); }));
  var ms = Math.max(1, Math.ceil((mw + 8) / (step || 1)));
  rows.forEach(function(r, i){ if ((n - 1 - i) % ms === 0) s += Tedge(X(i), y0 + 13, mShort(r), w, { size:10, fill:C.mut }); });
  s += '<line x1="'+padL+'" y1="'+y0+'" x2="'+(w-padR)+'" y2="'+y0+'" stroke="#B5BAC2" stroke-width="1"/>';
  rows.forEach(function(r, i){ s += '<line x1="'+X(i).toFixed(1)+'" y1="'+y0+'" x2="'+X(i).toFixed(1)+'" y2="'+(y0+4)+'" stroke="#B5BAC2"/>'; });
  host.innerHTML = s + '</svg>';
}

/* ============ 3. Heatmap год × месяц ============ */
/* opts: years[], grid{y}{m}=val, fmt */
function heatmap(host, o){
  var w = Math.max(host.clientWidth || 700, 320);
  if (w < 560) w = 560;
  var years = o.years, padL = 46, padT = 20, cellH = 30, gap = 3;
  var cw = (w - padL - 4) / 12;
  var h = padT + years.length * (cellH + gap) + 6;
  var vals = [];
  years.forEach(function(y){ for (var m = 1; m <= 12; m++){ var v = o.grid[y] && o.grid[y][m]; if (v != null) vals.push(v); } });
  var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  for (var m = 1; m <= 12; m++) s += T(padL + cw * (m - 0.5), padT - 6, MON[m-1], { size:10.5, fill:C.mut });
  years.forEach(function(y, r){
    var yy = padT + r * (cellH + gap);
    s += T(padL - 8, yy + cellH / 2 + 4, y, { size:11.5, w:600, fill:C.navy, a:'end' });
    for (var m = 1; m <= 12; m++){
      var v = o.grid[y] && o.grid[y][m], x = padL + cw * (m - 1);
      if (v == null){
        s += '<rect x="'+x.toFixed(1)+'" y="'+yy+'" width="'+(cw-2).toFixed(1)+'" height="'+cellH+
             '" fill="#FBFCFD" stroke="#EEF0F3" stroke-dasharray="2 2"/>';
        s += T(x + cw / 2 - 1, yy + cellH / 2 + 4, '—', { size:11, fill:'#C9CFD8' });
      } else {
        var t = mx === mn ? 0.6 : (v - mn) / (mx - mn);
        var op = 0.10 + t * 0.85;
        s += '<rect x="'+x.toFixed(1)+'" y="'+yy+'" width="'+(cw-2).toFixed(1)+'" height="'+cellH+
             '" fill="'+C.navy+'" fill-opacity="'+op.toFixed(2)+'" rx="3"/>';
        s += T(x + cw / 2 - 1, yy + cellH / 2 + 4, o.fmt(v), { size:11, w:600, fill: t > 0.55 ? '#fff' : C.ink });
      }
    }
  });
  host.innerHTML = s + '</svg>';
}

/* ============ 4. Сгруппированные столбцы: месяц × годы ============ */
/* opts: years[], grid{y}{m}, fmt */
function yoyChart(host, o){
  var w = Math.max(host.clientWidth || 700, 320);
  if (w < 620) w = 620;
  var h = o.h || 230, padT = 24, padB = 30, padL = 6, padR = 6;
  var iw = w - padL - padR, slot = iw / 12, y0 = h - padB, ih = y0 - padT;
  var ys = o.years, k = ys.length, bw = Math.min((slot * 0.8) / k, 26);
  var vals = [];
  ys.forEach(function(y){ for (var m = 1; m <= 12; m++){ var v = o.grid[y] && o.grid[y][m]; if (v != null) vals.push(v); } });
  var mx = Math.max.apply(null, vals) * 1.14 || 1;
  var pal = [ '#C7CFDC', '#8C9BB4', C.navy, C.copper ];
  var col = function(i){ return k <= 2 ? [ '#A9B6C9', C.navy ][i] : pal[Math.min(i, 3)]; };

  /* подписи значений ставим только если реально помещаются: иначе — только последний год, иначе — никаких */
  var lw = 0;
  ys.forEach(function(y){ for (var m = 1; m <= 12; m++){ var v = o.grid[y] && o.grid[y][m];
    if (v != null) lw = Math.max(lw, tw(o.fmtShort(v), 9.5, 600)); } });
  var mode = lw + 3 <= bw ? 'all' : (lw + 4 <= slot ? 'last' : 'none');

  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  for (var m = 1; m <= 12; m++){
    var gx = padL + slot * (m - 1) + (slot - bw * k) / 2;
    ys.forEach(function(y, i){
      var v = o.grid[y] && o.grid[y][m]; if (v == null) return;
      var bh = Math.max(1, v / mx * ih), x = gx + bw * i;
      s += '<rect x="'+x.toFixed(1)+'" y="'+(y0-bh).toFixed(1)+'" width="'+(bw-1.5).toFixed(1)+'" height="'+bh.toFixed(1)+
           '" fill="'+col(i)+'"/>';
      if (mode === 'all')
        s += T(x + bw / 2, y0 - bh - 4, o.fmtShort(v), { size:9.5, w:600, fill:C.ink });
      else if (mode === 'last' && i === k - 1)
        s += T(x + bw / 2, y0 - bh - 4, o.fmtShort(v), { size:9.5, w:600, fill:C.navy });
    });
    s += T(padL + slot * (m - 0.5), y0 + 13, MON[m-1], { size:10.5, fill:C.mut });
  }
  s += '<line x1="'+padL+'" y1="'+y0+'" x2="'+(w-padR)+'" y2="'+y0+'" stroke="#B5BAC2"/>';
  for (var q = 0; q <= 12; q++){ var xt = padL + slot * q;
    s += '<line x1="'+xt.toFixed(1)+'" y1="'+y0+'" x2="'+xt.toFixed(1)+'" y2="'+(y0+4)+'" stroke="#B5BAC2"/>'; }
  host.innerHTML = s + '</svg>';
  if (o.legendHost){
    o.legendHost.innerHTML = ys.map(function(y, i){
      return '<span><i style="background:'+col(i)+'"></i>' + y + '</span>'; }).join('');
  }
}

/* ============ 5. Отклонения г/г: столбцы вверх/вниз от нуля ============ */
function devChart(host, o){
  var w = Math.max(host.clientWidth || 700, 320);
  var rows = o.rows, n = rows.length;
  var minW = n * (o.minSlot == null ? 22 : o.minSlot) + 30; if (w < minW) w = minW;
  var h = o.h || 190, padT = 18, padB = 26, padL = 6, padR = 6;
  var iw = w - padL - padR, slot = iw / n, bw = Math.min(slot * 0.66, 30);
  var vv = rows.map(function(r){ return Math.abs(r.val == null ? 0 : r.val); });
  var mx = Math.max.apply(null, vv) * 1.25 || 1;
  var zy = padT + (h - padT - padB) / 2, half = (h - padT - padB) / 2;
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  rows.forEach(function(r, i){
    var cx = padL + slot * i + slot / 2;
    if (r.val == null){ s += T(cx, zy - 4, 'н/д', { size:9.5, fill:'#C0C6D0' }); }
    else {
      var bh = Math.abs(r.val) / mx * half, up = r.val >= 0;
      s += '<rect x="'+(cx-bw/2).toFixed(1)+'" y="'+((up ? zy - bh : zy)).toFixed(1)+'" width="'+bw.toFixed(1)+
           '" height="'+bh.toFixed(1)+'" fill="'+(up ? C.green : C.bad)+'" fill-opacity="0.85"/>';
      if (slot > 26) s += T(cx, up ? zy - bh - 4 : zy + bh + 11, pct(r.val), { size:9.5, w:600, fill: up ? C.ok : C.bad });
    }
    if (slot > 30) s += T(cx, h - 8, mShort(r), { size:9.5, fill:C.mut });
  });
  s += '<line x1="'+padL+'" y1="'+zy+'" x2="'+(w-padR)+'" y2="'+zy+'" stroke="#B5BAC2"/>';
  host.innerHTML = s + '</svg>';
}


/* ============ 7. Сезонный профиль: отклонение месяца от среднего (п.п.) ============ */
function seasonChart(host, season, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 340, 200);
  var h = host.clientHeight || 104, padT = fs(16), padB = fs(o && o.base ? 36 : 16);
  var pillW = o && o.meanVal != null ? tw('$' + sp(Math.round(o.meanVal)), 10, 700) + fs(9) : 0;
  var padL = pillW ? pillW + fs(4) : 2, padR = 2;
  var iw = w - padL - padR, slot = iw / Math.max(1, season.length);
  var uid = 's' + (host.id || '').replace(/[^a-z0-9]/gi, '');
  var me = season.map(function(x){ return x.m2 == null ? null : x.m2; });   /* ТО/м² арендатора по месяцам окна */
  var nMon = season.length;
  var bs = o.base || null;                                                  /* ТО/м² базы по месяцам */
  var all = me.filter(function(v){ return v != null; }).concat(bs ? bs.filter(function(v){ return v != null; }) : []);
  if (o.meanVal != null) all.push(o.meanVal);
  if (!all.length){ host.innerHTML = ''; return; }
  var mx = Math.max.apply(null, all), mn = Math.min.apply(null, all);
  var pad = (mx - mn) * 0.35 || mx * 0.15 || 1;
  var hi = mx + pad, lo = Math.max(0, mn - pad);
  var y0 = h - padB, ih = y0 - padT;
  var cx = function(i){ return padL + slot * i + slot / 2; };
  var cy = function(v){ return y0 - (v - lo) / (hi - lo) * ih; };

  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<radialGradient id="' + uid + 'd" cx="0.34" cy="0.28" r="0.8">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.32" stop-color="#A9754F"/>' +
        '<stop offset="1" stop-color="#4A2C18"/>' +
      '</radialGradient>' +
      '<radialGradient id="' + uid + 'r" cx="0.34" cy="0.28" r="0.85">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.3" stop-color="#E8563C"/>' +
        '<stop offset="1" stop-color="#7A1B10"/>' +
      '</radialGradient>' +
    '</defs>';

  /* заливка ступеней до оси: месяц выше среднего по выборке — зелёный, ниже — красный */
  if (bs && o.meanVal != null){
    var ay = cy(o.meanVal);
    bs.forEach(function(v, i){
      if (v == null) return;
      var y = cy(v), top = Math.min(y, ay), hh = Math.abs(y - ay);
      if (hh < 0.4) return;
      s += '<rect x="' + (padL + slot * i).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + slot.toFixed(1) +
           '" height="' + hh.toFixed(1) + '" fill="' + (v >= o.meanVal ? '#2FA36B' : '#E2553D') + '" fill-opacity="0.16"/>';
    });
  }

  /* ось графика — средний месяц ВЫБОРКИ: единая точка отсчёта и для базы, и для арендатора */
  if (o.meanVal != null){
    var my = cy(o.meanVal);
    s += '<line x1="' + padL + '" y1="' + my.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + my.toFixed(1) +
         '" stroke="' + C.navy + '" stroke-width="1"/>';
    var mt = '$' + sp(Math.round(o.meanVal));
    s += '<rect x="0" y="' + (my - fs(7)).toFixed(1) + '" width="' + pillW.toFixed(1) +
         '" height="' + fs(14) + '" rx="' + fs(7) + '" fill="' + C.navy + '"/>';
    s += T(pillW / 2, my + fs(3.5), mt, { size:10, w:700, fill:'#fff' });
  }

  /* база: сплошная ступенчатая линия — уровень держится весь месяц */
  if (bs){
    var d = '', open = false;
    bs.forEach(function(v, i){
      if (v == null){ open = false; return; }
      var x1 = padL + slot * i, x2 = x1 + slot, y = cy(v);
      d += (open ? ' L' : ' M') + x1.toFixed(1) + ' ' + y.toFixed(1) + ' L' + x2.toFixed(1) + ' ' + y.toFixed(1);
      open = true;
    });
    if (d) s += '<path d="' + d + '" fill="none" stroke="#A9B0BC" stroke-width="0.5" stroke-linejoin="round"/>';
  }

  /* профиль арендатора: линия с объёмными шариками */
  var seg = [], cur = [];
  me.forEach(function(v, i){
    if (v == null){ if (cur.length) seg.push(cur); cur = []; return; }
    cur.push(i);
  });
  if (cur.length) seg.push(cur);
  seg.forEach(function(g){
    if (g.length < 2) return;
    var d = '';
    g.forEach(function(i, k){ d += (k ? ' L' : 'M') + cx(i).toFixed(1) + ' ' + cy(me[i]).toFixed(1); });
    s += '<path d="' + d + '" fill="none" stroke="#6B4226" stroke-width="1.4" stroke-linejoin="round"/>';
  });
  me.forEach(function(v, i){
    if (v == null){ s += T(cx(i), y0 - ih / 2, '·', { size:11, fill:'#C9CFD8' }); return; }
    var x = cx(i), y = cy(v), below = bs && bs[i] != null && v < bs[i];
    if (below) s += '<g class="matdot">';
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (below ? 3.6 : 3.2) +
         '" fill="url(#' + uid + (below ? 'r' : 'd') + ')"/>';
    s += '<circle cx="' + (x - 0.9).toFixed(1) + '" cy="' + (y - 1).toFixed(1) + '" r="0.9" fill="#fff" fill-opacity="0.75"/>';
    if (below) s += '</g>';
    if (h >= fs(82))
      s += T(x, below ? y + fs(16) : y - fs(7), '$' + sp(Math.round(v)),
             { size:10.5, w:600, fill: below ? C.warn : C.ink });
  });
  /* ТО/м² выборки по месяцам — строкой над названиями месяцев; прореживаем, если не влезает */
  if (bs){
    var vw = 0;
    bs.forEach(function(v){ if (v != null) vw = Math.max(vw, tw('$' + sp(Math.round(v)), 10.5, 600)); });
    var vStep = Math.max(1, Math.ceil((vw + fs(4)) / slot));
    bs.forEach(function(v, i){
      if (v == null || (nMon - 1 - i) % vStep !== 0) return;
      s += T(cx(i), h - fs(19), '$' + sp(Math.round(v)), { size:10.5, w:600, fill:'#7C8698' });
    });
  }
  /* год подписываем только при смене — иначе «сен 25 окт 25 …» не помещается */
  var mw2 = 0;
  season.forEach(function(r){ mw2 = Math.max(mw2, tw(MON[r.m - 1], 10, 400)); });
  var mStep2 = Math.max(1, Math.ceil((mw2 + fs(5)) / slot));
  season.forEach(function(r, i){
    if ((nMon - 1 - i) % mStep2 !== 0) return;
    var lab = MON[r.m - 1] + (i === 0 || r.m === 1 ? ' ' + String(r.y).slice(2) : '');
    s += T(cx(i), h - fs(3), lab, { size:10, fill:C.mut });
  });
  host.innerHTML = s + '</svg>';
}

/* ============ 7б. Сезонность «полочками» (Олег, 09.11, по макету mockups/season-shelves-mockup.html) ============
   Ось X — месяцы, оси Y и сетки нет. Синяя полочка с цифрой — как в этот месяц продаёт база,
   полочки соединены серым пунктиром ступенькой, как в водопаде. От полочки до уровня арендатора —
   заливка: зелёная вверх (продаёт больше базы), красная вниз (меньше); цифра арендатора на её краю.
   season: [{y, m, m2}], o.base: [ТО/м² базы по тем же месяцам] */
function seasonChart2(host, season, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 340, 200), h = host.clientHeight || 160;
  var me = season.map(function(x){ return x.m2 == null ? null : x.m2; });
  var bs = o.base || season.map(function(){ return null; });
  var all = me.concat(bs).filter(function(v){ return v != null; });
  if (!all.length){ host.innerHTML = ''; return; }
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  if (hi <= lo) hi = lo + 1;
  var money0 = function(v){ return '$' + sp(Math.round(v)); };
  var padL = fs(4), padR = fs(4), padT = fs(20), padB = o.padB != null ? o.padB : fs(18), mB = fs(18);
  var n = season.length, slot = (w - padL - padR) / Math.max(1, n);
  var y0 = h - padB, ih = y0 - padT;
  var X0 = function(i){ return padL + slot * i + slot * 0.14; };
  var X1 = function(i){ return padL + slot * i + slot * 0.86; };
  var Y = function(v){ return y0 - mB - (v - lo) / (hi - lo) * (ih - mB); };
  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';
  s += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + (w - padR) + '" y2="' + y0 + '" stroke="#B5BAC2"/>';

  /* пунктир между соседними полочками базы — ступенькой в промежутке между месяцами */
  for (var i = 0; i < n - 1; i++){
    if (bs[i] == null || bs[i + 1] == null) continue;
    var xe = X1(i), xs = X0(i + 1), xm = (xe + xs) / 2;
    s += '<path d="M' + xe.toFixed(1) + ' ' + Y(bs[i]).toFixed(1) + ' H' + xm.toFixed(1) + ' V' + Y(bs[i + 1]).toFixed(1) +
         ' H' + xs.toFixed(1) + '" fill="none" stroke="#9AA3AF" stroke-width="0.9" stroke-dasharray="2 2"/>';
  }
  var labOK = tw('$0000', 10.5, 700) <= slot - 2;
  season.forEach(function(r, i){
    var v = me[i], b = bs[i], x0 = X0(i), x1 = X1(i), cx = (x0 + x1) / 2;
    var showLab = labOK || i % 2 === (n - 1) % 2;
    if (b != null && v != null){
      var up = v >= b, ym = Y(v), yb = Y(b), top = Math.min(ym, yb), hh = Math.max(0.6, Math.abs(ym - yb));
      s += '<rect x="' + x0.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (x1 - x0).toFixed(1) + '" height="' + hh.toFixed(1) +
           '" fill="' + (up ? '#2FA36B' : '#E2553D') + '" fill-opacity="0.3"/>';
      if (showLab){
        s += T(cx, up ? yb + fs(14) : yb - fs(6), money0(b), { size:10.5, w:600, fill:'#5C6B85' });
        s += T(cx, up ? ym - fs(6) : ym + fs(14), money0(v), { size:10.5, w:700, fill:up ? '#2E7D5B' : '#C0392B' });
      }
    } else if (b != null){                         /* месяц без оборота арендатора — только база */
      if (showLab) s += T(cx, Y(b) - fs(6), money0(b), { size:10.5, w:600, fill:'#5C6B85' });
    } else if (v != null){                         /* у базы нет профиля — показываем арендатора своей полочкой */
      s += '<line x1="' + x0.toFixed(1) + '" y1="' + Y(v).toFixed(1) + '" x2="' + x1.toFixed(1) + '" y2="' + Y(v).toFixed(1) +
           '" stroke="#C0703A" stroke-width="2.4" stroke-linecap="round"/>';
      if (showLab) s += T(cx, Y(v) - fs(6), money0(v), { size:10.5, w:700, fill:C.ink });
    }
    if (b != null)
      s += '<line x1="' + x0.toFixed(1) + '" y1="' + Y(b).toFixed(1) + '" x2="' + x1.toFixed(1) + '" y2="' + Y(b).toFixed(1) +
           '" stroke="#1B2A4A" stroke-width="2.4" stroke-linecap="round"/>';
  });

  /* месяцы: год — у первого месяца и у января; прореживание по ширине подписи */
  var mw = 0;
  season.forEach(function(r){ mw = Math.max(mw, tw(MON[r.m - 1] + ' 00', 10, 400)); });
  var mStep = Math.max(1, Math.ceil((mw + fs(5)) / slot));
  season.forEach(function(r, i){
    if ((n - 1 - i) % mStep !== 0) return;
    s += T(padL + slot * i + slot / 2, y0 + fs(14), MON[r.m - 1] + (i === 0 || r.m === 1 ? ' ' + String(r.y).slice(2) : ''),
           { size:10, fill:C.mut });
  });
  host.innerHTML = s + '</svg>';
}


/* ============ 8. Шкала нагрузки: факт против нормы категории ============ */
function occBar(host, val, lo, hi){
  var w = Math.max(host.clientWidth || 280, 220), h = host.clientHeight || 52;
  var padL = 4, padR = 4, iw = w - padL - padR;
  var max = Math.max(hi * 1.6, val * 1.25, 25);
  var X = function(v){ return padL + v / max * iw; };
  var y = 20, bh = 13;
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  s += '<rect x="'+padL+'" y="'+y+'" width="'+iw+'" height="'+bh+'" fill="#F0F2F5" rx="3"/>';
  s += '<rect x="'+X(lo).toFixed(1)+'" y="'+y+'" width="'+(X(hi)-X(lo)).toFixed(1)+'" height="'+bh+
       '" fill="#4E9B6F" fill-opacity="0.22" rx="2"/>';
  s += T(X(lo), y + bh + 11, lo + '%', { size:9, fill:C.mut });
  s += T(X(hi), y + bh + 11, hi + '%', { size:9, fill:C.mut });
  s += T(padL, y + bh + 11, 'норма', { size:9, fill:C.mut, a:'start' });
  var col = val > hi ? C.bad : (val < lo ? C.warn : C.ok);
  var x = X(val);
  s += '<rect x="'+(x-1.5).toFixed(1)+'" y="'+(y-5)+'" width="3" height="'+(bh+10)+'" fill="'+col+'" rx="1.5"/>';
  var lab = num1(val) + '%';
  var anchor = x > w - 40 ? 'end' : 'middle';
  s += T(anchor === 'end' ? x - 6 : x, y - 9, lab, { size:11, w:600, fill:col, a:anchor });
  host.innerHTML = s + '</svg>';
}

/* ============ 9. Сравнение с бенчмарком: горизонтальные полосы ============ */
function benchBar(host, items){
  var w = Math.max(host.clientWidth || 280, 140), h = host.clientHeight || 56;
  var vw = w;                                     /* ширина области рисования = ширина контейнера */
  var labW = 0, lab = 10;
  items.forEach(function(it){ labW = Math.max(labW, tw(it.name, lab, 600)); });
  /* узкая карточка, но есть высота: подпись над столбцом, кегль 10 сохраняется (стандарт отчёта) */
  var lineH = fs(12), minRow = lineH + 11;
  if (labW + 8 > w * 0.42 && h >= items.length * minRow + 4){
    var mxS = Math.max.apply(null, items.map(function(i){ return i.val; })) * 1.12 || 1;
    var rowS = Math.min(34, (h - 4) / items.length), bhS = Math.max(7, Math.min(12, rowS - lineH - 4));
    var topS = Math.max(2, (h - rowS * items.length) / 2), valS = 46;
    var st = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg" style="overflow:hidden">';
    items.forEach(function(it, i){
      var y = topS + i * rowS, by = y + lineH + 1, bw = Math.max(2, (w - valS - 6) * it.val / mxS);
      st += T(1, y + fs(10), it.name, { size:10, w:600, fill:C.ink, a:'start' });
      st += '<rect x="0" y="'+by.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bhS.toFixed(1)+'" fill="'+it.color+'" rx="2"/>';
      st += T(bw + 5, by + bhS - 2, money(it.val), { size:10.5, w:600, fill:C.ink, a:'start' });
    });
    host.innerHTML = st + '</svg>';
    return;
  }
  while (labW + 8 > w * 0.42 && lab > 7.5){      /* подпись не влезает — уменьшаем шрифт, а не режем макет */
    lab -= 0.5; labW = 0;
    items.forEach(function(it){ labW = Math.max(labW, tw(it.name, lab, 600)); });
  }
  labW = Math.min(labW + 8, w * 0.42);
  var mx = Math.max.apply(null, items.map(function(i){ return i.val; })) * 1.28 || 1;
  var rowH = Math.max(18, Math.min(26, (h - 6) / items.length));
  var bh = Math.min(14, rowH - 7), gap = rowH - bh, top = 4;
  var valW = 46;
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg" style="overflow:hidden">';
  items.forEach(function(it, i){
    var y = top + i * (bh + gap), bw = Math.max(2, (vw - labW - valW - 6) * it.val / mx);
    s += T(labW - 6, y + bh - 3, it.name, { size:lab, w:600, fill:C.ink, a:'end' });
    s += '<rect x="'+labW+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" fill="'+it.color+'" rx="2"/>';
    s += T(labW + bw + 5, y + bh - 3, money(it.val), { size:10, w:600, fill:C.ink, a:'start' });
  });
  host.innerHTML = s + '</svg>';
}


/* ============ 9б. Сравнение вертикальными столбцами (Олег, 09.11) ============
   items: [{name, val, color}]. Подпись под столбцом — в 1–2 строки по словам, кегль 10 не уменьшается.
   o.padB — нижний отступ: ось X на одном уровне с соседним графиком ряда */
function benchCols(host, items, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 280, 160), h = host.clientHeight || 160;
  var n = items.length, padL = 2, padR = 2, padT = fs(18), padB = o.padB != null ? o.padB : fs(30);
  var slot = (w - padL - padR) / Math.max(1, n), bw = Math.min(slot * 0.56, fs(44));
  var y0 = h - padB, ih = y0 - padT;
  var mx = Math.max.apply(null, items.map(function(i){ return i.val; })) || 1;
  var wrap = function(t){                         /* слова в строки шириной не больше слота */
    var words = String(t).split(' '), lines = [], cur = '';
    words.forEach(function(wd){
      var tryL = cur ? cur + ' ' + wd : wd;
      if (!cur || tw(tryL, 10, 600) <= slot - 4) cur = tryL; else { lines.push(cur); cur = wd; }
    });
    if (cur) lines.push(cur);
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')];
    return lines;
  };
  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';
  items.forEach(function(it, i){
    var cx = padL + slot * i + slot / 2, bh = Math.max(1, it.val / mx * ih), y = y0 - bh;
    s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) +
         '" fill="' + it.color + '" rx="2"/>';
    s += T(cx, y - fs(5), money(it.val), { size:10.5, w:600, fill:C.ink });
    wrap(it.name).forEach(function(ln, k){
      s += T(cx, y0 + fs(13) + fs(12) * k, ln, { size:10, w:600, fill:C.ink });
    });
  });
  s += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + (w - padR) + '" y2="' + y0 + '" stroke="#B5BAC2"/>';
  host.innerHTML = s + '</svg>';
}

/* ============ 10. Рейтинг: горизонтальные столбцы, свой выделен ============ */
/* items: [{name, val, me}], opts: {h, fmt, unit} */
function rankChart(host, items, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 300, 220), h = o.h || host.clientHeight || 200;
  var labW = 0;
  items.forEach(function(it){ labW = Math.max(labW, tw(it.name, 9.5, it.me ? 700 : 400)); });
  labW = Math.min(labW + 6, w * 0.40);
  var valW = 46, rowH = h / items.length, bh = Math.min(rowH * 0.72, 15);
  var mx = Math.max.apply(null, items.map(function(i){ return i.val; })) || 1;
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  items.forEach(function(it, i){
    var y = i * rowH + (rowH - bh) / 2;
    var bw = Math.max(1.5, (w - labW - valW - 6) * it.val / mx);
    s += T(labW - 5, y + bh - 3, it.name, { size:9.5, w:it.me ? 700 : 400, fill:it.me ? C.navy : C.mut, a:'end' });
    s += '<rect x="'+labW+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+
         '" fill="'+(it.me ? C.copper : '#B9C4D4')+'" rx="2"/>';
    s += T(labW + bw + 4, y + bh - 3, (o.fmt || money)(it.val), { size:9.5, w:it.me ? 700 : 600,
          fill:it.me ? C.copper : C.ink, a:'start' });
  });
  host.innerHTML = s + '</svg>';
}

/* ============ 11. Точечная диаграмма: два показателя, свой выделен ============ */
/* pts: [{x, y, me, name}], opts: {h, xLab, yLab, xFmt, yFmt, xMed, yMed, bands:[lo,hi]} */
function scatterChart(host, pts, o){
  var xUsed = [], yTitleIn = false;                                 /* занятые места подписей под осью X */
  var w = Math.max(host.clientWidth || 320, 170), h = o.h || host.clientHeight || 240;
  var padL = 40, padR = 12, padT = 12, padB = 30;
  var xs = pts.map(function(p){ return p.x; }), ys = pts.map(function(p){ return p.y; });
  var x0 = 0, x1 = Math.max.apply(null, xs) * 1.08;
  var y0v = 0, y1 = Math.max.apply(null, ys) * 1.08;
  var X = function(v){ return padL + (v - x0) / (x1 - x0) * (w - padL - padR); };
  var Y = function(v){ return h - padB - (v - y0v) / (y1 - y0v) * (h - padT - padB); };
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  if (o.bands){                                     /* коридор нормы по оси Y */
    s += '<rect x="'+padL+'" y="'+Y(o.bands[1]).toFixed(1)+'" width="'+(w-padL-padR)+
         '" height="'+Math.abs(Y(o.bands[0]) - Y(o.bands[1])).toFixed(1)+'" fill="#4E9B6F" fill-opacity="0.10"/>';
  }
  /* зоны бенчмарков: красная (OCR выше тревоги или ТО ниже критической), жёлтая — буфер,
     зелёная — ТО не ниже нормы и OCR в коридоре. z = {tLo, tCrit, oLo, oHi, oAlarm} */
  if (o.zones){
    var z = o.zones, xR = w - padR, yB = h - padB;
    var xc = Math.max(padL, Math.min(xR, X(z.tCrit))), xl = Math.max(padL, Math.min(xR, X(z.tLo)));
    var ya = Math.max(padT, Math.min(yB, Y(z.oAlarm))), yh = Math.max(padT, Math.min(yB, Y(z.oHi)));
    s += '<rect x="'+padL+'" y="'+padT+'" width="'+(xR-padL).toFixed(1)+'" height="'+(ya-padT).toFixed(1)+
         '" fill="#E2553D" fill-opacity="0.15"/>';
    s += '<rect x="'+padL+'" y="'+ya.toFixed(1)+'" width="'+(xc-padL).toFixed(1)+'" height="'+(yB-ya).toFixed(1)+
         '" fill="#E2553D" fill-opacity="0.15"/>';
    s += '<rect x="'+xc.toFixed(1)+'" y="'+ya.toFixed(1)+'" width="'+(xR-xc).toFixed(1)+'" height="'+(yh-ya).toFixed(1)+
         '" fill="#F0B429" fill-opacity="0.22"/>';
    s += '<rect x="'+xc.toFixed(1)+'" y="'+yh.toFixed(1)+'" width="'+Math.max(0, xl-xc).toFixed(1)+'" height="'+(yB-yh).toFixed(1)+
         '" fill="#F0B429" fill-opacity="0.22"/>';
    s += '<rect x="'+xl.toFixed(1)+'" y="'+yh.toFixed(1)+'" width="'+Math.max(0, xR-xl).toFixed(1)+'" height="'+(yB-yh).toFixed(1)+
         '" fill="#2FA36B" fill-opacity="0.20"/>';
    /* пунктиры OCR с подписями слева, границы ТО — засечками на оси X */
    [[z.oHi, '#0C447C'], [z.oLo, '#0C447C'], [z.oAlarm, '#A32D2D']].forEach(function(g){
      var y = Y(g[0]);
      if (y < padT || y > yB) return;
      s += '<line x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+xR+'" y2="'+y.toFixed(1)+
           '" stroke="'+g[1]+'" stroke-width="0.9" stroke-dasharray="5 3" stroke-opacity="0.55"/>';
      s += T(padL - fs(3), y + fs(3), (o.yFmt || num1)(g[0]), { size:9, w:600, fill:g[1], a:'end' });
      if (y < padT + fs(16)) yTitleIn = true;          /* граница зоны у самого верха — заголовок оси уводим внутрь */
    });
    [z.tLo, z.tCrit].forEach(function(v){
      var x = X(v);
      if (x < padL || x > xR) return;
      s += '<line x1="'+x.toFixed(1)+'" y1="'+yB+'" x2="'+x.toFixed(1)+'" y2="'+(yB-5)+'" stroke="#6B7280"/>';
      var t = (o.xFmt || money)(v), hw = tw(t, 9, 600) / 2 + 3;
      if (xUsed.some(function(q){ return x + hw > q[0] && x - hw < q[1]; })) return;   /* близкие границы — одна подпись */
      xUsed.push([x - hw, x + hw]);
      s += T(x, yB + 12, t, { size:9, w:600, fill:'#6B7280' });
    });
  }
  if (o.xMed != null){
    s += '<line x1="'+X(o.xMed).toFixed(1)+'" y1="'+padT+'" x2="'+X(o.xMed).toFixed(1)+'" y2="'+(h-padB)+
         '" stroke="#C9CFD8" stroke-dasharray="4 4"/>';
    if (h >= 150) s += T(X(o.xMed) + 3, h - padB - 5, 'медиана', { size:8.5, fill:'#A6AEBB', a:'start' });
  }
  if (o.yMed != null)
    s += '<line x1="'+padL+'" y1="'+Y(o.yMed).toFixed(1)+'" x2="'+(w-padR)+'" y2="'+Y(o.yMed).toFixed(1)+
         '" stroke="#C9CFD8" stroke-dasharray="4 4"/>';
  /* цвет точки — по родству с арендатором: чем ближе в классификаторе, тем заметнее.
     Точки объёмные: радиальный градиент с бликом, как у остальных графиков */
  var puid = 'sc' + (host.id || '').replace(/[^a-z0-9]/gi, '');
  s += '<defs>' +
    '<radialGradient id="'+puid+'n" cx="0.34" cy="0.28" r="0.85">' +
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
      '<stop offset="0.3" stop-color="#3D5578"/><stop offset="1" stop-color="#0E1830"/></radialGradient>' +
    '<radialGradient id="'+puid+'b" cx="0.34" cy="0.28" r="0.85">' +
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
      '<stop offset="0.3" stop-color="#7FA8F5"/><stop offset="1" stop-color="#2A4FA0"/></radialGradient>' +
    '<radialGradient id="'+puid+'y" cx="0.34" cy="0.28" r="0.85">' +
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
      '<stop offset="0.3" stop-color="#E8BC5E"/><stop offset="1" stop-color="#7A5A08"/></radialGradient>' +
    '</defs>';
  var TONE = { sub2:'n', sub:'b', cat:'y' };
  var order = ['cat', 'sub', 'sub2'];              /* дальние рисуем первыми, ближние поверх */
  order.forEach(function(tone){
    pts.forEach(function(p){
      if (p.me || (p.tone || 'cat') !== tone) return;
      var big = tone !== 'cat', cx2 = X(p.x), cy2 = Y(p.y);
      s += '<circle cx="'+cx2.toFixed(1)+'" cy="'+cy2.toFixed(1)+'" r="'+(big ? 3.8 : 3.2)+
           '" fill="url(#'+puid+TONE[tone]+')"/>';
      s += '<circle cx="'+(cx2-1).toFixed(1)+'" cy="'+(cy2-1.1).toFixed(1)+'" r="0.9" fill="#fff" fill-opacity="0.75"/>';
    });
  });
  /* подписи соседей: мелким шрифтом, с проверкой на наложение — что не влезло, пропускаем.
     Своя под-подкатегория подписывается первой, у неё приоритет на место. */
  if (h >= 130){
    var taken = [];                                /* занятые прямоугольники подписей */
    var mePt = pts.filter(function(p){ return p.me; })[0];
    if (mePt) taken.push([X(mePt.x) - 12, Y(mePt.y) - fs(14), X(mePt.x) + 100, Y(mePt.y) + fs(14)]);
    var fits = function(r){
      return !taken.some(function(t){ return !(r[2] < t[0] || r[0] > t[2] || r[3] < t[1] || r[1] > t[3]); });
    };
    ['sub2', 'sub', 'cat'].forEach(function(tone){
      pts.forEach(function(p){
        if (p.me || (p.tone || 'cat') !== tone || !p.name) return;
        var nm = p.name.length > 11 ? p.name.slice(0, 10) + '…' : p.name;
        var tw2 = tw(nm, 8.5, 400), cx2 = X(p.x), cy2 = Y(p.y);
        var right = cx2 + 6 + tw2 < w - padR;
        var x1 = right ? cx2 + 5 : cx2 - 5 - tw2, x2 = x1 + tw2;
        var rect = [x1 - 1, cy2 - fs(5), x2 + 1, cy2 + fs(5)];
        if (x1 < padL || !fits(rect)) return;
        taken.push(rect);
        s += T(right ? cx2 + 5 : cx2 - 5, cy2 + fs(3), nm,
               { size:8.5, fill:tone === 'sub2' ? '#4A5568' : '#8C9BB4', a:right ? 'start' : 'end' });
      });
    });
  }
  pts.filter(function(p){ return p.me; }).forEach(function(p){
    var zone = o.meZone || 'green';                 /* green | amber | red — по зоне бенчмарков */
    var ZC = { green:['#48B87E', '#175C3C', '#2E7D5B'], amber:['#F0B429', '#7A5A08', '#854F0B'],
               red:['#E8563C', '#7A1B10', '#C0563A'] };
    var zc = ZC[zone] || ZC.green;
    var sid = 'sme' + (host.id || '').replace(/[^a-z0-9]/gi, '');
    s += '<defs><radialGradient id="' + sid + '" cx="0.34" cy="0.28" r="0.85">' +
         '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
         '<stop offset="0.3" stop-color="'+zc[0]+'"/>' +
         '<stop offset="1" stop-color="'+zc[1]+'"/>' +
         '</radialGradient></defs>';
    s += '<g class="matdot"><circle cx="'+X(p.x).toFixed(1)+'" cy="'+Y(p.y).toFixed(1)+
         '" r="6" fill="url(#' + sid + ')" stroke="#fff" stroke-width="1.5"/>' +
         '<circle cx="'+(X(p.x)-2).toFixed(1)+'" cy="'+(Y(p.y)-2).toFixed(1)+'" r="1.6" fill="#fff" fill-opacity="0.7"/></g>';
    var lx = X(p.x), ly = Y(p.y);
    var right = lx < w - 90;
    s += T(right ? lx + 10 : lx - 10, ly - fs(8), p.name,
           { size:10, w:700, fill:zc[2], a:right ? 'start' : 'end' });
    if (h >= 110) s += T(right ? lx + 10 : lx - 10, ly + fs(10), (o.xFmt || money)(p.x) + ' · ' + (o.yFmt || num1)(p.y),
           { size:9, w:600, fill:C.ink, a:right ? 'start' : 'end' });
  });
  /* оси */
  s += '<line x1="'+padL+'" y1="'+(h-padB)+'" x2="'+(w-padR)+'" y2="'+(h-padB)+'" stroke="#B5BAC2"/>';
  s += '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(h-padB)+'" stroke="#B5BAC2"/>';
  var xLabW = h >= 110 ? tw(o.xLab || '', 9.5, 400) + 10 : 0;
  if (h >= 130){                                  /* на низком графике шкалу не подписываем */
    [0.25, 0.5, 0.75, 1].forEach(function(t){
      var vx = x0 + (x1 - x0) * t;
      var lw = tw((o.xFmt || money)(vx), 9, 400) / 2;
      if (xUsed.some(function(q){ return X(vx) + lw + 3 > q[0] && X(vx) - lw - 3 < q[1]; })) return;  /* не на подписи зон */
      if (X(vx) - lw > padL + xLabW)                           /* не наезжаем на подпись оси */
        s += T(X(vx), h - padB + 12, (o.xFmt || money)(vx), { size:9, fill:C.mut });
    });
    /* шкала нагрузки — круглыми значениями с шагом 5, а не долями от максимума:
       дробные 8,7% и 17,4% спорили с подписями коридоров */
    var step = (y1 - y0v) > 80 ? 20 : ((y1 - y0v) > 55 ? 10 : 5);
    /* шкалу ведём ВЫШЕ зоны коридоров: внизу и так плотно от их подписей */
    var from = o.zones ? Math.max(o.zones.oAlarm, o.zones.oHi) : y0v;
    for (var vy = Math.ceil((from + 1) / step) * step; vy < y1; vy += step){
      var yy = Y(vy);
      if (yy < padT + fs(16) || yy > h - padB - 4) continue;   /* верх занят подписью оси «OCR, %» */
      s += T(padL - 5, yy + 3, (o.yFmt || num1)(vy), { size:9, fill:C.mut, a:'end' });
    }
  }
  if (h >= 110){                                  /* подписи осей — по краям, чтобы не сталкиваться со шкалой */
    s += T(padL, h - 4, o.xLab || '', { size:9.5, fill:C.mut, a:'start' });
    s += T(yTitleIn ? padL + 4 : Math.max(2, padL - 34), padT + 4, o.yLab || '', { size:9.5, fill:C.mut, a:'start' });
  }
  host.innerHTML = s + '</svg>';
}

/* ============ 12. Распределение по категории: точки на шкале ============ */
function stripPlot(host, values, mine, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 300, 240), h = o.h || host.clientHeight || 66;
  var padL = 6, padR = 6, y = 30;
  var all = values.concat([mine]);
  var mn = Math.min.apply(null, all) * 0.95, mx = Math.max.apply(null, all) * 1.05;
  var X = function(v){ return padL + (v - mn) / (mx - mn) * (w - padL - padR); };
  var med = values.slice().sort(function(a, b){ return a - b; })[Math.floor(values.length / 2)];
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  s += '<line x1="'+padL+'" y1="'+y+'" x2="'+(w-padR)+'" y2="'+y+'" stroke="#DDE1E7" stroke-width="2"/>';
  values.forEach(function(v){
    s += '<circle cx="'+X(v).toFixed(1)+'" cy="'+y+'" r="3.4" fill="#8C9BB4" fill-opacity="0.5"/>';
  });
  s += '<line x1="'+X(med).toFixed(1)+'" y1="'+(y-11)+'" x2="'+X(med).toFixed(1)+'" y2="'+(y+11)+'" stroke="#6B7280" stroke-dasharray="3 3"/>';
  s += T(X(med), y + 22, 'медиана ' + (o.fmt || money)(med), { size:10, fill:C.mut });
  s += '<circle cx="'+X(mine).toFixed(1)+'" cy="'+y+'" r="6.5" fill="'+C.copper+'" stroke="#fff" stroke-width="2"/>';
  s += T(X(mine), y - 13, (o.fmt || money)(mine), { size:10.5, w:700, fill:C.copper });
  s += T(padL, h - 3, (o.fmt || money)(mn), { size:10, fill:'#A6AEBB', a:'start' });
  s += T(w - padR, h - 3, (o.fmt || money)(mx), { size:10, fill:'#A6AEBB', a:'end' });
  host.innerHTML = s + '</svg>';
}

/* ============ 14. Скользящий год: заливка по уровню значения ============ */
/* Пустые месяцы в начале ряда (пока окно 12 мес. не набралось) не показываем вовсе. */
function matChart(host, rows, vals, o){
  o = o || {};
  var i0 = 0, i1 = vals.length - 1;
  while (i0 < vals.length && vals[i0] == null) i0++;
  while (i1 >= 0 && vals[i1] == null) i1--;
  if (i1 <= i0){ host.innerHTML = ''; return; }
  var v = vals.slice(i0, i1 + 1), rr = rows.slice(i0, i1 + 1), n = v.length;
  var w = Math.max(host.clientWidth || 300, o.hardMin || 180);
  var h = host.clientHeight || o.h || 90;
  var uid = 'm' + (host.id || '').replace(/[^a-z0-9]/gi, '');
  var fmt = o.fmt || function(x){ return num1(x); };
  var live = v.filter(function(x){ return x != null; });
  /* коридор входит в масштаб: иначе полоса уходит за нижнюю границу и точек в ней не видно */
  var scale = o.band ? live.concat(o.band) : live;
  if (o.bench) scale = scale.concat([o.bench.lo, o.bench.hi]);
  var mx = Math.max.apply(null, scale), mn = Math.min.apply(null, scale);
  /* поля по краям: под крайние подписи значения и месяца, иначе они срезаются */
  var edge = Math.max(tw(fmt(v[0]), 8.5, 600), tw(fmt(v[n - 1]), 8.5, 600),
                      tw(MON[rr[0].m - 1] + ' 00', 8.5, 400)) / 2 + 3;
  /* границы коридора подписываются слева — резервируем под них поле */
  var bandW = o.band ? Math.max(tw(fmt(o.band[0]), 9, 600), tw(fmt(o.band[1]), 9, 600)) + fs(6) : 0;
  var benchW = o.bench ? Math.max(tw(fmt(o.bench.lo), 9, 600), tw(fmt(o.bench.hi), 9, 600)) + fs(6) : 0;
  edge = Math.max(edge, bandW, benchW);
  /* o.bracket: над рядом место под «скобку» прироста год к году */
  var padT = fs(15) + (o.bracket ? fs(24) : 0), padB = o.padB != null ? o.padB : fs(14), padL = edge, padR = edge;
  var y0 = h - padB, ih = y0 - padT, iw = w - padL - padR, step = n > 1 ? iw / (n - 1) : 0;
  var pad = (mx - mn) * 0.18 || mx * 0.1 || 1;
  var hi = mx + pad, lo = Math.max(0, mn - pad);
  var Y = function(x){ return y0 - (x - lo) / (hi - lo) * ih; };
  var X = function(i){ return padL + step * i; };
  /* цвет по уровню значения: минимум ряда — красный, максимум — зелёный */
  var hue = function(x){
    var t = mx === mn ? 0.5 : (x - mn) / (mx - mn);
    if (o.invert) t = 1 - t;                      /* для нагрузки высокое значение — плохо */
    var stop = [[226, 85, 61], [240, 180, 41], [47, 163, 107]];
    var i = t < 0.5 ? 0 : 1, k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    var a = stop[i], b = stop[i + 1];
    return 'rgb(' + a.map(function(c, j){ return Math.round(c + (b[j] - c) * k); }).join(',') + ')';
  };

  /* градиент идёт слева направо: каждая точка красится по своему уровню */
  var stops = '';
  v.forEach(function(x, i){
    if (x == null) return;
    stops += '<stop offset="' + (n > 1 ? (i / (n - 1) * 100).toFixed(1) : 0) + '%" stop-color="' + hue(x) +
             '" stop-opacity="0.26"/>';
  });
  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<linearGradient id="' + uid + 'a" x1="0" y1="0" x2="1" y2="0">' + stops + '</linearGradient>' +
      '<radialGradient id="' + uid + 'd" cx="0.34" cy="0.28" r="0.8">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.32" stop-color="#A9754F"/>' +
        '<stop offset="1" stop-color="#4A2C18"/>' +
      '</radialGradient>' +
      /* сравниваемые точки — объёмный красный */
      '<radialGradient id="' + uid + 'r" cx="0.34" cy="0.28" r="0.85">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.3" stop-color="#E8563C"/>' +
        '<stop offset="1" stop-color="#7A1B10"/>' +
      '</radialGradient>' +
      /* синие сравниваемые точки (скользящий год, Олег 09.11) */
      '<radialGradient id="' + uid + 'b" cx="0.34" cy="0.28" r="0.85">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.3" stop-color="#5B8DEF"/>' +
        '<stop offset="1" stop-color="#1E3F8A"/>' +
      '</radialGradient>' +
      '<radialGradient id="' + uid + 'g" cx="0.34" cy="0.28" r="0.85">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.3" stop-color="#48B87E"/>' +
        '<stop offset="1" stop-color="#175C3C"/>' +
      '</radialGradient>' +
    '</defs>';

  if (o.band){                                    /* коридор нормы фоном + его границы слева */
    var bHi = Math.max(o.band[0], o.band[1]), bLo = Math.min(o.band[0], o.band[1]);
    var by1 = Y(bHi), by2 = Y(bLo);
    s += '<rect x="' + padL.toFixed(1) + '" y="' + by1.toFixed(1) + '" width="' + iw.toFixed(1) +
         '" height="' + Math.max(1, by2 - by1).toFixed(1) + '" fill="#2FA36B" fill-opacity="0.10"/>';
    s += T(padL - fs(3), by1 + fs(3), fmt(bHi), { size:9, w:600, fill:'#3E8C63', a:'end' });
    s += T(padL - fs(3), by2 + fs(3), fmt(bLo), { size:9, w:600, fill:'#3E8C63', a:'end' });
  }
  if (o.bench){                                   /* мировой бенчмарк подкатегории — заливка + пунктир */
    var yHi = Y(Math.max(o.bench.lo, o.bench.hi)), yLo = Y(Math.min(o.bench.lo, o.bench.hi));
    s += '<rect x="' + padL.toFixed(1) + '" y="' + yHi.toFixed(1) + '" width="' + iw.toFixed(1) +
         '" height="' + Math.max(1, yLo - yHi).toFixed(1) + '" fill="#F0B429" fill-opacity="0.16"/>';
    [o.bench.hi, o.bench.lo].forEach(function(bv){
      var y = Y(bv);
      s += '<line x1="' + padL.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + (w - padR).toFixed(1) +
           '" y2="' + y.toFixed(1) + '" stroke="' + C.navy + '" stroke-width="0.9" stroke-dasharray="5 3" ' +
           'stroke-opacity="0.65"/>';
      s += T(w - padR + fs(3), y + fs(3), fmt(bv), { size:9, w:600, fill:C.navy, a:'start' });
    });
  }
  var line = '', open = false;
  v.forEach(function(x, i){
    if (x == null){ open = false; return; }        /* месяц без данных — разрыв, а не соединение */
    line += (open ? ' L' : ' M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1);
    open = true;
  });
  if (!o.band)                                    /* на графике с коридором заливка мешает читать полосу */
    s += '<path d="' + line + ' L' + X(n - 1).toFixed(1) + ' ' + y0.toFixed(1) + ' L' + X(0).toFixed(1) + ' ' +
         y0.toFixed(1) + ' Z" fill="url(#' + uid + 'a)"/>';
  /* от каждой точки — белая пунктирная стойка до оси: видно, к какому месяцу относится значение */
  v.forEach(function(x, i){
    if (x == null) return;
    s += '<line x1="' + X(i).toFixed(1) + '" y1="' + (Y(x) + 3).toFixed(1) + '" x2="' + X(i).toFixed(1) +
         '" y2="' + y0.toFixed(1) + '" stroke="#fff" stroke-width="0.8" stroke-opacity="0.85" stroke-dasharray="2 2"/>';
  });
  s += '<line x1="' + padL.toFixed(1) + '" y1="' + y0 + '" x2="' + (w - padR).toFixed(1) + '" y2="' + y0 +
       '" stroke="#DDE1E7"/>';
  s += '<path d="' + line + '" fill="none" stroke="#6B4226" stroke-width="1.3" stroke-linejoin="round"/>';

  var everyLab = Math.max(1, Math.ceil(n * fs(36) / iw)), lastLo = -1e9, labeled = {};
  var iNow = n - 1, iPrev = n - 1 - 12;          /* точки, которые сравниваются в подзаголовке карточки */
  v.forEach(function(x, i){
    if (x == null) return;
    var cx = X(i), cy = Y(x);
    /* выделяем точки: на скользящем годе — сравниваемые, на нагрузке — вышедшие за коридор */
    /* цвет — по порогу o.hot (верх бенчмарка); полоса базы на цвет не влияет */
    var lim = o.hot != null ? o.hot : (o.band ? Math.max(o.band[0], o.band[1]) : null);
    var above = lim != null && x > lim;
    var mark = lim == null && (i === iNow || i === iPrev);
    var grad = lim != null ? (above ? 'r' : 'g') : (mark ? (o.markBlue ? 'b' : 'r') : 'd');
    var hot = mark || above;                      /* красный шарик всегда раздувается */
    if (hot) s += '<g class="matdot' + (i === iNow && mark ? ' now' : '') + '">';
    s += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (mark || o.band ? 3.8 : 3.4) +
         '" fill="url(#' + uid + grad + ')"/>';
    s += '<circle cx="' + (cx - 1).toFixed(1) + '" cy="' + (cy - 1.1).toFixed(1) + '" r="1" fill="#fff" fill-opacity="0.75"/>';
    if (hot) s += '</g>';
    /* крайние подписи — внутрь графика: слева и справа на полях стоят подписи коридора и бенчмарка */
    var la = i === 0 && (o.band || o.bench) ? 'start' : (i === n - 1 && (o.band || o.bench) ? 'end' : 'middle');
    if (lim != null && !above){                   /* точки не выше порога подписываем снизу */
      var lw = tw(fmt(x), 10.5, 600) + fs(3);
      var mid = la === 'start' ? cx + lw / 2 : (la === 'end' ? cx - lw / 2 : cx);   /* центр подписи */
      if (mid - lastLo >= lw){ s += T(cx, cy + fs(13), fmt(x), { size:10.5, w:600, fill:'#2E7D5B', a:la }); lastLo = mid; }
    } else if ((i % everyLab === 0 && n - 1 - i >= everyLab * 0.6) || i === n - 1)
      { s += T(cx, cy - fs(6), fmt(x), { size:10.5, w:600, fill:'#5A3A24', a:la }); labeled[i] = true; }
  });
  /* «скобка» год к году: от двух сравниваемых точек вверх серые пунктиры, сверху тонкая линия,
     посередине прирост в деньгах и в процентах (Олег, 09.11) */
  if (o.bracket && iPrev >= 0 && v[iPrev] != null && v[iNow] != null){
    var xa = X(iPrev), xb = X(iNow), top = 1e9;
    for (var q = iPrev; q <= iNow; q++) if (v[q] != null) top = Math.min(top, Y(v[q]) - (labeled[q] ? fs(17) : 0));
    var yb = Math.max(fs(16), top - fs(10));
    [[xa, iPrev], [xb, iNow]].forEach(function(p){
      var y0d = Y(v[p[1]]) - (labeled[p[1]] ? fs(19) : 6);
      if (y0d > yb) s += '<line x1="' + p[0].toFixed(1) + '" y1="' + y0d.toFixed(1) + '" x2="' + p[0].toFixed(1) +
        '" y2="' + yb.toFixed(1) + '" stroke="#9AA3AF" stroke-width="0.8" stroke-dasharray="2 2"/>';
    });
    s += '<line x1="' + xa.toFixed(1) + '" y1="' + yb.toFixed(1) + '" x2="' + xb.toFixed(1) + '" y2="' + yb.toFixed(1) +
         '" stroke="#9AA3AF" stroke-width="0.7"/>';
    /* стрелки на концах — как размерная линия: «ширина» от года назад до сейчас */
    s += '<path d="M' + xa.toFixed(1) + ' ' + yb.toFixed(1) + ' l6 -3 v6 Z M' + xb.toFixed(1) + ' ' + yb.toFixed(1) +
         ' l-6 -3 v6 Z" fill="#9AA3AF"/>';
    var d = v[iNow] - v[iPrev], dp = v[iPrev] ? d / v[iPrev] * 100 : null;
    var mul = o.bracketMul || 1, up = d >= 0;
    var txt = (up ? '▲ +' : '▼ −') + money(Math.abs(d) * mul) + (dp == null ? '' : ' · ' + (up ? '+' : '−') + num1(Math.abs(dp)) + '%') +
              ' за год';
    var tW = tw(txt, 10.5, 700) + 10, mx2 = (xa + xb) / 2;
    s += '<rect x="' + (mx2 - tW / 2).toFixed(1) + '" y="' + (yb - fs(7)).toFixed(1) + '" width="' + tW.toFixed(1) +
         '" height="' + fs(14) + '" rx="3" fill="#fff"/>';
    s += T(mx2, yb + fs(4), txt, { size:10.5, w:700, fill:up ? '#2E7D5B' : '#C0392B' });
  }
  var everyX = Math.max(1, Math.ceil(n * fs(44) / iw));
  rr.forEach(function(r, i){
    if (i !== n - 1 && (i % everyX !== 0 || n - 1 - i < everyX * 0.6)) return;
    s += T(X(i), y0 + fs(11), MON[r.m - 1] + ' ' + String(r.y).slice(2), { size:10, fill:C.mut });
  });
  host.innerHTML = s + '</svg>';
}

/* ============ 15. Ставка: план физибилити и факт по годам договора ============ */
/* plan: [{y, plan}], fact: [{y, fact}], cur — текущий год договора */
function rateChart(host, plan, fact, cur, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 300, o.hardMin || 200);
  var h = host.clientHeight || o.h || 150;
  var n = plan.length, padT = fs(20), padB = fs(30), padL = 4, padR = 4;
  /* пометка не влезает в ширину — переносим по « · » на вторую строку, а не обрезаем */
  var noteLines = !o.note ? [] : (tw(o.note, 9) <= w - padL - padR ? [o.note] : o.note.split(' · '));
  if (noteLines.length > 1) padB += fs(11) * (noteLines.length - 1);
  var y0 = h - padB, ih = y0 - padT, iw = w - padL - padR, slot = iw / n;
  var vals = plan.map(function(p){ return p.plan; }).concat(fact.map(function(f){ return f.fact; }));
  var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
  /* поля в пикселях: сверху место под подписи верхней линии (padT), снизу — под подписи нижней (mB) */
  var mB = fs(15), span = (mx - mn) || mx * 0.3 || 1;
  var Y = function(v){ return y0 - mB - (v - mn) / span * Math.max(8, ih - mB); };
  /* для каждого года: чья линия выше — у той подпись сверху, у нижней — снизу (не сталкиваются) */
  var factOf = {};
  fact.forEach(function(f){ factOf[f.y] = f.fact; });
  var factUp = function(yr){ var p = plan[yr - 1]; return !p || factOf[yr] >= p.plan; };
  var cx = function(i){ return padL + slot * i + slot / 2; };
  var money1 = o.fmt || function(v){ return '$' + Math.round(v); };
  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<radialGradient id="rpg" cx="0.34" cy="0.28" r="0.85">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.3" stop-color="#A9754F"/><stop offset="1" stop-color="#4A2C18"/></radialGradient>' +
      '<radialGradient id="rpr" cx="0.34" cy="0.28" r="0.85">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.3" stop-color="#E8563C"/><stop offset="1" stop-color="#7A1B10"/></radialGradient>' +
      '<radialGradient id="rpgr" cx="0.34" cy="0.28" r="0.85">' +
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>' +
        '<stop offset="0.3" stop-color="#48B87E"/><stop offset="1" stop-color="#175C3C"/></radialGradient>' +
    '</defs>';

  var ci = cur - 1;
  s += '<rect x="' + (padL + slot * ci).toFixed(1) + '" y="' + padT + '" width="' + slot.toFixed(1) +
       '" height="' + ih.toFixed(1) + '" fill="#1B2A4A" fill-opacity="0.05"/>';

  /* разрыв план/факт на текущем году */
  var fCur = fact.filter(function(f){ return f.y === cur; })[0];
  var pCur = plan[ci];
  if (fCur && pCur){
    var yF = Y(fCur.fact), yP = Y(pCur.plan), under = fCur.fact < pCur.plan;
    if (Math.abs(yF - yP) > 0.5)
      s += '<rect x="' + (padL + slot * ci).toFixed(1) + '" y="' + Math.min(yF, yP).toFixed(1) +
           '" width="' + slot.toFixed(1) + '" height="' + Math.abs(yF - yP).toFixed(1) +
           '" fill="' + (under ? '#E2553D' : '#2FA36B') + '" fill-opacity="0.18"/>';
  }

  /* ступенчатая линия плана */
  var d = '';
  plan.forEach(function(p, i){
    var x1 = padL + slot * i, x2 = x1 + slot, y = Y(p.plan);
    d += (i ? ' L' : 'M') + x1.toFixed(1) + ' ' + y.toFixed(1) + ' L' + x2.toFixed(1) + ' ' + y.toFixed(1);
  });
  s += '<path d="' + d + '" fill="none" stroke="#5A6478" stroke-width="1.3" stroke-linejoin="round"/>';

  /* факт: линия до текущего года */
  var fd = '';
  fact.forEach(function(f, i){
    var x1 = padL + slot * (f.y - 1), x2 = x1 + slot, y = Y(f.fact);
    fd += (i ? ' L' : 'M') + x1.toFixed(1) + ' ' + y.toFixed(1) + ' L' + x2.toFixed(1) + ' ' + y.toFixed(1);
  });
  if (fd) s += '<path d="' + fd + '" fill="none" stroke="#6B4226" stroke-width="1.6" stroke-linejoin="round"/>';

  /* точки факта: текущий год крупнее и по цвету разрыва */
  fact.forEach(function(f){
    var x = cx(f.y - 1), y = Y(f.fact), now = f.y === cur;
    var p = plan[f.y - 1], under = p && f.fact < p.plan;
    var g = now ? (under ? 'rpr' : 'rpgr') : 'rpg';
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (now ? 5.4 : 3.6) +
         '" fill="url(#' + g + ')"/>';
    s += '<circle cx="' + (x - 1.2).toFixed(1) + '" cy="' + (y - 1.3).toFixed(1) + '" r="1.1" fill="#fff" fill-opacity="0.75"/>';
  });

  /* подписи: у верхней линии года — над ней, у нижней — под ней */
  plan.forEach(function(p, i){
    var up = factOf[i + 1] == null || !factUp(i + 1);
    s += T(cx(i), up ? Y(p.plan) - fs(5) : Y(p.plan) + fs(12), money1(p.plan),
           { size:10.5, w:600, fill:i === ci ? C.navy : '#5A6478' });
  });
  fact.forEach(function(f){
    s += T(cx(f.y - 1), factUp(f.y) ? Y(f.fact) - fs(8) : Y(f.fact) + fs(13), money1(f.fact),
           { size:10.5, w:600, fill:f.y === cur ? (plan[f.y - 1] && f.fact < plan[f.y - 1].plan ? C.warn : '#2E7D5B') : '#5A3A24' });
  });

  s += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + (w - padR) + '" y2="' + y0 + '" stroke="#B5BAC2"/>';
  plan.forEach(function(p, i){
    var lab = i === ci ? p.y + '-й · сейчас' : p.y + '-й', lw = tw(lab, 10, i === ci ? 600 : 400);
    var lx = cx(i), la = 'middle';
    if (lx + lw / 2 > w - padR){ lx = w - padR; la = 'end'; }        /* крайняя подпись не уходит за край */
    s += T(lx, y0 + fs(16), lab, { size:10, w:i === ci ? 600 : 400, fill:i === ci ? C.navy : C.mut, a:la });
  });
  noteLines.forEach(function(t, k){
    s += T(padL, h - fs(2) - fs(11) * (noteLines.length - 1 - k), t, { size:9, fill:C.mut, a:'start' });
  });
  host.innerHTML = s + '</svg>';
  return padB;                                    /* нижний отступ: по нему выравнивается ось соседнего графика */
}

/* ============ 16. Календарь договора: слова сверху, даты снизу ============ */
/* marks: [{t, label, sub(дата), color, big, prio}] — при тесноте дата с меньшим prio скрывается */
function contractBar(host, marks, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 300, 170), h = o.h || host.clientHeight || 64;
  var padL = 4, padR = 4, iw = w - padL - padR, y = h / 2 + fs(2);
  var X = function(t){ return padL + Math.max(0, Math.min(1, t)) * iw; };
  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';
  s += '<rect x="' + padL + '" y="' + (y - 4) + '" width="' + iw + '" height="8" rx="4" fill="#EDF0F4"/>';
  if (o.done != null)
    s += '<rect x="' + padL + '" y="' + (y - 4) + '" width="' + (iw * Math.max(0, Math.min(1, o.done))).toFixed(1) +
         '" height="8" rx="4" fill="#1B2A4A" fill-opacity="0.55"/>';
  var place = function(x, lw){
    var a = x < padL + lw / 2 + 2 ? 'start' : (x > w - padR - lw / 2 - 2 ? 'end' : 'middle');
    var ax = a === 'start' ? padL : (a === 'end' ? w - padR : x);
    return { a:a, ax:ax, lo:a === 'start' ? ax : (a === 'end' ? ax - lw : ax - lw / 2) };
  };
  var top = [], bot = [];
  marks.forEach(function(mk){
    var x = X(mk.t), col = mk.color || C.navy;
    s += '<line x1="' + x.toFixed(1) + '" y1="' + (y - 10) + '" x2="' + x.toFixed(1) + '" y2="' + (y + 10) +
         '" stroke="' + col + '" stroke-width="' + (mk.big ? 2.5 : 1.5) + '"/>';
    if (mk.big) s += '<circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="4" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>';
  });
  /* слова над линией: при пересечении менее важное слово скрываем */
  marks.slice().sort(function(a, c){ return (c.prio || 0) - (a.prio || 0); }).forEach(function(mk){
    var lw = tw(mk.label, 10, 700), p = place(X(mk.t), lw), hi = p.lo + lw;
    if (top.some(function(q){ return !(hi < q.lo - 4 || p.lo > q.hi + 4); })) return;
    top.push({ lo:p.lo, hi:hi });
    s += T(p.ax, y - fs(15), mk.label, { size:10, w:700, fill:mk.color || C.navy, a:p.a });
  });
  /* даты под линией: тот же принцип */
  marks.slice().sort(function(a, c){ return (c.subPrio || c.prio || 0) - (a.subPrio || a.prio || 0); }).forEach(function(mk){
    if (!mk.sub) return;
    var lw = tw(mk.sub, 10, 400), p = place(X(mk.t), lw), hi = p.lo + lw;
    if (bot.some(function(q){ return !(hi < q.lo - 4 || p.lo > q.hi + 4); })) return;
    bot.push({ lo:p.lo, hi:hi });
    s += T(p.ax, y + fs(22), mk.sub, { size:10, fill:C.mut, a:p.a });
  });
  host.innerHTML = s + '</svg>';
}

/* ============ 16б. Календарь договора шагами: точки на равном расстоянии, не по времени ============ */
/* marks: [{ms, label, sub(дата), color, big}] — порядок по времени; между точками — длительность */
function stepBar(host, marks, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 300, 200), h = o.h || host.clientHeight || 46;
  var m = marks.slice().sort(function(a, c){ return a.ms - c.ms; }), n = m.length;
  var padL = 6, padR = 6, iw = w - padL - padR;
  var blockH = fs(39), y = Math.max(0, (h - blockH) / 2) + fs(19);
  var X = function(i){ return padL + iw * i / (n - 1); };
  var dur = function(ms){
    var mo = Math.round(ms / (30.44 * 864e5)), yr = Math.floor(mo / 12), r = mo % 12;
    if (mo < 1) return 'меньше месяца';
    return (yr ? yr + ' г.' : '') + (yr && r ? ' ' : '') + (r ? r + ' мес.' : '');
  };
  var anchor = function(i){ return i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle'); };
  var s = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">';
  s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y +
       '" stroke="#E3E7EE" stroke-width="6" stroke-linecap="round"/>';
  var nowI = -1;
  m.forEach(function(mk, i){ if (mk.now) nowI = i; });
  if (nowI > 0)
    s += '<line x1="' + padL + '" y1="' + y + '" x2="' + X(nowI).toFixed(1) + '" y2="' + y +
         '" stroke="#1B2A4A" stroke-opacity="0.55" stroke-width="6" stroke-linecap="round"/>';
  /* длительность отрезка — над линией посередине, если помещается между подписями точек */
  for (var i = 0; i < n - 1; i++){
    var t = dur(m[i + 1].ms - m[i].ms), tw0 = tw(t, 9, 400);
    /* свободный промежуток между подписями соседних точек (крайние подписи прижаты к краям) */
    var lo = X(i) + (i === 0 ? tw(m[i].label, 10, 700) : tw(m[i].label, 10, 700) / 2) + 6;
    var hi = X(i + 1) - (i + 1 === n - 1 ? tw(m[i + 1].label, 10, 700) : tw(m[i + 1].label, 10, 700) / 2) - 6;
    if (tw0 <= hi - lo) s += T((lo + hi) / 2, y - fs(5), t, { size:9, fill:C.mut });
  }
  m.forEach(function(mk, i){
    var x = X(i), col = mk.color || C.navy, a = anchor(i);
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="' + (mk.big ? 5 : 3.8) + '" fill="' + col +
         '" stroke="#fff" stroke-width="1.5"/>';
    s += T(x, y - fs(10), mk.label, { size:10, w:700, fill:col, a:a });
    s += T(x, y + fs(18), mk.sub, { size:10.5, w:600, fill:mk.big ? col : C.ink, a:a });
  });
  host.innerHTML = s + '</svg>';
}

/* ============ 13. Мини-график для панели показателей ============ */
/* vals: числа (null = нет данных); подпись последнего значения справа */
function miniChart(host, vals, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 150, 90), h = o.h || host.clientHeight || 44;
  var padR = o.label === false ? 2 : 40, padT = 5, padB = 8;
  var live = vals.filter(function(v){ return v != null; });
  if (!live.length){ host.innerHTML = ''; return; }
  var mx = Math.max.apply(null, live), mn = o.zero ? 0 : Math.min.apply(null, live);
  if (mx === mn) mx = mn + 1;
  var iw = w - padR - 2, step = vals.length > 1 ? iw / (vals.length - 1) : 0;
  var Y = function(v){ return h - padB - (v - mn) / (mx - mn) * (h - padT - padB); };
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  if (o.type === 'bar'){
    var bw = Math.max(1.5, iw / vals.length * 0.7);
    vals.forEach(function(v, i){
      if (v == null) return;
      var x = 2 + iw / vals.length * i, bh = Math.max(1, (h - padB) - Y(v));
      s += '<rect x="'+x.toFixed(1)+'" y="'+Y(v).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+
           '" fill="'+(o.color || C.green)+'" fill-opacity="0.7"/>';
    });
  } else {
    var d = '', prev = null;
    vals.forEach(function(v, i){
      if (v == null){ prev = null; return; }
      d += (prev === null ? 'M' : 'L') + (2 + step * i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '; prev = 1;
    });
    if (o.band){                                   /* коридор нормы */
      s += '<rect x="2" y="'+Y(o.band[1]).toFixed(1)+'" width="'+iw+'" height="'+
           Math.abs(Y(o.band[0]) - Y(o.band[1])).toFixed(1)+'" fill="#4E9B6F" fill-opacity="0.12"/>';
    }
    s += '<path d="'+d+'" fill="none" stroke="'+(o.color || C.navy)+'" stroke-width="1.8"/>';
  }
  var li = -1; vals.forEach(function(v, i){ if (v != null) li = i; });
  if (li >= 0 && o.label !== false){
    var lx = o.type === 'bar' ? 2 + iw / vals.length * li + 3 : 2 + step * li;
    s += '<circle cx="'+lx.toFixed(1)+'" cy="'+Y(vals[li]).toFixed(1)+'" r="2.6" fill="'+(o.color || C.navy)+'"/>';
    s += T(w - 2, Y(vals[li]) + 3.5, (o.fmt || num1)(vals[li]), { size:9.5, w:700, fill:C.ink, a:'end' });
  }
  host.innerHTML = s + '</svg>';
}


/* ============ 14. Таймлайн договора: старт — сегодня — дедлайн решения — окончание ============ */
/* marks: [{t: доля 0..1, label, sub, color, big}] */
function timeline(host, marks, o){
  o = o || {};
  var w = Math.max(host.clientWidth || 300, 170), h = o.h || host.clientHeight || 74;
  var padL = 10, padR = 10, iw = w - padL - padR;
  /* нижний ряд подписей занимает ~40px — линия не может стоять ниже h-40 */
  var y = Math.min(o.y || 34, h - fs(40));
  var X = function(t){ return padL + Math.max(0, Math.min(1, t)) * iw; };
  var s = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';
  s += '<rect x="'+padL+'" y="'+(y-4)+'" width="'+iw+'" height="8" rx="4" fill="#EDF0F4"/>';
  if (o.done != null)
    s += '<rect x="'+padL+'" y="'+(y-4)+'" width="'+(iw*Math.max(0,Math.min(1,o.done))).toFixed(1)+
         '" height="8" rx="4" fill="#1B2A4A" fill-opacity="0.55"/>';
  var lanes = [[], [], []];                   /* 0 — над линией, 1 — под линией, 2 — второй ряд сверху */
  marks.forEach(function(mk){
    var x = X(mk.t), col = mk.color || C.navy;
    s += '<line x1="'+x.toFixed(1)+'" y1="'+(y-12)+'" x2="'+x.toFixed(1)+'" y2="'+(y+12)+'" stroke="'+col+
         '" stroke-width="'+(mk.big ? 2.5 : 1.5)+'"/>';
    if (mk.big) s += '<circle cx="'+x.toFixed(1)+'" cy="'+y+'" r="4.5" fill="'+col+'" stroke="#fff" stroke-width="1.5"/>';
    var lw = Math.max(tw(mk.label, 9.5, 700), mk.sub ? tw(mk.sub, 8.5, 400) : 0);
    var anchor = x < padL + lw / 2 + 2 ? 'start' : (x > w - padR - lw / 2 - 2 ? 'end' : 'middle');
    var ax = anchor === 'start' ? padL : (anchor === 'end' ? w - padR : x);
    var lo = anchor === 'start' ? ax : (anchor === 'end' ? ax - lw : ax - lw / 2), hi = lo + lw;
    var lane = mk.lane != null ? mk.lane : 0;    /* уровень можно задать явно, иначе первый свободный */
    if (mk.lane == null){
      for (var k = 0; k < 3; k++){
        var free = lanes[k].every(function(p){ return hi < p.lo - 5 || lo > p.hi + 5; });
        lane = k;
        if (free) break;
      }
    }
    lanes[lane].push({ lo:lo, hi:hi });
    var ly = lane === 0 ? y - fs(17) : (lane === 1 ? y + fs(26) : y - fs(40));
    var sy = lane === 0 ? y - fs(29) : (lane === 1 ? y + fs(38) : y - fs(52));
    s += T(ax, ly, mk.label, { size:9.5, w:700, fill:col, a:anchor });
    if (mk.sub) s += T(ax, sy, mk.sub, { size:8.5, fill:C.mut, a:anchor });
  });
  host.innerHTML = s + '</svg>';
}

/* ============ 6. Спарклайн для таблиц ============ */
function spark(vals, w, h, color){
  w = w || 84; h = h || 20;
  var v = vals.filter(function(x){ return x != null; });
  if (v.length < 2) return '';
  var mx = Math.max.apply(null, v), mn = Math.min.apply(null, v), d = '';
  vals.forEach(function(x, i){
    if (x == null) return;
    var px = i / (vals.length - 1) * (w - 2) + 1;
    var py = h - 2 - (mx === mn ? 0.5 : (x - mn) / (mx - mn)) * (h - 4);
    d += (d ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
  });
  var lx = (w - 1), ly = h - 2 - (mx === mn ? 0.5 : (vals[vals.length-1] - mn) / (mx - mn)) * (h - 4);
  return '<svg width="'+w+'" height="'+h+'" style="vertical-align:middle">' +
    '<path d="'+d+'" fill="none" stroke="'+(color||C.navy)+'" stroke-width="1.4" stroke-opacity="0.8"/>' +
    '<circle cx="'+lx+'" cy="'+ly.toFixed(1)+'" r="2" fill="'+(color||C.navy)+'"/></svg>';
}
