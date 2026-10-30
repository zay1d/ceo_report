"use strict";
/* ============================================================
   TCM Analytics — страница для руководства.
   Данные приходят с сервера (/api/data) из таблицы «Реестр 26»:
   помесячно, в долларах по курсу ЦБ на конец месяца, без НДС.
   Комментарии хранятся на сервере (/api/comments).
   ============================================================ */

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = (x,d) => x.toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
const sig = x => { const a=Math.abs(x); return nf(x, a>=100?0:a>=10?1:2); };
function plural(n,a,b,c){const m=n%100,k=n%10;return m>10&&m<20?c:k===1?a:k>1&&k<5?b:c;}
const MS=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const MN=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const MFULL=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];

/* ---------- данные ---------- */
let D=null, B=[], ZONES=[], M0=[0,0], N=0, L=0, MALL_TR_MEAN=0, ZW_ALL=0, ZT={}, MS_ON=false;
const SEG_ORDER=['Luxury','Bridge Luxury','Premium','Contemporary','Upper Mass','Mass','Mass Market'];

/* месяцы: индекс i ↔ «YYYY-MM» (индекс может выходить за пределы данных) */
const ym = s => { const [y,m]=s.split('-').map(Number); return [y,m-1]; };
const mi = s => { const [y,m]=ym(s); return (y-M0[0])*12+(m-M0[1]); };
const mOf = i => { const t=M0[1]+i; return [M0[0]+Math.floor(t/12), ((t%12)+12)%12]; };
const mIso = i => { const [y,m]=mOf(i); return y+'-'+String(m+1).padStart(2,'0'); };
const mLab = i => { const [y,m]=mOf(i); return MN[m]+' '+y; };
const mShort = i => { const [y,m]=mOf(i); return MN[m]+' '+String(y).slice(2); };
function fmtRange(a,b){
  if(a===b) return mLab(a);
  const [y1,m1]=mOf(a),[y2,m2]=mOf(b);
  if(y1===y2) return MN[m1]+'–'+MN[m2]+' '+y1;
  return mLab(a)+' – '+mLab(b);
}
/* подпись диапазона для списков периода: «сентябрь», «июль–сентябрь», «окт 2025 – сен 2026» */
function humanRange(a,b){
  const [y1,m1]=mOf(a),[y2,m2]=mOf(b), yL=mOf(L)[0], yy=y1===y2&&y1!==yL?' '+y1:'';
  if(a===b) return MFULL[m1]+yy;
  if(y1===y2) return MFULL[m1]+'–'+MFULL[m2]+yy;
  return MN[m1]+' '+y1+' – '+MN[m2]+' '+y2;
}
const fmtDate = s => { if(!s) return null; const [y,m,d]=s.split('-').map(Number); return d+' '+MS[m-1]+' '+y; };

function prepare(data){
  D=data; N=D.months.length; L=N-1; M0=ym(D.months[0]);
  B=D.brands.map((b,i)=>({...b,i,zones:b.zone?[b.zone]:[]}));
  ZONES=Object.keys(D.zones).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
  ZW_ALL=ZONES.reduce((s,z)=>s+D.zones[z],0);
  const tr=D.mallTraffic.filter(v=>v);
  MALL_TR_MEAN=tr.length?tr.reduce((s,v)=>s+v,0)/tr.length:0;
  ZT=D.zoneTraffic||{}; MS_ON=D.trafficSource==='mallsense';
}
/* трафик зоны за месяц: счётчики MallSense, а где их нет — оценка (вес зоны × сезонность ТРЦ) */
function zoneTr(z,i,mt){
  const v=ZT[z]&&ZT[z][i]; if(v!=null) return v;
  return mt&&MALL_TR_MEAN&&D.zones[z]?D.zones[z]*mt/MALL_TR_MEAN:0;
}

/* ============================================================
   РАСЧЁТ. По каждому месяцу выборки — суммы, из которых считаются показатели.
   Месяц вне данных (раньше первого/позже последнего) — пустой.
   ============================================================ */
function monthAgg(set,i,isMall){
  if(i<0||i>=N) return null;
  const o={to:0,area:0,nb:0,toC:0,ch:0,toK:0,cost:0,tr:null,chT:0};
  for(const b of set){
    const t=b.to[i]; if(!(t>0)) continue;
    o.to+=t; o.area+=b.area; o.nb++;
    const c=b.ch[i]; if(c>0){o.toC+=t;o.ch+=c;}
    const k=b.cost[i]; if(k!=null){o.toK+=t;o.cost+=k;}
  }
  const mt=D.mallTraffic[i];
  if(isMall) o.tr=mt||null;
  else { const zs=new Set(set.flatMap(b=>b.zones)); let w=0; zs.forEach(z=>w+=zoneTr(z,i,mt)); o.tr=w||null; }
  if(o.tr) o.chT=o.ch;
  return o;
}
function series(set,a,b,isMall){
  const out=[]; for(let i=a;i<=b;i++) out.push(monthAgg(set,i,isMall)); return out;
}
function zoneInfo(set,isMall){
  if(isMall) return {zw:ZW_ALL,nz:ZONES.length};
  const zs=new Set(set.flatMap(b=>b.zones)); let w=0; zs.forEach(z=>w+=D.zones[z]||0); return {zw:w,nz:zs.size};
}
/* сумма по отрезку [x,y) серии; площадь и число брендов — средние по месяцам с данными */
function slice(s,x,y,z,mall){
  const o={to:0,toC:0,ch:0,toK:0,cost:0,tr:0,chT:0,area:0,nb:0,mto:0,marea:0,zw:z.zw,mzw:ZW_ALL,nz:z.nz,mon:0,trMon:0};
  for(let k=x;k<Math.min(y,s.length);k++){
    const m=s[k]; if(!m) continue;
    if(m.nb){o.mon++; o.area+=m.area; o.nb+=m.nb;}
    o.to+=m.to; o.toC+=m.toC; o.ch+=m.ch; o.toK+=m.toK; o.cost+=m.cost;
    if(m.tr){o.tr+=m.tr; o.chT+=m.chT; o.trMon++;}
    const mm=mall&&mall[k]; if(mm&&m.nb){o.mto+=mm.to; o.marea+=mm.area;}
  }
  if(o.mon){o.area/=o.mon; o.nb/=o.mon; o.marea/=o.mon;}
  return o;
}

/* ---------- показатели ---------- */
const METRICS=[
  {k:'to',  name:'Товарооборот', short:'ТО', type:'money', cur:'$',    fn:c=>c.nb>0?c.to:null, avg:c=>c.nb>0?c.to/c.nb:null, avgLabel:'на бренд'},
  {k:'tom2',name:'ТО на м²',     type:'money', cur:'$/м²', fn:c=>c.area>0?c.to/c.area:null},
  {k:'rA',  name:'Отдача площади', type:'ratio',
    fn:c=>(c.to>0&&c.area>0&&c.mto>0&&c.marea>0)?(c.to/c.mto)/(c.area/c.marea):null,
    hint:'Доля ТО объекта в ТО ТРЦ ÷ доля его площади в площади ТРЦ (по работающим брендам). 1,00 — отдача соответствует площади; выше — площадь работает лучше, чем в среднем по ТРЦ.'},
  {k:'rT',  name:'Отдача на трафик', type:'ratio',
    fn:c=>(c.to>0&&c.zw>0&&c.mto>0&&c.mzw>0)?(c.to/c.mto)/(c.zw/c.mzw):null,
    hint:'Доля ТО объекта в ТО ТРЦ ÷ доля трафика его зон в трафике всех зон. Выше 1,00 — объект даёт больше ТО, чем «весит» по трафику.'},
  {k:'ocr', name:'OCR',          type:'pct',   inverse:true, fn:c=>c.toK>0?c.cost/c.toK:null,
    hint:'OCR = (аренда + превышение ТО + OPEX и маркетинг) ÷ ТО, всё без НДС, по брендам с ТО за месяц.'},
  {k:'ch',  name:'Чеки',         type:'count', cur:'чеков', fn:c=>c.ch>0?c.ch:null, avg:c=>c.nb>0&&c.ch>0?c.ch/c.nb:null, avgLabel:'на бренд'},
  {k:'chk', name:'Средний чек',  type:'money', cur:'$',     fn:c=>c.ch>0?c.toC/c.ch:null},
  {k:'tr',  name:'Трафик зоны',  type:'count', cur:'чел.',  fn:c=>c.trMon?c.tr:null, avg:c=>c.trMon&&c.nz?c.tr/c.nz:null, avgLabel:'на зону', traffic:true},
  {k:'conv',name:'Усл. конверсия',type:'pct',  fn:c=>c.tr>0&&c.chT>0?c.chT/c.tr:null, traffic:true},
];
const MBY=Object.fromEntries(METRICS.map(m=>[m.k,m]));
const effFn=m=>(gActive()&&m.avg)?m.avg:m.fn;
function scale(v){const a=Math.abs(v);if(a>=1e9)return[v/1e9,'млрд'];if(a>=1e6)return[v/1e6,'млн'];if(a>=1e3)return[v/1e3,'тыс.'];return[v,''];}
function fmt(m,v){
  if(v==null||!isFinite(v)) return {num:'—',unit:''};
  if(m.type==='pct') return {num:nf(v*100,1),unit:'%'};
  if(m.type==='ratio') return {num:nf(v,2),unit:'×'};
  const [x,s]=scale(v); return {num:sig(x),unit:(s+' '+m.cur).trim()};
}
/* единый масштаб для всей таблицы показателя, чтобы цифры в колонках читались без единиц в каждой ячейке */
function mkScale(m,nums){
  if(m.type==='pct') return {unit:'%',f:v=>nf(v*100,1),fd:v=>nf(v*100,1)};
  if(m.type==='ratio') return {unit:'коэфф., 1,00 = по ТРЦ',f:v=>nf(v,2),fd:v=>nf(v,2)};
  const mx=Math.max(0,...nums.filter(x=>x!=null&&isFinite(x)).map(Math.abs));
  const [x,s]=scale(mx), div=x?mx/x:1, dec=x>=100?0:x>=10?1:2;
  return {unit:(s+' '+m.cur).trim(),f:v=>nf(v/div,dec),fd:v=>nf(v/div,Math.min(2,dec+1))};
}
function dnum(m,a,b){
  if(a==null||b==null||!isFinite(a)||!isFinite(b)) return null;
  const abs=a-b, rel=b!==0?abs/Math.abs(b):null, dir=Math.abs(abs)<1e-12?0:abs>0?1:-1;
  const good=dir===0?0:(m.inverse?-dir:dir);
  return {abs,rel,dir,cls:good>0?'up':good<0?'down':''};
}

