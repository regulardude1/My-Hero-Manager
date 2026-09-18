import { useState } from "react";

export function NavItem({ icon, label, active, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-sm cursor-pointer transition-all duration-200 font-bold text-sm
      ${active ? 'bg-hero-accent/10 text-hero-accent border border-hero-accent/20' : 'text-hero-muted hover:bg-hero-surface hover:text-hero-text border border-transparent'}`}
    >
      <div className={active ? 'text-hero-accent' : 'text-hero-muted'}>{icon}</div>
      {label}
    </div>
  );
}

export function FilterItem({ label, count, active, onClick, hideCountOnHover, forceHideCount }: any) {
  return (
    <div 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer transition-all duration-200 mb-1
      ${active ? 'bg-hero-accent/10 text-hero-accent border border-hero-accent/20' : 'text-hero-muted hover:bg-hero-surface hover:text-hero-text border border-transparent'}`}
    >
      <span className="text-xs font-bold truncate pr-2">{label}</span>
      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0 transition-opacity duration-200 ${active ? 'bg-hero-accent/20' : 'bg-hero-surface'} ${hideCountOnHover ? 'group-hover:opacity-0' : ''} ${forceHideCount ? 'opacity-0' : 'opacity-100'}`}>{count}</span>
    </div>
  );
}

export function RenameFolderInput({ initialName, onChange }: { initialName: string, onChange: (val: string) => void }) {
  const [name, setName] = useState(initialName);

  return (
    <input
      type="text"
      value={name}
      onChange={e => setName(e.target.value)}
      onBlur={() => onChange(name)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          onChange(name);
          e.currentTarget.blur();
        }
      }}
      className="bg-hero-surface border border-hero-border focus:border-hero-accent text-hero-text px-2 py-1 rounded-sm outline-none w-2/3 font-bold text-sm transition-colors"
    />
  );
}
