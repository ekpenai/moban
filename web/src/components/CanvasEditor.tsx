import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Group, Image as KonvaImage, Text, Transformer, Rect } from 'react-konva';
import { useEditorStore } from '../store/useEditorStore';
import type { TemplateLayer } from '../types';
import toast from 'react-hot-toast';
import api from '../lib/axios';
import { Undo2, Redo2, Sparkles, Minus, Plus, RefreshCw } from 'lucide-react';

/**
 * MacOS Elite 级设计系统
 */
const MACOS_THEME = {
  primary: '#6366F1',
  bg: 'rgba(255, 255, 255, 0.75)',
  border: 'rgba(255, 255, 255, 0.4)',
  shadow: '0 8px 32px -4px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.04)',
};

const TRANSFORMER_STYLE = {
  anchorFill: '#ffffff',
  anchorStroke: '#6366f1',
  anchorSize: 8,
  anchorCornerRadius: 2,
  borderStroke: '#6366f1',
  borderDash: [3, 3],
  padding: 2,
};

// 尺寸监听方案
const useContainerSize = (ref: React.RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return size;
};

const getLayerMaskUrl = (layer: TemplateLayer): string | undefined => {
  const mask = layer.mask;
  if (typeof mask === 'string') return mask;
  return (
    layer.maskUrl ||
    layer.mask_url ||
    layer.maskSrc ||
    layer.maskPath ||
    mask?.url ||
    mask?.src ||
    mask?.path ||
    mask?.image ||
    layer.maskInfo?.url ||
    layer.clippingMask?.url ||
    layer.clipMask?.url
  );
};

const isLayerReplaceable = (layer: TemplateLayer): boolean => {
  if (typeof layer.isReplaceable === 'boolean') return layer.isReplaceable;
  const text = `${layer.name || ''} ${layer.title || ''} ${layer.label || ''}`;
  return text.includes('替换');
};

const URLImage = ({ layer, isSelected, isHovered, onSelect, onHover, onChange, onDblClick }: any) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [maskImage, setMaskImage] = useState<HTMLImageElement | null>(null);
  const groupRef = useRef<any>(null);
  const trRef = useRef<any>(null);
  const maskUrl = getLayerMaskUrl(layer);

  useEffect(() => {
    setImage(null);
    if (layer.url) {
      const img = new window.Image();
      img.crossOrigin = 'Anonymous';
      img.src = layer.url;
      img.onload = () => setImage(img);
    }
  }, [layer.url]);

  useEffect(() => {
    if (maskUrl) {
      const img = new window.Image();
      img.crossOrigin = 'Anonymous';
      img.src = maskUrl;
      img.onload = () => {
        // Convert grayscale mask (white=visible, black=hidden) to alpha mask.
        // Transparent PNG masks keep their own alpha, which is what WeChat mini-program templates usually need.
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const brightness = Math.max(data[i], data[i + 1], data[i + 2]);
            data[i + 3] = Math.round((data[i + 3] * brightness) / 255);
          }
          ctx.putImageData(imageData, 0, 0);
          
          const alphaImg = new window.Image();
          alphaImg.onload = () => setMaskImage(alphaImg);
          alphaImg.src = canvas.toDataURL('image/png');
        } else {
          setMaskImage(img);
        }
      };
      img.onerror = () => setMaskImage(null);
    } else {
      setMaskImage(null);
    }
  }, [maskUrl]);

  useEffect(() => {
    const node = groupRef.current;
    if (!node || !image) return;

    // Use alpha-based hit map so transparent pixels don't block clicks.
    if (typeof node.clearCache === 'function') {
      node.clearCache();
    }
    if (typeof node.cache === 'function') {
      node.cache({
        x: 0,
        y: 0,
        width: Math.max(1, layer.width),
        height: Math.max(1, layer.height),
        pixelRatio: 1,
      });
    }
    if (typeof node.drawHitFromCache === 'function') {
      node.drawHitFromCache(1);
    }
    
    node.getLayer()?.batchDraw();

    return () => {
      if (typeof node.clearCache === 'function') {
        node.clearCache();
      }
    };
  }, [image, maskImage, layer.width, layer.height]);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <React.Fragment>
      <Group
        ref={groupRef}
        x={layer.x} y={layer.y} rotation={layer.rotation}
        width={layer.width} height={layer.height}
        draggable={layer.editable}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = groupRef.current;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(), y: node.y(), rotation: node.rotation(),
            width: Math.max(5, layer.width * sx),
            height: Math.max(5, layer.height * sy),
          });
        }}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onMouseEnter={() => onHover(layer.id)}
        onMouseLeave={() => onHover(null)}
      >
        <KonvaImage
          image={image as any}
          width={layer.width}
          height={layer.height}
        />
        {maskImage && (
          <KonvaImage
            image={maskImage as any}
            x={layer.maskRect ? layer.maskRect.x - layer.x : 0}
            y={layer.maskRect ? layer.maskRect.y - layer.y : 0}
            width={layer.maskRect ? layer.maskRect.width : layer.width}
            height={layer.maskRect ? layer.maskRect.height : layer.height}
            globalCompositeOperation="destination-in"
          />
        )}
      </Group>

      {isHovered && !isSelected && (
        <Rect
          x={layer.x} y={layer.y} width={layer.width} height={layer.height}
          rotation={layer.rotation} stroke="#6366f1" strokeWidth={2} dash={[4, 2]}
          listening={false} opacity={0.6}
        />
      )}
      {isSelected && (
        <Transformer
          ref={trRef}
          {...TRANSFORMER_STYLE}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5) ? oldBox : newBox}
        />
      )}
    </React.Fragment>
  );
};