/* ---------- периоды (месяцы) ---------- */
const PERIODS=[['last','Последний месяц'],['prev','Предыдущий месяц'],['q','Последние 3 месяца'],['h','Последние 6 месяцев'],['ytd','С начала года'],['l12','Последние 12 месяцев'],['pyear','Прошлый год'],['custom','Свой период']];
const COMPARES=[['none','Без сравнения'],['n','Предыдущий период'],['yoy','Год к году'],['custom','Свой период']];
const PLAB=Object.fromEntries(PERIODS), CLAB=Object.fromEntries(COMPARES);
function periodRange(p){
  const [y]=mOf(L), jan=mi(y+'-01');
  switch(p.key){
    case'last':return[L,L];case'prev':return[L-1,L-1];case'q':return[L-2,L];case'h':return[L-5,L];case'ytd':return[jan,L];
    case'l12':return[L-11,L];case'pyear':return[jan-12,jan-1];
    default:return[p.from,p.to];
  }
}
function compareRange(c,[a,b]){
  const n=b-a+1;
  switch(c.key){
    case'none':return null;case'n':return[a-n,b-n];case'yoy':return[a-12,b-12];
    default:return[c.from,c.to];
  }
}

/* ---------- состояние ---------- */
const DIMS=[['cat','Категория'],['sub','Подкатегория'],['ss','Под-подкатегория'],['seg','Сегмент'],['floor','Этаж'],['zone','Зона'],['mgr','Ответственный']];
const DIMLABEL={brand:'Бренд',cat:'Категория',sub:'Подкатегория',ss:'Под-подкатегория',seg:'Сегмент',floor:'Этаж',zone:'Зона',mgr:'Ответственный',mall:'Весь ТРЦ'};
const KEYS=['brand','cat','sub','ss','seg','floor','zone','mgr'];
const MAX_CMP=4;
/* палитра линий: у каждой линии (объект × период) свой цвет, без пунктира */
const PAL=['#B4806D','var(--ink)','#3E7C6B','#6A4C93','#C08A2E','#3B6EA5','#C2587A','#7A8B3C','#2E9AA8','#8C6D5A'];
const serColor=(i,kind,hasC)=>PAL[(hasC?i*2+(kind==='C'?1:0):i)%PAL.length];
/* state.f — текущий объект, state.cmpObjs — объекты сравнения (до 4), state.g — черновик в окне «Сравнить с» */
const state={f:{},g:{},cmpObjs:[],metric:'to',period:{key:'last',from:0,to:0},cmp:{key:'none',from:0,to:0}};
let cur={}, ui={tab:null,exp:{}};

const match=(b,f)=>(!f.brand||b.name===f.brand)&&(!f.cat||b.cat===f.cat)&&(!f.sub||b.sub===f.sub)&&(!f.ss||b.ss===f.ss)&&(!f.seg||b.seg===f.seg)&&(!f.floor||b.floor===f.floor)&&(!f.zone||b.zones.includes(f.zone))&&(!f.mgr||b.mgr===f.mgr);
const activeKeys=f=>KEYS.filter(k=>f[k]);
const gActive=()=>state.cmpObjs.length>0;
const setOf=f=>B.filter(b=>match(b,f));
const sameObj=(a,b)=>JSON.stringify(activeKeys(a).map(k=>[k,a[k]]))===JSON.stringify(activeKeys(b).map(k=>[k,b[k]]));
const entName=f=>{const k=activeKeys(f);return k.length?k.map(x=>f[x]).join(' · '):'Tashkent City Mall';};
function entTitle(f){const k=activeKeys(f);if(!k.length)return{name:'Tashkent City Mall',rest:[]};const v=k.map(x=>f[x]);return{name:v[0],rest:v.slice(1)};}

function recompute(){
  const objs=[state.f].concat(state.cmpObjs).map(f=>({f,set:setOf(f),isMall:!activeKeys(f).length}));
  const setA=objs[0].set, hasO=objs.length>1;
  const P=periodRange(state.period), C=compareRange(state.cmp,P);
  const eb=objs.slice(1).find(o=>!o.set.length);
  cur={setA,objs,P,C,hasO,isMallA:objs[0].isMall,bad:P[0]>P[1]||(C&&C[0]>C[1]),emptyA:!setA.length,emptyB:eb?entName(eb.f):null};
  if(!(cur.bad||cur.emptyA||cur.emptyB)){
    const w=chartWin(P), shift=C?C[0]-P[0]:0;
    cur.win=w;
    const mk=(set,isMall)=>({
      P:series(set,P[0],P[1],isMall), C:C?series(set,C[0],C[1],isMall):null,
      WP:series(set,w[0],w[1],isMall), WC:C?series(set,w[0]+shift,w[1]+shift,isMall):null,
      z:zoneInfo(set,isMall)});
    cur.mall=mk(B,true);
    objs.forEach(o=>{ o.o=o.isMall?cur.mall:mk(o.set,false); });
  }
  paint(true);
}
/* окно графика: сам период, а если он короче 6 месяцев — 12 месяцев до его конца */
function chartWin([a,b]){ return b-a+1>=6?[a,b]:[b-11,b]; }
/* значение показателя за период или за период сравнения */
function periodVal(m,obj,which,fn){
  const s=obj[which]; return (fn||effFn(m))(slice(s,0,s.length,obj.z,cur.mall[which]));
}
/* значения показателя по каждому бренду набора (для рейтинга и раскрытого списка) */
function brandRows(m,set){
  const P=cur.P, C=cur.C;
  const val=(b,a,e,mall)=>m.fn(slice(series([b],a,e,false),0,e-a+1,zoneInfo([b],false),mall));
  return set.map(b=>({b,vP:val(b,P[0],P[1],cur.mall.P),vC:C?val(b,C[0],C[1],cur.mall.C):null}));
}
const okv=x=>x!=null&&isFinite(x);
const bSub=b=>[b.floor,b.zone].filter(Boolean).join(' · ');

