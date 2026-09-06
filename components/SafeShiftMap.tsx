"use client";
import {useEffect,useRef,useState} from "react";
import type {Map as MLMap,Marker as MLMarker} from "maplibre-gl";
import {MALIN,cautionZone,redZone,type Site} from "../lib/data";

type RankedSite=Site&{score:number;regret:number;future:number};

const STYLE:any={
  version:8,
  sources:{
    osm:{type:"raster",tiles:["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png","https://b.tile.openstreetmap.org/{z}/{x}/{y}.png","https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:19,attribution:"© OpenStreetMap contributors"},
    terrain:{type:"raster-dem",tiles:["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],encoding:"terrarium",tileSize:512,maxzoom:17,attribution:"© Mapterhorn"}
  },
  layers:[
    {id:"osm",type:"raster",source:"osm"},
    {id:"hillshade",type:"hillshade",source:"terrain",paint:{"hillshade-shadow-color":"#07170f","hillshade-highlight-color":"#ddf8ec","hillshade-accent-color":"#3c8068","hillshade-exaggeration":.32}}
  ],
  terrain:{source:"terrain",exaggeration:1.4}
};

export default function SafeShiftMap({sites,selected,onSelect}:{sites:RankedSite[];selected:string;onSelect:(id:string)=>void}){
  const node=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MLMap|null>(null);
  const markers=useRef<MLMarker[]>([]);
  const[ready,setReady]=useState(false);
  const[error,setError]=useState<string|null>(null);

  useEffect(()=>{
    let disposed=false;let map:MLMap|undefined;let timer:number|undefined;
    (async()=>{
      try{
        const ml=await import("maplibre-gl");
        if(disposed||!node.current)return;
        map=new ml.Map({container:node.current,style:STYLE,center:MALIN,zoom:12.1,pitch:58,bearing:-16,antialias:true,attributionControl:false,maxPitch:80});
        mapRef.current=map;
        map.addControl(new ml.NavigationControl({visualizePitch:true}),"bottom-right");
        map.addControl(new ml.AttributionControl({compact:true}),"bottom-left");
        timer=window.setTimeout(()=>{if(!ready)setError("Map sources did not finish loading. The decision demo still works.")},18000);
        map.on("load",()=>{
          if(!map)return;
          map.addSource("caution",{type:"geojson",data:{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[cautionZone]}}});
          map.addLayer({id:"cautionFill",type:"fill",source:"caution",paint:{"fill-color":"#ffb75f","fill-opacity":.11}});
          map.addLayer({id:"cautionLine",type:"line",source:"caution",paint:{"line-color":"#f6bb6a","line-opacity":.65,"line-width":1.5,"line-dasharray":[3,2]}});
          map.addSource("redzone",{type:"geojson",data:{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[redZone]}}});
          map.addLayer({id:"redFill",type:"fill",source:"redzone",paint:{"fill-color":"#ff5e61","fill-opacity":.24}});
          map.addLayer({id:"redLine",type:"line",source:"redzone",paint:{"line-color":"#ff6666","line-opacity":.95,"line-width":2.5}});
          const el=document.createElement("div");el.className="malinMarker";el.innerHTML="<i></i><span><b>Malin</b><small>demo habitation</small></span>";
          new ml.Marker({element:el,anchor:"center"}).setLngLat(MALIN).addTo(map);
          if(timer)window.clearTimeout(timer);setReady(true);setError(null);
        });
        map.on("error",(e:any)=>console.warn("[SafeShift map]",e?.error?.message||e));
      }catch(e){setError(e instanceof Error?e.message:"Map initialization failed")}
    })();
    return()=>{disposed=true;if(timer)window.clearTimeout(timer);markers.current.forEach(m=>m.remove());map?.remove()};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    if(!ready||!mapRef.current)return;
    let cancelled=false;
    (async()=>{
      const ml=await import("maplibre-gl");
      if(cancelled||!mapRef.current)return;
      markers.current.forEach(m=>m.remove());markers.current=[];
      sites.forEach(s=>{
        const el=document.createElement("button");el.type="button";el.className=`siteMarker ${selected===s.id?"selected":""}`;
        el.innerHTML=`<i>${s.id}</i><span><b>${s.name}</b><small>${s.score}/100 · capacity ${Math.min(...Object.values(s.capacity))}</small></span>`;
        el.onclick=()=>onSelect(s.id);
        markers.current.push(new ml.Marker({element:el,anchor:"center"}).setLngLat(s.coord).addTo(mapRef.current!));
      });
    })();
    return()=>{cancelled=true};
  },[ready,sites,selected,onSelect]);

  return <div className="mapWrap"><div ref={node} className="mapNode"/>{!ready&&!error&&<div className="mapLoading"><span/><b>Loading terrain</b><small>OpenStreetMap + Mapterhorn elevation</small></div>}{error&&<div className="mapFallback"><b>Map unavailable</b><span>{error}</span><small>All decision controls remain usable.</small></div>}</div>;
}
