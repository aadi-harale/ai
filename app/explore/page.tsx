"use client";
import {useCallback,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,BarChart3,CloudRain,HeartHandshake,MapPinned,RotateCcw,Users,Wrench} from "lucide-react";
import SafeShiftMap from "../../components/SafeShiftMap";
import {bottleneck,context,functionalCapacity,households,scoreSite,sites,type CapacityKey} from "../../lib/data";

type Tab="decision"|"households"|"sites"|"future"|"cohesion";
const pretty:Record<CapacityKey,string>={Housing:"Housing",Water:"Water",Healthcare:"Healthcare",School:"School",Roads:"Road access",Livelihood:"Livelihood"};

export default function Explore(){
  const[tab,setTab]=useState<Tab>("decision");
  const[selected,setSelected]=useState("B");
  const[rain,setRain]=useState(20);
  const[roadFail,setRoadFail]=useState(false);
  const[growth,setGrowth]=useState(10);
  const[upgrades,setUpgrades]=useState<Record<string,boolean>>({A:false,B:false,C:false});

  const ranked=useMemo(()=>sites.map(s=>scoreSite(s,rain,roadFail,growth,!!upgrades[s.id])).sort((a,b)=>b.score-a.score),[rain,roadFail,growth,upgrades]);
  const current=ranked.find(s=>s.id===selected)??ranked[0];
  const selectSite=useCallback((id:string)=>{setSelected(id);setTab("sites")},[]);
  const reset=()=>{setTab("decision");setSelected("B");setRain(20);setRoadFail(false);setGrowth(10);setUpgrades({A:false,B:false,C:false})};

  return <main className="workspace">
    <header className="workspaceHeader"><div><Link href="/" className="back"><ArrowLeft/></Link><div className="miniBrand">▲ <b>SAFESHIFT</b></div><span className="divider"/><div><b>Malin relocation scenario</b><small>Ambegaon, Pune · illustrative snapshot</small></div></div><Link href="/brief" className="outlineButton">Decision brief</Link></header>
    <div className="evidenceStrip"><span><i className="green"/> Study location <b>REAL</b></span><span><i className="amber"/> Hazard polygon <b>DEMO</b></span><span><i className="amber"/> Site capacities <b>DEMO</b></span><em>Evidence coverage {context.evidence}%</em></div>
    <div className="workspaceGrid">
      <aside className="rail"><Rail active={tab==="decision"} icon={<BarChart3/>} text="Decision" click={()=>setTab("decision")}/><Rail active={tab==="households"} icon={<Users/>} text="Households" click={()=>setTab("households")}/><Rail active={tab==="sites"} icon={<MapPinned/>} text="Sites" click={()=>setTab("sites")}/><Rail active={tab==="future"} icon={<CloudRain/>} text="Futures" click={()=>setTab("future")}/><Rail active={tab==="cohesion"} icon={<HeartHandshake/>} text="Cohesion" click={()=>setTab("cohesion")}/><div className="spacer"/><Rail icon={<RotateCcw/>} text="Reset" click={reset}/></aside>
      <section className="mapArea"><SafeShiftMap sites={ranked} selected={selected} onSelect={selectSite}/><div className="mapHeadline"><span>● DECISION SIMULATION</span><b>{context.location}</b><small>{context.population.toLocaleString("en-IN")} people · {context.households} households</small></div><div className="mapDecisionChip"><b>PARTIAL RELOCATION</b><span>{context.extremeHouseholds} highest-risk households first</span></div><div className="mapStressBar"><div><CloudRain/><span>Rainfall stress<b>+{rain}%</b></span></div><input type="range" min="0" max="40" step="10" value={rain} onChange={e=>setRain(+e.target.value)}/><label><input type="checkbox" checked={roadFail} onChange={e=>setRoadFail(e.target.checked)}/> road failure</label></div></section>
      <aside className="sidePanel">
        {tab==="decision"&&<><PanelTitle over="DECISION" title="Relocation strategy"/><div className="decisionHero"><span>RECOMMENDED STRATEGY</span><h2>Partial relocation</h2><p>Catastrophic exposure is concentrated in the upper-slope and central clusters. Move those households first instead of displacing the whole village.</p><div className="metricGrid"><Metric label="Extreme-risk homes" value="138"/><Metric label="Village share" value="28%"/><Metric label="Evidence" value="82%"/><Metric label="Confidence" value="High"/></div></div><div className="actionCard"><span>NEXT ACTION</span><b>Validate candidate sites + begin land / consent checks</b><p>SafeShift produces a planning recommendation, not an automated eviction order.</p></div></>}
        {tab==="households"&&<><PanelTitle over="HOUSEHOLDS" title="Who actually needs to move?"/><div className="clusterList">{households.map(h=><div key={h.name} className={`cluster ${h.risk>=85?"critical":h.risk>=55?"watch":"safe"}`}><div><i/><span><b>{h.name}</b><small>{h.homes} households</small></span></div><strong>{h.risk}</strong><p>{h.note}</p></div>)}</div></>}
        {tab==="sites"&&<><PanelTitle over="CANDIDATE SITES" title="Where could they move?"/><div className="siteRanking">{ranked.map((s,i)=><button key={s.id} className={`siteRow ${selected===s.id?"selected":""}`} onClick={()=>setSelected(s.id)}><span>{i+1}</span><div><b>Site {s.id} · {s.name}</b><small>{functionalCapacity(s)} people · bottleneck {bottleneck(s)}</small></div><strong>{s.score}</strong></button>)}</div><div className="siteDetail"><div className="detailHeader"><div><span>SITE {current.id}</span><b>{current.name}</b></div><strong>{current.score}/100</strong></div><div className="capacityBars">{(Object.entries(current.capacity) as [CapacityKey,number][]).map(([k,v])=><div key={k} className={k===bottleneck(current)?"bottleneck":""}><span>{pretty[k]}<b>{v}</b></span><i><em style={{width:`${Math.min(100,v/10)}%`}}/></i></div>)}</div><div className="capacityResult"><span>FUNCTIONAL CARRYING CAPACITY</span><b>{functionalCapacity(current)} people</b><p>Limited by <strong>{bottleneck(current)}</strong>.</p></div></div><div className={`upgradeCard ${upgrades[current.id]?"active":""}`}><div><Wrench/><span><b>{current.upgrade.label}</b><small>Illustrative · ₹{current.upgrade.costCr} Cr</small></span></div><p>Raises {current.upgrade.key} by +{current.upgrade.add} people.</p><button onClick={()=>setUpgrades(u=>({...u,[current.id]:!u[current.id]}))}>{upgrades[current.id]?"Remove upgrade":"Simulate upgrade"}</button></div></>}
        {tab==="future"&&<><PanelTitle over="LOW-REGRET TEST" title="Will the choice survive?"/><div className="futureControl"><label><span>Extreme rainfall<b>+{rain}%</b></span><input type="range" min="0" max="40" step="10" value={rain} onChange={e=>setRain(+e.target.value)}/></label><label><span>Population growth<b>+{growth}%</b></span><input type="range" min="0" max="20" step="5" value={growth} onChange={e=>setGrowth(+e.target.value)}/></label><label className="check"><input type="checkbox" checked={roadFail} onChange={e=>setRoadFail(e.target.checked)}/> Assume primary-road failure</label></div><div className="futureTable"><div><span>Site</span><span>Score</span><span>Regret</span><span>Rank</span></div>{ranked.map((s,i)=><div key={s.id}><b>{s.id}</b><span>{s.score}</span><em>{s.regret}</em><strong>#{i+1}</strong></div>)}</div><div className="actionCard"><span>LOW-REGRET RULE</span><b>Don’t optimize for today only.</b><p>Prefer the site least likely to become tomorrow’s new vulnerable settlement.</p></div></>}
        {tab==="cohesion"&&<><PanelTitle over="SOCIAL CONSTRAINT" title="Will the community survive?"/><div className="cohesionHero"><HeartHandshake/><h2>Keep social units together.</h2><p>Optimization cannot scatter families, school groups and livelihood networks simply because it increases a score.</p></div><div className="metricGrid"><Metric label="Neighbour clusters" value="88%"/><Metric label="School groups" value="93%"/><Metric label="Livelihood continuity" value={`${current.livelihood}%`}/><Metric label="Cohesion" value={`${current.cohesion}%`}/></div><div className="dangerCard"><span>HARD GATE</span><b>Community consent not verified</b><p>Final status remains PLANNING CANDIDATE until land tenure and community consent are confirmed.</p></div></>}
      </aside>
    </div>
  </main>;
}

function Rail({active=false,icon,text,click}:{active?:boolean;icon:React.ReactNode;text:string;click:()=>void}){return <button className={active?"active":""} onClick={click}>{icon}<span>{text}</span></button>}
function Metric({label,value}:{label:string;value:string}){return <div className="metric"><span>{label}</span><b>{value}</b></div>}
function PanelTitle({over,title}:{over:string;title:string}){return <div className="panelTitle"><span>{over}</span><b>{title}</b></div>}