/* ---------- отрисовка ---------- */
function paintChips(){
  const keys=activeKeys(state.f), box=$('#chips');
  box.hidden=!keys.length;
  box.innerHTML=keys.map(k=>`<span class="chip"><span class="clab"><em>${DIMLABEL[k]}:</em> ${esc(state.f[k])}</span><button data-rm="${k}" aria-label="Убрать: ${DIMLABEL[k]}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`).join('');
  const n=keys.filter(k=>k!=='brand').length, fb=$('#fbadge'); fb.hidden=!n; fb.textContent=n;
  requestAnimationFrame(setHH);
}
/* объекты сравнения: чипы с крестиком; на кнопке «Сравнить с» появляются «Добавить» и «Очистить» */
function paintCmp(){
  const has=gActive(), hasC=state.cmp.key!=='none';
  $('#btnCmp').hidden=has; $('#cmp2').hidden=!has; $('#cmpwrap2').hidden=!has;
  $('#btnAdd').disabled=state.cmpObjs.length>=MAX_CMP;
  $('#cmpchips').innerHTML=state.cmpObjs.map((f,i)=>`<span class="chip"><i class="dot" style="background:${serColor(i+1,'P',hasC)}"></i><span class="clab">${esc(entName(f))}</span><button data-rmc="${i}" aria-label="Убрать из сравнения"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`).join('');
}
function paintCloud(animate){
  const {name,rest}=entTitle(state.f), set=cur.setA||[], area=set.reduce((s,b)=>s+b.area,0);
  $('#cName').textContent=name;
  const bits=[]; if(rest.length) bits.push(rest.join(' · '));
  bits.push(set.length?`${set.length} ${plural(set.length,'бренд','бренда','брендов')} · ${nf(area,0)} м²`:'нет брендов по такому сочетанию');
  $('#cSub').innerHTML=bits.map(esc).join('<br>');
  if(animate){const c=$('#cloud');c.classList.remove('pop');void c.offsetWidth;c.classList.add('pop');}
}
function paintMetrics(){
  $('#metrics').innerHTML=METRICS.map(m=>`<button class="pill" data-m="${m.k}" aria-pressed="${m.k===state.metric}">${esc(m.name)}</button>`).join('');
}

/* ---------- раскрытие брендов внутри таблицы ---------- */
function toggleExp(i){
  const o=cur.objs&&cur.objs[i]; if(!o||o.set.length<2) return;
  const key=entName(o.f); ui.exp[key]=!ui.exp[key];
  paintData();
}
function brandsBlock(m,o,hasC){
  const sgn=m.inverse?1:-1, sg=(t,v)=>v>0?'+'+t:t;
  const rows=brandRows(m,o.set);
  rows.sort((a,b)=>(okv(a.vP)?0:1)-(okv(b.vP)?0:1)||sgn*((okv(a.vP)?a.vP:0)-(okv(b.vP)?b.vP:0)));
  const S=mkScale(m,rows.flatMap(r=>hasC?[r.vP,r.vC]:[r.vP]));
  const absTxt=v=>sg(S.fd(v),v), relTxt=r=>r==null?'—':sg(nf(r*100,1),r)+' %';
  const lines=rows.map(r=>{
    const d=hasC?dnum(m,r.vP,r.vC):null;
    return `<div class="trow brow" role="button" tabindex="0" data-pickb="${esc(r.b.name)}"><div class="rn"><span>${esc(r.b.name)}<small>${esc(bSub(r.b))}</small></span></div><div class="cv"><b>${okv(r.vP)?S.f(r.vP):'—'}</b></div>`+
      (hasC?`<div class="cv"><b>${okv(r.vC)?S.f(r.vC):'—'}</b></div>`+(d?`<div class="cv ${d.cls}"><b>${absTxt(d.abs)}</b></div><div class="cv sm ${d.cls}"><b><em class="ar">${d.dir>0?'▲':d.dir<0?'▼':'•'}</em>${relTxt(d.rel)}</b></div>`:'<div class="cv"><b>—</b></div><div class="cv"><b>—</b></div>'):'')+`</div>`;
  }).join('');
  return `<div class="bgrp"><div class="bgh">Бренды: ${rows.length} · ${esc(S.unit)}${m.inverse?' · чем ниже, тем лучше':''} · нажмите на бренд, чтобы выбрать его</div>${lines}</div>`;
}

