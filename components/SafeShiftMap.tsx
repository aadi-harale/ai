"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import type {Map as MLMap,Marker as MLMarker} from "maplibre-gl";
import {Layers3,MapPinned,Mountain,Route,Waveform} from "lucide-react";
import {MALIN,cautionZone,redZone,type Site} from "../lib/data";

type RankedSite=Site&{score:number;regret:number;future:number};
type Coord=[number,number];
type LayerState={risk:boolean;flow:boolean;routes:boolean;clusters:boolean;terrain:boolean};

type Props={
  sites:RankedSite[];
  selected:string;
  onSelect:(id:string)=>void;
  rain:number;
  roadFail:boolean;
  simMinute:number;
  playing:boolean;
};

const BASE_STYLE:any={
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
  layers:[{
    id:"osm",type:"raster",source:"osm",
    paint:{
      "raster-saturation":-.74,
      "raster-hue-rotate":10,
      "raster-brightness-min":.07,
      "raster-brightness-max":.43,
      "raster-contrast":.22,
      "raster-opacity":.98
    }
  }]
};

const TERRAIN_TILES=["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"];

const ROUTES:Record<string,Coord[]>={
  A:[MALIN,[73.681,19.169],[73.670,19.179],[73.660,19.184],[73.6500,19.1870]],
  B:[MALIN,[73.699,19.158],[73.710,19.150],[73.721,19.143],[73.7300,19.1360]],
  C:[MALIN,[73.698,19.169],[73.706,19.178],[73.715,19.186],[73.7220,19.1920]]
};

const RUNOFF:Coord[][]=[
  [[73.676,19.187],[73.681,19.178],[73.685,19.169],MALIN,[73.692,19.151]],
  [[73.687,19.190],[73.689,19.180],[73.691,19.171],MALIN,[73.697,19.151]],
  [[73.699,19.184],[73.697,19.176],[73.694,19.168],MALIN,[73.687,19.149]]
];

const CLUSTERS=[
  {name:"Upper-slope",homes:58,risk:96,coord:[73.6857,19.1699] as Coord},
  {name:"Central",homes:80,risk:88,coord:[73.6902,19.1632] as Coord},
  {name:"Lower valley",homes:103,risk:62,coord:[73.6938,19.1569] as Coord},
  {name:"Agricultural",homes:121,risk:38,coord:[73.6797,19.1588] as Coord},
  {name:"Peripheral",homes:129,risk:24,coord:[73.6784,19.1718] as Coord}
];

const BLOCKED_SEGMENT:Coord[]=[[73.707,19.152],[73.715,19.147],[73.721,19.143]];

function featureCollection(features:any[]){return {type:"FeatureCollection",features} as any;}
function lineFeature(coords:Coord[],props:Record<string,unknown>={}){return {type:"Feature",properties:props,geometry:{type:"LineString",coordinates:coords}} as any;}
function pointFeature(coord:Coord,props:Record<string,unknown>={}){return {type:"Feature",properties:props,geometry:{type:"Point",coordinates:coord}} as any;}
function polygonFeature(coords:Coord[],props:Record<string,unknown>={}){return {type:"Feature",properties:props,geometry:{type:"Polygon",coordinates:[coords]}} as any;}

function centroid(coords:Coord[]):Coord{
  const pts=coords.slice(0,-1);
  const sum=pts.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]] as Coord,[0,0]);
  return [sum[0]/pts.length,sum[1]/pts.length];
}

function scalePolygon(coords:Coord[],factor:number):Coord[]{
  const c=centroid(coords);
  return coords.map(([x,y])=>[c[0]+(x-c[0])*factor,c[1]+(y-c[1])*factor]);
}

function circlePolygon(center:Coord,radiusKm:number,points=72):Coord[]{
  const out:Coord[]=[];
  const latRad=center[1]*Math.PI/180;
  for(let i=0;i<=points;i++){
    const a=(i/points)*Math.PI*2;
    const dy=(radiusKm/111.32)*Math.sin(a);
    const dx=(radiusKm/(111.32*Math.cos(latRad)))*Math.cos(a);
    out.push([center[0]+dx,center[1]+dy]);
  }
  return out;
}

