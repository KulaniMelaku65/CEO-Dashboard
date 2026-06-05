/* ============================================================
   KIFIYA CEO DASHBOARD — APP LOGIC
   ============================================================ */
const CFG = window.DASHBOARD_CONFIG;
const C = { navy:'#0B2A4A', navy3:'#1B4D7E', gold:'#F5A623', goldSoft:'#FFD27A',
            teal:'#1FB6A6', green:'#2EBD85', red:'#E5544B', muted:'#6B7C93', line:'#E3E9F2' };
const PALETTE = [C.navy, C.gold, C.teal, C.navy3, C.goldSoft, C.muted];
let CHARTS = {};

/* ---------- helpers ---------- */
const fmt = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);
const fmtM = n => (n<0?'-':'') + fmt(Math.abs(n));
function destroy(id){ if(CHARTS[id]){CHARTS[id].destroy(); delete CHARTS[id];} }

/* ---------- data acquisition ---------- */
async function getData(){
  if(CFG.MODE === 'live' && CFG.PROXY_BASE){
    setStatus('loading');
    try{
      const e = CFG.ENDPOINTS, b = CFG.PROXY_BASE;
      const [ba,bo,cf,rp] = await Promise.all([
        fetch(b+e.budgetActual).then(r=>r.json()),
        fetch(b+e.budgetOverview).then(r=>r.json()),
        fetch(b+e.cashflow).then(r=>r.json()),
        fetch(b+e.reports).then(r=>r.json())
      ]);
      setStatus('live');
      return { asOf: ba.asOf||new Date().toLocaleDateString(),
               budgetActual:ba, budgetOverview:bo, cashflow:cf, reports:rp };
    }catch(err){
      console.error('Live fetch failed, falling back to demo:',err);
      setStatus('error');
      return window.DEMO_DATA;
    }
  }
  setStatus('demo');
  return window.DEMO_DATA;
}
function setStatus(s){
  const dot=document.getElementById('statusDot'), txt=document.getElementById('statusTxt');
  // 'demo' here means a real ERP snapshot loaded from data.js — show it green.
  dot.className='dot'+((s==='live'||s==='demo')?' live':'');
  txt.textContent = {live:'Live · Business Central', demo:'ERP snapshot', loading:'Loading…', error:'Live failed — snapshot'}[s]||s;
}

/* ---------- KPI card builder ---------- */
function kpiCard({label,val,sub,pct,barPct,barColor,good}){
  const pill = pct==null ? '' :
    `<span class="pill ${good?'g':'r'}">${pct>0?'▲':'▼'} ${Math.abs(pct)}%</span>`;
  const bar = barPct==null ? '' :
    `<div class="bar"><i style="width:${Math.min(barPct,100)}%;background:${barColor||C.gold}"></i></div>`;
  return `<div class="card kpi"><span class="accent-strip" style="background:${barColor||C.gold}"></span>
    <div class="label">${label}</div><div class="val">${val}</div>
    <div class="meta">${sub||''} ${pill}</div>${bar}</div>`;
}

/* ============================================================
   PAGE 1 — BUDGET VS ACTUAL
   ============================================================ */