function paintData(){
  const m=MBY[state.metric], hasO=cur.hasO, hasC=!!cur.C;
  const vals=$('#vals'), slot=$('#chartslot');
  if(cur.bad||cur.emptyA||cur.emptyB){
    slot.innerHTML='';
    vals.innerHTML=`<p class="warn">${cur.bad?'Начало периода позже конца — поправьте месяцы.':cur.emptyA?'По выбранным параметрам брендов нет. Измените поиск или фильтр.':'По объекту сравнения «'+esc(cur.emptyB)+'» брендов нет. Уберите его из сравнения.'}</p>`;
    return;
  }
  const fnE=effFn(m), avgOn=hasO&&!!m.avg;
  const R=cur.objs.map((o,i)=>({name:entName(o.f),colP:serColor(i,'P',hasC),colC:serColor(i,'C',hasC),o:o.o}));
  const V=R.map(r=>({P:periodVal(m,r.o,'P',fnE),C:hasC?periodVal(m,r.o,'C',fnE):null}));
  const nums=[]; V.forEach(v=>{nums.push(v.P); if(hasC) nums.push(v.C);});
  const S=mkScale(m,nums), sg=(t,v)=>v>0?'+'+t:t;
  const absTxt=v=>sg(S.fd(v),v), relTxt=r=>r==null?'—':sg(nf(r*100,1),r)+' %';
  const arrow=d=>d.dir>0?'▲':d.dir<0?'▼':'•';
  const dots=hasO||hasC;
  const cols=hasC?'minmax(102px,1.2fr) minmax(0,.95fr) minmax(0,.95fr) minmax(0,.9fr) minmax(0,1.05fr)':'minmax(0,1.1fr) minmax(0,1fr)';
  const unit=S.unit+(avgOn?' · в среднем '+m.avgLabel:'');
  const cell=(v,col)=>`<div class="cv"><b>${dots&&col?`<i class="vd" style="background:${col}"></i>`:''}${v==null?'—':S.f(v)}</b></div>`;
  let h=`<div class="tbl${hasC?'':' t1'}" style="--cols:${cols}">
    <div class="trow thead"><div class="tm"><div class="tt"><h2>${esc(hasC?(m.short||m.name):m.name)}</h2><button class="mi" data-mi="${m.k}" aria-label="Что это и как считается">i</button></div><small>${esc(unit)}</small></div>
      <div class="tc">Период<small>${esc(fmtRange(cur.P[0],cur.P[1]))}</small></div>`+
    (hasC?`<div class="tc">Сравнение<small>${esc(fmtRange(cur.C[0],cur.C[1]))}</small></div>
      <div class="tc">Δ<small>${m.type==='pct'?'п.п.':'абс.'}</small></div><div class="tc">Прирост<small>%</small></div>`:'')+`</div>`;
  const chev='<svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg>';
  R.forEach((r,i)=>{
    const v=V[i], d=hasC?dnum(m,v.P,v.C):null, o=cur.objs[i], can=o.set.length>1, open=can&&!!ui.exp[entName(o.f)];
    const tg=can?`<button class="bx${open?' on':''}" data-exp="${i}" aria-expanded="${open}">${open?'Свернуть':'Показать бренды · '+o.set.length}${chev}</button>`:'';
    h+=`<div class="trow"><div class="rn"><span>${esc(r.name)}${tg}</span></div>${cell(v.P,r.colP)}`+
      (hasC?cell(v.C,r.colC)+(d?`<div class="cv ${d.cls}"><b>${absTxt(d.abs)}</b></div><div class="cv sm ${d.cls}"><b><em class="ar">${arrow(d)}</em>${relTxt(d.rel)}</b></div>`:'<div class="cv"><b>—</b></div><div class="cv"><b>—</b></div>'):'')+`</div>`;
    if(open) h+=brandsBlock(m,o,hasC);
  });
  if(hasO){
    const dd=(a,b)=>{const d=dnum(m,a,b);return d?`<div class="cv ${d.cls}"><b>${absTxt(d.abs)}</b><small>${relTxt(d.rel)}</small></div>`:'<div class="cv"><b>—</b></div>';};
    for(let j=1;j<R.length;j++){
      h+=`<div class="trow rowdiff"><div class="rn"><span>Разница<small>${esc(R[0].name)} к ${esc(R[j].name)}</small></span></div>${dd(V[0].P,V[j].P)}`+
        (hasC?dd(V[0].C,V[j].C)+'<div></div><div></div>':'')+`</div>`;
    }
  }
  h+=`</div><div class="mpop" id="mpop" hidden></div>`;
  const notes=[];
  if(m.hint) notes.push(m.hint);
  if(m.traffic){
    if(MS_ON) notes.push(cur.isMallA&&!hasO?'Трафик ТРЦ — вход посетителей по счётчикам MallSense.':'Трафик зон — вход в зоны по счётчикам MallSense. Посетитель, прошедший несколько зон, учтён в каждой.');
    else notes.push((D.trafficError?'MallSense сейчас недоступен. ':'')+(cur.isMallA&&!hasO?'Трафик ТРЦ — по счётчикам (вкладка «Заполняемость Mall»).':'Трафик зон — оценка: замер зоны из реестра × сезонность трафика ТРЦ по месяцам.'));
    const P=cur.P, miss=[]; for(let i=P[0];i<=P[1];i++) if(i>=0&&i<N&&!D.mallTraffic[i]) miss.push(mShort(i));
    if(miss.length) notes.push(`Нет данных о трафике за: ${miss.join(', ')} — эти месяцы не учтены.`);
  }
  if(avgOn) notes.push(`Чтобы объекты разного размера были сопоставимы, показано среднее ${m.avgLabel}.`);
  if(hasC&&(cur.C[0]<0||cur.C[1]>L)) notes.push(`Данные есть с ${mLab(0)} по ${mLab(L)}: месяцы сравнения вне этого диапазона пустые.`);
  if(hasC&&(cur.P[1]-cur.P[0])!==(cur.C[1]-cur.C[0])) notes.push(`Длина периодов разная: ${cur.P[1]-cur.P[0]+1} и ${cur.C[1]-cur.C[0]+1} мес., суммы сравнивайте с оговоркой.`);
  vals.innerHTML=(m.traffic&&cur.isMallA&&!hasO?liveBlock():'')+h+notes.map(n=>`<p class="hint">${esc(n)}</p>`).join('');
  const lines=[], legend=[], sh=hasC?cur.C[0]-cur.P[0]:0;
  R.forEach(r=>{ if(hasC) lines.push({s:r.o.WC,o:r.o,mall:cur.mall.WC,color:r.colC,kind:'C',label:(hasO?r.name+', ':'')+'сравнение',start:cur.win[0]+sh}); });
  R.forEach(r=>lines.push({s:r.o.WP,o:r.o,mall:cur.mall.WP,color:r.colP,kind:'P',label:(hasO?r.name+', ':'')+'период',start:cur.win[0]}));
  R.forEach(r=>{
    legend.push({color:r.colP,label:hasO?r.name+' — период':'Период · '+fmtRange(cur.P[0],cur.P[1])});
    if(hasC) legend.push({color:r.colC,label:hasO?r.name+' — сравнение':'Сравнение · '+fmtRange(cur.C[0],cur.C[1])});
  });
  drawChart(m,slot,lines,fnE,legend);
}
/* вход в ТРЦ прямо сейчас (MallSense): сегодня, вчера, месяц по вчера к тем же дням год назад */
function liveBlock(){
  const v=D.live; if(!MS_ON||!v) return '';
  const n=x=>x==null?'—':nf(Math.round(x),0), dd=s=>{const [y,m,d]=s.split('-').map(Number); return d+' '+MS[m-1];};
  const [y,mo]=v.month.split('-').map(Number), d=dnum(MBY.tr,v.mtd,v.mtdLy);
  const rel=d&&d.rel!=null?`<span class="td ${d.cls}"><em>${d.dir>0?'▲':d.dir<0?'▼':'•'}</em>${(d.rel>0?'+':'')+nf(d.rel*100,1)} %</span> к ${y-1}`:'';
  const it=(k,val,sub)=>`<div class="lv"><span>${k}</span><b>${val}</b><small>${sub}</small></div>`;
  return `<div class="live"><div class="lvh">Посещаемость ТРЦ · MallSense</div><div class="lvg">`+
    it('Сегодня',n(v.today),v.todayTo?'к '+v.todayTo:'данных пока нет')+
    it('Вчера',n(v.yesterday),dd(v.yesterdayDate))+
    it(MFULL[mo-1][0].toUpperCase()+MFULL[mo-1].slice(1),n(v.mtd),`1–${v.mtdDays} ${MS[mo-1]} `+rel)+
    `</div></div>`;
}
function drawChart(m,slot,lines,fnE,legend){
  const K=cur.win[1]-cur.win[0]+1;
  lines.forEach(l=>{ l.v=[]; for(let i=0;i<K;i++) l.v.push(fnE(slice(l.s,i,i+1,l.o.z,l.mall))); });
  const all=lines.flatMap(l=>l.v).filter(okv);
  if(!all.length){ slot.innerHTML='<p class="warn">Нет данных для графика.</p>'; return; }
  let lo=Math.min(...all), hi=Math.max(...all);
  const additive=(m.type==='count'||m.k==='to');
  if(additive) lo=0; else { const pad=(hi-lo||Math.abs(hi)||1)*.15; lo=Math.max(0,lo-pad); hi+=pad; }
  if(hi===lo) hi=lo+1; else if(additive) hi*=1.08;
  const lgW=slot.clientWidth||360;
  const wide=matchMedia('(min-width:1024px)').matches, W=Math.max(360,Math.round(lgW)), H=wide?320:220, Lp=54,Rp=10,T=12,Bt=28, X=i=>Lp+(K>1?i*(W-Lp-Rp)/(K-1):(W-Lp-Rp)/2), Y=v=>T+(1-(v-lo)/(hi-lo))*(H-T-Bt);
  const short=v=>{const f=fmt(m,v);return v<=0?'0':f.num+(m.type==='pct'?'%':(f.unit&&m.type!=='ratio'?' '+f.unit.split(' ')[0]:''));};
  const path=arr=>{let d='',pen=false;arr.forEach((v,i)=>{if(!okv(v)){pen=false;return;}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);pen=true;});return d;};
  const marks=arr=>arr.map((v,i)=>!okv(v)?'':`<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="1.8"/>`).join('');
  let grid='';
  for(let g=0;g<=3;g++){const v=lo+(hi-lo)*g/3,y=Y(v);
    grid+=`<line x1="${Lp}" x2="${W-Rp}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${Lp-6}" y="${y+3.5}" text-anchor="end" font-size="10" fill="var(--ink2)">${esc(short(v))}</text>`;}
  const w0=cur.win[0], pa=cur.P[0]-w0, pb=cur.P[1]-w0;
  const band=K>(pb-pa+1)?`<rect x="${(pa>0?(X(pa)+X(pa-1))/2:Lp).toFixed(1)}" y="${T}" width="${((pb<K-1?(X(pb)+X(pb+1))/2:W-Rp)-(pa>0?(X(pa)+X(pa-1))/2:Lp)).toFixed(1)}" height="${H-T-Bt}" fill="var(--bg2)"/>`:'';
  const paths=lines.map(l=>`<path d="${path(l.v)}" fill="none" stroke="${l.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/><g fill="${l.color}">${marks(l.v)}</g>`).join('');
  const dots=lines.map((l,i)=>`<circle id="pt${i}" r="4.2" fill="${l.color}" stroke="var(--bg)" stroke-width="2" opacity="0"/>`).join('');
  const tipRows=lines.map((l,i)=>`<g id="tr${i}" opacity="0"><circle r="3.6" fill="${l.color}"/><text font-size="10" font-weight="600" fill="var(--ink)"></text></g>`).join('');
  const lg=`<div class="lg">${legend.map(x=>`<span><i style="background:${x.color}"></i>${esc(x.label)}</span>`).join('')}</div>`;
  slot.innerHTML=lg+`<svg id="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График: ${esc(m.name)}">
    ${band}${grid}${paths}
    <text x="${Lp}" y="${H-8}" font-size="10" fill="var(--ink2)">${esc(mShort(cur.win[0]))}</text>
    <text x="${W-Rp}" y="${H-8}" font-size="10" fill="var(--ink2)" text-anchor="end">${esc(mShort(cur.win[1]))}</text>
    <line id="cx" y1="${T}" y2="${H-Bt}" stroke="var(--ink)" stroke-width="1" opacity="0"/>${dots}
    <g id="tip" opacity="0" pointer-events="none"><rect id="tipr" rx="8" fill="var(--sheet)" stroke="var(--line2)" stroke-width="1"/><text id="tiph" font-size="9.5" fill="var(--ink2)"></text>${tipRows}</g>
    <rect x="${Lp}" y="0" width="${W-Lp-Rp}" height="${H}" fill="transparent" id="hit"/></svg>
    <div id="cro">${band?'На графике — 12 месяцев до конца периода, выбранный период выделен. ':''}Проведите пальцем по графику: значения появятся на графике и ниже.</div>`;
  const hit=$('#hit'), svgEl=$('#chart');
  const move=e=>{
    const r=svgEl.getBoundingClientRect(), x=(e.clientX-r.left)/r.width*W;
    const i=Math.max(0,Math.min(K-1,Math.round((x-Lp)/(W-Lp-Rp)*(K-1)||0)));
    $('#cx').setAttribute('x1',X(i));$('#cx').setAttribute('x2',X(i));$('#cx').setAttribute('opacity','.35');
    const out=[], items=[];
    lines.forEach((l,idx)=>{ $('#tr'+idx).setAttribute('opacity','0'); });
    lines.slice().reverse().forEach(l=>{
      const idx=lines.indexOf(l), v=l.v[i], dot=$('#pt'+idx);
      if(okv(v)){dot.setAttribute('cx',X(i));dot.setAttribute('cy',Y(v));dot.setAttribute('opacity','1'); items.push({idx,v});}else dot.setAttribute('opacity','0');
      const f=fmt(m,v);
      out.push(`<span style="color:${l.color}">●</span> <b>${esc(l.label)}</b>, ${esc(mLab(l.start+i))}: ${!okv(v)?'нет данных':esc(f.num+' '+f.unit)}`);
    });
    $('#cro').innerHTML=out.join('<br>');
    /* всплывающее значение прямо на графике */
    const tip=$('#tip');
    if(!items.length){ tip.setAttribute('opacity','0'); return; }
    items.sort((a,b)=>b.v-a.v);
    const lp=lines.find(l=>l.kind==='P')||lines[0], head=$('#tiph');
    head.textContent=mLab(lp.start+i); head.setAttribute('x',8); head.setAttribute('y',13);
    tip.setAttribute('opacity','1');
    let maxw=head.getBBox().width;
    items.forEach((it,k)=>{
      const row=$('#tr'+it.idx), tx=row.querySelector('text'), c=row.querySelector('circle'), y=27+k*14;
      tx.textContent=short(it.v); tx.setAttribute('x',17); tx.setAttribute('y',y);
      c.setAttribute('cx',10); c.setAttribute('cy',y-3.5); row.setAttribute('opacity','1');
      maxw=Math.max(maxw,17+tx.getBBox().width);
    });
    const w=maxw+12, hgt=24+items.length*14;
    const rc=$('#tipr'); rc.setAttribute('width',w); rc.setAttribute('height',hgt);
    let px=X(i)+10; if(px+w>W-Rp) px=X(i)-10-w; if(px<Lp) px=Lp;
    tip.setAttribute('transform',`translate(${px},${T+2})`);
  };
  hit.addEventListener('pointerdown',move); hit.addEventListener('pointermove',move);
}
function paintPeriodUI(){
  const per=periodRange(state.period);
  const setSel=(sel,html,val)=>{ const el=$(sel); if(el.innerHTML!==html) el.innerHTML=html; el.value=val; if(PM.sel===el) paintPmenu(); };
  setSel('#selPer',PERIODS.map(([k,l])=>{ let tx=l; if(k!=='custom'){ const r=periodRange({...state.period,key:k}); tx+=' ('+humanRange(r[0],r[1])+')'; } return `<option value="${k}">${esc(tx)}</option>`; }).join(''),state.period.key);
  setSel('#selCmp',COMPARES.map(([k,l])=>{ let tx=l; if(k!=='none'&&k!=='custom'){ const r=compareRange({...state.cmp,key:k},per); tx+=' ('+humanRange(r[0],r[1])+')'; } return `<option value="${k}">${esc(tx)}</option>`; }).join(''),state.cmp.key);
  $('#pvPer').textContent=PLAB[state.period.key]; $('#pvPerS').textContent='('+humanRange(per[0],per[1])+')';
  $('#pvCmp').textContent=CLAB[state.cmp.key];
  const cr=compareRange(state.cmp,per); $('#pvCmpS').textContent=cr?'('+humanRange(cr[0],cr[1])+')':'';
  const cp=state.period.key==='custom', cc=state.cmp.key==='custom';
  $('#perDates').hidden=!cp; $('#cmpDates').hidden=!cc; $('#datesRow').hidden=!(cp||cc);
  $('#pf').value=mIso(state.period.from); $('#pt').value=mIso(state.period.to); $('#cf').value=mIso(state.cmp.from); $('#ct').value=mIso(state.cmp.to);
}
function paint(animate){ paintChips(); paintCmp(); paintCloud(animate); paintMetrics(); paintData(); paintInfo(); paintPeriodUI(); paintComments(); paintTop(); }

