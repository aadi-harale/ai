"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import type {Site} from "../lib/data";
import {MALIN,bottleneck,cautionZone,functionalCapacity,redZone} from "../lib/data";
import "maplibre-gl/dist/maplibre-gl.css";

type RankedSite=Site&{score:number;regret:number;future:number};
export type SafeShiftLayerState={risk:boolean;routes:boolean;households:boolean;sites:boolean};
type Props={sites:RankedSite[];selected:string;onSelect:(id:string)=>void;roadFail:boolean;layers:SafeShiftLayerState};
type Coord=[number,number];

const STYLE="https://tiles.openfreemap.org/styles/liberty";
const ROUTES:Record<string,Coord[]>={
  A:[MALIN,[73.681,19.169],[73.670,19.179],[73.660,19.184],[73.6500,19.1870]],
  B:[MALIN,[73.699,19.158],[73.710,19.150],[73.721,19.143],[73.7300,19.1360]],
  C:[MALIN,[73.698,19.169],[73.706,19.178],[73.715,19.186],[73.7220,19.1920]],
};
const CLUSTERS=[[73.646,19.194,11],[73.665,19.197,42],[73.705,19.198,5],[73.722,19.180,4],[73.734,19.163,7],[73.718,19.145,3],[73.698,19.137,9],[73.673,19.139,49],[73.651,19.149,2],[73.658,19.164,12],[73.686,19.167,138],[73.690,19.180,23],[73.704,19.165,6],[73.681,19.149,25]] as const;

function fc(features:any[]){return {type:"FeatureCollection",features} as any}
function pt(coord:Coord,properties:Record<string,unknown>={}){return {type:"Feature",properties,geometry:{type:"Point",coordinates:coord}} as any}
function ln(coords:Coord[],properties:Record<string,unknown>={}){return {type:"Feature",properties,geometry:{type:"LineString",coordinates:coords}} as any}
function poly(coords:Coord[],properties:Record<string,unknown>={}){return {type:"Feature",properties,geometry:{type:"Polygon",coordinates:[coords]}} as any}
function circle(center:Coord,radiusKm:number,steps=96):Coord[]{const out:Coord[]=[];const cos=Math.cos(center[1]*Math.PI/180);for(let i=0;i<=steps;i++){const a=i/steps*Math.PI*2;out.push([center[0]+Math.cos(a)*radiusKm/(111.32*cos),center[1]+Math.sin(a)*radiusKm/111.32])}return out}
function setVisible(map:any,ids:string[],show:boolean){ids.forEach(id=>{if(map.getLayer(id))map.setLayoutProperty(id,"visibility",show?"visible":"none")})}

function applyHackHabitatTheme(map:any){
  const hidden=[/^poi/,/shield/,/one_way/,/^airport/,/^highway-name/];
  for(const layer of map.getStyle()?.layers??[]){
    const id=String(layer.id||"");
    try{
      if(layer.type==="raster"){map.setPaintProperty(id,"raster-opacity",.12);map.setPaintProperty(id,"raster-saturation",-.85);map.setPaintProperty(id,"raster-brightness-max",.45);continue}
      if(layer.type==="fill-extrusion"){map.setLayoutProperty(id,"visibility","none");continue}
      if(layer.type==="symbol"){
        if(hidden.some(r=>r.test(id))){map.setLayoutProperty(id,"visibility","none");continue}
        const major=/country|city|state/.test(id),water=/water/.test(id);
        map.setPaintProperty(id,"text-color",water?"#5e8794":major?"#c9cbbe":"#8b9186");
        map.setPaintProperty(id,"text-halo-color","#070a08");map.setPaintProperty(id,"text-halo-width",1.2);map.setPaintProperty(id,"text-halo-blur",.4);continue;
      }
      const fills:Record<string,string>={background:"#0b100d",park:"#152218",landcover_wood:"#16241a",landcover_grass:"#182619",landcover_wetland:"#14231f",water:"#0d1d24",building:"#1a211b"};
      if(layer.type==="background"){map.setPaintProperty(id,"background-color","#0b100d");continue}
      if(layer.type==="fill"&&fills[id]){map.setPaintProperty(id,"fill-color",fills[id]);map.setPaintProperty(id,"fill-opacity",.85);continue}
      if(layer.type==="line"){
        const casing=id.includes("casing"),major=/motorway|trunk|primary/.test(id),secondary=/secondary|tertiary/.test(id),waterway=id.startsWith("waterway"),road=id.startsWith("road_")||id.startsWith("bridge_")||id.startsWith("tunnel_");
        if(casing){map.setPaintProperty(id,"line-color","#0d120e");map.setPaintProperty(id,"line-opacity",.85)}
        else if(major){map.setPaintProperty(id,"line-color","#3c4a3d");map.setPaintProperty(id,"line-opacity",.9)}
        else if(secondary){map.setPaintProperty(id,"line-color","#334034");map.setPaintProperty(id,"line-opacity",.85)}
        else if(waterway){map.setPaintProperty(id,"line-color","#12333f");map.setPaintProperty(id,"line-opacity",.75)}
        else if(road){map.setPaintProperty(id,"line-color","#252e26");map.setPaintProperty(id,"line-opacity",.7)}
      }
    }catch{}
  }
}

