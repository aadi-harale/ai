import Link from "next/link";
import {AlertTriangle,ArrowLeft,HeartHandshake,Waypoints,Wrench} from "lucide-react";
import styles from "./brief-upgrade.module.css";

const trace=[
  ["01","Exposure","138 / 491 households","Catastrophic exposure is concentrated, so a full-village move is not the default."],
  ["02","Strategy","Partial relocation","Move the highest-risk clusters first while preserving most livelihood ties."],
  ["03","Capacity","Weakest service wins","Functional carrying capacity is limited by the bottleneck service, not empty land area."],
  ["04","Sites","Rank + upgrade","Candidate sites are compared, then the minimum service upgrade can be simulated."],
  ["05","Future","Low-regret stress test","Rainfall, road failure and population growth can change the site ranking."],
  ["06","Consent","Hard gate","No site becomes an execution recommendation until tenure and community consent are verified."],
] as const;

const reversals=[
  ["Road access fails","Selected corridor becomes unusable","Downgrade that site and re-rank alternatives before moving households."],
  ["Future load exceeds weakest service","Functional carrying capacity falls below the relocation cohort","Simulate the minimum service upgrade or reject the site."],
  ["Rainfall / hazard shift raises future regret","A site that looks safe today becomes fragile","Prefer the lower-regret alternative rather than optimizing the current snapshot."],
  ["Cohesion or consent gate fails","Livelihood, school-group, tenure or consent constraints are not satisfied","Keep the result at PLANNING CANDIDATE; do not advance to execution."],
] as const;

export default function Brief(){
  return <main className="briefPage"><div className="briefTools"><Link href="/explore"><ArrowLeft/>Back</Link><span>Browser Print → Save as PDF</span></div><article className="brief"><header><div><b>SAFESHIFT</b><small>Proactive Relocation Decision Studio</small></div><span>DECISION BRIEF · MALIN DEMO</span></header><section className="briefHero"><small>PLANNING RECOMMENDATION</small><h1>Relocate the highest-risk clusters first — not the entire village.</h1><p>Illustrative scenario: 138 of 491 households dominate catastrophic exposure.</p></section><div className="briefStats"><div><span>Households</span><b>491</b></div><div><span>Extreme-risk</span><b>138</b></div><div><span>Strategy</span><b>Partial</b></div><div><span>Evidence</span><b>82%</b></div></div><section><h2>What SafeShift adds</h2><div className="briefList"><p><Waypoints/><span><b>Low-regret planning:</b> stress-test candidate sites across plausible futures.</span></p><p><Wrench/><span><b>Site Viability Upgrade Planner:</b> identify the minimum service investment that unlocks a safer site.</span></p><p><HeartHandshake/><span><b>Community cohesion gate:</b> do not optimize by scattering neighbourhood and livelihood networks.</span></p></div></section>

<section className={styles.trace} aria-label="Decision trace"><div className={styles.traceHead}><div><small>WHY THIS RECOMMENDATION EXISTS</small><h2>Six checks from hazard to consent</h2></div><p>A judge should be able to audit the recommendation without replaying the whole interface. Each stage exposes the rule that can stop or change the decision.</p></div><div className={styles.steps}>{trace.map(([n,title,value,why])=><article className={styles.step} key={n}><span>{n}</span><b>{title}</b><strong>{value}</strong><p>{why}</p></article>)}</div><div className={styles.evidence}><article><h3>Evidence status</h3><dl><div><dt>Study location</dt><dd>REAL</dd></div><div><dt>Hazard envelope</dt><dd>ILLUSTRATIVE</dd></div><div><dt>Relocation corridors</dt><dd>SCHEMATIC</dd></div><div><dt>Candidate-site capacity + costs</dt><dd>ILLUSTRATIVE</dd></div></dl></article><article className={styles.gate}><h3>Execution gate</h3><b>PLANNING CANDIDATE — NOT AN EVICTION ORDER</b><p>Authoritative hazard studies, land tenure, service feasibility and community consent remain required before implementation.</p><strong>Human decision authority remains outside SafeShift.</strong></article></div><div className={styles.proof}><b>Low-regret rule:</b> prefer the option that remains acceptable across plausible futures, not merely the site with the best score today. If a road failure or future population load makes the selected site fragile, the recommendation must downgrade or switch.</div></section>

<section aria-label="Recommendation reversal conditions"><h2>What would change this recommendation?</h2><div className="briefList">{reversals.map(([trigger,effect,response])=><p key={trigger}><AlertTriangle/><span><b>{trigger}:</b> {effect}. <strong>{response}</strong></span></p>)}</div><p>SafeShift is intentionally falsifiable: the recommendation is only useful if the system can also state the conditions under which it should be rejected or revised.</p></section>

<section className="briefLimits"><h2>Use limitation</h2><p><AlertTriangle/>Candidate sites, capacities, household counts and costs are illustrative.</p><p><AlertTriangle/>Real relocation requires authoritative hazard studies, land rights and community consent.</p></section></article></main>;
}