/* ---------- топ лучших и худших брендов выборки ---------- */
function paintTop(){
  const slot=$('#topslot'), m=MBY[state.metric];
  if(cur.bad){ slot.innerHTML=''; return; }
  const head='<section class="top10"><h3>Топ брендов</h3>';
  if(cur.emptyA){ slot.innerHTML=head+'<p class="sub">По выбранным параметрам брендов нет, поэтому рейтинга нет. Измените поиск или фильтр.</p></section>'; return; }
  if(cur.emptyB){ slot.innerHTML=''; return; }
  if(cur.setA.length<2){
    slot.innerHTML=head+'<p class="sub">Сейчас выбран один бренд, поэтому рейтинга нет. Выберите категорию, подкатегорию, под-подкатегорию, сегмент, этаж, зону или ответственного — здесь появятся 10 лучших и 10 худших брендов по выбранному показателю.</p></section>';
    return;
  }
  const hasC=!!cur.C, P=cur.P;
  /* бренд без данных за период (нет ТО, не открыт, не сдал отчёт) в рейтинге не участвует */
  const rows=brandRows(m,cur.setA).filter(r=>okv(r.vP));
  const k=Math.min(10,Math.floor(rows.length/2));
  if(k<1){ slot.innerHTML=head+'<p class="sub">В выбранном периоде слишком мало брендов с данными для рейтинга.</p></section>'; return; }
  const sgn=m.inverse?1:-1; rows.sort((a,b)=>sgn*(a.vP-b.vP));
  const best=rows.slice(0,k), worst=rows.slice(-k).reverse();
  const mk=list=>mkScale(m,list.flatMap(r=>hasC?[r.vP,r.vC]:[r.vP])), Sb=mk(best), Sw=mk(worst);
  const sg=(t,v)=>v>0?'+'+t:t;
  const li=S=>(r,i)=>{
    let td='';
    if(hasC){ const d=dnum(m,r.vP,r.vC);
      td=d?`<span class="td ${d.cls}"><em>${d.dir>0?'▲':d.dir<0?'▼':'•'}</em>${m.type==='pct'?sg(nf(d.abs*100,1),d.abs)+' п.п.':(d.rel==null?'—':sg(nf(d.rel*100,1),d.rel)+' %')}</span>`:'<span class="td">—</span>'; }
    return `<li class="ti${hasC?'':' nd'}" role="button" tabindex="0" data-pickb="${esc(r.b.name)}"><span class="rk">${i+1}</span><span class="tn"><span>${esc(r.b.name)}</span><small>${esc(bSub(r.b))}</small></span><span class="tv">${S.f(r.vP)}</span>${td}</li>`;
  };
  const sub=`${esc(entName(state.f))} · ${esc(m.name)} · ${fmtRange(P[0],P[1])} · ${rows.length} ${plural(rows.length,'бренд','бренда','брендов')} с данными${m.inverse?' · чем ниже, тем лучше':''}${hasC?' · справа изменение к периоду сравнения':''} · нажмите на бренд, чтобы выбрать его`;
  slot.innerHTML=head+`<p class="sub">${sub}</p>
    <div class="tgrp best"><h4>▲ Лучшие ${k} · ${esc(Sb.unit)}</h4><ul class="tl">${best.map(li(Sb)).join('')}</ul></div>
    <div class="tgrp worst"><h4>▼ Худшие ${k} · ${esc(Sw.unit)}</h4><ul class="tl">${worst.map(li(Sw)).join('')}</ul></div></section>`;
}

/* ---------- выбор бренда из рейтинга / раскрытого списка: заменяет текущий выбор ---------- */
function pickBrand(name){
  state.f={brand:name}; closeTab(); toggleInfo(false);
  recompute(); window.scrollTo({top:0,behavior:reduce()?'auto':'smooth'});
}

