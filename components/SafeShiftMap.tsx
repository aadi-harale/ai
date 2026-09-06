"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import type {Map as MLMap,Marker as MLMarker} from "maplibre-gl";
import {MALIN,cautionZone,redZone,type Site} from "../lib/data";

type RankedSite=Site&{score:number;regret:number;future:number};
type Coord=[number,number];

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
      "raster-saturation":-.72,
      "raster-brightness-min":.08,
      "raster-brightness-max":.46,
      "raster-contrast":.18,
      "raster-opacity":.96
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

export default function SafeShiftMap({sites,selected,onSelect,rain,roadFail,simMinute,playing}:Props){
  const node=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MLMap|null>(null);
  const markers=useRef<MLMarker[]>([]);
  const villageMarker=useRef<MLMarker|null>(null);
  const [ready,setReady]=useState(false);
  const [baseError,setBaseError]=useState<string|null>(null);
  const [terrainStatus,setTerrainStatus]=useState<"loading"|"ready"|"unavailable">("loading");

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
            map.addSource("terrain-dem",{type:"raster-dem",tiles:TERRAIN_TILES,encoding:"terrarium",tileSize:512,maxzoom:17,attribution:"© Mapterhorn"});
            map.addSource("hillshade-dem",{type:"raster-dem",tiles:TERRAIN_TILES,encoding:"terrarium",tileSize:512,maxzoom:17,attribution:"© Mapterhorn"});
            map.addLayer({id:"hillshade",type:"hillshade",source:"hillshade-dem",paint:{"hillshade-shadow-color":"#06100d","hillshade-highlight-color":"#cdeee4","hillshade-accent-color":"#285b4a","hillshade-exaggeration":.38}} as any);
            map.setTerrain({source:"terrain-dem",exaggeration:1.55});
            setTerrainStatus("ready");
          }catch(e){console.warn("[SafeShift terrain]",e);setTerrainStatus("unavailable");}

          try{
            map.addSource("caution",{type:"geojson",data:polygonFeature(cautionZone)} as any);
            map.addLayer({id:"cautionFill",type:"fill",source:"caution",paint:{"fill-color":"#f1ba69","fill-opacity":.10}} as any);
            map.addLayer({id:"cautionLine",type:"line",source:"caution",paint:{"line-color":"#f1ba69","line-opacity":.58,"line-width":1.5,"line-dasharray":[3,2]}} as any);

            map.addSource("redzone",{type:"geojson",data:polygonFeature(redZone)} as any);
            map.addLayer({id:"redGlow",type:"fill",source:"redzone",paint:{"fill-color":"#ff6667","fill-opacity":.10}} as any);
            map.addLayer({id:"redFill",type:"fill",source:"redzone",paint:{"fill-color":"#ff6667","fill-opacity":.22,"fill-outline-color":"#ff8b87"}} as any);
            map.addLayer({id:"redLine",type:"line",source:"redzone",paint:{"line-color":"#ff7774","line-opacity":.96,"line-width":2.7}} as any);

            map.addSource("runoff-lines",{type:"geojson",data:featureCollection(RUNOFF.map((r,i)=>lineFeature(r,{id:i})))} as any);
            map.addLayer({id:"runoffGlow",type:"line",source:"runoff-lines",paint:{"line-color":"#5ee1ff","line-width":8,"line-opacity":.10,"line-blur":6}} as any);
            map.addLayer({id:"runoffLine",type:"line",source:"runoff-lines",paint:{"line-color":"#71dfff","line-width":1.8,"line-opacity":.52,"line-dasharray":[1.5,2.5]}} as any);

            map.addSource("routes",{type:"geojson",data:routeData} as any);
            map.addLayer({id:"routeBase",type:"line",source:"routes",paint:{"line-color":"#8ba79d","line-width":2.2,"line-opacity":.28,"line-dasharray":[2,2]}} as any);
            map.addLayer({id:"routeSelected",type:"line",source:"routes",filter:["==",["get","id"],selected],paint:{"line-color":"#6be0c3","line-width":5.2,"line-opacity":.92,"line-blur":.15}} as any);
            map.addLayer({id:"routeSelectedCore",type:"line",source:"routes",filter:["==",["get","id"],selected],paint:{"line-color":"#d9fff5","line-width":1.4,"line-opacity":.95}} as any);
            map.addLayer({id:"routeBlocked",type:"line",source:"routes",filter:["==",["get","blocked"],1],paint:{"line-color":"#ff8b68","line-width":6,"line-opacity":.92,"line-dasharray":[1,1]}} as any);

            map.addSource("site-rings",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"siteRing",type:"circle",source:"site-rings",paint:{"circle-radius":["interpolate",["linear"],["get","score"],50,15,100,28],"circle-color":"#65d9bc","circle-opacity":.09,"circle-stroke-color":"#72dec3","circle-stroke-width":1.5,"circle-stroke-opacity":.45}} as any);
            map.addLayer({id:"selectedHalo",type:"circle",source:"site-rings",filter:["==",["get","selected"],1],paint:{"circle-radius":35,"circle-color":"#b9f27c","circle-opacity":.07,"circle-stroke-color":"#b9f27c","circle-stroke-width":2,"circle-stroke-opacity":.7}} as any);

            map.addSource("moving-runoff",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"runoffDotsGlow",type:"circle",source:"moving-runoff",paint:{"circle-radius":9,"circle-color":"#54dfff","circle-opacity":.12,"circle-blur":.7}} as any);
            map.addLayer({id:"runoffDots",type:"circle",source:"moving-runoff",paint:{"circle-radius":4,"circle-color":"#b9f3ff","circle-opacity":.94,"circle-stroke-color":"#2ebee4","circle-stroke-width":1}} as any);

            map.addSource("convoy",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"convoyGlow",type:"circle",source:"convoy",paint:{"circle-radius":10,"circle-color":"#b9f27c","circle-opacity":.14,"circle-blur":.5}} as any);
            map.addLayer({id:"convoyDots",type:"circle",source:"convoy",paint:{"circle-radius":4.6,"circle-color":"#e9ffd0","circle-stroke-color":"#7fb55c","circle-stroke-width":1.3}} as any);

            map.addSource("blocked-road",{type:"geojson",data:featureCollection([])} as any);
            map.addLayer({id:"blockedRoadLine",type:"line",source:"blocked-road",paint:{"line-color":"#ff795f","line-width":8,"line-opacity":.85,"line-blur":1}} as any);
            map.addLayer({id:"blockedRoadCore",type:"line",source:"blocked-road",paint:{"line-color":"#ffcf7a","line-width":2,"line-opacity":.95,"line-dasharray":[1,1]}} as any);

            const village=document.createElement("div");
            village.className="malinMarker";
            village.innerHTML="<i></i><span><b>Malin</b><small>491 households · red-zone origin</small></span>";
            villageMarker.current=new ml.Marker({element:village,anchor:"center"}).setLngLat(MALIN).addTo(map);

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
      markers.current=[];
      villageMarker.current?.remove();
      villageMarker.current=null;
      map?.remove();
      mapRef.current=null;
    };
  // data layers are synchronized in later effects
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
    const expansion=1+(rain/40)*(.025+.055*(simMinute/60))+.012*pulse;
    const cautionExpansion=1+(rain/40)*.035+.008*pulse;
    (map.getSource("redzone") as any)?.setData(polygonFeature(scalePolygon(redZone,expansion)));
    (map.getSource("caution") as any)?.setData(polygonFeature(scalePolygon(cautionZone,cautionExpansion)));
    if(map.getLayer("redFill"))map.setPaintProperty("redFill","fill-opacity",.17+.16*(rain/40)+.07*pulse);
    if(map.getLayer("redLine"))map.setPaintProperty("redLine","line-width",2.3+2.0*pulse);
    if(map.getLayer("runoffLine"))map.setPaintProperty("runoffLine","line-opacity",.25+.58*(rain/40));

    const runoffPoints=RUNOFF.flatMap((path,i)=>{
      const speed=.018+.012*(rain/40);
      return [0,.34,.68].map((offset,j)=>pointFeature(pointAlong(path,(simMinute*speed+offset+i*.13)%1),{path:i,dot:j}));
    });
    (map.getSource("moving-runoff") as any)?.setData(featureCollection(runoffPoints));

    const route=ROUTES[selected]??ROUTES.B;
    const raw=simMinute/60;
    const stopped=roadFail&&selected==="B";
    const lead=stopped?Math.min(raw,.47):raw;
    const convoy=[0,.08,.16].map((lag,i)=>pointFeature(pointAlong(route,Math.max(0,lead-lag)),{i}));
    (map.getSource("convoy") as any)?.setData(featureCollection(convoy));

    if(playing&&simMinute%12===0){
      const destination=sites.find(s=>s.id===selected)?.coord;
      if(destination){
        const mid:Coord=[(MALIN[0]+destination[0])/2,(MALIN[1]+destination[1])/2];
        map.easeTo({center:mid,zoom:12.05,pitch:64,bearing:-18+Math.sin(simMinute/10)*5,duration:550});
      }
    }
  },[ready,rain,roadFail,simMinute,playing,selected,sites]);

  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    const dest=sites.find(s=>s.id===selected)?.coord;if(!dest)return;
    const mid:Coord=[(MALIN[0]+dest[0])/2,(MALIN[1]+dest[1])/2];
    map.easeTo({center:mid,zoom:12.15,pitch:63,bearing:-18,duration:650});
  },[selected,ready,sites]);

  return <div className="mapWrap">
    <div ref={node} className="mapNode"/>
    {!ready&&!baseError&&<div className="mapLoading"><span/><b>Loading decision terrain</b><small>Dark basemap first · 3D elevation and simulation layers follow</small></div>}
    {baseError&&<div className="mapFallback"><b>Basemap unavailable</b><span>{baseError}</span><small>The decision simulation remains usable.</small></div>}
    {ready&&<div className={`terrainBadge ${terrainStatus==="unavailable"?"warn":""}`}><i/><span>{terrainStatus==="ready"?"3D terrain active":"2D terrain fallback"}</span></div>}
    {ready&&<div className="mapLegendPro"><span><i className="lgRisk"/>dynamic risk envelope</span><span><i className="lgFlow"/>runoff flow</span><span><i className="lgRoute"/>selected corridor</span>{roadFail&&<span><i className="lgBlocked"/>road failure</span>}<small>Relocation corridors are schematic demo paths, not surveyed roads.</small></div>}
  </div>;
}
