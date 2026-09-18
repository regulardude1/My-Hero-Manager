import { useState } from "react";
import { CheckSquare, Square, Eye, X, ChevronDown, ChevronRight, Folder, GripHorizontal, ArrowDown, ArrowUp } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDraggable,
  useDroppable,
  pointerWithin,
  DragOverlay,
  useDndContext
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Mod, ContextMenuState, ModFolder, getModDescription } from "../utils/mods";
import ModelViewer from "../ModelViewer";

export type ColumnDef = { id: string; label: string; width: string };

export const INITIAL_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Mod Name", width: "flex-1" },
  { id: "author", label: "Creator", width: "w-32" },
  { id: "version", label: "Ver", width: "w-20" },
  { id: "category", label: "Category", width: "w-32" },
  { id: "character", label: "Character", width: "w-40" }
];

function SortableHeader({ id, label, width, sortConfig, onSort }: { id: string, label: string, width: string, sortConfig: { key: string, direction: 'asc' | 'desc' } | null, onSort: (key: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${width} min-w-0 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-hero-muted transition-colors relative group py-2`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-hero-surface rounded-sm">
        <GripHorizontal size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-hero-accent" />
      </div>
      <div
        className="flex items-center gap-1.5 flex-1 cursor-pointer hover:text-hero-accent select-none py-1"
        onClick={() => onSort(id)}
      >
        {label}
        {sortConfig?.key === id && (
          <span className="text-hero-accent">
            {sortConfig.direction === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableWrapper({ id, data, children, isChild, isConflicting, isSelected, title, onClick, onContextMenu }: any) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });

  return (
    <div
      ref={setNodeRef}
      title={title}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
      className={`flex items-center min-w-0 px-4 py-3 rounded-sm group cursor-pointer border transition-all duration-200 relative outline-none
        ${isChild ? 'ml-8 w-[calc(100%-2rem)] border-l-2 border-l-hero-accent/50 ' : 'w-full '}
        ${isDragging ? 'opacity-30 border-hero-accent/50 bg-hero-surface ' : 'cursor-grab '}
        ${isConflicting ? 'bg-red-900/40 border-red-500 hover:bg-red-900/60' :
          isSelected ? 'bg-hero-accent/10 border-hero-accent/50' : 'bg-hero-card/40 border-hero-border hover:bg-hero-card/80 hover:border-hero-accent/30'}`}
    >
      {children}
    </div>
  );
}

function ModFolderRow({
  folder,
  childrenMods,
  renderMod,
  mods,
  setMods,
  saveFolders,
  folders
}: any) {
  const [isExpanded, setIsExpanded] = useState(false);
  const allActive = childrenMods.length > 0 && childrenMods.every((m: any) => m.active);
  const anyActive = childrenMods.some((m: any) => m.active);
  const { setNodeRef, isOver } = useDroppable({ id: `folder-${folder.id}`, data: { type: 'folder', folderId: folder.id } });

  return (
    <div className="space-y-1.5" ref={setNodeRef}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center w-full min-w-0 px-4 py-2.5 rounded-sm group cursor-pointer border transition-all duration-200
          ${isOver ? 'bg-hero-accent/20 border-hero-accent scale-[1.01] shadow-lg shadow-hero-accent/20 z-10' : 'bg-hero-surface/30 border-hero-border hover:bg-hero-surface/80 hover:border-hero-accent/30'}`}
      >
        <div
          className="w-12 shrink-0 text-hero-muted hover:text-hero-text transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            const nextState = !allActive;
            const nextMods = mods.map((m: any) => folder.modIds.includes(m.id) ? { ...m, active: nextState } : m);
            setMods(nextMods);
          }}
        >
          {allActive ? <CheckSquare size={18} className="text-hero-accent" /> :
           anyActive ? <Square size={18} className="text-hero-accent/50" /> : <Square size={18} />}
        </div>
        <div className="w-10 shrink-0 text-hero-muted">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="flex-1 font-black italic tracking-widest text-hero-accent text-[13px] uppercase flex items-center gap-2">
          <Folder size={16} />
          {folder.name}
        </div>
        <div className="shrink-0 text-[10px] font-bold text-hero-muted mr-4">
          {childrenMods.length} MODS
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            saveFolders(folders.filter((f: any) => f.id !== folder.id));
          }}
          className="text-hero-muted hover:text-red-400 p-1 rounded transition-colors"
          title="Unfolder"
        >
          <X size={14} />
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-1.5 mt-1.5">
          {childrenMods.map((child: any) => renderMod(child, true))}
        </div>
      )}
    </div>
  );
}