function renderBVA(d){
  const L = d.budgetActual.lines;
  // KPIs
  document.getElementById('kpiBVA').innerHTML = L.map(x=>{
    const v = x.actual - x.budget;
    const pct = +(v/x.budget*100).toFixed(1);
    const good = x.higherIsBetter ? v>=0 : v<=0;
    return kpiCard({
      label:x.name, val:fmtM(x.actual)+'M',
      sub:`vs ${fmtM(x.budget)}M budget`, pct, good,
      barPct: x.actual/x.budget*100, barColor: good?C.green:C.red
    });
  }).join('');

  // grouped bar
  destroy('bvaBar');
  CHARTS.bvaBar = new Chart(document.getElementById('bvaBar'),{
    type:'bar',
    data:{labels:L.map(x=>x.name),datasets:[
      {label:'Budget',data:L.map(x=>x.budget),backgroundColor:C.navy3,borderRadius:6},
      {label:'Actual',data:L.map(x=>x.actual),backgroundColor:C.gold,borderRadius:6}
    ]},
    options:baseOpts({legend:true})
  });

  // variance %
  destroy('varBar');
  const vpct = L.map(x=>+((x.actual-x.budget)/x.budget*100).toFixed(1));
  CHARTS.varBar = new Chart(document.getElementById('varBar'),{
    type:'bar',
    data:{labels:L.map(x=>x.name),datasets:[{data:vpct,
      backgroundColor:L.map((x,i)=>{const v=x.actual-x.budget;const g=x.higherIsBetter?v>=0:v<=0;return g?C.green:C.red;}),
      borderRadius:6}]},
    options:baseOpts({suffix:'%'})
  });

  // table
  document.querySelector('#bvaTable tbody').innerHTML = L.map(x=>{
    const v=x.actual-x.budget, pct=(v/x.budget*100).toFixed(1);
    const good = x.higherIsBetter ? v>=0 : v<=0;
    const cls = good?'pos':'neg';
    return `<tr><td>${x.name}</td><td>${fmtM(x.budget)}</td><td>${fmtM(x.actual)}</td>
      <td class="${cls}">${v>0?'+':''}${fmtM(v)}</td>
      <td class="${cls}">${v>0?'+':''}${pct}%</td></tr>`;
  }).join('');
}

/* ============================================================
   PAGE 2 — BUDGET OVERVIEW
   ============================================================ */
function renderBO(d){
  const o=d.budgetOverview;
  const total=o.byUnit.reduce((s,x)=>s+x.budget,0);
  const usedTotal=o.utilizationYTD.reduce((s,x)=>s+x.used,0);
  document.getElementById('kpiBO').innerHTML =
    kpiCard({label:'Total Budget',val:fmtM(total)+'M',sub:'allocated FY',barColor:C.navy}) +
    kpiCard({label:'Utilised YTD',val:fmtM(usedTotal)+'M',sub:`${(usedTotal/total*100).toFixed(0)}% of budget`,barPct:usedTotal/total*100,barColor:C.gold}) +
    kpiCard({label:'Remaining',val:fmtM(total-usedTotal)+'M',sub:'available',barColor:C.teal}) +
    kpiCard({label:'Business Units',val:o.byUnit.length,sub:'tracked'});

  destroy('buDonut');
  CHARTS.buDonut=new Chart(document.getElementById('buDonut'),{
    type:'doughnut',
    data:{labels:o.byUnit.map(x=>x.unit),datasets:[{data:o.byUnit.map(x=>x.budget),
      backgroundColor:PALETTE,borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'right',labels:{boxWidth:12,padding:12,font:{size:12}}}}}
  });

  destroy('m2mLine');
  CHARTS.m2mLine=new Chart(document.getElementById('m2mLine'),{
    type:'line',
    data:{labels:o.monthly.labels,datasets:[
      {label:'Budget',data:o.monthly.budget,borderColor:C.navy3,borderDash:[6,4],tension:.3,fill:false,pointRadius:3},
      {label:'Actual',data:o.monthly.actual,borderColor:C.gold,backgroundColor:'rgba(245,166,35,.12)',tension:.3,fill:true,pointRadius:3}
    ]},options:baseOpts({legend:true})
  });

  destroy('utilBar');
  CHARTS.utilBar=new Chart(document.getElementById('utilBar'),{
    type:'bar',
    data:{labels:o.utilizationYTD.map(x=>x.unit),datasets:[
      {label:'Used',data:o.utilizationYTD.map(x=>x.used),backgroundColor:C.gold,borderRadius:6,stack:'s'},
      {label:'Remaining',data:o.utilizationYTD.map(x=>x.budget-x.used),backgroundColor:'#DCE6F1',borderRadius:6,stack:'s'}
    ]},
    options:{...baseOpts({legend:true}),scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:C.line}}}}
  });
}

