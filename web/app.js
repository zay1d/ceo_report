"use strict";
/* ============================================================
   TCM Analytics — страница для руководства.
   Данные приходят с сервера (/api/data) из таблицы «Реестр 26»:
   помесячно, в долларах по курсу ЦБ на конец месяца, без НДС.
   ============================================================ */

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = (x,d) => x.toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
const sig = x => { const a=Math.abs(x); return nf(x, a>=100?0:a>=10?1:2); };
function plural(n,a,b,c){const m=n%100,k=n%10;return m>10&&m<20?c:k===1?a:k>1&&k<5?b:c;}
const MS=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const MN=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

/* ---------- данные ---------- */
let D=null, B=[], ZONES=[], M0=[0,0], N=0, L=0, MALL_TR_MEAN=0, ZW_ALL=0;
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
const fmtDate = s => { if(!s) return null; const [y,m,d]=s.split('-').map(Number); return d+' '+MS[m-1]+' '+y; };

function prepare(data){
  D=data; N=D.months.length; L=N-1; M0=ym(D.months[0]);
  B=D.brands.map((b,i)=>({...b,i,zones:b.zone?[b.zone]:[]}));
  ZONES=Object.keys(D.zones).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
  ZW_ALL=ZONES.reduce((s,z)=>s+D.zones[z],0);
  const tr=D.mallTraffic.filter(v=>v);
  MALL_TR_MEAN=tr.length?tr.reduce((s,v)=>s+v,0)/tr.length:0;
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
  if(mt){
    if(isMall) o.tr=mt;
    else { const zs=new Set(set.flatMap(b=>b.zones)); let w=0; zs.forEach(z=>w+=D.zones[z]||0); o.tr=w?w*mt/MALL_TR_MEAN:null; }
    if(o.tr) o.chT=o.ch;
  }
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
    hint:'Доля ТО объекта в ТО ТРЦ ÷ доля трафика его зон в трафике всех зон (замер из реестра). Выше 1,00 — объект даёт больше ТО, чем «весит» по трафику.'},
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
const PERIODS=[['last','Последний месяц'],['prev','Предыдущий месяц'],['q','Последние 3 месяца'],['ytd','С начала года'],['l12','Последние 12 месяцев'],['pyear','Прошлый год'],['custom','Свой период']];
const COMPARES=[['none','Без сравнения'],['n','Предыдущий период'],['yoy','Год к году'],['custom','Свой период']];
function periodRange(p){
  const [y]=mOf(L), jan=mi(y+'-01');
  switch(p.key){
    case'last':return[L,L];case'prev':return[L-1,L-1];case'q':return[L-2,L];case'ytd':return[jan,L];
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
const DIMLABEL={brand:'Бренд',cat:'Категория',sub:'Подкатегория',ss:'Под-подкатегория',seg:'Сегмент',floor:'Этаж',zone:'Зона',mgr:'Ответственный'};
const KEYS=['brand','cat','sub','ss','seg','floor','zone','mgr'];
const state={f:{},g:{},metric:'to',period:{key:'last',from:0,to:0},cmp:{key:'none',from:0,to:0}};
let cur={}, ui={tab:null};

const match=(b,f)=>(!f.brand||b.name===f.brand)&&(!f.cat||b.cat===f.cat)&&(!f.sub||b.sub===f.sub)&&(!f.ss||b.ss===f.ss)&&(!f.seg||b.seg===f.seg)&&(!f.floor||b.floor===f.floor)&&(!f.zone||b.zones.includes(f.zone))&&(!f.mgr||b.mgr===f.mgr);
const activeKeys=f=>KEYS.filter(k=>f[k]);
const gActive=()=>activeKeys(state.g).length>0;
const entName=f=>{const k=activeKeys(f);return k.length?k.map(x=>f[x]).join(' · '):'Tashkent City Mall';};
function entTitle(f){const k=activeKeys(f);if(!k.length)return{name:'Tashkent City Mall',rest:[]};const v=k.map(x=>f[x]);return{name:v[0],rest:v.slice(1)};}

function recompute(){
  const isMallA=!activeKeys(state.f).length, setA=B.filter(b=>match(b,state.f)), hasO=gActive(), setB=hasO?B.filter(b=>match(b,state.g)):[];
  const P=periodRange(state.period), C=compareRange(state.cmp,P);
  cur={setA,setB,P,C,hasO,isMallA,bad:P[0]>P[1]||(C&&C[0]>C[1]),emptyA:!setA.length,emptyB:hasO&&!setB.length};
  if(!(cur.bad||cur.emptyA||cur.emptyB)){
    const w=chartWin(P), shift=C?C[0]-P[0]:0;
    cur.win=w;
    const mk=(set,isMall)=>({
      P:series(set,P[0],P[1],isMall), C:C?series(set,C[0],C[1],isMall):null,
      WP:series(set,w[0],w[1],isMall), WC:C?series(set,w[0]+shift,w[1]+shift,isMall):null,
      z:zoneInfo(set,isMall)});
    cur.mall=mk(B,true); cur.A=mk(setA,isMallA); if(hasO) cur.B=mk(setB,false);
  }
  paint(true);
}
/* окно графика: сам период, а если он короче 6 месяцев — 12 месяцев до его конца */
function chartWin([a,b]){ return b-a+1>=6?[a,b]:[b-11,b]; }
/* значение показателя за период или за период сравнения */
function periodVal(m,obj,which){
  const s=obj[which]; return effFn(m)(slice(s,0,s.length,obj.z,cur.mall[which]));
}

/* ---------- отрисовка ---------- */
function paintChips(){
  const keys=activeKeys(state.f), box=$('#chips');
  box.hidden=!keys.length;
  box.innerHTML=keys.map(k=>`<span class="chip"><span><em>${DIMLABEL[k]}:</em> ${esc(state.f[k])}</span><button data-rm="${k}" aria-label="Убрать: ${DIMLABEL[k]}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`).join('');
  const n=keys.filter(k=>k!=='brand').length, fb=$('#fbadge'); fb.hidden=!n; fb.textContent=n;
  requestAnimationFrame(setHH);
}
function paintCloud(animate){
  const {name,rest}=entTitle(state.f), set=cur.setA||[], area=set.reduce((s,b)=>s+b.area,0);
  $('#cName').textContent=name;
  const bits=[]; if(rest.length) bits.push(rest.join(' · '));
  bits.push(set.length?`${set.length} ${plural(set.length,'бренд','бренда','брендов')} · ${nf(area,0)} м²`:'нет брендов по такому сочетанию');
  $('#cSub').innerHTML=bits.map(esc).join('<br>');
  $('#cmpTarget').textContent=gActive()?entName(state.g):'не выбрано';
  if(animate){const c=$('#cloud');c.classList.remove('pop');void c.offsetWidth;c.classList.add('pop');}
}
function paintMetrics(){
  $('#metrics').innerHTML=METRICS.map(m=>`<button class="pill" data-m="${m.k}" aria-pressed="${m.k===state.metric}">${esc(m.name)}</button>`).join('');
}
function paintData(){
  const m=MBY[state.metric], hasO=cur.hasO, hasC=!!cur.C;
  const vals=$('#vals'), slot=$('#chartslot');
  if(cur.bad||cur.emptyA||cur.emptyB){
    slot.innerHTML='';
    vals.innerHTML=`<p class="warn">${cur.bad?'Начало периода позже конца — поправьте месяцы.':cur.emptyA?'По выбранным параметрам брендов нет. Измените поиск или фильтр.':'По объекту сравнения брендов нет. Измените «Сравнить с».'}</p>`;
    return;
  }
  const fnE=effFn(m), avgOn=hasO&&!!m.avg;
  const nameA=entName(state.f), nameB=hasO?entName(state.g):'';
  const R=[{name:nameA,color:'var(--terra)',o:cur.A}];
  if(hasO) R.push({name:nameB,color:'var(--ink)',o:cur.B});
  const V=R.map(r=>({P:periodVal(m,r.o,'P'),C:hasC?periodVal(m,r.o,'C'):null}));
  const nums=[]; V.forEach(v=>{nums.push(v.P); if(hasC) nums.push(v.C);});
  const S=mkScale(m,nums), sg=(t,v)=>v>0?'+'+t:t;
  const absTxt=v=>sg(S.fd(v),v), relTxt=r=>r==null?'—':sg(nf(r*100,1),r)+' %';
  const arrow=d=>d.dir>0?'▲':d.dir<0?'▼':'•';
  const cols=hasC?'minmax(102px,1.2fr) minmax(0,.95fr) minmax(0,.95fr) minmax(0,.9fr) minmax(0,1.05fr)':'minmax(0,1.1fr) minmax(0,1fr)';
  const unit=S.unit+(avgOn?' · в среднем '+m.avgLabel:'');
  const cell=v=>`<div class="cv"><b>${v==null?'—':S.f(v)}</b></div>`;
  let h=`<div class="tbl${hasC?'':' t1'}" style="--cols:${cols}">
    <div class="trow thead"><div class="tm"><h2>${esc(hasC?(m.short||m.name):m.name)}</h2><small>${esc(unit)}</small></div>
      <div class="tc"><i class="ls"></i>Период<small>${esc(fmtRange(cur.P[0],cur.P[1]))}</small></div>`+
    (hasC?`<div class="tc"><i class="ls d"></i>Сравнение<small>${esc(fmtRange(cur.C[0],cur.C[1]))}</small></div>
      <div class="tc">Δ<small>${m.type==='pct'?'п.п.':'абс.'}</small></div><div class="tc">Прирост<small>%</small></div>`:'')+`</div>`;
  R.forEach((r,i)=>{
    const v=V[i], d=hasC?dnum(m,v.P,v.C):null;
    h+=`<div class="trow"><div class="rn"><i class="dot" style="background:${r.color}"></i><span>${esc(r.name)}</span></div>${cell(v.P)}`+
      (hasC?cell(v.C)+(d?`<div class="cv ${d.cls}"><b>${absTxt(d.abs)}</b></div><div class="cv sm ${d.cls}"><b><em class="ar">${arrow(d)}</em>${relTxt(d.rel)}</b></div>`:'<div class="cv"><b>—</b></div><div class="cv"><b>—</b></div>'):'')+`</div>`;
  });
  if(hasO){
    const dd=(a,b)=>{const d=dnum(m,a,b);return d?`<div class="cv ${d.cls}"><b>${absTxt(d.abs)}</b><small>${relTxt(d.rel)}</small></div>`:'<div class="cv"><b>—</b></div>';};
    h+=`<div class="trow rowdiff"><div class="rn"><span>Разница<small>${esc(nameA)} к ${esc(nameB)}</small></span></div>${dd(V[0].P,V[1].P)}`+
      (hasC?dd(V[0].C,V[1].C)+'<div></div><div></div>':'')+`</div>`;
  }
  h+=`</div>`;
  const notes=[];
  if(m.hint) notes.push(m.hint);
  if(m.traffic){
    notes.push(cur.isMallA&&!hasO?'Трафик ТРЦ — по счётчикам (вкладка «Заполняемость Mall»).':'Трафик зон — оценка: замер зоны из реестра × сезонность трафика ТРЦ по месяцам.');
    const P=cur.P, miss=[]; for(let i=P[0];i<=P[1];i++) if(i>=0&&i<N&&!D.mallTraffic[i]) miss.push(mShort(i));
    if(miss.length) notes.push(`Нет данных о трафике за: ${miss.join(', ')} — эти месяцы не учтены.`);
  }
  if(avgOn) notes.push(`Чтобы объекты разного размера были сопоставимы, показано среднее ${m.avgLabel}.`);
  if(hasC&&(cur.C[0]<0||cur.C[1]>L)) notes.push(`Данные есть с ${mLab(0)} по ${mLab(L)}: месяцы сравнения вне этого диапазона пустые.`);
  if(hasC&&(cur.P[1]-cur.P[0])!==(cur.C[1]-cur.C[0])) notes.push(`Длина периодов разная: ${cur.P[1]-cur.P[0]+1} и ${cur.C[1]-cur.C[0]+1} мес., суммы сравнивайте с оговоркой.`);
  vals.innerHTML=h+notes.map(n=>`<p class="hint">${esc(n)}</p>`).join('');
  const lines=[];
  R.forEach(r=>{ if(hasC) lines.push({s:r.o.WC,o:r.o,mall:cur.mall.WC,color:r.color,dash:true,label:(hasO?r.name+', ':'')+'сравнение',start:cur.win[0]+(cur.C[0]-cur.P[0])}); });
  R.forEach(r=>lines.push({s:r.o.WP,o:r.o,mall:cur.mall.WP,color:r.color,dash:false,label:(hasO?r.name+', ':'')+'период',start:cur.win[0]}));
  drawChart(m,slot,lines,fnE);
}
function drawChart(m,slot,lines,fnE){
  const K=cur.win[1]-cur.win[0]+1;
  lines.forEach(l=>{ l.v=[]; for(let i=0;i<K;i++) l.v.push(fnE(slice(l.s,i,i+1,l.o.z,l.mall))); });
  const all=lines.flatMap(l=>l.v).filter(v=>v!=null&&isFinite(v));
  if(!all.length){ slot.innerHTML='<p class="warn">Нет данных для графика.</p>'; return; }
  let lo=Math.min(...all), hi=Math.max(...all);
  const additive=(m.type==='count'||m.k==='to');
  if(additive) lo=0; else { const pad=(hi-lo||Math.abs(hi)||1)*.15; lo=Math.max(0,lo-pad); hi+=pad; }
  if(hi===lo) hi=lo+1; else if(additive) hi*=1.08;
  const wide=matchMedia('(min-width:1024px)').matches, W=Math.max(360,Math.round(slot.clientWidth||360)), H=wide?320:220, Lp=54,Rp=10,T=12,Bt=28, X=i=>Lp+(K>1?i*(W-Lp-Rp)/(K-1):(W-Lp-Rp)/2), Y=v=>T+(1-(v-lo)/(hi-lo))*(H-T-Bt);
  const path=arr=>{let d='',pen=false;arr.forEach((v,i)=>{if(v==null||!isFinite(v)){pen=false;return;}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);pen=true;});return d;};
  const marks=arr=>arr.map((v,i)=>v==null||!isFinite(v)?'':`<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="1.8"/>`).join('');
  let grid='';
  for(let g=0;g<=3;g++){const v=lo+(hi-lo)*g/3,y=Y(v),f=fmt(m,v);
    const tx=v<=0?'0':f.num+(m.type==='pct'?'%':(f.unit&&m.type!=='ratio'?' '+f.unit.split(' ')[0]:''));
    grid+=`<line x1="${Lp}" x2="${W-Rp}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${Lp-6}" y="${y+3.5}" text-anchor="end" font-size="10" fill="var(--ink2)">${esc(tx)}</text>`;}
  const w0=cur.win[0], pa=cur.P[0]-w0, pb=cur.P[1]-w0;
  const band=K>(pb-pa+1)?`<rect x="${(pa>0?(X(pa)+X(pa-1))/2:Lp).toFixed(1)}" y="${T}" width="${((pb<K-1?(X(pb)+X(pb+1))/2:W-Rp)-(pa>0?(X(pa)+X(pa-1))/2:Lp)).toFixed(1)}" height="${H-T-Bt}" fill="var(--bg2)"/>`:'';
  const paths=lines.map(l=>`<path d="${path(l.v)}" fill="none" stroke="${l.color}" stroke-width="${l.dash?2:2.8}"${l.dash?' stroke-dasharray="5 4"':''} stroke-linejoin="round" stroke-linecap="round"${l.dash?' opacity=".85"':''}/><g fill="${l.color}">${marks(l.v)}</g>`).join('');
  const dots=lines.map((l,i)=>`<circle id="pt${i}" r="4.2" fill="${l.color}" stroke="var(--bg)" stroke-width="2" opacity="0"/>`).join('');
  slot.innerHTML=`<svg id="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График: ${esc(m.name)}">
    ${band}${grid}${paths}
    <text x="${Lp}" y="${H-8}" font-size="10" fill="var(--ink2)">${esc(mShort(cur.win[0]))}</text>
    <text x="${W-Rp}" y="${H-8}" font-size="10" fill="var(--ink2)" text-anchor="end">${esc(mShort(cur.win[1]))}</text>
    <line id="cx" y1="${T}" y2="${H-Bt}" stroke="var(--ink)" stroke-width="1" opacity="0"/>${dots}
    <rect x="${Lp}" y="0" width="${W-Lp-Rp}" height="${H}" fill="transparent" id="hit"/></svg>
    <div id="cro">${band?'На графике — 12 месяцев до конца периода, выбранный период выделен. ':''}Проведите пальцем по графику: покажу значения по каждой линии.</div>`;
  const hit=$('#hit'), svgEl=$('#chart');
  const move=e=>{
    const r=svgEl.getBoundingClientRect(), x=(e.clientX-r.left)/r.width*W;
    const i=Math.max(0,Math.min(K-1,Math.round((x-Lp)/(W-Lp-Rp)*(K-1)||0)));
    $('#cx').setAttribute('x1',X(i));$('#cx').setAttribute('x2',X(i));$('#cx').setAttribute('opacity','.35');
    const out=[];
    lines.slice().reverse().forEach(l=>{
      const idx=lines.indexOf(l), v=l.v[i], dot=$('#pt'+idx);
      if(v!=null){dot.setAttribute('cx',X(i));dot.setAttribute('cy',Y(v));dot.setAttribute('opacity','1');}else dot.setAttribute('opacity','0');
      const f=fmt(m,v);
      out.push(`<span style="color:${l.color}">●</span> <b>${esc(l.label)}</b>, ${esc(mLab(l.start+i))}: ${v==null?'нет данных':esc(f.num+' '+f.unit)}`);
    });
    $('#cro').innerHTML=out.join('<br>');
  };
  hit.addEventListener('pointerdown',move); hit.addEventListener('pointermove',move);
}
function paintPeriodUI(){
  $('#selPer').value=state.period.key; $('#selCmp').value=state.cmp.key;
  const cp=state.period.key==='custom', cc=state.cmp.key==='custom';
  $('#perDates').hidden=!cp; $('#cmpDates').hidden=!cc; $('#datesRow').hidden=!(cp||cc);
  $('#pf').value=mIso(state.period.from); $('#pt').value=mIso(state.period.to); $('#cf').value=mIso(state.cmp.from); $('#ct').value=mIso(state.cmp.to);
}
function paint(animate){ paintChips(); paintCloud(animate); paintMetrics(); paintData(); paintInfo(); paintPeriodUI(); paintTop(); }

/* ---------- топ лучших и худших брендов выборки ---------- */
function paintTop(){
  const slot=$('#topslot'), m=MBY[state.metric];
  if(cur.bad||cur.emptyA||cur.emptyB){ slot.innerHTML=''; return; }
  const head='<section class="top10"><h3>Топ брендов</h3>';
  if(cur.setA.length<2){
    slot.innerHTML=head+'<p class="sub">Сейчас выбран один бренд, поэтому рейтинга нет. Выберите категорию, подкатегорию, под-подкатегорию, сегмент, этаж, зону или ответственного — здесь появятся 10 лучших и 10 худших брендов по выбранному показателю.</p></section>';
    return;
  }
  const hasC=!!cur.C, P=cur.P, C=cur.C, mallP=cur.mall.P, mallC=cur.mall.C;
  const val=(b,a,e,mall)=>{const z=zoneInfo([b],false);return m.fn(slice(series([b],a,e,false),0,e-a+1,z,mall));};
  /* бренд без данных за период (нет ТО, не открыт, не сдал отчёт) в рейтинге не участвует */
  const rows=cur.setA.map(b=>({b,vP:val(b,P[0],P[1],mallP),vC:C?val(b,C[0],C[1],mallC):null})).filter(r=>r.vP!=null&&isFinite(r.vP));
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
    return `<li class="ti${hasC?'':' nd'}"><span class="rk">${i+1}</span><span class="tn"><span>${esc(r.b.name)}</span><small>${esc([r.b.floor,r.b.zone].filter(Boolean).join(' · '))}</small></span><span class="tv">${S.f(r.vP)}</span>${td}</li>`;
  };
  const sub=`${esc(entName(state.f))} · ${esc(m.name)} · ${fmtRange(P[0],P[1])} · ${rows.length} ${plural(rows.length,'бренд','бренда','брендов')} с данными${m.inverse?' · чем ниже, тем лучше':''}${hasC?' · справа изменение к периоду сравнения':''}`;
  slot.innerHTML=head+`<p class="sub">${sub}</p>
    <div class="tgrp best"><h4>▲ Лучшие ${k} · ${esc(Sb.unit)}</h4><ul class="tl">${best.map(li(Sb)).join('')}</ul></div>
    <div class="tgrp worst"><h4>▼ Худшие ${k} · ${esc(Sw.unit)}</h4><ul class="tl">${worst.map(li(Sw)).join('')}</ul></div></section>`;
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
}
const TYPE_RANK={cat:0,seg:1,zone:2,floor:2,mgr:3,sub:3,ss:4,brand:5};
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
function applySearch(it,t){
  if(t==='f'){
    state.f=it.t==='brand'?{brand:it.l}:{...state.f,[it.t]:it.l}; if(it.t!=='brand') delete state.f.brand;
    $('#q').value=''; showResults('f'); closeTab(); toggleInfo(false);
  } else {
    state.g=it.t==='brand'?{brand:it.l}:{...state.g,[it.t]:it.l}; if(it.t!=='brand') delete state.g.brand;
    $('#q2').value=''; showResults('g'); paintG();
  }
  recompute();
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
function openSheet(){ lastFocus=document.activeElement; paintG(); $('#sheet').classList.add('open'); $('#sheet').setAttribute('aria-hidden','false'); $('#scrim').classList.add('on'); document.body.classList.add('lock'); setTimeout(()=>{const x=$('#sheet .xbtn');x&&x.focus({preventScroll:true});},60); }
function closeSheet(){ $('#sheet').classList.remove('open'); $('#sheet').setAttribute('aria-hidden','true'); $('#scrim').classList.remove('on'); document.body.classList.remove('lock'); if(lastFocus&&lastFocus.focus) lastFocus.focus({preventScroll:true}); }

const reduce=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
function setHH(){ document.documentElement.style.setProperty('--hh',$('#top').offsetHeight+'px'); }

/* ---------- события ---------- */
function bindEvents(){
  document.addEventListener('click',e=>{
    if(!e.target.closest('#top')) closeTab();
    if(!e.target.closest('#infoPop')&&!e.target.closest('#btnInfo')) toggleInfo(false);
    const t=e.target.closest('button'); if(!t||!D) return;
    const d=t.dataset;
    if(t.id==='tabSearch') return openTab('search');
    if(t.id==='tabFilter') return openTab('filter');
    if(t.id==='btnInfo') return toggleInfo();
    if('infoclose' in d) return toggleInfo(false);
    if(t.id==='btnCmp') return openSheet();
    if('close' in d) return closeSheet();
    if(t.id==='fReset'){ state.f={}; paintF(); return recompute(); }
    if(t.id==='fApply'){ return closeTab(); }
    if(t.id==='gReset'){ state.g={}; paintG(); return recompute(); }
    if(d.res!=null) return applySearch(shown[d.t][+d.res],d.t);
    if(d.rm){ delete state.f[d.rm]; return recompute(); }
    if(d.rmg){ delete state.g[d.rmg]; paintG(); return recompute(); }
    if(d.m){ state.metric=d.m; paintMetrics(); paintData(); paintTop(); const b=document.querySelector(`[data-m="${d.m}"]`); b&&b.scrollIntoView({block:'nearest',inline:'center',behavior:reduce()?'auto':'smooth'}); return; }
  });
  document.addEventListener('change',e=>{
    const el=e.target, id=el.id;
    if(el.dataset&&el.dataset.sel){
      const t=el.dataset.t, k=el.dataset.sel;
      if(el.value){ state[t][k]=el.value; delete state[t].brand; } else delete state[t][k];
      if(t==='f') paintF(); else paintG();
      return recompute();
    }
    if(id==='selPer'){ state.period.key=el.value; return recompute(); }
    if(id==='selCmp'){ state.cmp.key=el.value; return recompute(); }
    if(['pf','pt','cf','ct'].includes(id)&&/^\d{4}-\d{2}$/.test(el.value)){
      const v=mi(el.value);
      if(id==='pf') state.period.from=v; if(id==='pt') state.period.to=v; if(id==='cf') state.cmp.from=v; if(id==='ct') state.cmp.to=v;
      recompute();
    }
  });
  $('#scrim').addEventListener('click',closeSheet);
  ['#q','#q2'].forEach(s=>{
    const t=s==='#q'?'f':'g';
    $(s).addEventListener('input',()=>showResults(t));
    $(s).addEventListener('keydown',e=>{ if(e.key==='Enter'&&shown[t][0]){ e.preventDefault(); applySearch(shown[t][0],t); } });
  });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeSheet(); closeTab(); toggleInfo(false); }});
  let rT=0; window.addEventListener('resize',()=>{ setHH(); clearTimeout(rT); rT=setTimeout(()=>{ if(D&&cur.win) paintData(); },150); });
}