/* ---------- «i» у показателей: что это и как считается ---------- */
const MINFO={
  to:{w:'Сколько продано в деньгах.',h:'Сумма ТО всех брендов выборки за выбранный период (вкладка «Тurnover»), в долларах по курсу ЦБ на конец каждого месяца.',u:'Доллары США ($), без НДС.'},
  tom2:{w:'Сколько товарооборота приходится на 1 м² площади.',h:'ТО ÷ площадь выборки (зал + терраса). Площадь берётся средняя за период по брендам, у которых есть ТО.',u:'$ / м².'},
  rA:{w:'Лучше или хуже, чем в среднем по ТРЦ, площадь выборки приносит товарооборот.',h:'Доля ТО выборки в ТО всего ТРЦ ÷ доля площади выборки в площади ТРЦ. 1,00 — как в среднем по ТРЦ; выше — лучше.',u:'Коэффициент, без валюты.'},
  rT:{w:'Сколько товарооборота выборка даёт относительно доли трафика своих зон.',h:'Доля ТО выборки в ТО ТРЦ ÷ доля трафика её зон в трафике всех зон (средний месячный вход по счётчикам MallSense; без MallSense — замер из реестра). Выше 1,00 — выборка даёт больше ТО, чем «весит» по трафику. Формула требует подтверждения.',u:'Коэффициент, без валюты.'},
  ocr:{w:'Какую долю товарооборота бренд отдаёт молу.',h:'Итого молла ÷ ТО. Итого молла = аренда без НДС + превышение ТО + OPEX и маркетинг (вкладки брендов). Чем ниже, тем лучше.',u:'Проценты.'},
  ch:{w:'Сколько покупок совершено.',h:'Число чеков за период (вкладка «Тurnover»).',u:'Штуки.'},
  chk:{w:'Средняя сумма одной покупки.',h:'ТО ÷ число чеков за период, только по брендам, сдавшим чеки (не среднее из средних).',u:'Доллары США ($).'},
  tr:{w:'Сколько людей проходит по зонам выборки.',h:'Вход посетителей по счётчикам MallSense (127 датчиков Xovis): для всего ТРЦ — вход в ТРЦ, для зон — вход в зоны выборки. Если MallSense недоступен — вкладка «Заполняемость Mall» и оценка по замеру зоны из реестра.',u:'Человек.'},
  conv:{w:'Сколько чеков приходится на проход по зоне.',h:'Чеки ÷ трафик зон, по месяцам, где есть трафик. Это не доля посетителей, зашедших в магазин.',u:'Проценты.'}
};
/* ---------- меню периода: своё вместо системного списка (тот рисуется браузером и не следует теме) ---------- */
const PM={sel:null,btn:null};
function paintPmenu(){
  const el=PM.sel, m=$('#pmenu'); if(!el) return;
  m.innerHTML=[...el.options].map(o=>{
    const i=o.text.indexOf(' ('), t=i>0?o.text.slice(0,i):o.text, s=i>0?o.text.slice(i+2,-1):'';
    return `<button type="button" role="option" class="pmo${o.value===el.value?' on':''}" aria-selected="${o.value===el.value}" data-pmv="${esc(o.value)}"><b>${esc(t)}</b>${s?`<small>${esc(s)}</small>`:''}</button>`;
  }).join('');
}
function openPmenu(btn){
  const sel=btn.querySelector('select'), m=$('#pmenu');
  if(PM.sel===sel){ closePmenu(); return; }
  PM.sel=sel; PM.btn=btn; paintPmenu();
  m.style.top=(btn.offsetTop+btn.offsetHeight+4)+'px';
  m.hidden=false; btn.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>{ m.classList.add('open'); const on=m.querySelector('.pmo.on')||m.querySelector('.pmo'); on&&on.focus({preventScroll:true}); });
}
function closePmenu(focus){
  const m=$('#pmenu'); if(!PM.sel) return;
  m.classList.remove('open'); m.hidden=true; PM.btn.setAttribute('aria-expanded','false');
  if(focus) PM.btn.focus({preventScroll:true});
  PM.sel=null; PM.btn=null;
}
function pickPmenu(v){
  const el=PM.sel; closePmenu(true); if(!el||el.value===v) return;
  el.value=v; el.dispatchEvent(new Event('change',{bubbles:true}));
}
function toggleMi(k,btn){
  const box=$('#mpop'); if(!box) return;
  if(!box.hidden&&box.dataset.k===k){ closeMi(); return; }
  const i=MINFO[k], m=MBY[k]; if(!i) return;
  box.dataset.k=k;
  box.innerHTML=`<button class="mpx" data-miclose aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button><b>${esc(m.name)}</b><p><span>Что это</span>${esc(i.w)}</p><p><span>Как считается</span>${esc(i.h)}</p><p><span>Единица</span>${esc(i.u)}</p>`;
  box.style.top=(btn.getBoundingClientRect().bottom-$('#vals').getBoundingClientRect().top+8)+'px';
  box.hidden=false;
}
function closeMi(){ const b=$('#mpop'); if(b) b.hidden=true; }

/* ---------- «Выгрузить анализ»: PDF «Отчёт по арендатору» (2 листа A4) по выбранному бренду ---------- */
let toastT=null;
function toast(msg){ const el=$('#toast'); el.textContent=msg; el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>{el.hidden=true;},6500); }
let exporting=false;
async function exportAnalysis(){
  const one=state.f.brand&&cur.setA&&cur.setA.length===1?cur.setA[0]:null;
  if(!one){ toast('Выгрузка анализа строится по одному бренду. Выберите бренд через «Поиск» и нажмите ещё раз.'); return; }
  if(exporting) return;
  exporting=true; const btn=$('#btnExport'); btn.disabled=true; btn.classList.add('busy');
  toast('Готовлю PDF по «'+one.name+'»… Обычно это 10–20 секунд.');
  try{
    const r=await fetch('api/report.pdf?brand='+encodeURIComponent(one.name),{credentials:'same-origin'});
    if(r.status===401){ location.href='login'; return; }
    if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.error||('HTTP '+r.status)); }
    const blob=await r.blob(), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='Отчёт по арендатору — '+one.name+'.pdf';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
    toast('PDF по «'+one.name+'» скачан. Период отчёта — с начала года по последний месяц с оборотом, независимо от выбранного на странице.');
  }catch(e){ toast('Не удалось выгрузить PDF: '+e.message); }
  finally{ exporting=false; btn.disabled=false; btn.classList.remove('busy'); }
}

/* ---------- комментарии: ответственного и руководства (хранятся на сервере) ---------- */
/* роль приходит с сервера: «management» видит оба комментария, «manager» — только комментарий ответственного */
const CM={role:null,byObj:{},loading:{},err:null};
const drafts={};
const cmKey=kind=>entName(state.f)+'|'+kind;
async function cmLoad(obj){
  if(CM.loading[obj]) return; CM.loading[obj]=true;
  try{
    const r=await fetch('api/comments?obj='+encodeURIComponent(obj),{credentials:'same-origin',headers:{Accept:'application/json'}});
    if(r.status===401){ location.href='login'; return; }
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
    CM.role=j.role; CM.byObj[obj]=j.items||{}; CM.err=null;
  }catch(e){ CM.err=e.message; }
  finally{ CM.loading[obj]=false; }
  if(entName(state.f)===obj) paintComments();
}
function paintComments(){
  const slot=$('#cmslot');
  if(!D||cur.bad||cur.emptyA){ slot.innerHTML=''; return; }
  const obj=entName(state.f), items=CM.byObj[obj];
  if(!items&&!CM.err) cmLoad(obj);
  const mg=[...new Set(cur.setA.map(b=>b.mgr).filter(Boolean))];
  const mgTxt=mg.length===1?mg[0]:mg.length>1?mg.length+' ответственных':'не указан';
  const lockSvg='<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const card=(kind,title,sub,lock,ro)=>{
    const key=cmKey(kind), saved=items&&items[kind], val=ro?(saved?saved.t:''):drafts[key]!=null?drafts[key]:(saved?saved.t:'');
    const when=!items?(CM.err?'Не удалось загрузить: '+CM.err:'Загружаю…'):saved?'Сохранено '+new Date(saved.at*1000).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+(saved.by?' · '+saved.by:''):'Пока без комментария';
    const head=`<div class="cm"><div class="cm-h"><b>${esc(title)}</b>${lock?`<span class="lock">${lockSvg}пишет руководство</span>`:''}</div><p class="cm-s">${sub}</p>`;
    if(ro) return head+`<div class="cm-ro${saved?'':' empty'}">${saved?esc(saved.t):'Руководство пока не оставило комментарий.'}</div><div class="cm-f"><span class="cm-st">${esc(saved?when:(!items?when:''))}</span></div></div>`;
    return head+`<textarea class="cm-t" data-cm="${kind}" rows="3" maxlength="4000" placeholder="Напишите комментарий…" aria-label="${esc(title)}"${items?'':' disabled'}>${esc(val)}</textarea><div class="cm-f"><span class="cm-st" id="cmst-${kind}">${esc(when)}</span><button class="btn" data-cmsave="${kind}"${items?'':' disabled'}>Сохранить</button></div></div>`;
  };
  const ro=CM.role!=='management';
  slot.innerHTML=`<h3 class="cm-title">Комментарии</h3>`+
    card('manager','Комментарий ответственного','Ответственный: '+esc(mgTxt)+' · объект: '+esc(obj),false,false)+
    card('management','Комментарий руководства',ro?'Только для чтения':'Пишет только руководство, видят все',true,ro)+
    `<p class="hint">Комментарии привязаны к объекту (бренд, категория, зона…) и хранятся на сервере: их видят все, кто входит на страницу. Комментарий руководства пишут только пользователи с ролью «руководство».</p>`;
}
async function saveCm(kind){
  const ta=document.querySelector(`[data-cm="${kind}"]`); if(!ta) return;
  const obj=entName(state.f), st=$('#cmst-'+kind), btn=document.querySelector(`[data-cmsave="${kind}"]`);
  if(btn) btn.disabled=true; if(st) st.textContent='Сохраняю…';
  try{
    const r=await fetch('api/comments',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({obj,kind,text:ta.value})});
    if(r.status===401){ location.href='login'; return; }
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
    (CM.byObj[obj]=CM.byObj[obj]||{})[kind]=j.item||undefined;
    if(!j.item) delete CM.byObj[obj][kind];
    delete drafts[obj+'|'+kind];
    if(entName(state.f)===obj) paintComments();
    const st2=$('#cmst-'+kind); if(st2) st2.textContent=j.item?'Сохранено только что':'Комментарий удалён';
  }catch(e){
    if(st) st.textContent='Не сохранено: '+e.message;
  }finally{ const b=document.querySelector(`[data-cmsave="${kind}"]`); if(b) b.disabled=false; }
}

