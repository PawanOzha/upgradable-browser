import { useEffect, useState } from 'react';

interface BookmarkItem {
  id: number;
  title: string;
  url: string;
  pinned?: number;
  created_at: string;
}

interface BookmarksBarProps {
  version: number;
  onNavigate: (url: string) => void;
}

export default function BookmarksBar({ version, onNavigate }: BookmarksBarProps) {
  const [items, setItems] = useState<BookmarkItem[]>([]);

  const load = async () => {
    const res = await (window as any).bookmarks?.getAll?.();
    if (res?.success) {
      const pinned = (res.bookmarks || []).filter((b: any) => b.pinned);
      setItems(pinned);
    }
  };

  useEffect(() => {
    load();
  }, [version]);

  const getFavicon = (url: string) => {
    try {
      const u = new URL(url);
      return `${u.origin}/favicon.ico`;
    } catch {
      return '';
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="w-full h-8 flex items-center overflow-x-auto no-drag" style={{ backgroundColor: '#1b1b1a', borderBottom: '1px solid #3c3c3c' }}>
      <div className="flex items-center px-2 gap-1">
        {items.map((b) => (
          <button
            key={b.id}
            onClick={() => onNavigate(b.url)}
            className="flex items-center gap-2 px-2 h-6 rounded text-xs text-gray-200 hover:bg-[#2a2a28]"
            style={{ border: '1px solid #3c3c3c' }}
            title={b.title}
          >
            <img src={getFavicon(b.url)} alt="" width={14} height={14} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <span className="truncate max-w-[180px]">{b.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

