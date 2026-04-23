import React, { useState, useEffect, useCallback } from 'react';
import { X, Upload, Clipboard, Type, Check, Loader2, Image as ImageIcon } from 'lucide-react';
import api from '../lib/axios';

interface SaveModalProps {
  onClose: () => void;
  onConfirm: (data: { category: string; thumbnailUrl: string }) => Promise<void>;
  initialCategory?: string;
  initialPreview?: string | null;
}

export const SaveModal: React.FC<SaveModalProps> = ({ onClose, onConfirm, initialCategory = '未分类', initialPreview = null }) => {
  const [category, setCategory] = useState(initialCategory);
  const [preview, setPreview] = useState<string | null>(initialPreview);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = (selectedFile: File) => {
    if (selectedFile.type.startsWith('image/')) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onPaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) handleFile(blob);
        }
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPaste]);

  const handleConfirm = async () => {
    if (!preview || isSaving) return;
    setIsSaving(true);
    try {
      let finalThumbnailUrl = '';
      if (file) {
        // 如果有新选择的文件，则上传
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post('/upload/image', fd);
        finalThumbnailUrl = data.url;
      } else if (preview && (preview.startsWith('http') || preview.startsWith('data:image') || preview.startsWith('/'))) {
          finalThumbnailUrl = preview;
      }
      
      await onConfirm({ category, thumbnailUrl: finalThumbnailUrl });
    } catch (error) {
      console.error('Save failed', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white/90 backdrop-blur-2xl w-full max-w-lg rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.15)] border border-white/50 overflow-hidden animate-in zoom-in-95 duration-500">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black tracking-tight text-slate-800">保存设计</h3>
            <p className="text-[10px] font-black uppercase tracking-[2px] text-slate-400 mt-1">Finalize your creation</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all active:scale-75">
            <X size={20} />
          </button>
        </div>

        <div className="px-8 pb-10 space-y-8">
          
          {/* 分类输入 */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">所属分类</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                <Type size={18} />
              </div>
              <input 
                type="text" 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例如：证件、海报、个人..."
                className="w-full h-14 pl-12 pr-6 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-4 focus:ring-indigo-50 transition-all outline-none"
              />
            </div>
          </div>

          {/* 封面上传区 */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">封面图 (支持拖拽/点击/粘贴)</label>
            <div 
              onDragEnter={onDrag}
              onDragLeave={onDrag}
              onDragOver={onDrag}
              onDrop={onDrop}
              onClick={() => document.getElementById('cover-upload')?.click()}
              className={`relative group h-64 rounded-[28px] border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden ${
                dragActive ? 'border-indigo-500 bg-indigo-50/50 scale-[0.98]' : 
                preview ? 'border-transparent bg-slate-50' : 'border-slate-100 bg-slate-50/50 hover:bg-white hover:border-indigo-100'
              }`}
            >
              {preview ? (
                <div className="relative w-full h-full group/preview">
                  <img src={preview} alt="Preview" className="w-full h-full object-contain p-4" />
                  <div className="absolute inset-0 bg-slate-900/0 group-hover/preview:bg-slate-900/10 transition-all flex items-center justify-center">
                    <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-sm opacity-0 group-hover/preview:opacity-100 transition-all transform translate-y-4 group-hover/preview:translate-y-0 flex items-center gap-2">
                       <Upload size={14} className="text-indigo-600" />
                       <span className="text-[10px] font-black uppercase text-slate-600">更换图片</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center px-8">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-50 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 group-hover:shadow-indigo-100 transition-all duration-500">
                    <ImageIcon className="text-slate-300 group-hover:text-indigo-500 transition-colors" size={32} strokeWidth={1.5} />
                  </div>
                  <p className="text-xs font-bold text-slate-700">将封面拖到这里</p>
                  <p className="text-[10px] font-bold text-slate-300 mt-2 flex items-center justify-center gap-4">
                     <span className="flex items-center gap-1"><Upload size={10} /> 浏览本地</span>
                     <span className="w-[1px] h-3 bg-slate-200" />
                     <span className="flex items-center gap-1"><Clipboard size={10} /> 直接粘贴</span>
                  </p>
                </div>
              )}
              <input 
                id="cover-upload" 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} 
              />
            </div>
          </div>

          {/* Action Button */}
          <button 
            onClick={handleConfirm}
            disabled={!preview || isSaving}
            className={`w-full h-16 rounded-[20px] flex items-center justify-center gap-3 text-sm font-black uppercase tracking-[2px] transition-all relative overflow-hidden ${
              !preview ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 
              'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-0.5 active:scale-[0.98]'
            }`}
          >
            {isSaving ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <Check size={20} />
                确认并保存
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