/* ============================================================
   PAGE 3 — CASH FLOW
   ============================================================ */
function renderCF(d){
  const c=d.cashflow;
  const net=c.flows.collections+c.flows.otherInflows-c.flows.operatingOut-c.flows.capexOut;
  document.getElementById('kpiCF').innerHTML =
    kpiCard({label:'Collections',val:fmtM(c.flows.collections)+'M',sub:'as per bank',barColor:C.green}) +
    kpiCard({label:'Bank Balance',val:fmtM(c.bankDaily.balances.at(-1))+'M',sub:'latest daily',barColor:C.navy}) +
    kpiCard({label:'Other Inflows',val:fmtM(c.flows.otherInflows)+'M',sub:'YTD',barColor:C.teal}) +
    kpiCard({label:'Operating Outflows',val:fmtM(c.flows.operatingOut)+'M',sub:'YTD',barColor:C.gold}) +
    kpiCard({label:'Net Cash Flow',val:fmtM(net)+'M',sub:'YTD',barColor:net>=0?C.green:C.red,pct:null});

  destroy('bankLine');
  CHARTS.bankLine=new Chart(document.getElementById('bankLine'),{
    type:'line',
    data:{labels:c.bankDaily.labels,datasets:[{label:'Bank Balance',data:c.bankDaily.balances,
      borderColor:C.navy,backgroundColor:'rgba(11,42,74,.08)',fill:true,tension:.35,pointRadius:0,borderWidth:2}]},
    options:baseOpts({})
  });

  destroy('flowBar');
  CHARTS.flowBar=new Chart(document.getElementById('flowBar'),{
    type:'bar',
    data:{labels:['Collections','Other Inflows','Operating Out','CAPEX Out'],
      datasets:[{data:[c.flows.collections,c.flows.otherInflows,-c.flows.operatingOut,-c.flows.capexOut],
        backgroundColor:[C.green,C.teal,C.red,C.gold],borderRadius:6}]},
    options:baseOpts({})
  });

  destroy('collDonut');
  CHARTS.collDonut=new Chart(document.getElementById('collDonut'),{
    type:'doughnut',
    data:{labels:c.collectionsByBank.map(x=>x.bank),datasets:[{data:c.collectionsByBank.map(x=>x.amount),
      backgroundColor:PALETTE,borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'58%',
      plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:8,font:{size:11}}}}}
  });

  gauge('debtGauge', c.debtUtilisation.used, c.debtUtilisation.facility, 'of facility', C.gold);
  gauge('capexGauge', c.capexUtilisation.used, c.capexUtilisation.budget, 'of CAPEX budget', C.teal);
}

function gauge(id, used, total, label, color){
  destroy(id);
  const pct=Math.round(used/total*100);
  CHARTS[id]=new Chart(document.getElementById(id),{
    type:'doughnut',
    data:{datasets:[{data:[used,Math.max(total-used,0)],backgroundColor:[color,'#E9EEF5'],
      borderWidth:0,circumference:180,rotation:270}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false},tooltip:{enabled:false}}},
    plugins:[{id:'t'+id,afterDraw(ch){const {ctx,chartArea}=ch;ctx.save();
      const x=(chartArea.left+chartArea.right)/2, y=chartArea.bottom-10;
      ctx.textAlign='center';ctx.fillStyle=C.navy;ctx.font='700 30px Segoe UI';ctx.fillText(pct+'%',x,y);
      ctx.fillStyle=C.muted;ctx.font='12px Segoe UI';ctx.fillText(fmtM(used)+'M '+label,x,y+20);ctx.restore();}}]
  });
}

/* ============================================================
   PAGE 4 — REPORTS
   ============================================================ */