/* ---------- старт ---------- */
function splash(){
  const s=$('#splash'); let seen=false; try{seen=sessionStorage.getItem('tcm_splash')==='1';}catch(_){}
  if(seen){ s.remove(); return Promise.resolve(); }
  document.body.classList.add('lock');
  return new Promise(res=>{
    const done=()=>{ if(!s.isConnected) return; s.classList.add('out'); document.body.classList.remove('lock'); try{sessionStorage.setItem('tcm_splash','1');}catch(_){} setTimeout(()=>s.remove(),700); res(); };
    s.addEventListener('click',done); setTimeout(done,1900);
  });
}
async function start(){
  bindEvents(); setHH();
  $('#selPer').innerHTML=PERIODS.map(([k,l])=>`<option value="${k}">${l}</option>`).join('');
  $('#selCmp').innerHTML=COMPARES.map(([k,l])=>`<option value="${k}">${l}</option>`).join('');
  splash();
  $('#vals').innerHTML='<p class="warn">Загружаю данные…</p>';
  let data;
  try{
    const r=await fetch('api/data',{credentials:'same-origin',headers:{Accept:'application/json'}});
    if(r.status===401){ location.href='login'; return; }
    if(!r.ok) throw new Error('HTTP '+r.status);
    data=await r.json();
  }catch(err){
    $('#vals').innerHTML=`<p class="warn">Не удалось загрузить данные (${esc(err.message)}). Обновите страницу позже.</p>`; return;
  }
  prepare(data); buildIndex();
  state.period={key:'last',from:Math.max(0,L-2),to:L}; state.cmp={key:'none',from:Math.max(0,L-14),to:Math.max(0,L-12)};
  ['pf','pt','cf','ct'].forEach(id=>{ $('#'+id).min=D.months[0]; $('#'+id).max=D.months[L]; });
  const upd=new Date(D.asOf);
  $('#demo').textContent=`данные по ${mLab(L)} · обновлено ${isNaN(upd)?'':upd.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`;
  if(D.stale) $('#demo').textContent+=' · таблица недоступна, показаны последние данные';
  recompute();
}
start();