function ActiveDragOverlay({ mods, columns }: { mods: any[], columns: any[] }) {
  const { active } = useDndContext();
  if (!active || active.data.current?.type !== 'mod') return null;
  const mod = mods.find(m => m.id === active.data.current?.modId);
  if (!mod) return null;

  return (
    <DragOverlay dropAnimation={null}>
      <div className="bg-hero-card border-hero-accent ring-2 ring-hero-accent/50 shadow-2xl flex items-center px-4 py-3 rounded-sm opacity-90 w-[1000px] z-50">
        <div className="w-12 shrink-0 text-hero-accent">
          <CheckSquare size={18} />
        </div>
        <div className="w-10 shrink-0 text-hero-text/20">
          <Eye size={16} />
        </div>
        {columns.map(col => {
          if (col.id === "name") return <div key={col.id} className={`${col.width} min-w-0 font-bold text-hero-text truncate pr-4 text-[13px]`}>{mod.name}</div>;
          if (col.id === "author") return <div key={col.id} className={`${col.width} shrink-0 text-xs font-medium text-hero-muted truncate pr-4`}>{mod.author}</div>;
          if (col.id === "version") return <div key={col.id} className={`${col.width} shrink-0 text-[10px] font-bold text-hero-muted pr-4`}>{mod.version}</div>;
          if (col.id === "category") return (
            <div key={col.id} className={`${col.width} shrink-0 pr-4`}>
              <span className="px-2 py-0.5 bg-hero-surface text-hero-muted text-[9px] font-bold uppercase tracking-wider rounded-sm border border-hero-border">{mod.category}</span>
            </div>
          );
          if (col.id === "character") return <div key={col.id} className={`${col.width} shrink-0 text-xs font-medium text-hero-muted truncate pr-4`}>{mod.character}</div>;
          return null;
        })}
      </div>
    </DragOverlay>
  );
}

interface ModTableProps {
  mods: Mod[];
  filteredMods: Mod[];
  setMods: (mods: Mod[]) => void;
  folders: ModFolder[];
  saveFolders: (folders: ModFolder[]) => void;
  conflictSet: Set<string>;
  selectedModIds: Set<string>;
  setSelectedModIds: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  lastClickedModId: string | null;
  setLastClickedModId: (id: string | null) => void;
  renamingModId: string | null;
  setRenamingModId: (id: string | null) => void;
  renamingText: string;
  setRenamingText: (text: string) => void;
  handleModClick: (e: any, modId: string) => void;
  toggleMod: (id: string) => void;
  handleRenameSubmit: (modId: string) => void;
  setContextMenu: (menu: ContextMenuState) => void;
  columns: ColumnDef[];
  sortConfig: { key: string, direction: 'asc' | 'desc' } | null;
  handleSort: (key: string) => void;
  handleDragEnd: (event: DragEndEvent) => void;
}

