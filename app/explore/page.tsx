"use client";

import Link from "next/link";
import {useCallback,useMemo,useState} from "react";
import {FileText,Layers,Link2,MapPinned,Wrench} from "lucide-react";
import HackHabitatSafeShiftMap,{type SafeShiftLayerState} from "../../components/HackHabitatSafeShiftMap";
import {bottleneck,context,functionalCapacity,households,scoreSite,sites,type CapacityKey} from "../../lib/data";
import "./simulation.css";

type Tab="decision"|"households"|"sites"|"future"|"cohesion";
type Strategy="stay"|"partial"|"full";
const steps:[Tab,string][]=[["decision","Strategy"],["households","Who moves"],["sites","Where"],["future","Stress test"],["cohesion","Consent"]];
const pretty:Record<CapacityKey,string>={Housing:"Housing",Water:"Water",Healthcare:"Healthcare",School:"School",Roads:"Road access",Livelihood:"Livelihood"};
const strategyCopy:Record<Strategy,{title:string;badge:string;homes:string;detail:string}>={
  stay:{title:"Stay in place",badge:"HIGHEST RESIDUAL RISK",homes:"0 homes move",detail:"Preserves livelihood ties, but the highest-risk households remain exposed."},
  partial:{title:"Partial relocation",badge:"RECOMMENDED",homes:"138 homes move",detail:"Moves the households driving catastrophic exposure while preserving most community ties."},
  full:{title:"Full relocation",badge:"LOWEST EXPOSURE",homes:"491 homes move",detail:"Removes direct exposure, but creates the greatest social and infrastructure disruption."},
};

export default function Explore(){
  const[tab,setTab]=useState<Tab>("decision");const[strategy,setStrategy]=useState<Strategy>("partial");const[selected,setSelected]=useState("B");const[rain,setRain]=useState(20);const[roadFail,setRoadFail]=useState(false);const[growth,setGrowth]=useState(10);const[upgrades,setUpgrades]=useState<Record<string,boolean>>({A:false,B:false,C:false});const[layersOpen,setLayersOpen]=useState(false);const[layers,setLayers]=useState<SafeShiftLayerState>({risk:true,routes:true,households:true,sites:true});const[copied,setCopied]=useState(false);const[formulaOpen,setFormulaOpen]=useState(false);
  const ranked=useMemo(()=>sites.map(s=>scoreSite(s,rain,roadFail,growth,!!upgrades[s.id])).sort((a,b)=>b.score-a.score),[rain,roadFail,growth,upgrades]);
  const current=ranked.find(s=>s.id===selected)??ranked[0];const stepIndex=steps.findIndex(([id])=>id===tab);const selectSite=useCallback((id:string)=>{setSelected(id);setTab("sites")},[]);
  const serviceScore=Math.min(100,Math.round(functionalCapacity(current)/9.5));const continuityScore=Math.round((current.cohesion+current.livelihood)/2);
  const briefHref=useMemo(()=>({pathname:"/brief",query:{site:current.id,rain:String(rain),road:roadFail?"1":"0",growth:String(growth),upgrade:upgrades[current.id]?"1":"0",score:String(current.score),capacity:String(functionalCapacity(current)),bottleneck:bottleneck(current),regret:String(current.regret)}}),[current,rain,roadFail,growth,upgrades]);
  const copyShare=async()=>{try{await navigator.clipboard.writeText(window.location.href);setCopied(true);setTimeout(()=>setCopied(false),1500)}catch{}};

  return <main className="hhWorkspace">
    <header className="hhHeader">
      <div className="hhBrand"><Link href="/" className="hhBrandLink"><span className="hhMark">◉</span><b>SafeShift</b></Link><span className="hhDivider"/><div><strong>Malin relocation scenario</strong><small>19.162°N, 73.689°E · 6.2 km planning radius</small></div></div>
      <div className="hhHeaderActions">
        <div className="hhLayersWrap"><button className="hhGhost" onClick={()=>setLayersOpen(v=>!v)}><Layers size={15}/> Layers</button>{layersOpen?<div className="hhLayerMenu">{([['risk','Risk footprints'],['routes','Relocation routes'],['households','Household clusters'],['sites','Candidate sites']] as [keyof SafeShiftLayerState,string][]).map(([key,label])=><label key={key}><input type="checkbox" checked={layers[key]} onChange={e=>setLayers(v=>({...v,[key]:e.target.checked}))}/><span>{label}</span></label>)}</div>:null}</div>
        <button className="hhGhost" onClick={copyShare}><Link2 size={15}/>{copied?"Copied":"Share"}</button>
        <Link href={briefHref} className="hhPrimary"><FileText size={15}/> Export brief</Link>
      </div>
    </header>

    <div className="hhBody">
      <section className="hhMapPane"><HackHabitatSafeShiftMap sites={ranked} selected={selected} onSelect={selectSite} roadFail={roadFail} layers={layers}/></section>

      <aside className="hhPanel">
        <section className="hhCard hhFlowCard">
          <div className="hhSearch"><MapPinned size={15}/><span>Decision flow · step {stepIndex+1} of 5</span></div>
          <div className="hhStepTabs">{steps.map(([id,label],i)=><button key={id} className={tab===id?"active":i<stepIndex?"done":""} onClick={()=>setTab(id)}><span>{i+1}</span>{label}</button>)}</div>
          <div className="hhStepBody">{tab==="decision"?<Decision strategy={strategy} setStrategy={setStrategy} onNext={()=>setTab("households")}/>:tab==="households"?<Households onNext={()=>setTab("sites")}/>:tab==="sites"?<Sites ranked={ranked} selected={selected} setSelected={setSelected} current={current} upgrades={upgrades} setUpgrades={setUpgrades} onNext={()=>setTab("future")}/>:tab==="future"?<Future ranked={ranked} current={current} rain={rain} setRain={setRain} growth={growth} setGrowth={setGrowth} roadFail={roadFail} setRoadFail={setRoadFail} onNext={()=>setTab("cohesion")}/>:<Consent current={current} ranked={ranked} rain={rain} growth={growth} roadFail={roadFail} briefHref={briefHref}/>}</div>
        </section>

        <section className="hhCard hhIndexCard">
          <div className="hhCardHead"><span>RELOCATION DECISION INDEX</span><button type="button" aria-expanded={formulaOpen} onClick={()=>setFormulaOpen(v=>!v)}>{formulaOpen?"Hide formula":"How this is calculated"}</button></div>
          <div className="hhIndex"><strong>{current.score}</strong><span>/ 100</span></div><b className="hhGrade">{current.score>=75?"Strong candidate":current.score>=55?"Moderate candidate":"Weak candidate"}</b>
          <div className="hhTags"><span>ILLUSTRATIVE DATA</span><span>CAPACITY {functionalCapacity(current)}</span><span>REGRET {current.regret}</span></div>
          <div className="hhDrivers"><Driver label="Future hazard resilience" weight="44%" value={current.future}/><Driver label="Functional carrying capacity" weight="34%" value={serviceScore}/><Driver label="Community continuity" weight="22%" value={continuityScore}/></div>
          {formulaOpen?<div className="hhConfidence"><span>LIVE SCORE RECEIPT</span><b>{current.future} × 0.44 + {serviceScore} × 0.34 + {continuityScore} × 0.22 = {current.score}</b><small>Future resilience starts from site hazard and applies the selected rainfall, road-failure and population-growth penalties. Capacity is the weakest essential service, normalized to the demo&apos;s 950-person reference scale. Continuity is the mean of cohesion and livelihood. Regret = 100 − index.</small></div>:null}
          <div className="hhConfidence"><span>EVIDENCE STATUS</span><b>Planning demo · not an official relocation study</b></div>
        </section>
      </aside>
    </div>
  </main>
}