function renderReports(d){
  const r=d.reports;
  document.getElementById('ratioKpi').innerHTML = r.ratios.map(x=>{
    const hasTrend = x.trend && x.trend!==0;
    return kpiCard({label:x.label,val:x.value,
      sub:'', pct: hasTrend ? x.trend : null, good: x.trend>=0,
      barColor: C.navy});
  }).join('');

  // P&L bridge as a waterfall using Chart.js v4 floating bars: each bar's
  // data is a [start, end] pair, so consecutive up/down steps render correctly.
  destroy('plWaterfall');
  let run = 0;
  const floats = [], colors = [];
  r.pl.forEach(s => {
    if (s.type==='total' || s.type==='subtotal') {
      floats.push([0, s.value]);
      colors.push(s.type==='total' ? C.navy : C.navy3);
      run = s.value;
    } else {
      const start = run; run += s.value;
      floats.push([start, run]);
      colors.push(s.value < 0 ? C.red : C.green);
    }
  });
  CHARTS.plWaterfall=new Chart(document.getElementById('plWaterfall'),{
    type:'bar',
    data:{labels:r.pl.map(x=>x.name),datasets:[
      {data:floats, backgroundColor:colors, borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:(ctx)=>fmtM(r.pl[ctx.dataIndex].value)+'M'}}},
      scales:{
        x:{grid:{display:false}},
        y:{beginAtZero:true,grid:{color:C.line},ticks:{callback:v=>fmtM(v)}}
      }}
  });

  document.querySelector('#mgmtTable tbody').innerHTML = r.management.map(x=>{
    const cls=x.vsBudget>=0?'pos':'neg';
    const cell=v=> (v===0||v==null) ? '—' : fmtM(v);
    return `<tr><td>${x.metric}</td><td>${cell(x.month)}</td><td>${cell(x.last)}</td>
      <td>${fmtM(x.ytd)}</td><td class="${cls}">${x.vsBudget>0?'+':''}${x.vsBudget}%</td></tr>`;
  }).join('');
}

/* ---------- shared chart options ---------- */
function baseOpts({legend=false,suffix=''}={}){
  return {responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:legend,position:'top',labels:{boxWidth:12,padding:14,font:{size:12}}},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label?c.dataset.label+': ':''}${fmtM(c.parsed.y ?? c.parsed)}${suffix}`}}},
    scales:{x:{grid:{display:false}},y:{grid:{color:C.line},ticks:{callback:v=>fmtM(v)+suffix}}}};
}

/* ---------- tabs ---------- */
let LAST_DATA = null;   // cache so tab switches can re-render at correct size
const TAB_RENDER = {
  'budget-actual': d=>renderBVA(d),
  'budget-overview': d=>renderBO(d),
  'cashflow': d=>renderCF(d),
  'reports': d=>renderReports(d)
};
document.querySelectorAll('nav button').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById(b.dataset.tab).classList.add('active');
    // Charts created while their tab was hidden have a zero-width canvas and
    // render blank. Re-render this tab's charts now that it's visible.
    if (LAST_DATA && TAB_RENDER[b.dataset.tab]) {
      requestAnimationFrame(()=>TAB_RENDER[b.dataset.tab](LAST_DATA));
    }
  };
});

/* ---------- boot ---------- */
async function refresh(){
  const d = await getData();
  LAST_DATA = d;
  document.getElementById('asOf').textContent = d.asOf;
  renderBVA(d); renderBO(d); renderCF(d); renderReports(d);
}

// Wait until Chart.js (CDN) is ready, then boot. Prevents a blank
// dashboard if the chart library loads slowly on a corporate network.
function boot(tries=0){
  if (typeof Chart !== 'undefined'){
    Chart.defaults.font.family = "'Segoe UI',system-ui,sans-serif";
    Chart.defaults.color = C.muted;
    refresh();
    if(CFG.REFRESH_SECONDS>0) setInterval(refresh, CFG.REFRESH_SECONDS*1000);
  } else if (tries < 50){
    setTimeout(()=>boot(tries+1), 100);
  } else {
    document.getElementById('statusTxt').textContent = 'Chart library failed to load';
  }
}
boot();
