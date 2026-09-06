"use client";

import {useEffect,useRef,useState} from "react";
import type {Map as MLMap,Marker as MLMarker} from "maplibre-gl";
import {MALIN,cautionZone,redZone,type Site} from "../lib/data";

type RankedSite=Site&{score:number;regret:number;future:number};

// Keep the initial style intentionally tiny. The old version put the DEM in the
// startup style, so a slow/blocked terrain request could prevent the map from
// ever reaching its ready state. We now start with the basemap only and add
// elevation after style.load. Terrain is an enhancement, not a dependency.
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
  layers:[{id:"osm",type:"raster",source:"osm"}]
};

const TERRAIN_TILES=["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"];

export default function SafeShiftMap({sites,selected,onSelect}:{sites:RankedSite[];selected:string;onSelect:(id:string)=>void}){
  const node=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MLMap|null>(null);
  const markers=useRef<MLMarker[]>([]);
  const [ready,setReady]=useState(false);
  const [baseError,setBaseError]=useState<string|null>(null);
  const [terrainStatus,setTerrainStatus]=useState<"loading"|"ready"|"unavailable">("loading");

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
          zoom:12.1,
          pitch:58,
          bearing:-16,
          antialias:true,
          attributionControl:false,
          maxPitch:80
        });
        mapRef.current=map;
        map.addControl(new ml.NavigationControl({visualizePitch:true}),"bottom-right");
        map.addControl(new ml.AttributionControl({compact:true}),"bottom-left");

        startupTimer=window.setTimeout(()=>{
          if(!disposed&&!map?.isStyleLoaded()){
            setBaseError("Basemap initialization is taking unusually long.");
          }
        },12000);

        // style.load does NOT wait for every raster/terrain tile to finish.
        // This is the key difference from the previous implementation.
        map.on("style.load",()=>{
          if(!map||disposed)return;
          if(startupTimer)window.clearTimeout(startupTimer);

          try{
            map.addSource("caution",{
              type:"geojson",
              data:{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[cautionZone]}}
            });
            map.addLayer({
              id:"cautionFill",type:"fill",source:"caution",
              paint:{"fill-color":"#ffb75f","fill-opacity":.11}
            });
            map.addLayer({
              id:"cautionLine",type:"line",source:"caution",
              paint:{"line-color":"#f6bb6a","line-opacity":.65,"line-width":1.5,"line-dasharray":[3,2]}
            });

            map.addSource("redzone",{
              type:"geojson",
              data:{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[redZone]}}
            });
            map.addLayer({
              id:"redFill",type:"fill",source:"redzone",
              paint:{"fill-color":"#ff5e61","fill-opacity":.24}
            });
            map.addLayer({
              id:"redLine",type:"line",source:"redzone",
              paint:{"line-color":"#ff6666","line-opacity":.95,"line-width":2.5}
            });

            const village=document.createElement("div");
            village.className="malinMarker";
            village.innerHTML="<i></i><span><b>Malin</b><small>demo habitation</small></span>";
            new ml.Marker({element:village,anchor:"center"}).setLngLat(MALIN).addTo(map);

            setReady(true);
            setBaseError(null);
          }catch(e){
            console.error("[SafeShift overlays]",e);
            setReady(true);
          }

          // Elevation is deliberately best-effort. Separate DEM sources remove
          // MapLibre's 'same source for hillshade and terrain' warning and let
          // either layer fail without taking down the map.
          try{
            map.addSource("terrain-dem",{
              type:"raster-dem",
              tiles:TERRAIN_TILES,
              encoding:"terrarium",
              tileSize:512,
              maxzoom:17,
              attribution:"© Mapterhorn"
            });
            map.addSource("hillshade-dem",{
              type:"raster-dem",
              tiles:TERRAIN_TILES,
              encoding:"terrarium",
              tileSize:512,
              maxzoom:17,
              attribution:"© Mapterhorn"
            });
            map.addLayer({
              id:"hillshade",
              type:"hillshade",
              source:"hillshade-dem",
              paint:{
                "hillshade-shadow-color":"#07170f",
                "hillshade-highlight-color":"#ddf8ec",
                "hillshade-accent-color":"#3c8068",
                "hillshade-exaggeration":.32
              }
            });
            map.setTerrain({source:"terrain-dem",exaggeration:1.4});
            setTerrainStatus("ready");
          }catch(e){
            console.warn("[SafeShift terrain]",e);
            setTerrainStatus("unavailable");
          }
        });

        map.on("error",(event:any)=>{
          const message=String(event?.error?.message||event||"");
          console.warn("[SafeShift map]",message);

          // Terrain tile failures should degrade to a 2D basemap, not cover the
          // entire workspace with an error screen.
          if(/mapterhorn|terrain|raster-dem|webp/i.test(message)){
            setTerrainStatus("unavailable");
          }
        });
      }catch(e){
        setBaseError(e instanceof Error?e.message:"Map initialization failed");
      }
    })();

    return()=>{
      disposed=true;
      if(startupTimer)window.clearTimeout(startupTimer);
      markers.current.forEach(m=>m.remove());
      markers.current=[];
      map?.remove();
      mapRef.current=null;
    };
  },[]);

  useEffect(()=>{
    if(!ready||!mapRef.current)return;
    let cancelled=false;

    (async()=>{
      const ml=await import("maplibre-gl");
      if(cancelled||!mapRef.current)return;

      markers.current.forEach(m=>m.remove());
      markers.current=[];

      sites.forEach(s=>{
        const el=document.createElement("button");
        el.type="button";
        el.className=`siteMarker ${selected===s.id?"selected":""}`;
        el.innerHTML=`<i>${s.id}</i><span><b>${s.name}</b><small>${s.score}/100 · capacity ${Math.min(...Object.values(s.capacity))}</small></span>`;
        el.onclick=()=>onSelect(s.id);
        markers.current.push(
          new ml.Marker({element:el,anchor:"center"})
            .setLngLat(s.coord)
            .addTo(mapRef.current!)
        );
      });
    })();

    return()=>{cancelled=true};
  },[ready,sites,selected,onSelect]);

  return <div className="mapWrap">
    <div ref={node} className="mapNode"/>

    {!ready&&!baseError&&
      <div className="mapLoading">
        <span/>
        <b>Loading map</b>
        <small>Basemap first · 3D terrain loads separately</small>
      </div>
    }

    {baseError&&
      <div className="mapFallback">
        <b>Basemap unavailable</b>
        <span>{baseError}</span>
        <small>The decision simulation remains usable.</small>
      </div>
    }

    {ready&&terrainStatus==="unavailable"&&
      <div className="terrainNotice">
        <b>2D fallback active</b>
        <span>Elevation tiles unavailable · basemap and decision layers are still live</span>
      </div>
    }
  </div>;
}
