import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export function TitleBar() {
  return (
    <div className="h-10 select-none flex justify-between items-center fixed top-0 left-0 right-0 z-[99999] bg-black/40 backdrop-blur-md border-b border-white/5">
      <div 
        className="flex items-center gap-3 pl-4 pointer-events-none w-48 h-full"
      >
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)] opacity-50">Sanctuary OS</span>
      </div>

      <div 
        data-tauri-drag-region
        onMouseDown={async () => { try { await getCurrentWebviewWindow().startDragging(); } catch(e) { console.error(e); } }}
        className="flex-1 h-full cursor-default"
      ></div>
      
      <div className="flex h-full items-center z-[100000]">
        <button 
          onClick={async () => { await getCurrentWebviewWindow().minimize(); }} 
          className="w-12 h-full hover:bg-white/10 flex justify-center items-center text-[var(--text)] transition-colors opacity-70 hover:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6"></rect></svg>
        </button>
        <button 
          onClick={async () => { await getCurrentWebviewWindow().toggleMaximize(); }} 
          className="w-12 h-full hover:bg-white/10 flex justify-center items-center text-[var(--text)] transition-colors opacity-70 hover:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor"></rect></svg>
        </button>
        <button 
          onClick={async () => { await getCurrentWebviewWindow().close(); }} 
          className="w-12 h-full hover:bg-red-500 hover:text-white flex justify-center items-center text-[var(--text)] transition-colors opacity-70 hover:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M11.707 1.707L10.293 .293 6 4.586 1.707 .293 .293 1.707 4.586 6 .293 10.293l1.414 1.414L6 7.414l4.293 4.293 1.414-1.414L7.414 6z"></path></svg>
        </button>
      </div>
    </div>
  );
}
