"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import type {Map as MLMap} from "maplibre-gl";
import {Activity,Layers3,MapPinned,Mountain,Route} from "lucide-react";
import {MALIN,bottleneck,cautionZone,functionalCapacity,redZone,type Site} from "../lib/data";

type RankedSite=Site&{score:number;regret:number;future:number};
type Coord=[number,number];
type LayerState={risk:boolean;flow:boolean;routes:boolean;clusters:boolean;terrain:boolean;sites:boolean};
type Probe={lng:number;lat:number;elevation:number|null}|null;

type Props={
  sites:RankedSite[];
  selected:string;
  onSelect:(id:string)=>void;
  rain:number;
  roadFail:boolean;
  simMinute:number;
  playing:boolean;
};

const OPENFREE_STYLE="https://tiles.openfreemap.org/styles/dark";
const TERRAIN_TILEJSON="https://tiles.mapterhorn.com/tilejson.json";

const FALLBACK_STYLE:any={
  version:8,
  sources:{
    osm:{
      type:"raster",
      tiles:[
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
      ],
      tileSize:256,
      maxzoom:19,
      attribution:"© OpenStreetMap contributors"
    }
  },
  layers:[{id:"osm",type:"raster",source:"osm",paint:{
    "raster-saturation":-.72,
    "raster-hue-rotate":15,
    "raster-brightness-min":.035,
    "raster-brightness-max":.31,
    "raster-contrast":.32
  }}]
};

const ROUTES:Record<string,Coord[]>={
  A:[MALIN,[73.681,19.169],[73.670,19.179],[73.660,19.184],[73.6500,19.1870]],
  B:[MALIN,[73.699,19.158],[73.710,19.150],[73.721,19.143],[73.7300,19.1360]],
  C:[MALIN,[73.698,19.169],[73.706,19.178],[73.715,19.186],[73.7220,19.1920]]
};

const RUNOFF:Coord[][]=[
  [[73.671,19.194],[73.678,19.183],[73.684,19.171],MALIN,[73.693,19.147]],
  [[73.684,19.197],[73.688,19.183],[73.690,19.173],MALIN,[73.699,19.146]],
  [[73.700,19.194],[73.698,19.181],[73.695,19.171],MALIN,[73.687,19.145]],
  [[73.709,19.184],[73.704,19.175],[73.698,19.166],[73.693,19.157],[73.689,19.149]]
];

const SCENARIO_CLUSTERS=[
  {coord:[73.646,19.194] as Coord,count:11,band:"watch"},
  {coord:[73.665,19.197] as Coord,count:42,band:"watch"},
  {coord:[73.705,19.198] as Coord,count:5,band:"low"},
  {coord:[73.722,19.180] as Coord,count:4,band:"low"},
  {coord:[73.734,19.163] as Coord,count:7,band:"watch"},
  {coord:[73.718,19.145] as Coord,count:3,band:"low"},
  {coord:[73.698,19.137] as Coord,count:9,band:"watch"},
  {coord:[73.673,19.139] as Coord,count:49,band:"watch"},
  {coord:[73.651,19.149] as Coord,count:2,band:"low"},
  {coord:[73.658,19.164] as Coord,count:12,band:"watch"},
  {coord:[73.686,19.167] as Coord,count:148,band:"critical"},
  {coord:[73.690,19.180] as Coord,count:23,band:"critical"},
  {coord:[73.704,19.165] as Coord,count:6,band:"watch"},
  {coord:[73.678,19.188] as Coord,count:5,band:"watch"},
  {coord:[73.711,19.187] as Coord,count:2,band:"low"},
  {coord:[73.681,19.149] as Coord,count:25,band:"watch"},
  {coord:[73.707,19.151] as Coord,count:4,band:"low"}
];

const BLOCKED_SEGMENT:Coord[]=[[73.707,19.152],[73.715,19.147],[73.721,19.143]];

