import type {Metadata} from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./map-polish.css";
import "./ground-intel.css";
import "./readability.css";
import "./terrain-upgrade.css";
import "./map-controls-fix.css";

export const metadata:Metadata={
  title:"SafeShift — SIH26191",
  description:"Proactive relocation decision studio"
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