/* ---------- информация (i) ---------- */
function paintInfo(){
  const set=cur.setA||[];
  const row=(k,v)=>`<div class="r"><dt>${esc(k)}</dt><dd>${v==null||v===''?'—':esc(v)}</dd></div>`;
  let html='';
  if(state.f.brand && set.length===1){
    const b=set[0];
    html=`<h3>${esc(b.name)}</h3><dl>`+
      row('Название',b.name)+row('Официальное имя',b.legal)+row('Дата открытия',fmtDate(b.open))+row('Окончание договора',fmtDate(b.end))+
      row('Этаж',b.floor)+row('Зона',b.zone)+row('Площадь',nf(b.area,2)+' м²')+
      row('Ставка',b.rate?`${nf(b.rate,2)} $/м² в месяц`:null)+(b.toPct?row('% с ТО',nf(b.toPct*100,1)+' %'):'')+row('Ответственный',b.mgr)+`</dl>`;
  } else {
    const floors=[...new Set(set.map(b=>b.floor).filter(Boolean))].sort(), zones=[...new Set(set.flatMap(b=>b.zones))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true})),
      mg=[...new Set(set.map(b=>b.mgr).filter(Boolean))];
    html=`<h3>${esc(entName(state.f))}</h3><dl>`+
      row('Брендов',String(set.length))+row('Площадь',nf(set.reduce((s,b)=>s+b.area,0),0)+' м²')+row('Этажи',floors.join(', '))+
      row('Зоны',zones.length>6?zones.slice(0,6).join(', ')+' и ещё '+(zones.length-6):zones.join(', '))+row('Ответственные',mg.join(', '))+
      `</dl><p class="note">Официальное имя, даты договора и ставку показываю, когда выбран один бренд.</p>`;
  }
  $('#infoPop').innerHTML=html+`<button class="x" data-infoclose aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
}
function toggleInfo(open){
  const pop=$('#infoPop'), btn=$('#btnInfo'); open=open==null?!pop.classList.contains('open'):open;
  pop.classList.toggle('open',open); btn.setAttribute('aria-expanded',String(open));
}

/* ---------- поиск (общий для «Поиск» и «Сравнить с») ---------- */
const INDEX=[];
function buildIndex(){
  INDEX.length=0;
  B.forEach(b=>INDEX.push({t:'brand',l:b.name,hay:(b.name+' '+(b.legal||'')).toLowerCase()}));
  const add=(t,arr)=>[...new Set(arr.filter(Boolean))].forEach(v=>INDEX.push({t,l:v,hay:v.toLowerCase()}));
  add('cat',B.map(b=>b.cat));add('sub',B.map(b=>b.sub));add('ss',B.map(b=>b.ss));add('seg',B.map(b=>b.seg));add('zone',ZONES);add('floor',B.map(b=>b.floor));add('mgr',B.map(b=>b.mgr));
  INDEX.push({t:'mall',l:'Tashkent City Mall',hay:'tashkent city mall весь трц тцм молл'});
}
const TYPE_RANK={mall:-1,cat:0,seg:1,zone:2,floor:2,mgr:3,sub:3,ss:4,brand:5};
function search(q){
  q=q.trim().toLowerCase(); if(!q) return [];
  const out=[];
  for(const it of INDEX){
    const i=it.hay.indexOf(q); if(i<0) continue;
    const ws=i===0||/[\s_/&-]/.test(it.hay[i-1]);
    out.push({it,s:i===0?0:ws?1:2});
  }
  out.sort((a,b)=>a.s-b.s||TYPE_RANK[a.it.t]-TYPE_RANK[b.it.t]||a.it.l.localeCompare(b.it.l));
  return out.slice(0,14).map(x=>x.it);
}
const shown={f:[],g:[]};
function showResults(t){
  const inp=$(t==='f'?'#q':'#q2'), box=$(t==='f'?'#results':'#results2'), q=inp.value;
  if(!q.trim()){ box.innerHTML=''; shown[t]=[]; return; }
  shown[t]=search(q);
  box.innerHTML=shown[t].length?shown[t].map((it,i)=>`<button class="res" data-res="${i}" data-t="${t}"><b>${esc(it.l)}</b><small>${DIMLABEL[it.t]}</small></button>`).join(''):
    '<div class="res-none">Ничего не найдено. Ищу по бренду, юрлицу, категории, подкатегории, сегменту, этажу, зоне и ответственному.</div>';
}
function addCmp(f){
  if(state.cmpObjs.length>=MAX_CMP) return false;
  if(state.cmpObjs.some(o=>sameObj(o,f))||sameObj(state.f,f)) return false;
  state.cmpObjs.push({...f}); return true;
}
function applySearch(it,t){
  /* поиск НЕ накладывается на уже выбранное: он заменяет выбор. Накладывать параметры можно только фильтром */
  if(t==='f'){
    state.f=it.t==='mall'?{}:{[it.t]:it.l};
    $('#q').value=''; showResults('f'); closeTab(); toggleInfo(false);
    recompute();
  } else if(it.t==='mall'){
    addCmp({}); state.g={}; $('#q2').value=''; showResults('g'); closeSheet(); recompute();
  } else {
    state.g={[it.t]:it.l};
    $('#q2').value=''; showResults('g'); paintG();
  }
}

/* ---------- выпадающие списки параметров ---------- */
function selectsHTML(t){
  const f=state[t];
  return DIMS.map(([k,label])=>{
    const other={...f}; delete other[k]; delete other.brand;
    let vals=[...new Set(B.flatMap(b=>k==='zone'?b.zones:[b[k]]).filter(Boolean))];
    if(k==='seg') vals.sort((a,b)=>(SEG_ORDER.indexOf(a)+1||99)-(SEG_ORDER.indexOf(b)+1||99));
    else if(k==='zone') vals.sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
    else vals.sort((a,b)=>a.localeCompare(b,'en'));
    const opts=vals.map(v=>{
      const c=B.filter(b=>match(b,{...other,[k]:v})).length, on=f[k]===v;
      return c===0&&!on?'':`<option value="${esc(v)}"${on?' selected':''}>${esc(v)} · ${c}</option>`;
    }).join('');
    if(!opts) return '';
    return `<label class="fl"><span>${label}</span><select class="sel" data-sel="${k}" data-t="${t}"><option value="">Все</option>${opts}</select></label>`;
  }).join('');
}
function paintF(){
  $('#fSelects').innerHTML=selectsHTML('f');
  const n=B.filter(b=>match(b,{...state.f,brand:undefined})).length;
  $('#fApply').textContent=`Показать ${n} ${plural(n,'бренд','бренда','брендов')}`;
}
function paintG(){
  $('#gSelects').innerHTML=selectsHTML('g');
  const keys=activeKeys(state.g);
  $('#gChips').innerHTML=keys.map(k=>`<span class="chip"><span><em>${DIMLABEL[k]}:</em> ${esc(state.g[k])}</span><button data-rmg="${k}" aria-label="Убрать: ${DIMLABEL[k]}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`).join('');
  const n=keys.length?setOf(state.g).length:0;
  $('#gCount').textContent=keys.length?(n?`Подходит ${n} ${plural(n,'бренд','бренда','брендов')}`:'По такому сочетанию брендов нет'):'';
  $('#gAdd').disabled=!n;
  const mallOff=state.cmpObjs.length>=MAX_CMP||state.cmpObjs.some(o=>sameObj(o,{}))||sameObj(state.f,{});
  $('#gMall').disabled=mallOff;
}

