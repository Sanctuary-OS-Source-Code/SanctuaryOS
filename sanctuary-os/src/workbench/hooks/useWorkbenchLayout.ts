import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';

interface UseWorkbenchLayoutProps {
   editorRef: any;
   previewMode: 'preview' | 'file' | 'off';
   isTemplateMode: boolean;
}

export function useWorkbenchLayout({ editorRef, previewMode, isTemplateMode }: UseWorkbenchLayoutProps) {
   const [isLight, setIsLight] = useState(false);
   const [isFullscreen, setIsFullscreen] = useState(false);
   const [previewWidth, setPreviewWidth] = useState(600);
   const [isResizingPreview, setIsResizingPreview] = useState(false);
   const rawContainerRef = useRef<HTMLDivElement>(null);
   const dragPreviewWidthRef = useRef<number>(600);
   const [isTemplateGuideOpen, setIsTemplateGuideOpen] = useState(false);
   const [showTimeline, setShowTimeline] = useState(false);
   const [confirmSaveWithErrors, setConfirmSaveWithErrors] = useState(false);
   
   const [isScrollLocked, setIsScrollLocked] = useState(false);
   
   const visualScrollRef = useRef<HTMLDivElement>(null);
   const rightEditorRef = useRef<any>(null);
   const isSyncingScroll = useRef(false);
   const isJumping = useRef(0);

   useEffect(() => {
      const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
      if (bg) {
         const bgHex = bg.replace('#', '');
         const r = parseInt(bgHex.substring(0, 2), 16) || 0;
         const g = parseInt(bgHex.substring(2, 4), 16) || 0;
         const b = parseInt(bgHex.substring(4, 6), 16) || 0;
         const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
         setIsLight(luminance > 0.5);
      }
   }, []);

   useEffect(() => {
      if (!isResizingPreview) return;
      const handleMouseMove = (e: MouseEvent) => {
         const newWidth = Math.max(300, window.innerWidth - e.clientX - 40);
         dragPreviewWidthRef.current = newWidth;
         if (rawContainerRef.current) {
            rawContainerRef.current.style.width = `${newWidth}px`;
         }
      };
      const handleMouseUp = () => {
         setIsResizingPreview(false);
         setPreviewWidth(dragPreviewWidthRef.current);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
         document.removeEventListener('mousemove', handleMouseMove);
         document.removeEventListener('mouseup', handleMouseUp);
      };
   }, [isResizingPreview]);

   useEffect(() => {
      if (!isScrollLocked || !editorRef) return;
      const editor = editorRef;

      if (rightEditorRef.current && previewMode === 'file') {
         const rightEditor = rightEditorRef.current;
         const leftScrollListener = editor.onDidScrollChange((e: any) => {
            if (isSyncingScroll.current || Date.now() < isJumping.current) return;
            isSyncingScroll.current = true;
            const leftHeight = editor.getScrollHeight() - editor.getLayoutInfo().height;
            const perc = leftHeight > 0 ? e.scrollTop / leftHeight : 0;
            const rightHeight = rightEditor.getScrollHeight() - rightEditor.getLayoutInfo().height;
            rightEditor.setScrollTop(perc * rightHeight);
            setTimeout(() => { isSyncingScroll.current = false; }, 10);
         });

         const rightScrollListener = rightEditor.onDidScrollChange((e: any) => {
            if (isSyncingScroll.current || Date.now() < isJumping.current) return;
            isSyncingScroll.current = true;
            const rightHeight = rightEditor.getScrollHeight() - rightEditor.getLayoutInfo().height;
            const perc = rightHeight > 0 ? e.scrollTop / rightHeight : 0;
            const leftHeight = editor.getScrollHeight() - editor.getLayoutInfo().height;
            editor.setScrollTop(perc * leftHeight);
            setTimeout(() => { isSyncingScroll.current = false; }, 10);
         });

         return () => {
            leftScrollListener.dispose();
            rightScrollListener.dispose();
         };
      }

      if (visualScrollRef.current && (!isTemplateMode || previewMode === 'preview')) {
         const visual = visualScrollRef.current;

         const handleVisualScroll = () => {
            if (isSyncingScroll.current || Date.now() < isJumping.current) return;
            isSyncingScroll.current = true;

            requestAnimationFrame(() => {
               const vHeight = visual.scrollHeight - visual.clientHeight;
               const vPerc = vHeight > 0 ? visual.scrollTop / vHeight : 0;
               const eHeight = editor.getScrollHeight() - editor.getLayoutInfo().height;
               editor.setScrollTop(vPerc * eHeight);
               
               setTimeout(() => { isSyncingScroll.current = false; }, 10);
            });
         };

         const monacoScrollListener = editor.onDidScrollChange((e: any) => {
            if (isSyncingScroll.current || Date.now() < isJumping.current) return;
            isSyncingScroll.current = true;

            const eHeight = editor.getScrollHeight() - editor.getLayoutInfo().height;
            const ePerc = eHeight > 0 ? e.scrollTop / eHeight : 0;

            const vHeight = visual.scrollHeight - visual.clientHeight;
            visual.scrollTop = ePerc * vHeight;

            setTimeout(() => { isSyncingScroll.current = false; }, 10);
         });

         visual.addEventListener('scroll', handleVisualScroll);
         return () => {
            visual.removeEventListener('scroll', handleVisualScroll);
            monacoScrollListener.dispose();
         };
      }
   }, [isScrollLocked, editorRef, previewMode, isTemplateMode]);

   return {
      isLight,
      isFullscreen, setIsFullscreen,
      previewWidth, setPreviewWidth, rawContainerRef, dragPreviewWidthRef,
      isResizingPreview, setIsResizingPreview,
      isTemplateGuideOpen, setIsTemplateGuideOpen,
      showTimeline, setShowTimeline,
      confirmSaveWithErrors, setConfirmSaveWithErrors,
      isScrollLocked, setIsScrollLocked,
      visualScrollRef, rightEditorRef,
      isJumping
   };
}
