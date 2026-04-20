import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { getCroppedImg } from '../utils/cropUtils';
import { X, Check, ZoomIn, Scissors } from 'lucide-react';

interface CropModalProps {
  image: string;
  aspect: number;
  onClose: () => void;
  onConfirm: (blob: Blob) => void;
}

export const CropModal: React.FC<CropModalProps> = ({ image, aspect, onClose, onConfirm }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [loading, setLoading] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setLoading(true);
    try {
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels);
      if (croppedBlob) {
        onConfirm(croppedBlob);
      }
    } catch (e) {
      console.error('裁剪失败:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white/90 backdrop-blur-2xl w-full max-w-2xl rounded-[32px] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.3)] border border-white flex flex-col animate-in zoom-in-95 duration-500">
        
        {/* Header */}
        <div className="px-8 py-6 flex items-center justify-between border-b border-slate-100">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Scissors className="text-indigo-600" size={20} />
              裁剪图像
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Adjust selection to fit layer</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Cropper Work Area */}
        <div className="relative flex-1 bg-slate-50 min-h-[400px]">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            classes={{
              containerClassName: 'cursor-move',
              mediaClassName: 'object-contain',
            }}
          />
        </div>

        {/* Controls */}
        <div className="px-8 py-8 bg-white space-y-6">
          <div className="flex items-center gap-4">
            <ZoomIn size={18} className="text-slate-400 shrink-0" />
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-indigo-600 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-[10px] font-black text-slate-500 w-8">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="flex gap-3 mt-4">
            <button 
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-all active:scale-95"
            >
              取消
            </button>
            <button 
              onClick={handleConfirm}
              disabled={loading}
              className="flex-[2] h-12 rounded-2xl bg-indigo-600 text-white font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check size={18} />
              )}
              确认裁剪并应用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