/* ---------- верхняя панель: вкладки ---------- */
function openTab(w){
  const same=ui.tab===w; closeTab(); if(same) return;
  ui.tab=w; $('#dd').hidden=false; $('#ddSearch').hidden=w!=='search'; $('#ddFilter').hidden=w!=='filter';
  $('#tabSearch').setAttribute('aria-selected',String(w==='search')); $('#tabFilter').setAttribute('aria-selected',String(w==='filter'));
  if(w==='filter') paintF(); else setTimeout(()=>$('#q').focus(),40);
}
function closeTab(){
  ui.tab=null; $('#dd').hidden=true;
  $('#tabSearch').setAttribute('aria-selected','false'); $('#tabFilter').setAttribute('aria-selected','false');
  $('#q').blur();
}

/* ---------- «Сравнить с» ---------- */
let lastFocus=null;
function openSheet(){ lastFocus=document.activeElement; state.g={}; $('#q2').value=''; showResults('g'); paintG(); $('#sheet').classList.add('open'); $('#sheet').setAttribute('aria-hidden','false'); $('#scrim').classList.add('on'); document.body.classList.add('lock'); setTimeout(()=>{const x=$('#sheet .xbtn');x&&x.focus({preventScroll:true});},60); }
function closeSheet(){ $('#sheet').classList.remove('open'); $('#sheet').setAttribute('aria-hidden','true'); $('#scrim').classList.remove('on'); document.body.classList.remove('lock'); if(lastFocus&&lastFocus.focus) lastFocus.focus({preventScroll:true}); }

const reduce=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function setHH(){ document.documentElement.style.setProperty('--hh',$('#top').offsetHeight+'px'); }

/* ---------- события ---------- */
function bindEvents(){
  document.addEventListener('click',e=>{
    const po=e.target.closest('[data-pmv]'); if(po){ pickPmenu(po.dataset.pmv); return; }
    const pb=e.target.closest('.psel'); if(pb){ openPmenu(pb); return; }
    if(PM.sel&&!e.target.closest('#pmenu')) closePmenu();
    if(!e.target.closest('#top')) closeTab();
    if(!e.target.closest('#infoPop')&&!e.target.closest('#btnInfo')) toggleInfo(false);
    if(!e.target.closest('#mpop')&&!e.target.closest('.mi')) closeMi();
    if(!D) return;
    const pk=e.target.closest('[data-pickb]'); if(pk) return pickBrand(pk.dataset.pickb);
    const t=e.target.closest('button'); if(!t) return;
    const d=t.dataset;
    if(d.mi) return toggleMi(d.mi,t);
    if('miclose' in d) return closeMi();
    if(d.cmsave) return saveCm(d.cmsave);
    if(t.id==='btnExport') return exportAnalysis();
    if(t.id==='gMall'){ addCmp({}); state.g={}; closeSheet(); return recompute(); }
    if(t.id==='tabSearch') return openTab('search');
    if(t.id==='tabFilter') return openTab('filter');
    if(t.id==='btnInfo') return toggleInfo();
    if('infoclose' in d) return toggleInfo(false);
    if(t.id==='btnCmp'||t.id==='btnAdd') return openSheet();
    if(t.id==='btnClear'){ state.cmpObjs=[]; return recompute(); }
    if(d.exp!=null) return toggleExp(+d.exp);
    if(t.id==='gAdd'){
      const f={...state.g};
      if(!activeKeys(f).length||!setOf(f).length) return;
      addCmp(f);
      state.g={}; closeSheet(); return recompute();
    }
    if(d.rmc!=null){ state.cmpObjs.splice(+d.rmc,1); return recompute(); }
    if('close' in d) return closeSheet();
    if(t.id==='fReset'){ state.f={}; paintF(); return recompute(); }
    if(t.id==='fApply'){ return closeTab(); }
    if(t.id==='gReset'){ state.g={}; $('#q2').value=''; showResults('g'); paintG(); return; }
    if(d.res!=null) return applySearch(shown[d.t][+d.res],d.t);
    if(d.rm){ delete state.f[d.rm]; return recompute(); }
    if(d.rmg){ delete state.g[d.rmg]; paintG(); return; }
    if(d.m){ state.metric=d.m; paintMetrics(); paintData(); paintTop(); const b=document.querySelector(`[data-m="${d.m}"]`); b&&b.scrollIntoView({block:'nearest',inline:'center',behavior:reduce()?'auto':'smooth'}); return; }
  });
  document.addEventListener('change',e=>{
    const el=e.target, id=el.id;
    if(!D) return;
    if(el.dataset&&el.dataset.sel){
      const t=el.dataset.t, k=el.dataset.sel;
      if(el.value){ state[t][k]=el.value; delete state[t].brand; } else delete state[t][k];
      if(t==='f'){ paintF(); return recompute(); }
      paintG(); return;
    }
    if(id==='selPer'){ state.period.key=el.value; return recompute(); }
    if(id==='selCmp'){ state.cmp.key=el.value; return recompute(); }
    if(['pf','pt','cf','ct'].includes(id)&&/^\d{4}-\d{2}$/.test(el.value)){
      const v=mi(el.value);
      if(id==='pf') state.period.from=v; if(id==='pt') state.period.to=v; if(id==='cf') state.cmp.from=v; if(id==='ct') state.cmp.to=v;
      recompute();
    }
  });
  document.addEventListener('input',e=>{ const ta=e.target.closest&&e.target.closest('[data-cm]'); if(ta) drafts[cmKey(ta.dataset.cm)]=ta.value; });
  $('#scrim').addEventListener('click',closeSheet);
  ['#q','#q2'].forEach(s=>{
    const t=s==='#q'?'f':'g';
    $(s).addEventListener('input',()=>showResults(t));
    $(s).addEventListener('keydown',e=>{ if(e.key==='Enter'&&shown[t][0]){ e.preventDefault(); applySearch(shown[t][0],t); } });
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ closePmenu(true); closeSheet(); closeTab(); toggleInfo(false); closeMi(); }
    const pb=e.target.closest&&e.target.closest('.psel');
    if(pb&&e.target===pb&&(e.key==='Enter'||e.key===' '||e.key==='ArrowDown')){ e.preventDefault(); openPmenu(pb); }
    if(PM.sel&&(e.key==='ArrowDown'||e.key==='ArrowUp')&&e.target.classList.contains('pmo')){
      e.preventDefault(); const o=[...document.querySelectorAll('.pmo')], i=o.indexOf(e.target);
      const n=o[(i+(e.key==='ArrowDown'?1:-1)+o.length)%o.length]; n&&n.focus();
    }
    if((e.key==='Enter'||e.key===' ')&&D&&e.target.dataset&&e.target.dataset.pickb){ e.preventDefault(); pickBrand(e.target.dataset.pickb); }
  });
  let rT=0; window.addEventListener('resize',()=>{ setHH(); clearTimeout(rT); rT=setTimeout(()=>{ if(D&&cur.win) paintData(); },150); });
}

/* ---------- старт ---------- */
/* заставка закрывается, когда данные загружены (но не раньше SPLASH_MIN мс) */
const SPLASH_MIN=1600, splashT0=performance.now();
function splash(){
  const s=$('#splash'); let seen=false; try{seen=sessionStorage.getItem('tcm_splash')==='1';}catch(_){}
  if(!s) return ()=>{};
  if(seen){ s.remove(); return ()=>{}; }
  document.body.classList.add('lock');
  return ()=>{
    const wait=Math.max(0,SPLASH_MIN-(performance.now()-splashT0));
    setTimeout(()=>{ if(!s.isConnected) return; s.classList.add('out'); document.body.classList.remove('lock'); try{sessionStorage.setItem('tcm_splash','1');}catch(_){} setTimeout(()=>s.remove(),700); },wait);
  };
}
async function start(){
  bindEvents(); setHH();
  const splashDone=splash();
  $('#vals').innerHTML='<p class="warn">Загружаю данные…</p>';
  let data;
  try{
    const r=await fetch('api/data',{credentials:'same-origin',headers:{Accept:'application/json'}});
    if(r.status===401){ location.href='login'; return; }
    if(!r.ok) throw new Error('HTTP '+r.status);
    data=await r.json();
  }catch(err){
    splashDone();
    $('#vals').innerHTML=`<p class="warn">Не удалось загрузить данные (${esc(err.message)}). Обновите страницу позже.</p>`; return;
  }
  prepare(data); buildIndex();
  state.period={key:'last',from:Math.max(0,L-2),to:L}; state.cmp={key:'none',from:Math.max(0,L-14),to:Math.max(0,L-12)};
  ['pf','pt','cf','ct'].forEach(id=>{ $('#'+id).min=D.months[0]; $('#'+id).max=D.months[L]; });
  const upd=new Date(D.asOf);
  $('#demo').textContent=`данные по ${mLab(L)} · обновлено ${isNaN(upd)?'':upd.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`;
  if(D.stale) $('#demo').textContent+=' · таблица недоступна, показаны последние данные';
  recompute();
  splashDone();
}
start();
