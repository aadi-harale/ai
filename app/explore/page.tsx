"use client";

import {useCallback,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,CloudRain,HeartHandshake,Wrench} from "lucide-react";
import SafeShiftMap from "../../components/SafeShiftMap";
import {bottleneck,context,functionalCapacity,households,scoreSite,sites,type CapacityKey} from "../../lib/data";
import "./simulation.css";

type Tab="decision"|"households"|"sites"|"future"|"cohesion";
const steps:[Tab,string][]=[["decision","Strategy"],["households","Who moves"],["sites","Where"],["future","Stress test"],["cohesion","Consent"]];
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
  const stepIndex=steps.findIndex(([id])=>id===tab);
  const selectSite=useCallback((id:string)=>{setSelected(id);setTab("sites")},[]);
  const briefHref=useMemo(()=>({pathname:"/brief",query:{site:current.id,rain:String(rain),road:roadFail?"1":"0",growth:String(growth),upgrade:upgrades[current.id]?"1":"0",score:String(current.score),capacity:String(functionalCapacity(current)),bottleneck:bottleneck(current),regret:String(current.regret)}}),[current,rain,roadFail,growth,upgrades]);
  const mapStatus=useMemo(()=>{
    if(tab==="decision")return {title:"PARTIAL RELOCATION",detail:"Compare stay vs partial vs full before moving anyone."};
    if(tab==="households")return {title:`${context.extremeHouseholds} OF ${context.households} HOMES`,detail:"Risk is concentrated — do not move the whole village by default."};
    if(tab==="sites")return {title:`SITE ${current.id} · ${current.score}/100`,detail:`Capacity ${functionalCapacity(current)} people · bottleneck ${bottleneck(current)}.`};
    if(tab==="future")return {title:`+${rain}% RAIN · ${roadFail?"ROAD FAILED":"ROAD OPEN"}`,detail:`Site ${current.id} is rank #${ranked.findIndex(s=>s.id===current.id)+1} · regret ${current.regret}.`};
    return {title:"CONSENT GATE",detail:`Site ${current.id} remains a planning candidate until consent and tenure are verified.`};
  },[tab,current,rain,roadFail,ranked]);

  return <main className="workspace guidedWorkspace">
    <header className="workspaceHeader">
      <div><Link href="/" className="back"><ArrowLeft/></Link><div className="miniBrand">▲ <b>SAFESHIFT</b></div><span className="divider"/><div><b>Malin relocation scenario</b><small>Illustrative planning demo · Ambegaon, Pune</small></div></div>
      {tab==="cohesion"?<Link href={briefHref} className="outlineButton">Open decision brief</Link>:<span className="outlineButton" aria-label={`Step ${stepIndex+1} of 5`}>Step {stepIndex+1} of 5</span>}
    </header>

    <div className="guidedShell">
      <nav className="judgeFlow" aria-label="SafeShift demo progress">
        {steps.map(([id,label],i)=><button key={id} className={i===stepIndex?"active":i<stepIndex?"done":""} onClick={()=>setTab(id)}><span>{i<stepIndex?"✓":i+1}</span><b>{label}</b></button>)}
      </nav>

      <div className="guidedMain">
        <section className="mapArea guidedMap">
          <SafeShiftMap sites={ranked} selected={selected} onSelect={selectSite} rain={rain} roadFail={roadFail} simMinute={18} playing={false}/>
          <div className="mapHeadline"><span>DECISION TWIN</span><b>{context.location}</b><small>{context.population.toLocaleString("en-IN")} people · {context.households} households</small></div>
          <div className="mapDecisionChip"><b>{mapStatus.title}</b><span>{mapStatus.detail}</span></div>
        </section>

        <aside className="sidePanel guidedPanel">
          {tab==="decision"&&<>
            <PanelTitle over="STEP 1 OF 5" title="Choose the relocation strategy"/>
            <div className="decisionHero"><span>RECOMMENDED</span><h2>Partial relocation</h2><p>Move the 138 households driving catastrophic exposure while preserving most livelihood and community ties.</p></div>
            <div className="strategyGrid guidedStrategies">
              <button className="strategyCard"><span>STAY</span><b>0 homes move</b><small>Critical residual hazard remains.</small></button>
              <button className="strategyCard recommended"><span>BEST TRADE-OFF</span><b>138 homes move</b><small>Low residual risk with high livelihood continuity.</small></button>
              <button className="strategyCard"><span>FULL MOVE</span><b>491 homes move</b><small>Lowest exposure, highest social disruption.</small></button>
            </div>
            <button className="decisionNext" onClick={()=>setTab("households")}>Next · show why only 138 households move →</button>
          </>}

          {tab==="households"&&<>
            <PanelTitle over="STEP 2 OF 5" title="Identify who actually needs to move"/>
            <div className="decisionHero compactHero"><span>CORE IDEA</span><h2>Risk is concentrated.</h2><p>SafeShift relocates household clusters, not entire villages by default.</p></div>
            <div className="clusterList">{households.map(h=><div key={h.name} className={`cluster ${h.risk>=85?"critical":h.risk>=55?"watch":"safe"}`}><div><i/><span><b>{h.name}</b><small>{h.homes} households</small></span></div><strong>{h.risk}</strong><p>{h.note}</p></div>)}</div>
            <button className="decisionNext" onClick={()=>setTab("sites")}>Next · find a site that can sustain them →</button>
          </>}

          {tab==="sites"&&<>
            <PanelTitle over="STEP 3 OF 5" title="Choose a viable destination"/>
            <div className="siteRanking">{ranked.map((s,i)=><button key={s.id} className={`siteRow ${selected===s.id?"selected":""}`} onClick={()=>setSelected(s.id)}><span>{i+1}</span><div><b>Site {s.id} · {s.name}</b><small>{functionalCapacity(s)} people · bottleneck {bottleneck(s)}</small></div><strong>{s.score}</strong></button>)}</div>
            <div className="siteDetail"><div className="detailHeader"><div><span>SELECTED SITE {current.id}</span><b>{current.name}</b></div><strong>{current.score}/100</strong></div><div className="capacityBars">{(Object.entries(current.capacity) as [CapacityKey,number][]).map(([k,v])=><div key={k} className={k===bottleneck(current)?"bottleneck":""}><span>{pretty[k]}<b>{v}</b></span><i><em style={{width:`${Math.min(100,v/10)}%`}}/></i></div>)}</div><div className="capacityResult"><span>FUNCTIONAL CARRYING CAPACITY</span><b>{functionalCapacity(current)} people</b><p>Weakest service: <strong>{bottleneck(current)}</strong>.</p></div></div>
            <div className={`upgradeCard ${upgrades[current.id]?"active":""}`}><div><Wrench/><span><b>{current.upgrade.label}</b><small>Illustrative · ₹{current.upgrade.costCr} Cr</small></span></div><p>Upgrade the bottleneck and immediately re-rank the site.</p><button onClick={()=>setUpgrades(u=>({...u,[current.id]:!u[current.id]}))}>{upgrades[current.id]?"Remove upgrade":"Simulate upgrade"}</button></div>
            <button className="decisionNext" onClick={()=>setTab("future")}>Next · see if this choice survives a worse future →</button>
          </>}

          {tab==="future"&&<>
            <PanelTitle over="STEP 4 OF 5" title="Stress-test the decision"/>
            <div className="futureControl"><label><span><CloudRain/> Extreme rainfall<b>+{rain}%</b></span><input type="range" min="0" max="40" step="10" value={rain} onChange={e=>setRain(+e.target.value)}/></label><label><span>Population growth<b>+{growth}%</b></span><input type="range" min="0" max="20" step="5" value={growth} onChange={e=>setGrowth(+e.target.value)}/></label><label className="check"><input type="checkbox" checked={roadFail} onChange={e=>setRoadFail(e.target.checked)}/> Fail primary road</label></div>
            <div className="futureTable"><div><span>Site</span><span>Score</span><span>Regret</span><span>Rank</span></div>{ranked.map((s,i)=><div key={s.id}><b>{s.id}</b><span>{s.score}</span><em>{s.regret}</em><strong>#{i+1}</strong></div>)}</div>
            <div className="actionCard"><span>LOW-REGRET RULE</span><b>Do not optimize for today only.</b><p>Prefer the destination least likely to become tomorrow’s vulnerable settlement.</p></div>
            <button className="decisionNext" onClick={()=>setTab("cohesion")}>Next · apply the community consent gate →</button>
          </>}

          {tab==="cohesion"&&<>
            <PanelTitle over="STEP 5 OF 5" title="Apply cohesion + consent gate"/>
            <div className="cohesionHero"><HeartHandshake/><h2>Keep the community together.</h2><p>A technically optimal site cannot proceed if it breaks livelihood networks or lacks consent.</p></div>
            <div className="metricGrid"><Metric label="Neighbour clusters" value="88%"/><Metric label="School groups" value="93%"/><Metric label="Livelihood continuity" value={`${current.livelihood}%`}/><Metric label="Cohesion" value={`${current.cohesion}%`}/></div>
            <div className="dangerCard"><span>HARD GATE</span><b>Consent not yet verified</b><p>Status remains PLANNING CANDIDATE until land tenure and community consent are confirmed.</p></div>
            <Link href={briefHref} className="decisionNext">Finish · open the auditable decision brief →</Link>
          </>}
        </aside>
      </div>
    </div>
  </main>
}

function Metric({label,value}:{label:string;value:string}){return <div className="metric"><span>{label}</span><b>{value}</b></div>}
function PanelTitle({over,title}:{over:string;title:string}){return <div className="panelTitle"><span>{over}</span><b>{title}</b></div>}