function fc(features:any[]){return {type:"FeatureCollection",features} as any;}
function point(coord:Coord,properties:Record<string,unknown>={}){return {type:"Feature",properties,geometry:{type:"Point",coordinates:coord}} as any;}
function line(coords:Coord[],properties:Record<string,unknown>={}){return {type:"Feature",properties,geometry:{type:"LineString",coordinates:coords}} as any;}
function polygon(coords:Coord[],properties:Record<string,unknown>={}){return {type:"Feature",properties,geometry:{type:"Polygon",coordinates:[coords]}} as any;}

function centroid(coords:Coord[]):Coord{
  const pts=coords.slice(0,-1);
  const sum=pts.reduce((acc,p)=>[acc[0]+p[0],acc[1]+p[1]] as Coord,[0,0]);
  return [sum[0]/pts.length,sum[1]/pts.length];
}

function scalePolygon(coords:Coord[],factor:number):Coord[]{
  const c=centroid(coords);
  return coords.map(([x,y])=>[c[0]+(x-c[0])*factor,c[1]+(y-c[1])*factor]);
}

function circlePolygon(center:Coord,radiusKm:number,steps=96):Coord[]{
  const out:Coord[]=[];
  const cos=Math.cos(center[1]*Math.PI/180);
  for(let i=0;i<=steps;i++){
    const a=i/steps*Math.PI*2;
    out.push([
      center[0]+Math.cos(a)*radiusKm/(111.32*cos),
      center[1]+Math.sin(a)*radiusKm/111.32
    ]);
  }
  return out;
}

function pointAlong(coords:Coord[],progress:number):Coord{
  const p=Math.max(0,Math.min(.9999,progress));
  const lengths:number[]=[];
  let total=0;
  for(let i=0;i<coords.length-1;i++){
    const dx=coords[i+1][0]-coords[i][0];
    const dy=coords[i+1][1]-coords[i][1];
    const len=Math.sqrt(dx*dx+dy*dy);
    lengths.push(len);total+=len;
  }
  let target=total*p;
  for(let i=0;i<lengths.length;i++){
    if(target<=lengths[i]){
      const t=lengths[i]===0?0:target/lengths[i];
      return [coords[i][0]+(coords[i+1][0]-coords[i][0])*t,coords[i][1]+(coords[i+1][1]-coords[i][1])*t];
    }
    target-=lengths[i];
  }
  return coords[coords.length-1];
}

function polishOpenMap(map:any){
  const style=map.getStyle?.();
  const styleLayers=style?.layers??[];
  for(const layer of styleLayers){
    const id=String(layer.id||"");
    const key=id.toLowerCase();
    try{
      if(layer.type==="background")map.setPaintProperty(id,"background-color","#06100b");
      if(layer.type==="fill"){
        if(/water/.test(key))map.setPaintProperty(id,"fill-color","#061a20");
        else if(/wood|forest/.test(key))map.setPaintProperty(id,"fill-color","#102718");
        else if(/grass|park|landcover|scrub/.test(key))map.setPaintProperty(id,"fill-color","#172b1a");
        else if(/building|residential/.test(key))map.setPaintProperty(id,"fill-color","#111a15");
      }
      if(layer.type==="line"){
        if(/road|highway|transport/.test(key)){
          map.setPaintProperty(id,"line-color",/motorway|trunk|primary/.test(key)?"#8d8c45":"#566155");
          map.setPaintProperty(id,"line-opacity",.72);
        }else if(/boundary/.test(key)){
          map.setPaintProperty(id,"line-color","#a7b0a4");
          map.setPaintProperty(id,"line-opacity",.48);
        }else if(/river|waterway/.test(key)){
          map.setPaintProperty(id,"line-color","#173541");
        }
      }
      if(layer.type==="symbol"){
        map.setPaintProperty(id,"text-color",/city|town|village|place/.test(key)?"#b5bbb3":"#939c94");
        map.setPaintProperty(id,"text-halo-color","rgba(4,10,7,.92)");
        map.setPaintProperty(id,"text-halo-width",1.25);
      }
    }catch{}
  }
}

function safeVisibility(map:any,ids:string[],show:boolean){
  for(const id of ids){
    if(map.getLayer?.(id)){
      try{map.setLayoutProperty(id,"visibility",show?"visible":"none");}catch{}
    }
  }
}

