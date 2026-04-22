import React, { useState } from 'react';
import { CanvasEditor } from './components/CanvasEditor';
import { useEditorStore } from './store/useEditorStore';
import { 
  UploadCloud, Image as ImageIcon, Download, Loader2, Save, 
  Trash2, ChevronUp, ChevronDown, Type, Plus, 
  DownloadCloud, Sparkles, Layout, FolderHeart, 
  Layers as LayersIcon, PanelLeftOpen, PanelLeftClose, 
  Settings2, Palette, RefreshCcw, Edit3, MoveUp, MoveDown
} from 'lucide-react';
import { CropModal } from './components/CropModal';
import type { TemplateData } from './types';
import api from './lib/axios';
import toast from 'react-hot-toast';

type TabType = 'library' | 'tools' | 'layers' | null;

type MpMessagePayload = Record<string, unknown>;

function postToMiniProgram(type: string, payload: MpMessagePayload = {}) {
  const message = { type, ...payload, timestamp: Date.now() };
  const wxObj = (window as any)?.wx;
  if (wxObj?.miniProgram?.postMessage) {
    wxObj.miniProgram.postMessage({ data: message });
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, '*');
  }
}

function App() {
  const { 
    setTemplate, template, selectedId, setSelectedId, 
    updateLayer, addLayer, moveLayerUp, moveLayerDown, deleteLayer,
    setRequestReplaceId, requestCropInfo, setRequestCropInfo,
    stageRef
  } = useEditorStore();

  const [activeTab, setActiveTab] = useState<TabType>('layers');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [myTemplates, setMyTemplates] = useState<TemplateData[]>([]);
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('全部');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const templateId = params.get('templateId');
    const from = params.get('from');

    fetchTemplates();
    if (from === 'mp') {
      postToMiniProgram('ready', { scene: 'editor' });
    }
    if (templateId) {
      api.get(`/templates/${templateId}`)
        .then((res) => {
          if (res?.data?.data) {
            setTemplate(res.data.data);
            postToMiniProgram('templateLoaded', { templateId });
          }
        })
        .catch(() => {
          toast.error('指定模板加载失败');
          postToMiniProgram('templateLoadFail', { templateId });
        });
    }
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data } = await api.get('/templates');
      setMyTemplates(data.data);
    } catch {}
  };

  const handlePsdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', file);
    try {
      // Large PSD parsing can take long on cloud; disable request timeout for this endpoint.
      const res = await api.post('/upload/psd', formData, {
        timeout: 0,
        onUploadProgress: (evt) => {
          const total = evt.total || file.size || 0;
          if (!total) return;
          const percent = Math.min(100, Math.round((evt.loaded / total) * 100));
          setUploadProgress(percent);
        },
      });
      setUploadProgress(100);
      setTemplate(res.data.data);
      toast.success('PSD 导入成功');
    } catch (error: any) {
      const message = error?.message?.includes('timeout')
        ? 'PSD 导入超时，请稍后重试或减小文件体积'
        : '导入失败，请检查文件格式或服务状态';
      toast.error(message);
    } finally {
      setIsUploading(false);
      window.setTimeout(() => setUploadProgress(0), 600);
    }
  };

  const handleSave = async () => {
    if (!template) return;
    const nameInput = prompt('项目名称', template.name || '未命名设计');
    const name = nameInput?.trim();
    if (!name) return;

    // Defer the second dialog one tick to avoid consecutive prompt blocking in some browsers.
    const categoryInput = await new Promise<string | null>((resolve) => {
      window.setTimeout(() => {
        resolve(prompt('分类名称（如：证件、海报、个人）', template.category || '未分类'));
      }, 0);
    });
    const categoryName = categoryInput?.trim() || '未分类';
    
    setIsSaving(true);
    let thumbnail = '';
    
    // 生成快照
    if (stageRef) {
      try {
        thumbnail = stageRef.toDataURL({ 
          pixelRatio: 0.3, // 压缩比例以减小存储体积
          quality: 0.8
        });
      } catch (e) {
        console.warn('快照生成失败:', e);
      }
    }

    try {
      await api.post('/templates/save', { ...template, name, thumbnail, category: categoryName });
      toast.success('已保存至云端');
      postToMiniProgram('saveSuccess', { name, category: categoryName });
      fetchTemplates();
    } catch {
      postToMiniProgram('saveFail');
      toast.error('保存失败，请稍后重试');
    } finally { setIsSaving(false); }
  };

  const handleAddText = () => {
    addLayer({
      type: 'text', text: '新文本内容',
      x: (template?.width || 500) / 2 - 100, y: (template?.height || 500) / 2 - 20,
      fontSize: 32, color: '#1e293b', editable: true, visible: true, rotation: 0,
      width: 200, height: 48,
    });
  };

  const handleRender = async () => {
    if (!template) return;
    setIsRendering(true);
    const tid = toast.loading('正在导出高分辨率图像...');
    const maxAttempts = 90; // ~3 分钟
    let attempts = 0;
    let poll: ReturnType<typeof setInterval> | null = null;

    const finishError = (msg: string) => {
      if (poll) clearInterval(poll);
      setIsRendering(false);
      toast.error(msg, { id: tid });
    };

    try {
      const res = await api.post('/render', { template });
      const jobId = res.data.jobId;

      poll = setInterval(async () => {
        attempts += 1;
        if (attempts > maxAttempts) {
          finishError('导出超时。请确认已启动渲染 Worker（worker 目录运行 npx ts-node index.ts），且 Redis 正常。');
          return;
        }
        try {
          const statusRes = await api.get(`/render/${jobId}`);
          const { status, result, failedReason } = statusRes.data;

          if (status === 'completed' && result) {
            if (poll) clearInterval(poll);
            setRenderResult(result);
            setIsRendering(false);
            toast.success('导出完成', { id: tid });
            postToMiniProgram('renderSuccess', { result });
            return;
          }

          if (status === 'failed') {
            postToMiniProgram('renderFail', { reason: failedReason || 'failed' });
            finishError(failedReason ? `导出失败：${failedReason}` : '导出失败，请查看服务端或 Worker 日志');
            return;
          }

          if (status === 'not_found') {
            postToMiniProgram('renderFail', { reason: 'not_found' });
            finishError('任务不存在或已过期，请重试导出');
            return;
          }
        } catch {
          if (poll) clearInterval(poll);
          setIsRendering(false);
          postToMiniProgram('renderFail', { reason: 'poll_error' });
          toast.error('查询导出状态失败，请检查网络或后端服务', { id: tid });
        }
      }, 2000);
    } catch {
      setIsRendering(false);
      postToMiniProgram('renderFail', { reason: 'submit_error' });
      toast.error('提交导出任务失败', { id: tid });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('确定要永久删除这个模板吗？')) return;
    const tid = toast.loading('正在移除...');
    try {
      await api.delete(`/templates/${id}`);
      toast.success('已从云端移除', { id: tid });
      fetchTemplates();
    } catch {
      toast.error('移除失败', { id: tid });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要永久删除这 ${selectedIds.length} 个模板吗？`)) return;
    const tid = toast.loading('正在批量移除...');
    try {
      await api.post('/templates/batch-delete', { ids: selectedIds });
      toast.success('批量删除成功', { id: tid });
      setSelectedIds([]);
      setIsManageMode(false);
      fetchTemplates();
    } catch {
      toast.error('批量删除失败', { id: tid });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (!requestCropInfo) return;
    const tid = toast.loading('正在同步裁剪后的资源...');
    try {
      const formData = new FormData();
      formData.append('file', blob, 'cropped.jpg');
      const { data } = await api.post('/upload/image', formData);
      updateLayer(requestCropInfo.id, { url: data.url });
      toast.success('替换成功', { id: tid });
      setRequestCropInfo(null);
    } catch (error) {
      toast.error('上传失败', { id: tid });
    }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const tid = toast.loading('上传资源中...');
    try {
      const { data } = await api.post('/upload/image', fd);
      addLayer({
        type: 'image', url: data.url, x: 100, y: 100, width: 240, height: 240,
        editable: true, visible: true, rotation: 0
      });
      toast.success('图片已就位', { id: tid });
    } catch { toast.error('上传失败', { id: tid }); }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f0f2f6] text-[#1d1d1f] overflow-hidden select-none font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif]">
      
      {/* 顶部导航 - MacOS Floating Style */}
      <header className="fixed top-2 left-1/2 -translate-x-1/2 h-12 w-[calc(100%-12px)] sm:w-auto max-w-[980px] flex items-center justify-between sm:justify-start gap-2 sm:gap-6 px-3 sm:px-6 bg-white/80 backdrop-blur-2xl rounded-full border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.06)] z-[100] transition-all">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center shadow-sm">
            <Sparkles className="text-white w-3.5" />
          </div>
          <span className="text-sm font-black tracking-tight text-slate-800">MOBAN</span>
        </div>

        <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />
        
        <div className="flex items-center gap-1">
          <button onClick={handleSave} className="h-8 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 hover:bg-slate-100 rounded-lg text-[11px] sm:text-xs font-semibold text-slate-600 transition-all active:scale-95">
             {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
             保存
          </button>
          <label className="h-8 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 hover:bg-slate-100 rounded-lg text-[11px] sm:text-xs font-bold text-indigo-600 cursor-pointer transition-all active:scale-95">
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            <span className="hidden sm:inline">{isUploading ? `上传中 ${uploadProgress}%` : '导入 PSD'}</span>
            <span className="sm:hidden">{isUploading ? `${uploadProgress}%` : '导入'}</span>
            <input type="file" hidden accept=".psd" onChange={handlePsdUpload} disabled={isUploading} />
          </label>
        </div>

        <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

        <button 
          onClick={handleRender}
          disabled={!template || isRendering}
          className="h-8 flex items-center gap-1 sm:gap-2 px-3 sm:px-5 bg-indigo-600 text-white rounded-full text-[11px] sm:text-xs font-bold shadow-md shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-30"
        >
          {isRendering ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
          <span className="hidden sm:inline">导出设计</span>
          <span className="sm:hidden">导出</span>
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden pt-16 sm:pt-20 relative">
        {isUploading && (
          <div className="fixed top-[56px] sm:top-[64px] left-0 right-0 z-[120] px-4">
            <div className="h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
        {/* === MacOS Dock Navigation === */}
        <nav className="w-0 md:w-[72px] bg-transparent md:flex md:flex-col md:items-center md:py-6 md:gap-3 z-[60] md:ml-4 md:my-4 shrink-0">
          <div className="fixed md:static bottom-3 left-1/2 -translate-x-1/2 md:translate-x-0 flex md:flex-col gap-2 p-1.5 bg-white/80 backdrop-blur-xl rounded-[20px] md:rounded-[24px] border border-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
            {[
              { id: 'library', icon: <FolderHeart size={20} />, label: '模板' },
              { id: 'tools', icon: <Palette size={20} />, label: '工具' },
              { id: 'layers', icon: <LayersIcon size={20} />, label: '图层' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(activeTab === item.id ? null : item.id as TabType)}
                className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 relative group ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:bg-white hover:text-slate-900 shadow-sm hover:shadow-md'}`}
              >
                {item.icon}
                <span className={`hidden md:block text-[9px] font-bold mt-1 tracking-tighter transition-all ${activeTab === item.id ? 'opacity-100 scale-100' : 'opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100'}`}>
                  {item.label}
                </span>
                {activeTab === item.id && (
                  <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-3 bg-indigo-600 rounded-full" />
                )}
              </button>
            ))}
          </div>
          
          <div className="hidden md:block mt-auto p-1.5 bg-white/70 backdrop-blur-xl rounded-full border border-white/50 shadow-sm cursor-pointer hover:bg-white transition-all active:scale-90">
            <Settings2 size={20} className="text-slate-400" />
          </div>
        </nav>

        {activeTab && (
          <div
            className="md:hidden fixed inset-0 bg-slate-900/15 backdrop-blur-[1px] z-[70]"
            onClick={() => { setActiveTab(null); setIsManageMode(false); }}
          />
        )}

        {/* === Inspector Side Panel === */}
        <aside 
          className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col z-[80] md:z-[50] fixed md:static left-2 right-2 top-16 bottom-20 md:inset-auto ${activeTab ? 'translate-x-0 opacity-100 pointer-events-auto md:w-[320px] md:translate-x-0 md:opacity-100 md:pointer-events-auto' : '-translate-x-8 opacity-0 pointer-events-none md:w-0 md:-translate-x-12 md:opacity-0 md:pointer-events-none'}`}
        >
          <div className="w-full md:w-[300px] h-full md:h-[calc(100vh-120px)] md:m-4 md:ml-0 bg-white/85 backdrop-blur-2xl rounded-[24px] md:rounded-[32px] border border-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden relative">
            <div className="px-4 md:px-6 pt-5 md:pt-8 pb-3 md:pb-4 flex items-center justify-between">
              <h2 className="text-[10px] font-black text-slate-300 uppercase tracking-[4px]">
                {activeTab === 'library' && (isManageMode ? 'Managing Designs' : 'Resources')}
                {activeTab === 'tools' && 'Creative'}
                {activeTab === 'layers' && 'Inspector'}
              </h2>
              <div className="flex items-center gap-2">
                {activeTab === 'library' && myTemplates.length > 0 && (
                  <button 
                    onClick={() => setIsManageMode(!isManageMode)}
                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${isManageMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    {isManageMode ? '完成' : '管理'}
                  </button>
                )}
                <button onClick={() => { setActiveTab(null); setIsManageMode(false); }} className="p-2 hover:bg-slate-50 rounded-full text-slate-300 transition-all active:scale-75">
                  <PanelLeftClose size={14} />
                </button>
              </div>
            </div>

            {/* 批量操作工具栏 */}
            {isManageMode && selectedIds.length > 0 && (
              <div className="mx-6 mb-2 flex items-center justify-between p-3 bg-red-50 rounded-2xl border border-red-100 animate-in slide-in-from-top-4 duration-500">
                <span className="text-[10px] font-bold text-red-600 px-1">已选 {selectedIds.length} 项</span>
                <button 
                  onClick={handleBatchDelete}
                  className="px-4 py-1.5 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-red-100 hover:bg-red-600 active:scale-95 transition-all"
                >
                  立即删除
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 md:px-4 pb-20 md:pb-8 scrollbar-hide">
              {/* 素材库内容 - MacOS Grid */}
              {activeTab === 'library' && (
                <div className="space-y-6">
                  {/* 分类筛选器 */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
                    {['全部', ...Array.from(new Set(myTemplates.map(t => t.category || '未分类')))].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${
                          activeCategory === cat 
                            ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                            : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 md:gap-3 animate-in fade-in zoom-in-95 duration-500">
                    {myTemplates
                      .filter(t => activeCategory === '全部' || (t.category || '未分类') === activeCategory)
                      .map(t => (
                        <div 
                          key={t.id} 
                          onClick={() => {
                            if (isManageMode) {
                              toggleSelect(t.id);
                            } else {
                              api.get(`/templates/${t.id}`).then(res => setTemplate(res.data.data));
                            }
                          }}
                          className={`group relative bg-slate-50/50 hover:bg-white p-2.5 rounded-[24px] border transition-all ${
                            isManageMode 
                              ? selectedIds.includes(t.id)
                                ? 'border-indigo-500 ring-4 ring-indigo-50 shadow-xl'
                                : 'border-transparent hover:border-slate-200 cursor-pointer'
                              : 'border-transparent hover:border-indigo-100 hover:shadow-xl cursor-pointer'
                          }`}
                        >
                          <div className="w-full aspect-[4/5] bg-white rounded-[16px] mb-2.5 flex items-center justify-center overflow-hidden text-slate-100 group-hover:text-indigo-400 shadow-sm transition-all group-hover:-translate-y-1">
                            {t.thumbnail ? (
                              <img src={t.thumbnail} className="w-full h-full object-cover" />
                            ) : (
                              <Layout size={32} strokeWidth={1} />
                            )}
                            
                            {/* 选中状态指示器 */}
                            {isManageMode && selectedIds.includes(t.id) && (
                              <div className="absolute inset-0 bg-indigo-600/10 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-300">
                                 <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl scale-110">
                                   <Plus size={20} className="rotate-45" />
                                 </div>
                              </div>
                            )}

                            {/* 管理模式未选中时的微标 */}
                            {isManageMode && !selectedIds.includes(t.id) && (
                              <div className="absolute top-4 right-4 w-6 h-6 bg-white/80 backdrop-blur shadow-sm rounded-full border border-slate-100 flex items-center justify-center transition-all group-hover:bg-white">
                                <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-200" />
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-slate-800 truncate px-1 text-center">{t.name || '未命名作品'}</p>
                          <p className="text-[8px] font-bold text-slate-300 px-1 text-center uppercase tracking-widest">{t.category || '未分类'}</p>
                        </div>
                      ))}
                    {myTemplates.length === 0 && <div className="col-span-2 py-12 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">No Templates Found</div>}
                  </div>
                </div>
              )}

              {/* 创作工具 - MacOS Buttons */}
              {activeTab === 'tools' && (
                <div className="space-y-3 animate-in fade-in zoom-in-95 duration-500">
                  <button 
                    onClick={handleAddText}
                    className="w-full p-6 bg-slate-50/50 hover:bg-white border border-transparent hover:border-indigo-100 rounded-[28px] transition-all hover:shadow-xl hover:shadow-indigo-50 active:scale-95 group text-center"
                  >
                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors group-hover:bg-amber-500 group-hover:text-white group-hover:shadow-lg group-hover:shadow-amber-100">
                      <Type size={20} />
                    </div>
                    <p className="text-xs font-bold text-slate-800">添加文本图层</p>
                    <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Standard Text</p>
                  </button>

                  <label className="block w-full p-6 bg-slate-50/50 hover:bg-white border border-transparent hover:border-indigo-100 rounded-[28px] transition-all hover:shadow-xl hover:shadow-indigo-50 active:scale-95 group text-center cursor-pointer">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors group-hover:bg-blue-500 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-100">
                      <ImageIcon size={20} />
                    </div>
                    <p className="text-xs font-bold text-slate-800">上传本地图像</p>
                    <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-widest font-bold">Local Asset</p>
                    <input type="file" hidden accept="image/*" onChange={handleAddImage} />
                  </label>
                </div>
              )}

              {/* 图层管理 - MacOS List Item */}
              {activeTab === 'layers' && (
                <div className="space-y-2 animate-in fade-in zoom-in-95 duration-500">
                  {template?.layers.slice().reverse().map((layer) => (
                    <div 
                      key={layer.id}
                      onClick={() => setSelectedId(layer.id)}
                      className={`group relative p-3 rounded-[20px] border transition-all cursor-pointer flex items-center gap-3 ${selectedId === layer.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100 ring-4 ring-indigo-50' : 'bg-white border-slate-100 hover:border-indigo-100 hover:shadow-md'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${selectedId === layer.id ? 'bg-white/20' : 'bg-slate-50 text-slate-400 group-hover:text-indigo-600'}`}>
                        {layer.type === 'text' ? <Type size={16} /> : <ImageIcon size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-bold truncate ${selectedId === layer.id ? 'text-white' : 'text-slate-900'}`}>{layer.name || (layer.type === 'text' ? layer.text : '图形层')}</p>
                        <p className={`text-[8px] font-black uppercase mt-0.5 opacity-40 ${selectedId === layer.id ? 'text-white' : 'text-slate-400'}`}>{layer.type}</p>
                      </div>
                      <div className={`flex gap-0.5 transition-all ${selectedId === layer.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (layer.type === 'text') {
                              const nt = prompt('内容', layer.text || '');
                              if (nt !== null) updateLayer(layer.id, { text: nt });
                            } else {
                              setRequestReplaceId(layer.id);
                            }
                          }}
                          className={`p-2 rounded-lg transition-all ${selectedId === layer.id ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-50 text-indigo-400'}`}
                          title="替换"
                        >
                          <RefreshCcw size={14} />
                        </button>
                        <button 
                          onClick={(e) => {e.stopPropagation(); deleteLayer(layer.id);}} 
                          className={`p-2 rounded-lg transition-all ${selectedId === layer.id ? 'hover:bg-red-500 text-white' : 'hover:bg-red-50 text-red-300'}`}
                          title="溢出"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!template || template.layers.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-200 opacity-50">
                      <LayersIcon size={48} strokeWidth={1} />
                      <p className="text-[10px] font-black uppercase tracking-[2px] mt-4">Draft Board Empty</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* === MacOS Background & Canvas Wrapper === */}
        <main className="flex-1 relative overflow-hidden flex items-center justify-center p-2 sm:p-4 md:p-8 bg-slate-100/50">
           {/* MacOS Desktop Texture */}
           <div className="absolute inset-0 z-0 bg-[#f1f3f7] opacity-60" style={{ backgroundImage: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(168, 85, 247, 0.05) 0px, transparent 50%)' }} />
           
           <div className="relative z-10 w-full h-full flex items-center justify-center">
              <CanvasEditor />
           </div>

           {/* Panels Shortcut Indicator */}
           {!activeTab && (
              <button 
                onClick={() => setActiveTab('layers')}
                className="hidden md:block absolute left-6 top-1/2 -translate-y-1/2 w-3 h-12 bg-slate-200 hover:bg-slate-400 rounded-full transition-all z-20 group"
              >
                <div className="absolute left-6 whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all text-[10px] font-black tracking-widest text-slate-400 uppercase">Open Inspector</div>
              </button>
           )}
        </main>
      </div>

      {/* Export Result - MacOS Modal */}
      {renderResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 md:p-12 bg-[#1d1d1f]/40 backdrop-blur-3xl animate-in fade-in duration-300">
           <div className="bg-white rounded-[24px] md:rounded-[40px] w-full max-w-4xl shadow-[0_48px_80px_-16px_rgba(0,0,0,0.15)] overflow-hidden animate-in zoom-in-95 duration-700 border border-white">
              <div className="px-4 sm:px-6 md:px-10 py-4 sm:py-6 md:py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-50">
                <div>
                  <h3 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
                    <Sparkles className="text-indigo-600" size={24} />
                    渲染成功
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Master Studio Quality Export</p>
                </div>
                <div className="flex w-full sm:w-auto gap-2">
                  <a href={renderResult} download className="h-11 sm:h-12 bg-indigo-600 text-white px-4 sm:px-10 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:-translate-y-1 active:scale-95 transition-all flex-1 sm:flex-none items-center justify-center flex">立刻下载</a>
                  <button onClick={() => setRenderResult(null)} className="h-11 sm:h-12 px-4 sm:px-8 bg-slate-100 font-bold rounded-2xl text-sm text-slate-600 hover:bg-slate-200 transition-all flex-1 sm:flex-none items-center justify-center flex">关闭预览</button>
                </div>
              </div>
              <div className="p-4 sm:p-8 md:p-12 flex items-center justify-center bg-slate-50 min-h-[280px] sm:min-h-[400px]">
                <img src={renderResult} className="max-h-[50vh] object-contain shadow-[0_32px_64px_rgba(0,0,0,0.12)] rounded-2xl border-[12px] border-white" />
              </div>
           </div>
        </div>
      )}

      {/* 裁剪弹窗 */}
      {requestCropInfo && (
        <CropModal
          image={requestCropInfo.url}
          aspect={requestCropInfo.aspect}
          onClose={() => setRequestCropInfo(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}

export default App;
