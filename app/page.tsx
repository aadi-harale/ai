import Link from "next/link";
import {ArrowRight,CheckCircle2,CloudRain,HeartHandshake,House,ShieldCheck,TriangleAlert,Users,Waypoints,Wrench} from "lucide-react";

export default function Home(){
  return <main className="landing">
    <header className="siteHeader">
      <div className="brand"><span>▲</span><div><b>SAFESHIFT</b><small>Proactive Relocation Decision Studio</small></div></div>
      <nav><a href="#workflow">How it works</a><a href="#innovation">Innovation</a><a href="#limits">Limits</a></nav>
      <Link className="headerCta" href="/explore">Open demo →</Link>
    </header>

    <section className="hero">
      <div className="heroCopy">
        <div className="eyebrow"><i/> SIH26191 · NDRF / MHA</div>
        <h1>Don’t wait for the next disaster to decide <em>where people can live.</em></h1>
        <p>SafeShift turns multi-hazard red zones into an actual relocation decision: who needs to move, which location can sustain them, and whether that choice still works under a worse future.</p>
        <div className="heroActions"><Link href="/explore" className="primaryCta">Start 3-minute decision walkthrough <ArrowRight/></Link><a href="#workflow" className="secondaryCta">See decision logic</a></div>
        <div className="trustRow"><span><ShieldCheck/>Evidence before verdicts</span><span><HeartHandshake/>Community cohesion</span><span><Waypoints/>Future stress tests</span></div>
      </div>
      <div className="landingPreview">
        <div className="previewHeader"><span>● MALIN DEMO SCENARIO</span><b>Relocation planning</b></div>
        <div className="previewMap"><div className="ridge r1"/><div className="ridge r2"/><div className="ridge r3"/><div className="redBlob"/><div className="villagePin">Malin<small>491 households</small></div><div className="candidate a"><i>A</i><small>capacity 480</small></div><div className="candidate b"><i>B</i><small>capacity 780</small></div><div className="candidate c"><i>C</i><small>capacity 540</small></div><div className="upgradePulse">+ health package<b>Site C → 870</b></div></div>
        <div className="previewFooter"><div><Users/><span>Extreme-risk homes<b>138 / 491</b></span></div><div><House/><span>Recommended action<b>Partial relocation</b></span></div><div><Waypoints/><span>Lowest-regret option<b>Site C + upgrade</b></span></div></div>
      </div>
    </section>

    <section className="sourceStrip" aria-label="SafeShift judge demo path"><div><small>01 · COMPARE</small><b>Stay · partial · full</b></div><div><small>02 · CAPACITY</small><b>find weakest service</b></div><div><small>03 · UPGRADE</small><b>repair site viability</b></div><div><small>04 · STRESS</small><b>rain · road · growth</b></div><div><small>05 · GATE + BRIEF</small><b>consent · evidence · export</b></div><span>3–5 MIN JUDGE PATH</span></section>

    <section className="section" id="workflow"><span className="kicker">FROM RISK MAP TO HUMAN DECISION</span><h2>Not another red-zone dashboard.</h2><div className="workflowGrid"><Card n="01" icon={<TriangleAlert/>} title="Identify the red zone" text="Combine hazard intensity and vulnerability without hiding uncertainty."/><Card n="02" icon={<Users/>} title="Who actually needs to move?" text="Separate extreme-risk clusters instead of forcing all-or-nothing relocation."/><Card n="03" icon={<House/>} title="Functional carrying capacity" text="A site only supports as many people as its weakest essential service can sustain."/><Card n="04" icon={<CloudRain/>} title="Stress-test the future" text="Re-rank sites under heavier rainfall, road loss and population growth."/></div></section>

    <section className="section" id="innovation"><span className="kicker">THE FEATURE TO SELL</span><h2>Don’t just choose the best site. Design it.</h2><div className="innovation"><Wrench/><div><span>SITE VIABILITY UPGRADE PLANNER</span><h3>Site C is safer — but healthcare is the bottleneck.</h3><p>Simulate the minimum infrastructure package needed to unlock a safer site, then recalculate carrying capacity, future robustness and low-regret ranking instantly.</p></div></div></section>

    <section className="section" id="limits"><div className="limitsCard"><div><span className="kicker">SCIENTIFIC + ETHICAL HONESTY</span><h2>Evidence, not eviction.</h2></div><div><p><CheckCircle2/>Malin is used as a real study location.</p><p><CheckCircle2/>Decision logic is deterministic and inspectable.</p><p><TriangleAlert/>Candidate sites, capacities, household clusters and costs are illustrative demo data.</p><p><TriangleAlert/>Real relocation requires authoritative hazard studies, land verification and community consent.</p></div></div></section>
  </main>;
}

function Card({n,icon,title,text}:{n:string;icon:React.ReactNode;title:string;text:string}){return <article className="workflow"><span>{n}</span><div>{icon}</div><h3>{title}</h3><p>{text}</p></article>}