export default function SafeShiftMap({sites,selected,onSelect,rain,roadFail,simMinute,playing}:Props){
  const node=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MLMap|null>(null);
  const [ready,setReady]=useState(false);
  const [baseError,setBaseError]=useState<string|null>(null);
  const [terrainStatus,setTerrainStatus]=useState<"loading"|"ready"|"unavailable">("loading");
  const [layers,setLayers]=useState<LayerState>({risk:true,flow:true,routes:true,clusters:true,terrain:true,sites:true});
  const [probe,setProbe]=useState<Probe>(null);

  const routeData=useMemo(()=>fc(Object.entries(ROUTES).map(([id,coords])=>line(coords,{id,blocked:roadFail&&id==="B"?1:0}))),[roadFail]);
  const siteData=useMemo(()=>fc(sites.map(s=>point(s.coord,{
    id:s.id,
    label:`${s.id} · ${s.name}`,
    score:s.score,
    capacity:functionalCapacity(s),
    bottleneck:bottleneck(s),
    selected:s.id===selected?1:0
  }))),[sites,selected]);

  useEffect(()=>{
    let disposed=false;
    let map:any;
    let fallbackTimer:number|undefined;
    let usingFallback=false;

    (async()=>{
      try{
        const ml=await import("maplibre-gl");
        if(disposed||!node.current)return;

        map=new ml.Map({
          container:node.current,
          style:OPENFREE_STYLE,
          center:[73.690,19.166],
          zoom:11.35,
          pitch:54,
          bearing:-11,
          antialias:true,
          maxPitch:78,
          minZoom:9.5,
          maxZoom:17.5,
          attributionControl:false
        });
        mapRef.current=map;
        map.addControl(new ml.NavigationControl({visualizePitch:true,showCompass:true,showZoom:true}),"bottom-right");
        map.addControl(new ml.AttributionControl({compact:true}),"bottom-left");

        const installLayers=()=>{
          if(disposed||!map)return;
          setBaseError(null);
          polishOpenMap(map);
          const firstSymbol=(map.getStyle()?.layers??[]).find((l:any)=>l.type==="symbol")?.id;

          try{
            if(!map.getSource("terrain-dem"))map.addSource("terrain-dem",{type:"raster-dem",url:TERRAIN_TILEJSON,tileSize:512,maxzoom:17,attribution:"Terrain © Mapterhorn"});
            if(!map.getSource("hillshade-dem"))map.addSource("hillshade-dem",{type:"raster-dem",url:TERRAIN_TILEJSON,tileSize:512,maxzoom:17,attribution:"Terrain © Mapterhorn"});
            if(!map.getLayer("ss-hillshade"))map.addLayer({
              id:"ss-hillshade",type:"hillshade",source:"hillshade-dem",
              paint:{
                "hillshade-shadow-color":"#020805",
                "hillshade-highlight-color":"#6e8a61",
                "hillshade-accent-color":"#29462f",
                "hillshade-illumination-direction":318,
                "hillshade-exaggeration":.56
              }
            },firstSymbol);
            map.setTerrain({source:"terrain-dem",exaggeration:1.28});
            setTerrainStatus("ready");
          }catch(error){
            console.warn("[SafeShift terrain]",error);
            setTerrainStatus("unavailable");
          }

          if(!map.getSource("analysis-radius")){
            map.addSource("analysis-radius",{type:"geojson",data:polygon(circlePolygon(MALIN,6.2),{kind:"analysis"})});
            map.addLayer({id:"analysis-fill",type:"fill",source:"analysis-radius",paint:{"fill-color":"#b9d84d","fill-opacity":.017}},firstSymbol);
            map.addLayer({id:"analysis-ring-glow",type:"line",source:"analysis-radius",paint:{"line-color":"#c8e45b","line-width":7,"line-opacity":.06,"line-blur":4}},firstSymbol);
            map.addLayer({id:"analysis-ring",type:"line",source:"analysis-radius",paint:{"line-color":"#cae85a","line-width":2.05,"line-opacity":.88,"line-dasharray":[2.4,2.1]}},firstSymbol);
          }

          if(!map.getSource("caution-zone")){
            map.addSource("caution-zone",{type:"geojson",data:polygon(cautionZone,{kind:"caution"})});
            map.addLayer({id:"caution-fill",type:"fill",source:"caution-zone",paint:{"fill-color":"#d5b94b","fill-opacity":.055}},firstSymbol);
            map.addLayer({id:"caution-line",type:"line",source:"caution-zone",paint:{"line-color":"#d8be54","line-width":1.65,"line-opacity":.68,"line-dasharray":[2,2]}},firstSymbol);
          }

          if(!map.getSource("risk-zone")){
            map.addSource("risk-zone",{type:"geojson",data:polygon(redZone,{kind:"extreme"})});
            map.addLayer({id:"risk-glow",type:"fill",source:"risk-zone",paint:{"fill-color":"#e85d50","fill-opacity":.07}},firstSymbol);
            map.addLayer({id:"risk-fill",type:"fill",source:"risk-zone",paint:{"fill-color":"#e66455","fill-opacity":.15}},firstSymbol);
            map.addLayer({id:"risk-line",type:"line",source:"risk-zone",paint:{"line-color":"#ff8067","line-width":2.25,"line-opacity":.92,"line-dasharray":[2,1.6]}},firstSymbol);
          }

          if(!map.getSource("runoff")){
            map.addSource("runoff",{type:"geojson",data:fc(RUNOFF.map((r,i)=>line(r,{i})))});
            map.addLayer({id:"runoff-glow",type:"line",source:"runoff",paint:{"line-color":"#58d9e9","line-width":8,"line-opacity":.055,"line-blur":5}},firstSymbol);
            map.addLayer({id:"runoff-lines",type:"line",source:"runoff",paint:{"line-color":"#71d8e0","line-width":1.35,"line-opacity":.48,"line-dasharray":[1,2.6]}},firstSymbol);
          }

          if(!map.getSource("routes")){
            map.addSource("routes",{type:"geojson",data:routeData});
            map.addLayer({id:"route-base",type:"line",source:"routes",paint:{"line-color":"#c5cdc0","line-width":2,"line-opacity":.42,"line-dasharray":[2,2]}});
            map.addLayer({id:"route-selected-glow",type:"line",source:"routes",filter:["==",["get","id"],selected],paint:{"line-color":"#cfe75c","line-width":9,"line-opacity":.10,"line-blur":4}});
            map.addLayer({id:"route-selected",type:"line",source:"routes",filter:["==",["get","id"],selected],paint:{"line-color":"#d4e868","line-width":2.8,"line-opacity":.96}});
            map.addLayer({id:"route-blocked",type:"line",source:"routes",filter:["==",["get","blocked"],1],paint:{"line-color":"#ff765e","line-width":7,"line-opacity":.82,"line-dasharray":[1,1]}});
          }

          if(!map.getSource("scenario-clusters")){
            map.addSource("scenario-clusters",{type:"geojson",data:fc(SCENARIO_CLUSTERS.map((c,i)=>point(c.coord,{...c,i})))});
            map.addLayer({id:"cluster-halo",type:"circle",source:"scenario-clusters",paint:{
              "circle-radius":["interpolate",["linear"],["get","count"],1,12,25,22,150,39],
              "circle-color":"#c7dc70",
              "circle-opacity":.08,
              "circle-blur":.25
            }});
            map.addLayer({id:"cluster-circles",type:"circle",source:"scenario-clusters",paint:{
              "circle-radius":["interpolate",["linear"],["get","count"],1,7,25,14,150,27],
              "circle-color":["match",["get","band"],"critical","#bdca67","watch","#9faf59","#75854d"],
              "circle-opacity":.88,
              "circle-stroke-color":"#d9e98b",
              "circle-stroke-opacity":.52,
              "circle-stroke-width":1.2
            }});
            map.addLayer({id:"cluster-counts",type:"symbol",source:"scenario-clusters",layout:{
              "text-field":["to-string",["get","count"]],
              "text-size":12,
              "text-font":["Noto Sans Bold"],
              "text-allow-overlap":true,
              "text-ignore-placement":true
            },paint:{"text-color":"#0d160d","text-halo-color":"rgba(218,232,142,.18)","text-halo-width":.5}});
          }

          if(!map.getSource("sites")){
            map.addSource("sites",{type:"geojson",data:siteData});
            map.addLayer({id:"site-halo",type:"circle",source:"sites",paint:{
              "circle-radius":["case",["==",["get","selected"],1],28,21],
              "circle-color":["case",["==",["get","selected"],1],"#d6ec68","#5bd4b3"],
              "circle-opacity":["case",["==",["get","selected"],1],.12,.065],
              "circle-stroke-color":["case",["==",["get","selected"],1],"#e5f48d","#7bd9c0"],
              "circle-stroke-width":["case",["==",["get","selected"],1],2.4,1.4]
            }});
            map.addLayer({id:"site-core",type:"circle",source:"sites",paint:{
              "circle-radius":["case",["==",["get","selected"],1],9,7],
              "circle-color":["case",["==",["get","selected"],1],"#d7e95e","#66cfb2"],
              "circle-stroke-color":"#07110d",
              "circle-stroke-width":2
            }});
            map.addLayer({id:"site-label",type:"symbol",source:"sites",layout:{
              "text-field":["concat","SITE ",["get","id"],"  ·  ",["get","label"],"\n",["to-string",["get","capacity"]]," ppl · bottleneck ",["get","bottleneck"]],
              "text-font":["Noto Sans Bold"],
              "text-size":11,
              "text-offset":[0,-2.4],
              "text-anchor":"bottom",
              "text-max-width":18,
              "text-allow-overlap":false
            },paint:{"text-color":"#e4eee4","text-halo-color":"rgba(3,10,6,.95)","text-halo-width":1.8}});
          }

          if(!map.getSource("malin")){
            map.addSource("malin",{type:"geojson",data:point(MALIN,{name:"MALIN",households:491})});
            map.addLayer({id:"malin-halo",type:"circle",source:"malin",paint:{"circle-radius":19,"circle-color":"#ff735d","circle-opacity":.11,"circle-stroke-color":"#ff8975","circle-stroke-width":2,"circle-stroke-opacity":.7}});
            map.addLayer({id:"malin-core",type:"circle",source:"malin",paint:{"circle-radius":6,"circle-color":"#ff7a62","circle-stroke-color":"#2a0c08","circle-stroke-width":2}});
            map.addLayer({id:"malin-label",type:"symbol",source:"malin",layout:{"text-field":"MALIN · 491 HH","text-font":["Noto Sans Bold"],"text-size":12,"text-offset":[0,2],"text-anchor":"top"},paint:{"text-color":"#fff1e8","text-halo-color":"#120705","text-halo-width":2}});
          }

          if(!map.getSource("motion")){
            map.addSource("motion",{type:"geojson",data:fc([])});
            map.addLayer({id:"motion-glow",type:"circle",source:"motion",paint:{
              "circle-radius":["match",["get","kind"],"convoy",10,7],
              "circle-color":["match",["get","kind"],"convoy","#d9eb62","#72d9e4"],
              "circle-opacity":.13,
              "circle-blur":.6
            }});
            map.addLayer({id:"motion-dots",type:"circle",source:"motion",paint:{
              "circle-radius":["match",["get","kind"],"convoy",4.7,3.4],
              "circle-color":["match",["get","kind"],"convoy","#ecf7a0","#b9f5f8"],
              "circle-stroke-color":["match",["get","kind"],"convoy","#8c9b35","#3299a3"],
              "circle-stroke-width":1
            }});
          }

          if(!map.getSource("blocked-segment")){
            map.addSource("blocked-segment",{type:"geojson",data:fc([])});
            map.addLayer({id:"blocked-segment-glow",type:"line",source:"blocked-segment",paint:{"line-color":"#ff644f","line-width":11,"line-opacity":.17,"line-blur":3}});
            map.addLayer({id:"blocked-segment",type:"line",source:"blocked-segment",paint:{"line-color":"#ff8a67","line-width":3,"line-opacity":.95,"line-dasharray":[1,1]}});
          }

          map.on("mouseenter","site-halo",()=>{map.getCanvas().style.cursor="pointer";});
          map.on("mouseleave","site-halo",()=>{map.getCanvas().style.cursor="";});
          map.on("click","site-halo",(event:any)=>{
            const id=String(event.features?.[0]?.properties?.id||"");
            if(id){
              onSelect(id);
              const found=sites.find(s=>s.id===id);
              if(found)map.easeTo({center:found.coord,zoom:12.8,pitch:58,bearing:-8,duration:900});
            }
          });

          map.on("click",(event:any)=>{
            try{
              const elevation=map.queryTerrainElevation?.(event.lngLat,{exaggerated:false});
              setProbe({lng:event.lngLat.lng,lat:event.lngLat.lat,elevation:typeof elevation==="number"?Math.round(elevation):null});
            }catch{
              setProbe({lng:event.lngLat.lng,lat:event.lngLat.lat,elevation:null});
            }
          });

          setReady(true);
        };

        map.on("style.load",installLayers);
        map.on("error",(event:any)=>{
          const message=String(event?.error?.message||event||"");
          if(/mapterhorn|terrain|raster-dem/i.test(message))setTerrainStatus("unavailable");
          console.warn("[SafeShift map]",message);
        });

        fallbackTimer=window.setTimeout(()=>{
          if(disposed||!map||map.isStyleLoaded?.()||usingFallback)return;
          usingFallback=true;
          console.warn("[SafeShift map] OpenFreeMap style timed out; switching to resilient OSM fallback");
          try{map.setStyle(FALLBACK_STYLE);}catch(error){setBaseError(error instanceof Error?error.message:"Basemap unavailable");}
        },12000);
      }catch(error){
        setBaseError(error instanceof Error?error.message:"Map initialization failed");
      }
    })();

    return()=>{
      disposed=true;
      if(fallbackTimer)window.clearTimeout(fallbackTimer);
      try{map?.remove();}catch{}
      mapRef.current=null;
    };
  },[]);

  useEffect(()=>{
    const map:any=mapRef.current;
    if(!ready||!map)return;

    const riskScale=1+rain*.0065;
    const riskSource=map.getSource("risk-zone");
    if(riskSource?.setData)riskSource.setData(polygon(scalePolygon(redZone,riskScale),{kind:"extreme",rain}));

    const routes=map.getSource("routes");
    if(routes?.setData)routes.setData(routeData);
    if(map.getLayer("route-selected-glow"))map.setFilter("route-selected-glow",["==",["get","id"],selected]);
    if(map.getLayer("route-selected"))map.setFilter("route-selected",["==",["get","id"],selected]);
    if(map.getLayer("route-blocked"))map.setFilter("route-blocked",["==",["get","blocked"],1]);

    const siteSource=map.getSource("sites");
    if(siteSource?.setData)siteSource.setData(siteData);

    const blocked=map.getSource("blocked-segment");
    if(blocked?.setData)blocked.setData(roadFail&&selected==="B"?fc([line(BLOCKED_SEGMENT,{blocked:1})]):fc([]));
  },[ready,rain,roadFail,selected,routeData,siteData]);

  useEffect(()=>{
    const map:any=mapRef.current;
    if(!ready||!map)return;
    const route=ROUTES[selected]??ROUTES.B;
    const progress=Math.max(0,Math.min(1,simMinute/60));
    const moving=[point(pointAlong(route,progress),{kind:"convoy"})];
    RUNOFF.forEach((r,i)=>{
      const p=(progress+i*.18)%1;
      moving.push(point(pointAlong(r,p),{kind:"runoff",i}));
      moving.push(point(pointAlong(r,(p+.08)%1),{kind:"runoff",i}));
    });
    const source=map.getSource("motion");
    if(source?.setData)source.setData(fc(moving));
    if(map.getLayer("motion-dots"))map.setPaintProperty("motion-dots","circle-opacity",playing?1:.76);
  },[ready,selected,simMinute,playing]);

  useEffect(()=>{
    const map:any=mapRef.current;
    if(!ready||!map)return;
    safeVisibility(map,["risk-glow","risk-fill","risk-line","caution-fill","caution-line"],layers.risk);
    safeVisibility(map,["runoff-glow","runoff-lines","motion-glow","motion-dots"],layers.flow);
    safeVisibility(map,["route-base","route-selected-glow","route-selected","route-blocked","blocked-segment-glow","blocked-segment"],layers.routes);
    safeVisibility(map,["cluster-halo","cluster-circles","cluster-counts"],layers.clusters);
    safeVisibility(map,["site-halo","site-core","site-label","malin-halo","malin-core","malin-label"],layers.sites);
    safeVisibility(map,["ss-hillshade"],layers.terrain);

    try{
      map.setTerrain(layers.terrain&&map.getSource("terrain-dem")?{source:"terrain-dem",exaggeration:1.28}:null);
      map.easeTo(layers.terrain?{pitch:54,bearing:-11,duration:650}:{pitch:0,bearing:0,duration:650});
    }catch{}
  },[ready,layers]);

  const toggle=(key:keyof LayerState)=>setLayers(v=>({...v,[key]:!v[key]}));

  return <div className="mapWrap">
    <div ref={node} className="mapNode"/>

    {!ready&&!baseError&&<div className="mapLoading"><span/><b>Loading high-detail terrain</b><small>OpenFreeMap vectors · Mapterhorn DEM · hillshade · live decision layers</small></div>}
    {baseError&&<div className="mapFallback"><b>Basemap unavailable</b><span>{baseError}</span><small>The decision model remains usable while the terrain provider recovers.</small></div>}

    {ready&&<div className={`terrainBadge ${terrainStatus==="unavailable"?"warn":""}`}><i/><span>{terrainStatus==="ready"&&layers.terrain?"3D DEM terrain active":"2D fallback terrain"}</span></div>}

    {ready&&<div className="mapLayerDock" aria-label="Map layers">
      <div className="mapLayerDockTitle"><Layers3/><span>Terrain</span></div>
      <button className={layers.terrain?"active":""} onClick={()=>toggle("terrain")}><Mountain/><span>3D relief</span></button>
      <button className={layers.clusters?"active":""} onClick={()=>toggle("clusters")}><Layers3/><span>Clusters</span></button>
      <button className={layers.risk?"active":""} onClick={()=>toggle("risk")}><MapPinned/><span>Risk</span></button>
      <button className={layers.routes?"active":""} onClick={()=>toggle("routes")}><Route/><span>Routes</span></button>
      <button className={layers.flow?"active":""} onClick={()=>toggle("flow")}><Activity/><span>Runoff</span></button>
    </div>}

    {ready&&<div style={{position:"absolute",left:14,bottom:44,zIndex:9,minWidth:190,padding:"9px 11px",border:"1px solid rgba(177,210,117,.24)",borderRadius:10,background:"rgba(4,12,8,.88)",backdropFilter:"blur(14px)",boxShadow:"0 12px 28px rgba(0,0,0,.28)",pointerEvents:"none"}}>
      <div style={{fontSize:9,fontWeight:800,letterSpacing:".09em",color:"#a5bc73"}}>TERRAIN PROBE · DEM</div>
      {probe?<div style={{marginTop:4,display:"flex",alignItems:"baseline",gap:7}}><b style={{fontSize:17,color:"#eef6df"}}>{probe.elevation===null?"—":`${probe.elevation} m`}</b><span style={{fontSize:9,color:"#849487"}}>{probe.lat.toFixed(4)}, {probe.lng.toFixed(4)}</span></div>:<div style={{marginTop:4,fontSize:10,color:"#8b9b8d"}}>Click terrain to inspect elevation</div>}
      <div style={{marginTop:3,fontSize:9,color:"#657468"}}>Scenario clusters are illustrative · terrain is streamed elevation data</div>
    </div>}
  </div>;
}