export default function ModTable(props: ModTableProps) {
  const {
    mods,
    filteredMods,
    setMods,
    folders,
    saveFolders,
    conflictSet,
    selectedModIds,
    setSelectedModIds,
    lastClickedModId,
    setLastClickedModId,
    renamingModId,
    setRenamingModId,
    renamingText,
    setRenamingText,
    handleModClick,
    toggleMod,
    handleRenameSubmit,
    setContextMenu,
    columns,
    sortConfig,
    handleSort,
    handleDragEnd
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  return (
    <>
      <div className="min-w-0 flex flex-col p-6 overflow-y-auto overflow-x-hidden custom-scrollbar border-r border-hero-border">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-center w-full min-w-0 px-4 pb-2 border-b-2 border-hero-border mb-4 select-none">
            <div className="w-12 shrink-0"></div>
            <div className="w-10 shrink-0"></div>
            <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
              {columns.map(col => (
                <SortableHeader key={col.id} id={col.id} label={col.label} width={col.width} sortConfig={sortConfig} onSort={handleSort} />
              ))}
            </SortableContext>
          </div>
          <div className="space-y-1.5 pb-10 select-none">
          {(() => {
            const folderedModIds = new Set(folders.flatMap(f => f.modIds));
            const items: any[] = [];
            folders.forEach(folder => {
              const children = filteredMods.filter(m => folder.modIds.includes(m.id));
              if (children.length > 0) items.push({ type: 'folder', folder, children });
            });
            filteredMods.forEach(mod => {
              if (!folderedModIds.has(mod.id)) items.push({ type: 'mod', mod });
            });
            const renderMod = (mod: Mod, isChild = false) => {
              const isConflicting = conflictSet.has(mod.id);
              return (
                <DraggableWrapper
                  id={`mod-${mod.id}`}
                  data={{ type: 'mod', modId: mod.id }}
                  isChild={isChild}
                  isConflicting={isConflicting}
                  isSelected={selectedModIds.has(mod.id)}
                  title={getModDescription(mod)}
                  onClick={(e: any) => handleModClick(e, mod.id)}
                  onContextMenu={(e: any) => {
                    e.preventDefault();
                    if (!selectedModIds.has(mod.id)) {
                      setSelectedModIds(new Set([mod.id]));
                      setLastClickedModId(mod.id);
                    }
                    setContextMenu({ x: e.pageX, y: e.pageY, modId: mod.id });
                  }}
                >
                  {isConflicting && (
                    <div className="absolute top-0 right-0 px-2 py-0.5 bg-red-500 text-hero-text text-[9px] font-bold rounded-bl-sm uppercase tracking-wider shadow-lg z-10">
                      Conflict Detected
                    </div>
                  )}
                          <div className="w-12 shrink-0 text-hero-muted hover:text-hero-text transition-colors cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleMod(mod.id); }}>
                            {mod.active ? <CheckSquare size={18} className="text-hero-accent" /> : <Square size={18} />}
                          </div>
                          <div className={`w-10 shrink-0 transition-colors ${selectedModIds.has(mod.id) ? 'text-hero-accent' : 'text-hero-text/20 group-hover:text-hero-text/60'}`}>
                            <Eye size={16} />
                          </div>
                          {columns.map(col => {
                            if (col.id === "name") return (
                              <div key={col.id} title={mod.name} className={`${col.width} min-w-0 font-bold text-hero-text truncate pr-4 text-[13px]`}>
                                {renamingModId === mod.id ? (
                                  <input autoFocus type="text" value={renamingText} onChange={e => setRenamingText(e.target.value)} onBlur={() => handleRenameSubmit(mod.id)} onKeyDown={e => { if (e.key === "Enter") handleRenameSubmit(mod.id); if (e.key === "Escape") setRenamingModId(null); }} className="bg-hero-bg/50 border border-hero-accent text-hero-text px-2 py-0.5 rounded-sm outline-none w-[90%]" onClick={e => e.stopPropagation()} />
                                ) : mod.name}
                              </div>
                            );
                            if (col.id === "author") return <div key={col.id} className={`${col.width} shrink-0 text-xs font-medium text-hero-muted truncate pr-4`}>{mod.author}</div>;
                            if (col.id === "version") return <div key={col.id} className={`${col.width} shrink-0 text-[10px] font-bold text-hero-muted pr-4`}>{mod.version}</div>;
                            if (col.id === "category") return (
                              <div key={col.id} className={`${col.width} shrink-0 pr-4`}>
                                <span className="px-2 py-0.5 bg-hero-surface text-hero-muted text-[9px] font-bold uppercase tracking-wider rounded-sm border border-hero-border group-hover:border-hero-accent/20 group-hover:text-hero-accent transition-colors">{mod.category}</span>
                              </div>
                            );
                            if (col.id === "character") return <div key={col.id} className={`${col.width} shrink-0 text-xs font-medium text-hero-muted truncate pr-4`}>{mod.character}</div>;
                            return null;
                          })}
                </DraggableWrapper>
              );
            };
            return items.map((item) => {
              if (item.type === 'mod') return renderMod(item.mod, false);
              else return <ModFolderRow key={item.folder.id} folder={item.folder} childrenMods={item.children} renderMod={renderMod} mods={mods} setMods={setMods} saveFolders={saveFolders} folders={folders} />;
            });
          })()}
          </div>
          <ActiveDragOverlay mods={mods} columns={columns} />
        </DndContext>
      </div>
      <div className="bg-black/40 relative min-w-0 min-h-0 overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-t from-hero-bg to-transparent z-0 opacity-80 pointer-events-none"></div>
         <div className="absolute inset-0 z-0 opacity-50 pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
         <div className="absolute inset-0 z-10">
           <ModelViewer selectedMod={mods.find(m => m.id === lastClickedModId)} />
         </div>
      </div>
    </>
  );
}
