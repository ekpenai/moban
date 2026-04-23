import React, { useState, useEffect } from 'react';
import { X, Upload, Trash2, Loader2, Save } from 'lucide-react';
import api from '../lib/axios';
import toast from 'react-hot-toast';

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const [carousel, setCarousel] = useState<string[]>([]);
  const [categories, setCategories] = useState<{ name: string; icon: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [res1, res2] = await Promise.all([
          api.get('/settings/carousel'),
          api.get('/settings/categories')
        ]);
        if (res1.data.data) setCarousel(res1.data.data);
        if (res2.data.data) setCategories(res2.data.data);
      } catch (e) {
        toast.error('获取配置失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleUpload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/upload/sys-image', fd);
    return data.url;
  };

  const addCarouselImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const tid = toast.loading('上传中...');
    try {
      const url = await handleUpload(e.target.files[0]);
      setCarousel(prev => [...prev, url]);
      toast.success('上传成功', { id: tid });
    } catch {
      toast.error('上传失败', { id: tid });
    }
  };

  const addCategory = () => {
    setCategories(prev => [...prev, { name: '新分类', icon: '' }]);
  };

  const updateCategoryIcon = async (index: number, file: File) => {
    const tid = toast.loading('上传图标...');
    try {
      const url = await handleUpload(file);
      const newCats = [...categories];
      newCats[index].icon = url;
      setCategories(newCats);
      toast.success('上传成功', { id: tid });
    } catch {
      toast.error('上传失败', { id: tid });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/settings/carousel', { value: carousel });
      await api.post('/settings/categories', { value: categories });
      toast.success('配置保存成功');
      onClose();
    } catch {
      toast.error('保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white/95 backdrop-blur-xl rounded-[32px] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-[0_32px_64px_-12px_rgba(0,0,0,0.15)] border border-white/50 overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="px-8 py-6 flex items-center justify-between border-b border-slate-100">
          <div>
            <h3 className="text-xl font-black tracking-tight text-slate-800">系统配置</h3>
            <p className="text-[10px] font-black uppercase tracking-[2px] text-slate-400 mt-1">小程序系统素材配置</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all active:scale-75">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Carousel */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">首页轮播图配置</h4>
              <label className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-indigo-100 hover:-translate-y-0.5 active:scale-95 transition-all">
                <input type="file" hidden accept="image/*" onChange={addCarouselImage} />
                + 添加图片
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {carousel.map((url, i) => (
                <div key={i} className="relative group aspect-video bg-slate-100 rounded-[20px] overflow-hidden border border-slate-200">
                  <img src={url} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors" />
                  <button onClick={() => setCarousel(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-2 right-2 p-2 bg-white/90 backdrop-blur text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm hover:bg-red-50 hover:scale-110 active:scale-90">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {carousel.length === 0 && (
                <div className="col-span-full py-8 border-2 border-dashed border-slate-100 rounded-[20px] flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  暂无轮播图数据
                </div>
              )}
            </div>
          </div>

          <div className="w-full h-px bg-slate-100" />

          {/* Categories */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-600">分类导航配置</h4>
              <button onClick={addCategory} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-indigo-100 hover:-translate-y-0.5 active:scale-95 transition-all">
                + 添加分类
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {categories.map((cat, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 rounded-2xl border border-slate-100 group">
                  <label className="w-14 h-14 shrink-0 bg-white border border-slate-200 rounded-[14px] flex items-center justify-center cursor-pointer hover:border-indigo-300 overflow-hidden relative group/upload">
                    {cat.icon ? <img src={cat.icon} className="w-full h-full object-contain p-2" /> : <Upload size={16} className="text-slate-300" />}
                    <div className="absolute inset-0 bg-white/80 opacity-0 group-hover/upload:opacity-100 flex items-center justify-center transition-all">
                       <Upload size={14} className="text-indigo-500" />
                    </div>
                    <input type="file" hidden accept="image/*" onChange={(e) => { if(e.target.files?.[0]) updateCategoryIcon(i, e.target.files[0]) }} />
                  </label>
                  <input 
                    value={cat.name}
                    onChange={(e) => {
                      const newCats = [...categories];
                      newCats[i].name = e.target.value;
                      setCategories(newCats);
                    }}
                    className="flex-1 h-12 px-4 border-none bg-white rounded-xl text-sm font-bold outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                    placeholder="如: 婚庆海报"
                  />
                  <button onClick={() => setCategories(prev => prev.filter((_, idx) => idx !== i))} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-90">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <div className="col-span-full py-8 border-2 border-dashed border-slate-100 rounded-[20px] flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  暂无分类数据
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button onClick={handleSave} disabled={saving} className="h-12 px-8 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-[2px] flex items-center gap-2 hover:bg-indigo-700 hover:-translate-y-0.5 active:scale-95 transition-all shadow-lg shadow-indigo-100">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            保存配置应用
          </button>
        </div>
      </div>
    </div>
  );
};