const EditableText = ({ layer, isSelected, isHovered, onSelect, onHover, onChange }: any) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const handleDblClick = () => {
    const nt = prompt('内容', layer.text || '');
    if (nt !== null) onChange({ text: nt });
  };

  return (
    <React.Fragment>
      <Text
        onClick={onSelect} onTap={onSelect} onDblClick={handleDblClick} onDblTap={handleDblClick}
        onMouseEnter={() => onHover(layer.id)} onMouseLeave={() => onHover(null)}
        ref={shapeRef} {...layer} text={layer.text || ''} fontSize={layer.fontSize || 20}
        fill={layer.color || '#000'} draggable={layer.editable}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = shapeRef.current;
          const sx = node.scaleX();
          node.scaleX(1); node.scaleY(1);
          onChange({
            x: node.x(), y: node.y(), rotation: node.rotation(),
            fontSize: (layer.fontSize || 20) * sx,
            width: Math.max(5, node.width() * sx),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef} {...TRANSFORMER_STYLE}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </React.Fragment>
  );
};

export const CanvasEditor: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerSize = useContainerSize(containerRef);
  const { 
    setTemplate, template, selectedId, setSelectedId, updateLayer,
    undo, redo, past, future, requestReplaceId, setRequestReplaceId,
    setRequestCropInfo, setStageRef
  } = useEditorStore();
  
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isUploadingPsd, setIsUploadingPsd] = useState(false);
  const stageRefLocal = useRef<any>(null);

  useEffect(() => {
    setStageRef(stageRefLocal.current);
  }, [stageRefLocal.current, setStageRef]);

  useEffect(() => {
    if (requestReplaceId) {
      const layer = template?.layers.find(l => l.id === requestReplaceId);
      if (layer?.type === 'image') onImageDblClick(requestReplaceId);
      setRequestReplaceId(null);
    }
  }, [requestReplaceId]);

  const handleReplaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingId) return;
    
    // 获取当前图层信息以锁定裁剪比例
    const layer = template?.layers.find(l => l.id === replacingId);
    if (!layer) return;

    const maskRect = layer.maskRect;
    const cropWidth = maskRect?.width || layer.width;
    const cropHeight = maskRect?.height || layer.height;

    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setRequestCropInfo({
        id: replacingId,
        url,
        aspect: cropWidth / cropHeight
      });
      setReplacingId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const onImageDblClick = (id: string) => {
    const layer = template?.layers.find(l => l.id === id);
    if (layer && !isLayerReplaceable(layer)) {
      toast.error('该图片图层未标记为可替换');
      return;
    }
    setReplacingId(id);
    fileInputRef.current?.click();
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') { setIsSpacePressed(true); if (e.target === document.body) e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpacePressed(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const { finalScale, finalX, finalY } = useMemo(() => {
    const cw = containerSize.width || 800;
    const ch = containerSize.height || 600;
    if (!template) return { finalScale: 1, finalX: 0, finalY: 0 };
    const sp = 160;
    const bs = Math.min((cw - sp) / template.width, (ch - sp) / template.height);
    const s = bs * zoom;
    return { finalScale: s, finalX: (cw - template.width * s) / 2 + stagePos.x, finalY: (ch - template.height * s) / 2 + stagePos.y };
  }, [template, containerSize, zoom, stagePos]);

  const handleWheel = (e: any) => {
    if (e.evt.ctrlKey) {
      e.evt.preventDefault();
      const d = e.evt.deltaY > 0 ? 0.92 : 1.08;
      setZoom(p => Math.min(Math.max(p * d, 0.1), 8));
    }
  };

  if (!template) {
    const handlePsdUploadFromCanvas = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploadingPsd(true);
      const formData = new FormData();
      formData.append('file', file);
      const tid = toast.loading('正在解析 PSD...');
      try {
        const res = await api.post('/upload/psd', formData);
        setTemplate(res.data.data);
        toast.success('PSD 导入成功', { id: tid });
      } catch {
        toast.error('导入失败', { id: tid });
      } finally {
        setIsUploadingPsd(false);
      }
    };

    return (
      <label className="flex flex-col items-center justify-center p-20 bg-white/40 backdrop-blur-xl rounded-[48px] border border-white shadow-2xl animate-in zoom-in-95 duration-700 cursor-pointer group hover:scale-105 transition-all">
        <input type="file" hidden accept=".psd" onChange={handlePsdUploadFromCanvas} />
        <div className="w-20 h-20 bg-indigo-50 rounded-[28px] flex items-center justify-center text-indigo-400 mb-6 shadow-inner ring-8 ring-indigo-50/50 group-hover:bg-indigo-600 group-hover:text-white transition-all">
          {isUploadingPsd ? <RefreshCw className="w-10 h-10 animate-spin" /> : <Sparkles size={40} strokeWidth={1} />}
        </div>
        <p className="text-xl font-black text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">
          {isUploadingPsd ? '正在解析设计...' : '点击或拖入 PSD 设计稿'}
        </p>
        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-[3px]">
          {isUploadingPsd ? 'Optimizing Layers' : 'Start your creation here'}
        </p>
      </label>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden flex items-center justify-center">
      <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleReplaceImage} />

      <Stage
        ref={stageRefLocal}
        width={containerSize.width || 800} height={containerSize.height || 600}
        scaleX={finalScale} scaleY={finalScale} x={finalX} y={finalY}
        draggable={isSpacePressed} onWheel={handleWheel}
        onDragEnd={(e) => {
          if (isSpacePressed) {
            const bx = (containerSize.width - template.width * finalScale) / 2;
            const by = (containerSize.height - template.height * finalScale) / 2;
            setStagePos({ x: e.target.x() - bx, y: e.target.y() - by });
          }
        }}
        onMouseDown={(e) => e.target === e.target.getStage() && setSelectedId(null)}
        className={`${isSpacePressed ? 'cursor-grabbing' : 'cursor-crosshair'} transition-all duration-300`}
      >
        <Layer>
          <Rect
            x={0} y={0} width={template.width} height={template.height}
            fill="#ffffff" shadowBlur={60} shadowColor="rgba(0,0,0,0.08)" shadowOffsetY={10} cornerRadius={2}
          />
          <Group clipX={0} clipY={0} clipWidth={template.width} clipHeight={template.height}>
            {template.layers.map((layer: TemplateLayer) => {
              const props = {
                layer, isSelected: layer.id === selectedId, isHovered: layer.id === hoverId,
                onSelect: () => setSelectedId(layer.id), onHover: setHoverId,
                onChange: (newAttrs: any) => updateLayer(layer.id, newAttrs),
                onDblClick: () => layer.type === 'image' && onImageDblClick(layer.id),
              };
              return layer.type === 'image' ? <URLImage key={layer.id} {...props} /> : <EditableText key={layer.id} {...props} />;
            })}
          </Group>
        </Layer>
      </Stage>

      {/* MacOS Capsule Control Console */}
      <div className="absolute bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 md:p-1.5 bg-white/85 backdrop-blur-2xl rounded-full border border-white/40 shadow-[0_12px_44px_-8px_rgba(0,0,0,0.12)] z-50 animate-in slide-in-from-bottom-10 duration-1000 scale-[0.86] sm:scale-100 origin-bottom">
        
        {/* History Group */}
        <div className="flex gap-0.5 px-0.5">
          <button 
            onClick={undo} disabled={past.length === 0}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${past.length === 0 ? 'text-slate-200 opacity-40' : 'text-slate-600 hover:bg-slate-100 active:scale-90 hover:shadow-sm'}`}
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button 
            onClick={redo} disabled={future.length === 0}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${future.length === 0 ? 'text-slate-200 opacity-40' : 'text-slate-600 hover:bg-slate-100 active:scale-90 hover:shadow-sm'}`}
            title="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-slate-200 mx-1" />

        {/* Zoom Group */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setZoom(p => Math.max(p - 0.1, 0.2))} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:scale-90"><Minus size={16} /></button>
          <div className="min-w-[42px] sm:min-w-[50px] text-center text-[10px] font-black text-slate-400 tracking-tighter tabular-nums px-1">
            {Math.round(finalScale * 100)}%
          </div>
          <button onClick={() => setZoom(p => Math.min(p + 0.1, 6))} className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:scale-90"><Plus size={16} /></button>
        </div>

        <div className="w-[1px] h-4 bg-slate-200 mx-1" />

        {/* Reset Capsule */}
        <button 
          onClick={() => {setZoom(1); setStagePos({x: 0, y: 0});}}
          className="h-9 px-2.5 sm:px-4 flex items-center gap-1.5 sm:gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:bg-indigo-600 hover:text-white rounded-full transition-all active:scale-95 hover:shadow-lg hover:shadow-indigo-100"
        >
          <RefreshCw size={12} />
          <span className="hidden sm:inline">Centering</span>
          <span className="sm:hidden">Center</span>
        </button>
      </div>

      {!isSpacePressed && (
        <div className="hidden md:flex absolute bottom-8 right-10 text-[8px] font-black text-slate-400 uppercase tracking-[3px] pointer-events-none drop-shadow-sm opacity-50 items-center gap-3 animate-pulse">
          <div className="flex items-center gap-1"><span className="bg-slate-300 text-white p-0.5 rounded px-1.5 font-sans">SPACE</span> PAN</div>
          <div className="flex items-center gap-1"><span className="bg-slate-300 text-white p-0.5 rounded px-1.5 font-sans">CTRL+滚轮</span> ZOOM</div>
        </div>
      )}
    </div>
  );
};