function pointAlong(line:Coord[],progress:number):Coord{
  const p=Math.max(0,Math.min(.9999,progress));
  const lengths:number[]=[];let total=0;
  for(let i=0;i<line.length-1;i++){
    const dx=line[i+1][0]-line[i][0],dy=line[i+1][1]-line[i][1];
    const len=Math.sqrt(dx*dx+dy*dy);lengths.push(len);total+=len;
  }
  let target=total*p;
  for(let i=0;i<lengths.length;i++){
    if(target<=lengths[i]){
      const t=lengths[i]===0?0:target/lengths[i];
      return [line[i][0]+(line[i+1][0]-line[i][0])*t,line[i][1]+(line[i+1][1]-line[i][1])*t];
    }
    target-=lengths[i];
  }
  return line[line.length-1];
}

function lineToProgress(line:Coord[],progress:number):Coord[]{
  const p=Math.max(0,Math.min(1,progress));
  if(p<=0)return [line[0],line[0]];
  if(p>=1)return line;
  const lengths:number[]=[];let total=0;
  for(let i=0;i<line.length-1;i++){
    const dx=line[i+1][0]-line[i][0],dy=line[i+1][1]-line[i][1];
    const len=Math.sqrt(dx*dx+dy*dy);lengths.push(len);total+=len;
  }
  const target=total*p;let walked=0;const out:Coord[]=[line[0]];
  for(let i=0;i<lengths.length;i++){
    if(walked+lengths[i]<target){out.push(line[i+1]);walked+=lengths[i];continue;}
    const t=lengths[i]===0?0:(target-walked)/lengths[i];
    out.push([line[i][0]+(line[i+1][0]-line[i][0])*t,line[i][1]+(line[i+1][1]-line[i][1])*t]);
    break;
  }
  return out.length>1?out:[line[0],line[0]];
}

