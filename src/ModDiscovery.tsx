export default function ModDiscovery({ onSelect }: { onSelect: (store: string) => void }) {
  
  const SUPPORTED_SERVERS = [
    {
      id: "1256679541112311809",
      name: "Endeavor HQ",
      icon: "https://cdn.discordapp.com/icons/1256679541112311809/a_07a0fed86beeb9fa64195129e3125182.webp?size=128"
    },
    {
      id: "1508333307354415245",
      name: "Momo's Castle",
      icon: "https://cdn.discordapp.com/icons/1508333307354415245/c99d5867ff794f847fc563a84d9e4def.webp?size=128"
    }
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-hero-bg text-white overflow-y-auto w-full h-full">
      <div className="w-full max-w-7xl">
        
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black italic tracking-wider mb-2 text-white uppercase drop-shadow-sm">
            Select Platform
          </h1>
          <p className="text-hero-muted text-sm font-medium">Choose a modding community to start browsing</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          
          {/* Discord Option */}
          <div 
            onClick={() => onSelect("Store")}
            className="group bg-zinc-900/60 border border-white/10 rounded-3xl p-8 cursor-pointer hover:border-[#5865F2] hover:bg-[#5865F2]/10 transition-all duration-300 flex flex-col items-center justify-center aspect-square shadow-xl hover:-translate-y-2 relative"
          >
            <svg viewBox="0 0 127.14 96.36" fill="currentColor" className="w-40 h-40 text-white group-hover:text-[#5865F2] transition-colors duration-300 drop-shadow-lg mb-12">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14h0c2.64-27.38-4.51-51.11-19.32-72.15ZM42.49,65.34c-5.36,0-9.76-4.86-9.76-10.82s4.35-10.82,9.76-10.82c5.45,0,9.8,4.9,9.76,10.82,0,5.96-4.35,10.82-9.76,10.82Zm42.16,0c-5.36,0-9.76-4.86-9.76-10.82s4.35-10.82,9.76-10.82c5.45,0,9.8,4.9,9.76,10.82,0,5.96-4.35,10.82-9.76,10.82Z"/>
            </svg>
            
            <div className="flex flex-col items-center w-full">
              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-3">Supported Servers</span>
              <div className="flex flex-col gap-2 w-full max-w-[240px]">
                {SUPPORTED_SERVERS.map(server => (
                  <div key={server.id} className="flex items-center gap-3 bg-black/40 border border-white/5 rounded-full p-2 pr-4 shadow-sm group-hover:bg-black/60 group-hover:border-white/10 transition-colors">
                    <img src={server.icon} alt={server.name} className="w-8 h-8 rounded-full ring-2 ring-black bg-black object-cover shrink-0" />
                    <span className="text-sm font-bold text-white/90 truncate">{server.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* GameBanana Option */}
          <div 
            onClick={() => onSelect("GameBanana")}
            className="group bg-zinc-900/60 border border-white/10 rounded-3xl p-8 cursor-pointer hover:border-[#F4D03F] hover:bg-[#F4D03F]/10 transition-all duration-300 flex items-center justify-center aspect-square shadow-xl hover:-translate-y-2 relative"
          >
            <svg viewBox="0 0 360 60" className="w-full max-w-[85%] h-auto drop-shadow-lg group-hover:scale-105 transition-transform duration-300" fill="currentColor">
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="46" letterSpacing="-1">
                <tspan fill="#ffffff" className="group-hover:fill-white transition-colors">Game</tspan>
                <tspan fill="#F4D03F">Banana</tspan>
              </text>
            </svg>
          </div>

          {/* Nexus Mods Option */}
          <div 
            onClick={() => onSelect("NexusMods")}
            className="group bg-zinc-900/60 border border-white/10 rounded-3xl p-8 cursor-pointer hover:border-[#DA8F44] hover:bg-[#DA8F44]/10 transition-all duration-300 flex flex-col items-center justify-center aspect-square shadow-xl hover:-translate-y-2 relative"
          >
            <svg viewBox="0 0 360 60" className="w-full max-w-[85%] h-auto drop-shadow-lg group-hover:scale-105 transition-transform duration-300" fill="currentColor">
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="46" letterSpacing="-1">
                <tspan fill="#DA8F44">Nexus</tspan>
                <tspan fill="#ffffff" className="group-hover:fill-white transition-colors">Mods</tspan>
              </text>
            </svg>
          </div>

        </div>
      </div>
    </div>
  );
}
