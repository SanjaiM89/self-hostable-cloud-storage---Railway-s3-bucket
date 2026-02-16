import { createContext, useContext, useMemo, useState } from 'react';
import { ChevronRight, Folder as FolderIcon, FolderOpen, File as FileIcon } from 'lucide-react';

const TreeCtx = createContext(null);

export function Tree({ elements = [], initialExpandedItems = [], initialSelectedId, onSelect, className = '', children }) {
  const [selectedId, setSelectedId] = useState(initialSelectedId || null);
  const [expanded, setExpanded] = useState(() => Object.fromEntries(initialExpandedItems.map((id) => [id, true])));

  const value = useMemo(() => ({
    selectedId,
    expanded,
    setSelectedId: (id) => {
      setSelectedId(id);
      onSelect?.(id);
    },
    toggle: (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] })),
  }), [selectedId, expanded, onSelect]);

  return <TreeCtx.Provider value={value}><div className={className}>{children || elements.map((el) => <TreeNode key={el.id} element={el} />)}</div></TreeCtx.Provider>;
}

function TreeNode({ element, level = 0 }) {
  const isFolder = !!element.children?.length;
  if (isFolder) {
    return (
      <Folder value={element.id} element={element.name} level={level}>
        {element.children.map((child) => <TreeNode key={child.id} element={child} level={level + 1} />)}
      </Folder>
    );
  }
  return <File value={element.id} level={level} label={element.name} />;
}

export function Folder({ element, value, level = 0, children }) {
  const { selectedId, setSelectedId, expanded, toggle } = useContext(TreeCtx);
  const open = !!expanded[value];
  const selected = selectedId === value;
  return (
    <div>
      <button
        className={`w-full min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${selected ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-text-active)]' : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]'}`}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => { setSelectedId(value); toggle(value); }}
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} strokeWidth={2.4} />
        {open ? <FolderOpen className="w-4 h-4 text-[var(--sidebar-accent)]" strokeWidth={2.4} /> : <FolderIcon className="w-4 h-4 app-icon-solid" strokeWidth={2.4} />}
        <span className="flex-1 min-w-0 truncate text-left whitespace-nowrap">{element}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

export function File({ value, level = 0, label }) {
  const { selectedId, setSelectedId } = useContext(TreeCtx);
  const selected = selectedId === value;
  return (
    <button
      className={`w-full min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${selected ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-text-active)]' : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]'}`}
      style={{ paddingLeft: `${8 + level * 16 + 18}px` }}
      onClick={() => setSelectedId(value)}
    >
      <FileIcon className="w-3.5 h-3.5 app-icon-solid" strokeWidth={2.3} />
      <span className="flex-1 min-w-0 truncate text-left whitespace-nowrap">{label}</span>
    </button>
  );
}
