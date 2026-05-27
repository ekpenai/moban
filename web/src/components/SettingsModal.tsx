import React, { useEffect, useMemo, useState } from 'react';
import { X, Upload, Trash2, Loader2, Save, Type, ImageIcon, Layers3 } from 'lucide-react';
import api from '../lib/axios';
import toast from 'react-hot-toast';

type CategoryItem = {
  name: string;
  icon: string;
};

type FontItem = {
  label: string;
  family: string;
  source: string;
  previewText?: string;
};

const FONT_PREVIEW_TEXT = 'تويعا ۋلاسسىن قۇرمىتى مېھمان';

function sanitizeFonts(fonts: unknown): FontItem[] {
  if (!Array.isArray(fonts)) return [];
  return fonts
    .map((item: any) => ({
      label: String(item?.label || item?.name || '').trim(),
      family: String(item?.family || item?.fontFamily || '').trim(),
      source: String(item?.source || item?.url || item?.fileUrl || item?.fontUrl || '').trim(),
      previewText: String(item?.previewText || item?.sampleText || FONT_PREVIEW_TEXT).trim(),
    }))
    .filter((item) => item.label && item.family && item.source);
}

const FontPreviewCard = ({ font, index }: { font: FontItem; index: number }) => {
  const fontFaceCss = useMemo(() => {
    const family = `font-preview-${index}-${font.family}`;
    return {
      family,
      css: `@font-face { font-family: '${family}'; src: url('${font.source}'); }`,
    };
  }, [font.family, font.source, index]);

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <style>{fontFaceCss.css}</style>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-800">{font.label}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{font.family}</div>
        </div>
        <a
          href={font.source}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 hover:bg-slate-200"
        >
          Font URL
        </a>
      </div>
      <div
        className="mt-4 rounded-[18px] bg-slate-50 px-4 py-5 text-right text-[28px] leading-[1.6] text-slate-800"
        style={{ fontFamily: `'${fontFaceCss.family}', sans-serif`, direction: 'rtl' }}
      >
        {font.previewText || FONT_PREVIEW_TEXT}
      </div>
    </div>
  );
};

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const [carousel, setCarousel] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFontIndex, setUploadingFontIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [res1, res2, res3] = await Promise.all([
          api.get('/settings/carousel'),
          api.get('/settings/categories'),
          api.get('/settings/fonts'),
        ]);
        if (Array.isArray(res1.data?.data)) setCarousel(res1.data.data);
        if (Array.isArray(res2.data?.data)) setCategories(res2.data.data);
        setFonts(sanitizeFonts(res3.data?.data));
      } catch {
        toast.error('获取配置失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleImageUpload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/upload/sys-image', fd);
    return data.url as string;
  };

  const handleFontUpload = async (index: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    setUploadingFontIndex(index);
    try {
      const { data } = await api.post('/upload/sys-font', fd);
      setFonts((prev) => {
        const next = [...prev];
        const current = next[index] || { label: '', family: '', source: '' };
        next[index] = {
          ...current,
          label: current.label || data.name || file.name.replace(/\.[^.]+$/, ''),
          family: current.family || (data.name || file.name.replace(/\.[^.]+$/, '')).replace(/\s+/g, ''),
          source: data.url,
          previewText: current.previewText || FONT_PREVIEW_TEXT,
        };
        return next;
      });
      toast.success('字体上传成功');
    } catch {
      toast.error('字体上传失败');
    } finally {
      setUploadingFontIndex(null);
    }
  };

  const addCarouselImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const tid = toast.loading('上传中...');
    try {
      const url = await handleImageUpload(e.target.files[0]);
      setCarousel((prev) => [...prev, url]);
      toast.success('上传成功', { id: tid });
    } catch {
      toast.error('上传失败', { id: tid });
    } finally {
      e.target.value = '';
    }
  };

  const addCategory = () => {
    setCategories((prev) => [...prev, { name: '新分类', icon: '' }]);
  };

  const updateCategoryIcon = async (index: number, file: File) => {
    const tid = toast.loading('上传图标...');
    try {
      const url = await handleImageUpload(file);
      setCategories((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], icon: url };
        return next;
      });
      toast.success('上传成功', { id: tid });
    } catch {
      toast.error('上传失败', { id: tid });
    }
  };

  const addFont = () => {
    setFonts((prev) => [
      ...prev,
      {
        label: '新字体',
        family: `CustomFont${prev.length + 1}`,
        source: '',
        previewText: FONT_PREVIEW_TEXT,
      },
    ]);
  };

  const updateFont = (index: number, patch: Partial<FontItem>) => {
    setFonts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleSave = async () => {
    const validFonts = fonts.filter((font) => font.label && font.family && font.source);
    setSaving(true);
    try {
      await Promise.all([
        api.post('/settings/carousel', { value: carousel }),
        api.post('/settings/categories', { value: categories }),
        api.post('/settings/fonts', { value: validFonts }),
      ]);
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/50 bg-white/95 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.15)] backdrop-blur-xl animate-in zoom-in-95 duration-500">
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <h3 className="text-xl font-black tracking-tight text-slate-800">系统配置</h3>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[2px] text-slate-400">轮播图、分类、字体统一管理</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 transition-all hover:bg-slate-100 active:scale-75">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <ImageIcon size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">轮播图配置</h4>
                  <p className="mt-1 text-xs text-slate-400">上传后会保存到对象存储</p>
                </div>
              </div>
              <label className="cursor-pointer rounded-full bg-indigo-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 transition-all hover:bg-indigo-100 hover:-translate-y-0.5 active:scale-95">
                <input type="file" hidden accept="image/*" onChange={addCarouselImage} />
                + 添加图片
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {carousel.map((url, i) => (
                <div key={i} className="group relative aspect-video overflow-hidden rounded-[20px] border border-slate-200 bg-slate-100">
                  <img src={url} className="h-full w-full object-cover" />
                  <button
                    onClick={() => setCarousel((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-red-500 opacity-0 shadow-sm transition-all hover:scale-110 hover:bg-red-50 active:scale-90 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {carousel.length === 0 && (
                <div className="col-span-full flex items-center justify-center rounded-[20px] border-2 border-dashed border-slate-100 py-8 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                  暂无轮播图
                </div>
              )}
            </div>
          </section>

          <div className="h-px w-full bg-slate-100" />

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <Layers3 size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">分类导航配置</h4>
                  <p className="mt-1 text-xs text-slate-400">支持名称和图标维护</p>
                </div>
              </div>
              <button
                onClick={addCategory}
                className="rounded-full bg-indigo-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 transition-all hover:bg-indigo-100 hover:-translate-y-0.5 active:scale-95"
              >
                + 添加分类
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {categories.map((cat, i) => (
                <div key={i} className="group flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <label className="group/upload relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[14px] border border-slate-200 bg-white hover:border-indigo-300">
                    {cat.icon ? <img src={cat.icon} className="h-full w-full object-contain p-2" /> : <Upload size={16} className="text-slate-300" />}
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 opacity-0 transition-all group-hover/upload:opacity-100">
                      <Upload size={14} className="text-indigo-500" />
                    </div>
                    <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && updateCategoryIcon(i, e.target.files[0])} />
                  </label>
                  <input
                    value={cat.name}
                    onChange={(e) => {
                      const next = [...categories];
                      next[i] = { ...next[i], name: e.target.value };
                      setCategories(next);
                    }}
                    className="h-12 flex-1 rounded-xl border-none bg-white px-4 text-sm font-bold outline-none ring-1 ring-slate-200 transition-all focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    placeholder="例如：婚庆海报"
                  />
                  <button
                    onClick={() => setCategories((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded-xl p-3 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 active:scale-90"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <div className="col-span-full flex items-center justify-center rounded-[20px] border-2 border-dashed border-slate-100 py-8 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                  暂无分类
                </div>
              )}
            </div>
          </section>

          <div className="h-px w-full bg-slate-100" />

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Type size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-700">字体管理</h4>
                  <p className="mt-1 text-xs text-slate-400">上传字体到对象存储，并维护小程序字体选择列表</p>
                </div>
              </div>
              <button
                onClick={addFont}
                className="rounded-full bg-indigo-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 transition-all hover:bg-indigo-100 hover:-translate-y-0.5 active:scale-95"
              >
                + 添加字体
              </button>
            </div>

            <div className="space-y-5">
              {fonts.map((font, i) => (
                <div key={`${font.family}-${i}`} className="rounded-[26px] border border-slate-200 bg-slate-50/70 p-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1.2fr_1fr_auto]">
                    <input
                      value={font.label}
                      onChange={(e) => updateFont(i, { label: e.target.value })}
                      className="h-12 rounded-xl border-none bg-white px-4 text-sm font-bold outline-none ring-1 ring-slate-200 transition-all focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      placeholder="显示名称，如 Kerwen Kz"
                    />
                    <input
                      value={font.family}
                      onChange={(e) => updateFont(i, { family: e.target.value })}
                      className="h-12 rounded-xl border-none bg-white px-4 text-sm font-bold outline-none ring-1 ring-slate-200 transition-all focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      placeholder="font-family，如 KerwenKz"
                    />
                    <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-[0.18em] text-slate-600 ring-1 ring-slate-200 transition-all hover:bg-slate-100">
                      {uploadingFontIndex === i ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      上传字体文件
                      <input
                        type="file"
                        hidden
                        accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFontUpload(i, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      onClick={() => setFonts((prev) => prev.filter((_, idx) => idx !== i))}
                      className="flex h-12 items-center justify-center rounded-xl bg-red-50 px-4 text-red-500 transition-all hover:bg-red-100 active:scale-95"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
                    <input
                      value={font.source}
                      onChange={(e) => updateFont(i, { source: e.target.value })}
                      className="h-12 rounded-xl border-none bg-white px-4 text-xs font-medium outline-none ring-1 ring-slate-200 transition-all focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      placeholder="字体文件 URL"
                    />
                    <input
                      value={font.previewText || ''}
                      onChange={(e) => updateFont(i, { previewText: e.target.value })}
                      className="h-12 rounded-xl border-none bg-white px-4 text-sm font-medium outline-none ring-1 ring-slate-200 transition-all focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      placeholder="预览文案"
                    />
                  </div>

                  {font.source ? (
                    <div className="mt-4">
                      <FontPreviewCard font={font} index={i} />
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center justify-center rounded-[18px] border-2 border-dashed border-slate-200 bg-white py-6 text-xs font-bold text-slate-400">
                      上传字体文件后这里会显示样式预览
                    </div>
                  )}
                </div>
              ))}

              {fonts.length === 0 && (
                <div className="flex items-center justify-center rounded-[20px] border-2 border-dashed border-slate-100 py-10 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                  暂无字体配置
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 p-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex h-12 items-center gap-2 rounded-xl bg-indigo-600 px-8 text-xs font-black uppercase tracking-[2px] text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700 hover:-translate-y-0.5 active:scale-95"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};