export default function HackHabitatSafeShiftMap({sites,selected,onSelect,roadFail,layers}:Props){
  const host=useRef<HTMLDivElement|null>(null);const mapRef=useRef<any>(null);const [ready,setReady]=useState(false);const [error,setError]=useState<string|null>(null);
  const siteData=useMemo(()=>fc(sites.map(s=>pt(s.coord,{id:s.id,name:s.name,score:s.score,capacity:functionalCapacity(s),bottleneck:bottleneck(s)}))),[sites]);
  const routeData=useMemo(()=>fc(Object.entries(ROUTES).map(([id,c])=>ln(c,{id,blocked:roadFail&&id==="B"?1:0}))),[roadFail]);

  useEffect(()=>{let disposed=false;let map:any;(async()=>{try{const ml=await import("maplibre-gl");if(disposed||!host.current)return;map=new ml.Map({container:host.current,style:STYLE,bounds:[[73.622,19.118],[73.754,19.213]],fitBoundsOptions:{padding:34},attributionControl:{compact:true},minZoom:9,maxZoom:16});mapRef.current=map;map.addControl(new ml.NavigationControl({showCompass:false}),"top-right");map.addControl(new ml.ScaleControl({maxWidth:90,unit:"metric"}),"bottom-left");map.on("load",()=>{applyHackHabitatTheme(map);const before=(map.getStyle()?.layers??[]).find((l:any)=>l.type==="symbol")?.id;const add=(l:any)=>before?map.addLayer(l,before):map.addLayer(l);
    map.addSource("ss-area",{type:"geojson",data:poly(circle(MALIN,6.2))});add({id:"ss-area-fill",type:"fill",source:"ss-area",paint:{"fill-color":"#b8d14a","fill-opacity":.035}});add({id:"ss-area-line",type:"line",source:"ss-area",paint:{"line-color":"#b8d14a","line-width":2,"line-opacity":.95,"line-dasharray":[2,2]}});
    map.addSource("ss-caution",{type:"geojson",data:poly(cautionZone)});add({id:"ss-caution-fill",type:"fill",source:"ss-caution",paint:{"fill-color":"#d8c24e","fill-opacity":.055}});add({id:"ss-caution-line",type:"line",source:"ss-caution",paint:{"line-color":"#d8c24e","line-width":1.2,"line-opacity":.6,"line-dasharray":[2,2]}});
    map.addSource("ss-risk",{type:"geojson",data:poly(redZone)});add({id:"ss-risk-fill",type:"fill",source:"ss-risk",paint:{"fill-color":"#e0674a","fill-opacity":.18}});add({id:"ss-risk-line",type:"line",source:"ss-risk",paint:{"line-color":"#e0674a","line-width":2,"line-opacity":.9}});
    map.addSource("ss-routes",{type:"geojson",data:routeData});add({id:"ss-routes-line",type:"line",source:"ss-routes",paint:{"line-color":["case",["==",["get","blocked"],1],"#e0674a","#d8c24e"],"line-width":["case",["==",["get","id"],selected],3,1.8],"line-opacity":.92,"line-dasharray":[2,1.5]}});
    map.addSource("ss-households",{type:"geojson",data:fc(CLUSTERS.map(([x,y,count])=>pt([x,y],{count})))});add({id:"ss-household-circles",type:"circle",source:"ss-households",paint:{"circle-radius":["interpolate",["linear"],["get","count"],1,7,25,14,138,27],"circle-color":"#91a756","circle-opacity":.9,"circle-stroke-color":"#c6d581","circle-stroke-width":1.3}});add({id:"ss-household-labels",type:"symbol",source:"ss-households",layout:{"text-field":["to-string",["get","count"]],"text-size":11,"text-allow-overlap":true},paint:{"text-color":"#0b100d"}});
    map.addSource("ss-sites",{type:"geojson",data:siteData});add({id:"ss-site-circles",type:"circle",source:"ss-sites",paint:{"circle-radius":["case",["==",["get","id"],selected],13,9],"circle-color":["case",["==",["get","id"],selected],"#c6e34f","#26362a"],"circle-stroke-color":"#d9ee72","circle-stroke-width":["case",["==",["get","id"],selected],2.5,1.4]}});add({id:"ss-site-labels",type:"symbol",source:"ss-sites",layout:{"text-field":["concat","SITE ",["get","id"]],"text-size":11,"text-offset":[0,1.65],"text-allow-overlap":true},paint:{"text-color":"#e5e7dc","text-halo-color":"#070a08","text-halo-width":1.4}});
    map.on("click","ss-site-circles",(e:any)=>{const id=e.features?.[0]?.properties?.id;if(id)onSelect(String(id))});map.on("mouseenter","ss-site-circles",()=>map.getCanvas().style.cursor="pointer");map.on("mouseleave","ss-site-circles",()=>map.getCanvas().style.cursor="");setReady(true)});map.on("error",(e:any)=>setError(e.error?.message??"Map failed to load"));}catch(e){setError(e instanceof Error?e.message:"Map failed to load")}})();return()=>{disposed=true;map?.remove();mapRef.current=null}},[onSelect]);

  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;const src=map.getSource("ss-sites");src?.setData?.(siteData);if(map.getLayer("ss-site-circles"))map.setPaintProperty("ss-site-circles","circle-radius",["case",["==",["get","id"],selected],13,9]);if(map.getLayer("ss-site-circles"))map.setPaintProperty("ss-site-circles","circle-color",["case",["==",["get","id"],selected],"#c6e34f","#26362a"]);const routes=map.getSource("ss-routes");routes?.setData?.(routeData);if(map.getLayer("ss-routes-line"))map.setPaintProperty("ss-routes-line","line-width",["case",["==",["get","id"],selected],3,1.8]);},[siteData,routeData,selected,ready]);
  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;setVisible(map,["ss-risk-fill","ss-risk-line","ss-caution-fill","ss-caution-line"],layers.risk);setVisible(map,["ss-routes-line"],layers.routes);setVisible(map,["ss-household-circles","ss-household-labels"],layers.households);setVisible(map,["ss-site-circles","ss-site-labels"],layers.sites)},[layers,ready]);

  return <div className="hhMapWrap"><div ref={host} className="hhMapNode" aria-label="SafeShift relocation decision map"/>{!ready&&!error?<div className="hhMapLoading">Loading decision map</div>:null}{error?<div className="hhMapError">Map unavailable · {error}</div>:null}<div className="hhLegend"><b>LEGEND</b><span><i className="lime"/> Household cluster</span><span><i className="red"/> High-risk footprint</span><span><i className="yellow"/> Relocation route</span><span><i className="green"/> Candidate site</span></div></div>
}
