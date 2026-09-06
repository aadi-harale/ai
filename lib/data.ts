export type CapacityKey="Housing"|"Water"|"Healthcare"|"School"|"Roads"|"Livelihood";
export type Site={id:string;name:string;coord:[number,number];hazard:number;capacity:Record<CapacityKey,number>;cohesion:number;livelihood:number;upgrade:{label:string;costCr:number;key:CapacityKey;add:number}};

export const MALIN:[number,number]=[73.68861,19.16155];
export const context={location:"Malin, Ambegaon Taluka, Pune District",population:2418,households:491,extremeHouseholds:138,evidence:82};

export const households=[
  {name:"Upper-slope hamlet",homes:58,risk:96,note:"Steep-slope + runoff concentration"},
  {name:"Central settlement",homes:80,risk:88,note:"Historic impact footprint + access constraint"},
  {name:"Lower valley homes",homes:103,risk:62,note:"Moderate exposure; road dependency dominates"},
  {name:"Outer agricultural cluster",homes:121,risk:38,note:"Lower direct hazard; livelihood continuity matters"},
  {name:"Peripheral households",homes:129,risk:24,note:"Currently suitable for stay + mitigation"}
];

export const sites:Site[]=[
  {id:"A",name:"North Ridge",coord:[73.6500,19.1870],hazard:18,capacity:{Housing:920,Water:480,Healthcare:710,School:760,Roads:840,Livelihood:510},cohesion:84,livelihood:67,upgrade:{label:"Gravity-fed water scheme",costCr:1.8,key:"Water",add:420}},
  {id:"B",name:"Ghodegaon Corridor",coord:[73.7300,19.1360],hazard:28,capacity:{Housing:980,Water:860,Healthcare:920,School:840,Roads:960,Livelihood:780},cohesion:71,livelihood:82,upgrade:{label:"Market + livelihood shuttle",costCr:0.9,key:"Livelihood",add:170}},
  {id:"C",name:"Plateau East",coord:[73.7220,19.1920],hazard:12,capacity:{Housing:900,Water:690,Healthcare:540,School:810,Roads:770,Livelihood:720},cohesion:89,livelihood:76,upgrade:{label:"Primary health centre package",costCr:1.3,key:"Healthcare",add:330}}
];

export const redZone:[number,number][]= [[73.6748,19.1760],[73.6820,19.1815],[73.6946,19.1792],[73.7020,19.1690],[73.6995,19.1565],[73.6910,19.1492],[73.6788,19.1510],[73.6720,19.1615],[73.6748,19.1760]];
export const cautionZone:[number,number][]= [[73.6650,19.1815],[73.6800,19.1900],[73.7000,19.1875],[73.7110,19.1740],[73.7080,19.1510],[73.6920,19.1405],[73.6700,19.1440],[73.6605,19.1600],[73.6650,19.1815]];

export function functionalCapacity(site:Site){return Math.min(...Object.values(site.capacity));}
export function bottleneck(site:Site){return Object.entries(site.capacity).sort((a,b)=>a[1]-b[1])[0][0] as CapacityKey;}
export function scoreSite(site:Site,rain:number,roadFail:boolean,growth:number,upgraded:boolean){
  const copy:Site={...site,capacity:{...site.capacity}};
  if(upgraded)copy.capacity[copy.upgrade.key]+=copy.upgrade.add;
  const service=Math.min(100,functionalCapacity(copy)/9.5);
  const future=Math.max(0,100-copy.hazard-(rain/40)*Math.max(4,24-copy.hazard/4)-(roadFail?12:0)-growth/2);
  const social=(copy.cohesion+copy.livelihood)/2;
  const score=Math.round(future*.44+service*.34+social*.22);
  return {...copy,score,regret:100-score,future:Math.round(future)};
}
