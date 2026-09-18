import { X, Globe } from "lucide-react";
import { openUrl } from '@tauri-apps/plugin-opener';
import { Mod } from "../utils/mods";

export function ModDetailsModal({ mod, onClose }: { mod: Mod | undefined; onClose: () => void }) {
  if (!mod) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-hero-sidebar border border-hero-border p-8 rounded-sm w-full max-w-3xl shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-hero-muted hover:text-hero-text transition-colors"
        ><X size={16}/></button>

                      <div className="space-y-5">
                <div>
                  <h3 className="text-2xl font-black italic tracking-wider text-hero-accent mb-1 break-words leading-tight pr-6">{mod.name}</h3>
                  <div className="flex gap-2 text-xs text-hero-text/60 font-mono">
                    <span className="text-hero-text">v{mod.version || "1.0"}</span>
                    <span>•</span>
                    <span>By <span className="text-hero-text">{mod.author || "Unknown"}</span></span>
                  </div>
                </div>
                
                {mod.url && (
                  <div className="bg-black/40 border border-hero-border p-4 rounded-sm">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div>
                        <div className="text-hero-text/60 uppercase tracking-wider mb-1 font-bold text-[10px]">Source Website</div>
                        <div className="text-hero-text font-bold text-lg flex items-center gap-2">
                          <Globe size={16} className="text-hero-accent"/>
                          {(() => {
                            try {
                              const urlObj = new URL(mod.url);
                              const hostname = urlObj.hostname.toLowerCase();
                              if (hostname.includes('discord')) return 'Discord';
                              if (hostname.includes('gamebanana')) return 'GameBanana';
                              if (hostname.includes('nexusmods')) return 'Nexus Mods';
                              if (hostname.includes('drive.google')) return 'Google Drive';
                              if (hostname.includes('mega.nz')) return 'MEGA';
                              if (hostname.includes('github')) return 'GitHub';
                              return urlObj.hostname.replace('www.', '');
                            } catch (e) {
                              return 'External Link';
                            }
                          })()}
                        </div>
                      </div>
                      <a 
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (mod.url) openUrl(mod.url); }}
                        className="flex-shrink-0 bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-hero-text px-5 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
                      >
                        <Globe size={14}/> Open Link
                      </a>
                    </div>
                    <div className="text-[11px] text-hero-muted truncate bg-hero-bg/50 p-2 rounded border border-hero-border font-mono select-all hover:text-hero-textSecondary transition-colors">
                      {mod.url}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-hero-muted uppercase tracking-wider mb-1.5 font-bold">Category</div>
                    <div className="text-hero-bg bg-hero-accent px-2.5 py-1 inline-block rounded-sm font-bold uppercase">{mod.category || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-hero-text/60 uppercase tracking-wider mb-1.5 font-bold">Character</div>
                    <div className="text-hero-text bg-white/10 px-2.5 py-1 inline-block rounded-sm">{mod.character || "N/A"}</div>
                  </div>
                  {mod.created_at && mod.created_at > 0 ? (
                    <div className="col-span-2">
                      <div className="text-hero-text/60 uppercase tracking-wider mb-1.5 font-bold">Date Imported</div>
                      <div className="text-hero-text bg-black/40 border border-hero-border px-2.5 py-1 inline-block rounded-sm font-mono text-[11px]">
                        {new Date(mod.created_at * 1000).toLocaleString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                {mod.pak_name && (
                  <div>
                    <div className="text-hero-text/60 uppercase tracking-wider mb-1.5 font-bold text-xs">File Name</div>
                    <div className="text-hero-text font-mono text-[11px] break-all bg-black/40 p-2.5 rounded-sm border border-hero-border select-all">
                      {mod.pak_name}
                    </div>
                  </div>
                )}
                
                {mod.modified_files && mod.modified_files.length > 0 && (
                  <div>
                    <div className="text-hero-text/60 uppercase tracking-wider mb-1.5 font-bold text-xs">Modified Internal Files ({mod.modified_files.length})</div>
                    <div className="text-hero-text font-mono text-[11px] break-all bg-black/40 p-2.5 rounded-sm border border-hero-border max-h-48 overflow-y-auto custom-scrollbar">
                      {mod.modified_files.slice(0, 50).map((f, i) => (
                        <div key={i} className="truncate py-0.5" title={f}>{f}</div>
                      ))}
                      {mod.modified_files.length > 50 && (
                        <div className="text-hero-accent mt-2 italic border-t border-hero-border pt-1.5">...and {mod.modified_files.length - 50} more files (hidden)</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
      </div>
    </div>
  );
}