export default function SafeShiftMap({sites,selected,onSelect,rain,roadFail,simMinute,playing}:Props){
  const node=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MLMap|null>(null);
  const markers=useRef<MLMarker[]>([]);
  const villageMarker=useRef<MLMarker|null>(null);
  const clusterMarkers=useRef<MLMarker[]>([]);
  const [ready,setReady]=useState(false);
  const [baseError,setBaseError]=useState<string|null>(null);
  const [terrainStatus,setTerrainStatus]=useState<"loading"|"ready"|"unavailable">("loading");
  const [layers,setLayers]=useState<LayerState>({risk:true,flow:true,routes:true,clusters:true,terrain:true});

  const routeData=useMemo(()=>featureCollection(Object.entries(ROUTES).map(([id,coords])=>lineFeature(coords,{id,blocked:roadFail&&id==="B"?1:0}))),[roadFail]);

  useEffect(()=>{
    let disposed=false;
    let map:MLMap|undefined;
    let startupTimer:number|undefined;

    (async()=>{
      try{
        const ml=await import("maplibre-gl");
        if(disposed||!node.current)return;

        map=new ml.Map({
          container:node.current,
          style:BASE_STYLE,
          center:MALIN,
          zoom:12.15,
          pitch:62,
          bearing:-18,
          attributionControl:false,
          maxPitch:80
        });
        mapRef.current=map;
        map.addControl(new ml.NavigationControl({visualizePitch:true}),"bottom-right");
        map.addControl(new ml.AttributionControl({compact:true}),"bottom-left");

        startupTimer=window.setTimeout(()=>{
          if(!disposed&&!map?.isStyleLoaded())setBaseError("Basemap initialization is taking unusually long.");
        },12000);

        map.on("style.load",()=>{
          if(!map||disposed)return;
          if(startupTimer)window.clearTimeout(startupTimer);

          try{
            map.addSource("terrain-dem",{type:"raster-dem",tiles:TERRAIN_TILES,encoding:"terrarium",tileSize:512,maxzoom:17,attribution:"© Mapterhorn"} as any);
            map.addSource("hillshade-dem",{type:"raster-dem",tiles:TERRAIN_TILES,encoding:"terrarium",tileSize:512,maxzoom:17,attribution:"© Mapterhorn"} as any);
            map.addLayer({id:"hillshade",type:"hillshade",source:"hillshade-dem",paint:{"hillshade-shadow-color":"#06100d","hillshade-highlight-color":"#d8f3e9","hillshade-accent-color":"#2b6652","hillshade-exaggeration":.42}} as any);
            map.setTerrain({source:"terrain-dem",exaggeration:1.58});
            setTerrainStatus("ready");
          }catch(e){console.warn("[SafeShift terrain]",e);setTerrainStatus("unavailable");}

          try{
            map.addSource("analysis-radius",{type:"geojson",data:polygonFeature(circlePolygon(MALIN,3.2))} as any);
            map.addLayer({id:"analysisRadiusFill",type:"fill",source:"analysis-radius",paint:{"fill-color":"#7fd8c0","fill-opacity":.025}} as any);
            map.addLayer({id:"analysisRadiusLine",type:"line",source:"analysis-radius",paint:{"line-color":"#8edac7","line-opacity":.34,"line-width":1.4,"line-dasharray":[4,4]}} as any);

            map.addSource("caution",{type:"geojson",data:polygonFeature(cautionZone)} as any);
            map.addLayer({id:"cautionFill",type:"fill",source:"caution",paint:{"fill-color":"#f1ba69","fill-opacity":.09}} as any);
            map.addLayer({id:"cautionLine",type:"line",source:"caution",paint:{"line-color":"#f1ba69","line-opacity":.62,"line-width":1.7,"line-dasharray":[3,2]}} as any);

            map.addSource("risk-contours",{type:"geojson",data:featureCollection([
              polygonFeature(scalePolygon(redZone,1.18),{level:1}),
              polygonFeature(scalePolygon(redZone,1.0),{level:2}),
              polygonFeature(scalePolygon(redZone,.78),{level:3})
            ])} as any);
            map.addLayer({id:"riskContours",type:"line",source:"risk-contours",paint:{
              "line-color":["match",["get","level"],1,"#dca866",2,"#ff7d72","#ff565d"],
              "line-width":["match",["get","level"],1,1.3,2,2.0,2.8],
              "line-opacity":["match",["get","level"],1,.34,2,.58,.9]
            }} as any);

            map.addSource("redzone",{type:"geojson",data:polygonFeature(redZone)} as any);
            map.addLayer({id:"redGlow",type:"fill",source:"redzone",paint:{"fill-color":"#ff6667","fill-opacity":.10}} as any);
            map.addLayer({id:"redFill",type:"fill",source:"redzone",paint:{"fill-color":"#ff6667","fill-opacity":.21,"fill-outline-color":"#ff8b87"}} as any);
            map.addLayer({id:"redLine",type:"line",source:"redzone",paint:{"line-color":"#ff7774","line-opacity":.98,"line-width":2.8}} as any);

            map.addSource("runoff-lines",{type:"geojson",data:featureCollection(RUNOFF.map((r,i)=>lineFeature(r,{id:i})))} as any);
            map.addLayer({id:"runoffGlow",type:"line",source:"runoff-lines",paint:{"line-color":"#5ee1ff","line-width":9,"line-opacity":.09,"line-blur":6}} as any);
            map.addLayer({id:"runoffLine",type:"line",source:"runoff-lines",paint:{"line-color":"#71dfff","line-width":2.0,"line-opacity":.52,"line-dasharray":[1.5,2.5]}} as any);

            map.addSource("routes",{type:"geojson",data:routeData} as any);
            map.addLayer({id:"routeBase",type:"line",source:"routes",paint:{"line-color":"#97afa7","line-width":2.5,"line-opacity":.26,"line-dasharray":[2,2]}} as any);
            map.addLayer({id:"routeSelected",type:"line",source:"routes",filter:["==",["get","id"],selected],paint:{"line-color":"#6be0c3","line-width":6.4,"line-opacity":.35,"line-blur":2}} as any);
            map.addLayer({id:"routeSelectedCore",type:"line",source:"routes",filter:["==",["get","id"],selected],paint:{"line-color":"#d9fff5","line-width":1.8,"line-opacity":.92}} as any);
            map.addLayer({id:"routeBlocked",type:"line",source:"routes",filter:["==",["get","blocked"],1],paint:{"line-color":"#ff8b68","line-width":7,"line-opacity":.92,"line-dasharray":[1,1]}} as any);

            map.addSource("route-progress",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"routeProgressGlow",type:"line",source:"route-progress",paint:{"line-color":"#b9f27c","line-width":11,"line-opacity":.14,"line-blur":5}} as any);
            map.addLayer({id:"routeProgress",type:"line",source:"route-progress",paint:{"line-color":"#cfff99","line-width":3.5,"line-opacity":.96}} as any);

            map.addSource("site-rings",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"siteRing",type:"circle",source:"site-rings",paint:{"circle-radius":["interpolate",["linear"],["get","score"],50,17,100,31],"circle-color":"#65d9bc","circle-opacity":.07,"circle-stroke-color":"#72dec3","circle-stroke-width":1.5,"circle-stroke-opacity":.48}} as any);
            map.addLayer({id:"selectedHalo",type:"circle",source:"site-rings",filter:["==",["get","selected"],1],paint:{"circle-radius":39,"circle-color":"#b9f27c","circle-opacity":.065,"circle-stroke-color":"#b9f27c","circle-stroke-width":2,"circle-stroke-opacity":.76}} as any);

            map.addSource("moving-runoff",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"runoffDotsGlow",type:"circle",source:"moving-runoff",paint:{"circle-radius":10,"circle-color":"#54dfff","circle-opacity":.12,"circle-blur":.7}} as any);
            map.addLayer({id:"runoffDots",type:"circle",source:"moving-runoff",paint:{"circle-radius":4.3,"circle-color":"#c2f6ff","circle-opacity":.96,"circle-stroke-color":"#2ebee4","circle-stroke-width":1.1}} as any);

            map.addSource("convoy",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"convoyGlow",type:"circle",source:"convoy",paint:{"circle-radius":11,"circle-color":"#b9f27c","circle-opacity":.15,"circle-blur":.5}} as any);
            map.addLayer({id:"convoyDots",type:"circle",source:"convoy",paint:{"circle-radius":5.2,"circle-color":"#f0ffd9","circle-stroke-color":"#85bc60","circle-stroke-width":1.4}} as any);

            map.addSource("blocked-road",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"blockedRoadLine",type:"line",source:"blocked-road",paint:{"line-color":"#ff795f","line-width":9,"line-opacity":.84,"line-blur":1}} as any);
            map.addLayer({id:"blockedRoadCore",type:"line",source:"blocked-road",paint:{"line-color":"#ffcf7a","line-width":2.2,"line-opacity":.98,"line-dasharray":[1,1]}} as any);

            const village=document.createElement("div");
            village.className="malinMarker";
            village.innerHTML="<i></i><span><b>Malin</b><small>491 households · red-zone origin</small></span>";
            villageMarker.current=new ml.Marker({element:village,anchor:"center"}).setLngLat(MALIN).addTo(map);

            CLUSTERS.forEach(c=>{
              const el=document.createElement("div");
              el.className=`clusterMapMarker ${c.risk>=85?"critical":c.risk>=55?"watch":"safe"}`;
              el.innerHTML=`<i>${c.homes}</i><span><b>${c.name}</b><small>${c.risk}/100 risk · schematic</small></span>`;
              clusterMarkers.current.push(new ml.Marker({element:el,anchor:"center"}).setLngLat(c.coord).addTo(map!));
            });

            setReady(true);
            setBaseError(null);
          }catch(e){console.error("[SafeShift overlays]",e);setReady(true);}
        });

        map.on("error",(event:any)=>{
          const message=String(event?.error?.message||event||"");
          console.warn("[SafeShift map]",message);
          if(/mapterhorn|terrain|raster-dem|webp/i.test(message))setTerrainStatus("unavailable");
        });
      }catch(e){setBaseError(e instanceof Error?e.message:"Map initialization failed");}
    })();

    return()=>{
      disposed=true;
      if(startupTimer)window.clearTimeout(startupTimer);
      markers.current.forEach(m=>m.remove());
      clusterMarkers.current.forEach(m=>m.remove());
      markers.current=[];
      clusterMarkers.current=[];
      villageMarker.current?.remove();
      villageMarker.current=null;
      map?.remove();
      mapRef.current=null;
    };
  // map is constructed once; live state is synchronized below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    const src=map.getSource("routes") as any;src?.setData(routeData);
    if(map.getLayer("routeSelected"))map.setFilter("routeSelected",["==",["get","id"],selected] as any);
    if(map.getLayer("routeSelectedCore"))map.setFilter("routeSelectedCore",["==",["get","id"],selected] as any);
    const blocked=map.getSource("blocked-road") as any;
    blocked?.setData(roadFail?featureCollection([lineFeature(BLOCKED_SEGMENT,{blocked:1})]):featureCollection([]));
  },[ready,routeData,selected,roadFail]);

  useEffect(()=>{
    if(!ready||!mapRef.current)return;
    let cancelled=false;
    (async()=>{
      const ml=await import("maplibre-gl");
      if(cancelled||!mapRef.current)return;
      markers.current.forEach(m=>m.remove());markers.current=[];
      sites.forEach(s=>{
        const el=document.createElement("button");
        el.type="button";el.className=`siteMarker ${selected===s.id?"selected":""}`;
        el.innerHTML=`<i>${s.id}</i><span><b>${s.name}</b><small>${s.score}/100 · capacity ${Math.min(...Object.values(s.capacity))}</small></span>`;
        el.onclick=()=>onSelect(s.id);
        markers.current.push(new ml.Marker({element:el,anchor:"center"}).setLngLat(s.coord).addTo(mapRef.current!));
      });
      (mapRef.current.getSource("site-rings") as any)?.setData(featureCollection(sites.map(s=>pointFeature(s.coord,{id:s.id,score:s.score,selected:s.id===selected?1:0}))));
    })();
    return()=>{cancelled=true};
  },[ready,sites,selected,onSelect]);

  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    const pulse=Math.sin(simMinute*.55)*.5+.5;
    const expansion=1+(rain/40)*(.03+.06*(simMinute/60))+.014*pulse;
    const cautionExpansion=1+(rain/40)*.04+.009*pulse;
    const expandedRed=scalePolygon(redZone,expansion);

    (map.getSource("redzone") as any)?.setData(polygonFeature(expandedRed));
    (map.getSource("caution") as any)?.setData(polygonFeature(scalePolygon(cautionZone,cautionExpansion)));
    (map.getSource("risk-contours") as any)?.setData(featureCollection([
      polygonFeature(scalePolygon(expandedRed,1.2),{level:1}),
      polygonFeature(expandedRed,{level:2}),
      polygonFeature(scalePolygon(expandedRed,.78),{level:3})
    ]));

    if(map.getLayer("redFill"))map.setPaintProperty("redFill","fill-opacity",.16+.17*(rain/40)+.07*pulse);
    if(map.getLayer("redLine"))map.setPaintProperty("redLine","line-width",2.4+2.2*pulse);
    if(map.getLayer("runoffLine"))map.setPaintProperty("runoffLine","line-opacity",.22+.62*(rain/40));

    const runoffPoints=RUNOFF.flatMap((path,i)=>{
      const speed=.017+.016*(rain/40);
      return [0,.22,.44,.66,.82].map((offset,j)=>pointFeature(pointAlong(path,(simMinute*speed+offset+i*.11)%1),{path:i,dot:j}));
    });
    (map.getSource("moving-runoff") as any)?.setData(featureCollection(runoffPoints));

    const route=ROUTES[selected]??ROUTES.B;
    const raw=Math.max(0,Math.min(1,simMinute/60));
    const stopped=roadFail&&selected==="B";
    const lead=stopped?Math.min(raw,.47):raw;
    const convoy=[0,.055,.11,.165].map((lag,i)=>pointFeature(pointAlong(route,Math.max(0,lead-lag)),{i}));
    (map.getSource("convoy") as any)?.setData(featureCollection(convoy));
    (map.getSource("route-progress") as any)?.setData(featureCollection([lineFeature(lineToProgress(route,lead),{progress:lead})]));

    if(playing&&simMinute%15===0){
      const destination=sites.find(s=>s.id===selected)?.coord;
      if(destination){
        const mid:Coord=[(MALIN[0]+destination[0])/2,(MALIN[1]+destination[1])/2];
        map.easeTo({center:mid,zoom:12.08,pitch:65,bearing:-18+Math.sin(simMinute/9)*6,duration:620});
      }
    }
  },[ready,rain,roadFail,simMinute,playing,selected,sites]);

  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    const dest=sites.find(s=>s.id===selected)?.coord;if(!dest)return;
    const mid:Coord=[(MALIN[0]+dest[0])/2,(MALIN[1]+dest[1])/2];
    map.easeTo({center:mid,zoom:12.15,pitch:63,bearing:-18,duration:650});
  },[selected,ready,sites]);

  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    const visibility=(on:boolean)=>on?"visible":"none";
    ["redGlow","redFill","redLine","riskContours","cautionFill","cautionLine"].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,"visibility",visibility(layers.risk)));
    ["runoffGlow","runoffLine","runoffDotsGlow","runoffDots"].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,"visibility",visibility(layers.flow)));
    ["routeBase","routeSelected","routeSelectedCore","routeBlocked","routeProgressGlow","routeProgress","convoyGlow","convoyDots","blockedRoadLine","blockedRoadCore"].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,"visibility",visibility(layers.routes)));
    clusterMarkers.current.forEach(m=>m.getElement().style.display=layers.clusters?"flex":"none");
    if(map.getSource("terrain-dem")){
      try{map.setTerrain(layers.terrain?{source:"terrain-dem",exaggeration:1.58}:null)}catch{}
    }
    if(map.getLayer("hillshade"))map.setLayoutProperty("hillshade","visibility",visibility(layers.terrain));
  },[ready,layers]);

  return <div className="mapWrap">
    <div ref={node} className="mapNode"/>

    {!ready&&!baseError&&<div className="mapLoading"><span/><b>Loading decision terrain</b><small>Cartographic basemap · 3D elevation · live planning layers</small></div>}
    {baseError&&<div className="mapFallback"><b>Basemap unavailable</b><span>{baseError}</span><small>The decision simulation remains usable.</small></div>}

    {ready&&<div className={`terrainBadge ${terrainStatus==="unavailable"?"warn":""}`}><i/><span>{terrainStatus==="ready"&&layers.terrain?"3D terrain active":"2D terrain mode"}</span></div>}

    {ready&&<div className="mapLayerDock" aria-label="Map layers">
      <div className="mapLayerDockTitle"><Layers3/><span>Map layers</span></div>
      <button className={layers.risk?"active":""} onClick={()=>setLayers(v=>({...v,risk:!v.risk}))}><MapPinned/><span>Risk</span></button>
      <button className={layers.flow?"active":""} onClick={()=>setLayers(v=>({...v,flow:!v.flow}))}><Waveform/><span>Runoff</span></button>
      <button className={layers.routes?"active":""} onClick={()=>setLayers(v=>({...v,routes:!v.routes}))}><Route/><span>Routes</span></button>
      <button className={layers.clusters?"active":""} onClick={()=>setLayers(v=>({...v,clusters:!v.clusters}))}><MapPinned/><span>Homes</span></button>
      <button className={layers.terrain?"active":""} onClick={()=>setLayers(v=>({...v,terrain:!v.terrain}))}><Mountain/><span>3D</span></button>
    </div>}

    {ready&&<div className="mapLegendPro">
      <span><i className="lgRadius"/>analysis radius</span>
      <span><i className="lgRisk"/>dynamic risk</span>
      <span><i className="lgFlow"/>runoff flow</span>
      <span><i className="lgRoute"/>relocation progress</span>
      {roadFail&&<span><i className="lgBlocked"/>road failure</span>}
      <small>Household markers and relocation corridors are schematic planning layers; terrain/basemap are geographic context.</small>
    </div>}
  </div>;
}