function Decision({strategy,setStrategy,onNext}:{strategy:Strategy;setStrategy:(s:Strategy)=>void;onNext:()=>void}){return <><span className="hhEyebrow">STEP 1 · COMPARE STRATEGIES</span><h2>How much relocation is actually necessary?</h2><p className="hhIntro">Test the safety gain against livelihood and social disruption before choosing a destination.</p><div className="hhChoiceList">{(['stay','partial','full'] as Strategy[]).map(s=><button key={s} className={strategy===s?"selected":""} onClick={()=>setStrategy(s)}><span><b>{strategyCopy[s].title}</b><small>{strategyCopy[s].detail}</small></span><strong>{strategyCopy[s].homes}</strong></button>)}</div><button className="hhAnalyze" disabled={strategy!=="partial"} onClick={onNext}>{strategy==="partial"?"Continue with partial relocation":"Select the recommended trade-off to continue"}</button></>}
function Households({onNext}:{onNext:()=>void}){return <><span className="hhEyebrow">STEP 2 · TARGET EXPOSURE</span><h2>Move the exposed clusters, not the whole village.</h2><p className="hhIntro">138 of 491 households drive the catastrophic-risk signal.</p><div className="hhMiniRows">{households.map(h=><div key={h.name}><span><b>{h.name}</b><small>{h.homes} households · {h.note}</small></span><strong>{h.risk}</strong></div>)}</div><button className="hhAnalyze" onClick={onNext}>Find a destination that can sustain them</button></>}
function Sites({ranked,selected,setSelected,current,upgrades,setUpgrades,onNext}:{ranked:any[];selected:string;setSelected:(s:string)=>void;current:any;upgrades:Record<string,boolean>;setUpgrades:any;onNext:()=>void}){return <><span className="hhEyebrow">STEP 3 · FUNCTIONAL CAPACITY</span><h2>Safe land is not enough.</h2><p className="hhIntro">The weakest essential service caps how many people a site can actually support.</p><div className="hhSiteRows">{ranked.map((s,i)=><button key={s.id} className={selected===s.id?"selected":""} onClick={()=>setSelected(s.id)}><span>#{i+1}</span><div><b>Site {s.id} · {s.name}</b><small>{functionalCapacity(s)} people · bottleneck {bottleneck(s)}</small></div><strong>{s.score}</strong></button>)}</div><div className="hhCapacity">{(Object.entries(current.capacity) as [CapacityKey,number][]).map(([k,v])=><div key={k} className={k===bottleneck(current)?"weak":""}><span>{pretty[k]} <b>{v}</b></span><i><em style={{width:`${Math.min(100,v/10)}%`}}/></i></div>)}</div><button className="hhUpgrade" onClick={()=>setUpgrades((u:any)=>({...u,[current.id]:!u[current.id]}))}><Wrench size={14}/>{upgrades[current.id]?"Remove simulated upgrade":`Simulate ${current.upgrade.label}`}</button><button className="hhAnalyze" onClick={onNext}>Stress-test this choice</button></>}
function Future({ranked,current,rain,setRain,growth,setGrowth,roadFail,setRoadFail,onNext}:{ranked:any[];current:any;rain:number;setRain:(n:number)=>void;growth:number;setGrowth:(n:number)=>void;roadFail:boolean;setRoadFail:(v:boolean)=>void;onNext:()=>void}){return <><span className="hhEyebrow">STEP 4 · LOW-REGRET TEST</span><h2>Will today&apos;s safe site become tomorrow&apos;s vulnerable site?</h2><div className="hhControl"><label><span>Extreme rainfall <b>+{rain}%</b></span><input type="range" min="0" max="40" step="10" value={rain} onChange={e=>setRain(+e.target.value)}/></label><label><span>Population growth <b>+{growth}%</b></span><input type="range" min="0" max="20" step="5" value={growth} onChange={e=>setGrowth(+e.target.value)}/></label><label className="hhCheck"><input type="checkbox" checked={roadFail} onChange={e=>setRoadFail(e.target.checked)}/> Fail primary road</label></div><div className="hhFutureRows">{ranked.map((s,i)=><div key={s.id}><b>Site {s.id}</b><span>score {s.score}</span><span>regret {s.regret}</span><strong>#{i+1}</strong></div>)}</div><p className="hhIntro">Selected Site {current.id} currently ranks #{ranked.findIndex(s=>s.id===current.id)+1}.</p><button className="hhAnalyze" onClick={onNext}>Apply community consent gate</button></>}
function Consent({current,ranked,rain,growth,roadFail,briefHref}:{current:any;ranked:any[];rain:number;growth:number;roadFail:boolean;briefHref:any}){const rank=ranked.findIndex(s=>s.id===current.id)+1;return <><span className="hhEyebrow">STEP 5 · LOW-REGRET RECOMMENDATION</span><h2>Phase the move — and stop at the consent gate.</h2><p className="hhIntro">Partial relocation avoids moving all 491 households while removing the concentrated catastrophic exposure first.</p><div className="hhMiniRows"><div><span><b>Phase 1 cohort</b><small>Highest-risk households only</small></span><strong>138 homes</strong></div><div><span><b>Planning candidate</b><small>Site {current.id} · current stress rank #{rank}</small></span><strong>{functionalCapacity(current)} people</strong></div><div><span><b>Stress scenario</b><small>Rain +{rain}% · growth +{growth}%</small></span><strong>{roadFail?"road failed":"road open"}</strong></div><div><span><b>Residual weakness</b><small>Weakest service still controls viability</small></span><strong>{bottleneck(current)}</strong></div></div><p className="hhIntro">Trade-off: preserve most livelihood and neighbourhood ties, accept a phased move instead of maximum displacement, and re-rank the site if future stress changes its position.</p><div className="hhMetricGrid"><Metric label="Neighbour clusters" value="88%"/><Metric label="School groups" value="93%"/><Metric label="Livelihood continuity" value={`${current.livelihood}%`}/><Metric label="Cohesion" value={`${current.cohesion}%`}/></div><div className="hhGate"><span>EXECUTION HARD GATE</span><b>Consent and tenure not yet verified</b><p>Recommendation remains a planning candidate. SafeShift cannot convert technical suitability into an eviction or execution decision.</p></div><Link href={briefHref} className="hhAnalyze link">Open auditable decision brief</Link></>}
function Metric({label,value}:{label:string;value:string}){return <div><span>{label}</span><b>{value}</b></div>}
function Driver({label,weight,value}:{label:string;weight:string;value:number}){return <div><span>{label} · {weight}<b>{value}</b></span><i><em style={{width:`${value}%`}}/></i></div>}
