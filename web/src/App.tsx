import React, { useEffect, useMemo, useState } from 'react';
import {
  Crown,
  DownloadCloud,
  FileImage,
  FolderHeart,
  Globe,
  Image as ImageIcon,
  Layout,
  Loader2,
  Palette,
  PanelLeftClose,
  RefreshCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
  UserRound,
  Users,
  Wifi,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { setApiBaseUrl } from './lib/axios';

import { CanvasEditor } from './components/CanvasEditor';
import { CropModal } from './components/CropModal';
import { SaveModal } from './components/SaveModal';
import { SettingsModal } from './components/SettingsModal';
import { useEditorStore } from './store/useEditorStore';
import type { TemplateData, TemplateLayer } from './types';

type WorkspaceTab = 'dashboard' | 'studio' | 'templates' | 'users';
type InspectorTab = 'layers' | 'tools';
type MpMessagePayload = Record<string, unknown>;

type DashboardStat = {
  label: string;
  value: string;
  hint: string;
  accent?: 'primary' | 'rose' | 'amber' | 'emerald';
};

type UserStatus = '在线' | '活跃' | '待接入';

type UserRecord = {
  id: string;
  name: string;
  phone: string;
  role: 'Admin' | 'User';
  vip: boolean;
  status: UserStatus;
  note: string;
  avatarUrl?: string;
};

type SystemConfigItem = {
  key: string;
  label: string;
  value: string;
  description: string;
};

type DashboardSummary = {
  userCount: number;
  templateCount: number;
  vipCount: number;
  adminCount: number;
  categoriesCount: number;
  fontsCount: number;
  systemStatus: string;
  miniProgramStatus: string;
};

const DEFAULT_SYSTEM_CONFIG: SystemConfigItem[] = [
  { key: 'api_base_url', label: 'API Base URL', value: 'http://localhost:3000', description: '后台服务主地址' },
  { key: 'wechat_login', label: '微信登录接口', value: '/auth/wechat-login', description: '小程序一键登录入口' },
  { key: 'render_api', label: '海报导出接口', value: '/render', description: '提交海报导出任务接口' },
  { key: 'render_status_api', label: '导出状态接口', value: '/render/:jobId', description: '轮询导出任务进度与结果' },
  { key: 'arabic_shape_api', label: 'Arabic Shaping', value: '/api/arabic/reshape', description: '阿拉伯系文字预处理接口' },
];

const DEFAULT_DASHBOARD_SUMMARY: DashboardSummary = {
  userCount: 0,
  templateCount: 0,
  vipCount: 0,
  adminCount: 0,
  categoriesCount: 0,
  fontsCount: 0,
  systemStatus: 'ONLINE',
  miniProgramStatus: 'READY',
};

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
    setTemplate,
    template,
    selectedId,
    setSelectedId,
    updateLayer,
    addLayer,
    deleteLayer,
    requestCropInfo,
    setRequestCropInfo,
    stageRef,
  } = useEditorStore();

  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>('studio');
  const [activeInspector, setActiveInspector] = useState<InspectorTab>('layers');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [myTemplates, setMyTemplates] = useState<TemplateData[]>([]);
  const [isManageMode, setIsManageMode] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [maskInfo, setMaskInfo] = useState<any>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfigItem[]>(DEFAULT_SYSTEM_CONFIG);
  const [userRecords, setUserRecords] = useState<UserRecord[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>(DEFAULT_DASHBOARD_SUMMARY);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const templateId = params.get('templateId');
    const from = params.get('from');

    void Promise.all([fetchTemplates(), fetchSettings(), fetchDashboardSummary(), fetchUsers()]);

    if (from === 'mp') {
      postToMiniProgram('ready', { scene: 'editor' });
    }

    if (templateId) {
      void api
        .get(`/templates/${templateId}`)
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

  const getLayerMaskUrl = (layer: Partial<TemplateLayer> & Record<string, any>): string | undefined => {
    const mask = layer.mask as any;
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

  const isLayerReplaceable = (layer: Partial<TemplateLayer> & Record<string, any>) => {
    if (typeof layer.isReplaceable === 'boolean') return layer.isReplaceable;
    const text = `${layer.name || ''} ${layer.title || ''} ${layer.label || ''}`;
    return text.includes('替换');
  };

  const fetchTemplates = async () => {
    try {
      const { data } = await api.get('/templates');
      setMyTemplates(data.data || []);
    } catch {
      toast.error('模板列表加载失败');
    }
  };

  const fetchDashboardSummary = async () => {
    try {
      const { data } = await api.get('/admin/dashboard');
      setDashboardSummary(data?.data || DEFAULT_DASHBOARD_SUMMARY);
    } catch {
      toast.error('仪表盘数据加载失败');
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/admin/users');
      setUserRecords(data?.data || []);
    } catch {
      toast.error('用户列表加载失败');
    }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await api.get('/admin/settings');
      const settingsMap = new Map(
        Array.isArray(data?.data) ? data.data.map((item: { key: string; value: unknown }) => [item.key, item.value]) : [],
      );

      setSystemConfig(
        DEFAULT_SYSTEM_CONFIG.map((item) => {
          if (item.key === 'api_base_url') {
            const url = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000') as string;
            setApiBaseUrl(url);
            return { ...item, value: url };
          }
          const value = settingsMap.get(item.key);
          return typeof value === 'string' && value.trim() ? { ...item, value } : item;
        }),
      );
    } catch {
      setSystemConfig(DEFAULT_SYSTEM_CONFIG);
    }
  };

  const saveSystemConfigItem = async (key: string) => {
    const target = systemConfig.find((item) => item.key === key);
    if (!target) return;
    try {
      await api.post(`/settings/${key}`, { value: target.value });
      toast.success('系统配置已保存');
      if (key === 'api_base_url') { setApiBaseUrl(target.value); }
      await fetchSettings();
    } catch {
      toast.error('系统配置保存失败');
    }
  };

  const updateConfigValue = (key: string, value: string) => {
    setSystemConfig((prev) => prev.map((item) => (item.key === key ? { ...item, value } : item)));
  };

  const toggleVip = async (id: string) => {
    const target = userRecords.find((user) => user.id === id);
    if (!target) return;
    try {
      await api.patch(`/admin/users/${id}`, { vip: !target.vip });
      toast.success('VIP 状态已更新');
      await Promise.all([fetchUsers(), fetchDashboardSummary()]);
    } catch {
      toast.error('VIP 状态更新失败');
    }
  };

  const promoteAdmin = async (id: string) => {
    const target = userRecords.find((user) => user.id === id);
    if (!target) return;
    const nextRole = target.role === 'Admin' ? 'User' : 'Admin';
    try {
      await api.patch(`/admin/users/${id}`, { role: nextRole });
      toast.success('管理员权限已更新');
      await Promise.all([fetchUsers(), fetchDashboardSummary()]);
    } catch {
      toast.error('管理员权限更新失败');
    }
  };

  const handleFetchMaskInfo = () => {
    if (!template) {
      toast.error('请先选择一个模板');
      return;
    }

    const tid = toast.loading('正在获取蒙版信息...');
    const layers = template.layers || [];
    let replaceLayer = layers.find((l: any) => l.type === 'image' && isLayerReplaceable(l));
    if (!replaceLayer) {
      replaceLayer = layers.find((l: any) => l.type === 'image' && getLayerMaskUrl(l));
    }

    if (!replaceLayer) {
      toast.error('未找到可替换图片图层或蒙版图层', { id: tid });
      return;
    }

    const maskUrl = getLayerMaskUrl(replaceLayer);
    setSelectedId(replaceLayer.id);
    setMaskInfo({
      id: replaceLayer.id,
      name: replaceLayer.name || replaceLayer.title || replaceLayer.label,
      x: replaceLayer.maskRect ? replaceLayer.maskRect.x : replaceLayer.x,
      y: replaceLayer.maskRect ? replaceLayer.maskRect.y : replaceLayer.y,
      width: replaceLayer.maskRect ? replaceLayer.maskRect.width : replaceLayer.width,
      height: replaceLayer.maskRect ? replaceLayer.maskRect.height : replaceLayer.height,
      url: maskUrl || replaceLayer.url,
      type: replaceLayer.type,
      isReplaceable: isLayerReplaceable(replaceLayer),
    });
    toast.success(maskUrl ? '蒙版信息获取成功' : '已找到替换图层，但未检测到蒙版地址', { id: tid });
  };

  const handlePsdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', file);

    try {
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
      setActiveWorkspace('studio');
      toast.success('PSD 导入成功');
    } catch (error: any) {
      const message = error?.message?.includes('timeout')
        ? 'PSD 导入超时，请稍后重试或减小文件体积'
        : '导入失败，请检查文件格式或服务状态';
      toast.error(message);
    } finally {
      setIsUploading(false);
      window.setTimeout(() => setUploadProgress(0), 600);
      e.target.value = '';
    }
  };

  const handleConfirmSave = async (data: { category: string; thumbnailUrl: string }) => {
    if (!template) return;
    const name = template.name || '未命名设计';
    setIsSaving(true);

    try {
      await api.post('/templates/save', {
        ...template,
        name,
        thumbnail: data.thumbnailUrl,
        category: data.category,
      });
      toast.success('已保存至云端');
      postToMiniProgram('saveSuccess', { name, category: data.category });
      setIsSaveModalOpen(false);
      await Promise.all([fetchTemplates(), fetchDashboardSummary()]);
    } catch {
      toast.error('保存失败，请检查网络或后端状态');
      throw new Error('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    if (!template) {
      toast.error('请先导入一个模板');
      return;
    }
    setIsSaveModalOpen(true);
  };

  const handleAddText = () => {
    addLayer({
      type: 'text',
      text: '新的文本内容',
      x: (template?.width || 500) / 2 - 100,
      y: (template?.height || 500) / 2 - 20,
      fontSize: 32,
      color: '#1e293b',
      editable: true,
      visible: true,
      rotation: 0,
      width: 200,
      height: 48,
    });
  };

  const handleRender = async () => {
    if (!template) return;
    setIsRendering(true);
    const tid = toast.loading('正在提交导出任务...');
    const maxAttempts = 90;
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
      toast.loading('任务已进入队列，正在后端生成海报...', { id: tid });

      poll = setInterval(async () => {
        attempts += 1;
        if (attempts > maxAttempts) {
          finishError('导出超时，请检查 worker 与 Redis 是否正常运行');
          return;
        }

        try {
          const statusRes = await api.get(`/render/${jobId}`);
          const { status, result, imageUrl, message, failedReason } = statusRes.data;
          const finalImage = imageUrl || result;

          if (status === 'completed' && finalImage) {
            if (poll) clearInterval(poll);
            setRenderResult(finalImage);
            setIsRendering(false);
            toast.success('导出完成', { id: tid });
            postToMiniProgram('renderSuccess', { result: finalImage });
            return;
          }

          if (status === 'failed') {
            const failedMsg = failedReason || message || '导出失败';
            postToMiniProgram('renderFail', { reason: failedMsg });
            finishError(`导出失败：${failedMsg}`);
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
      await Promise.all([fetchTemplates(), fetchDashboardSummary()]);
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
      await Promise.all([fetchTemplates(), fetchDashboardSummary()]);
    } catch {
      toast.error('批量删除失败', { id: tid });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (!requestCropInfo || !template) return;
    const tid = toast.loading('正在同步裁剪后的资源...');
    try {
      const formData = new FormData();
      formData.append('file', blob, 'cropped.jpg');
      const { data } = await api.post('/upload/image', formData);

      const layer = template.layers.find((l) => l.id === requestCropInfo.id);
      if (layer) {
        const maskUrl = getLayerMaskUrl(layer);
        updateLayer(requestCropInfo.id, {
          url: data.url,
          ...(maskUrl ? { maskUrl } : {}),
        });
      }

      toast.success('替换成功', { id: tid });
      setRequestCropInfo(null);
    } catch {
      toast.error('上传失败', { id: tid });
    }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append('file', file);
    const tid = toast.loading('上传图片中...');

    try {
      const { data } = await api.post('/upload/image', fd);
      addLayer({
        type: 'image',
        url: data.url,
        x: 100,
        y: 100,
        width: 240,
        height: 240,
        editable: true,
        visible: true,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        isReplaceable: true,
        name: '替换图片',
      });
      toast.success('图片已加入画布', { id: tid });
    } catch {
      toast.error('上传失败', { id: tid });
    } finally {
      e.target.value = '';
    }
  };

  const navigation = [
    { id: 'dashboard' as WorkspaceTab, label: '仪表盘', icon: <Layout size={18} /> },
    { id: 'studio' as WorkspaceTab, label: '工作台', icon: <Palette size={18} /> },
    { id: 'templates' as WorkspaceTab, label: '模板', icon: <FolderHeart size={18} /> },
    { id: 'users' as WorkspaceTab, label: '用户', icon: <Users size={18} /> },
  ];

  const categories = useMemo(() => {
    const values = new Set(['全部']);
    myTemplates.forEach((item) => values.add(item.category || '未分类'));
    return Array.from(values);
  }, [myTemplates]);

  const filteredTemplates = useMemo(() => {
    if (activeCategory === '全部') return myTemplates;
    return myTemplates.filter((item) => (item.category || '未分类') === activeCategory);
  }, [activeCategory, myTemplates]);

  const selectedLayer = template?.layers.find((layer) => layer.id === selectedId) || null;
  const visibleLayersCount = template?.layers.filter((layer) => layer.visible !== false).length || 0;
  const textLayerCount = template?.layers.filter((layer) => layer.type === 'text').length || 0;
  const imageLayerCount = template?.layers.filter((layer) => layer.type === 'image').length || 0;

  const dashboardStats: DashboardStat[] = [
    { label: '用户数量', value: `${dashboardSummary.userCount}`, hint: '后台展示用户与管理员总数', accent: 'primary' },
    { label: '模板数量', value: `${dashboardSummary.templateCount}`, hint: '当前系统内模板总数', accent: 'rose' },
    { label: 'VIP 用户', value: `${dashboardSummary.vipCount}`, hint: '可用于会员运营与权限管理', accent: 'amber' },
    { label: '管理员', value: `${dashboardSummary.adminCount}`, hint: '当前具有后台管理权限的账号', accent: 'emerald' },
  ];

  const loadTemplateIntoStudio = (item: TemplateData) => {
    setTemplate(item);
    setActiveWorkspace('studio');
    toast.success('模板已载入设计工作台');
  };

  const renderStudioQuickAccess = () => (
    <div className="grid gap-3 md:grid-cols-[1.5fr_1fr]">
      <div className="rounded-[28px] bg-white px-5 py-4 shadow-[0_16px_32px_rgba(168,180,219,0.14)]">
        <div className="text-[11px] font-black uppercase tracking-[0.28em] text-[#8ea0c3]">Quick Access</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#f5f7ff] px-4 py-3 text-sm font-black text-[#4d5f88] transition hover:bg-[#edf1ff]"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#eef3ff] px-4 py-3 text-sm font-black text-[#5d73ff] transition hover:bg-[#e5ecff]">
            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {isUploading ? `导入中 ${uploadProgress}%` : '导入 PSD'}
            <input type="file" hidden accept=".psd" onChange={handlePsdUpload} disabled={isUploading} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#fff6ea] px-4 py-3 text-sm font-black text-[#d58a1f] transition hover:bg-[#ffefd5]">
            <ImageIcon size={16} />
            添加图片
            <input type="file" hidden accept="image/*" onChange={handleAddImage} />
          </label>
          <button
            onClick={handleRender}
            disabled={!template || isRendering}
            className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#5f79ff,#6f95ff)] px-4 py-3 text-sm font-black text-white shadow-[0_18px_30px_rgba(104,126,255,0.28)] transition hover:brightness-105 disabled:opacity-40"
          >
            {isRendering ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
            导出设计
          </button>
        </div>
      </div>

      <div className="rounded-[28px] bg-white px-5 py-4 shadow-[0_16px_32px_rgba(168,180,219,0.14)]">
        <div className="text-[11px] font-black uppercase tracking-[0.28em] text-[#8ea0c3]">Current File</div>
        <div className="mt-3 text-lg font-black text-[#35456f]">{template?.name || '未加载设计稿'}</div>
        <div className="mt-1 text-sm text-[#97a3c4]">
          {template ? `${template.width} × ${template.height} · ${template.layers.length} layers` : '导入 PSD 后开始编辑'}
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="moban-card relative overflow-hidden px-6 py-6">
          <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(123,153,255,0.28),transparent_68%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#7f8eb8]">Dashboard</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-[#35456f]">MOBAN 管理中台</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#7b86a8]">
                展示用户、模板、VIP、管理员、小程序状态与系统运行概览，作为整套后台的总览入口。
              </p>
            </div>
            <div className="hidden rounded-[28px] bg-[linear-gradient(180deg,#6e88ff,#6d77ff)] px-5 py-4 text-white shadow-[0_24px_48px_rgba(92,114,255,0.32)] md:block">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Today</div>
              <div className="mt-2 text-3xl font-black">{dashboardSummary.templateCount}</div>
              <div className="mt-1 text-xs text-white/80">模板总量快照</div>
            </div>
          </div>
        </div>

        <div className="moban-card px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#7f8eb8]">Connection</p>
              <h2 className="mt-2 text-xl font-black text-[#35456f]">系统与小程序状态</h2>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-[24px] bg-[#f7f8ff] p-4">
              <div className="flex items-center gap-2 text-[#5d73ff]">
                <Globe size={18} />
                <span className="text-xs font-bold">系统状态</span>
              </div>
              <div className="mt-3 text-2xl font-black text-[#35456f]">{dashboardSummary.systemStatus}</div>
              <p className="mt-1 text-xs text-[#8b95b5]">前后端基础连接正常</p>
            </div>
            <div className="rounded-[24px] bg-[#fff7fb] p-4">
              <div className="flex items-center gap-2 text-[#ec6daf]">
                <Wifi size={18} />
                <span className="text-xs font-bold">小程序连接</span>
              </div>
              <div className="mt-3 text-2xl font-black text-[#35456f]">{dashboardSummary.miniProgramStatus}</div>
              <p className="mt-1 text-xs text-[#8b95b5]">微信接口与工作台消息入口可用</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((metric, index) => {
          const accentMap = {
            primary: 'bg-[linear-gradient(180deg,#6c7dff,#6e9cff)] text-white shadow-[0_28px_48px_rgba(105,126,255,0.35)]',
            rose: 'bg-[linear-gradient(180deg,#ff94b3,#ff7ea0)] text-white shadow-[0_28px_48px_rgba(255,128,167,0.28)]',
            amber: 'bg-white',
            emerald: 'bg-white',
          };
          const activeAccent = metric.accent || (index === 0 ? 'primary' : 'amber');
          return (
            <div key={metric.label} className={`moban-card px-5 py-5 ${accentMap[activeAccent]}`}>
              <div className={`text-[11px] font-black uppercase tracking-[0.26em] ${activeAccent === 'primary' || activeAccent === 'rose' ? 'text-white/70' : 'text-[#90a0c2]'}`}>
                {metric.label}
              </div>
              <div className={`mt-4 text-3xl font-black ${activeAccent === 'primary' || activeAccent === 'rose' ? 'text-white' : 'text-[#35456f]'}`}>
                {metric.value}
              </div>
              <p className={`mt-2 text-sm ${activeAccent === 'primary' || activeAccent === 'rose' ? 'text-white/80' : 'text-[#7d8aad]'}`}>
                {metric.hint}
              </p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="moban-card px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.26em] text-[#8fa0c2]">Core Modules</p>
              <h3 className="mt-2 text-xl font-black text-[#35456f]">后台核心能力</h3>
            </div>
            <ShieldCheck size={18} className="text-[#92a0c7]" />
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              { icon: <Users size={18} />, title: '用户中心', desc: '管理真实微信用户、VIP 与管理员权限' },
              { icon: <FolderHeart size={18} />, title: '模板中心', desc: '按分类管理模板与设计资产' },
              { icon: <Layout size={18} />, title: '设计工作台', desc: '聚焦画布编辑、图层调整与系统配置入口' },
              { icon: <Settings2 size={18} />, title: '系统配置', desc: '管理 API 文档配置与系统入口' },
            ].map((item) => (
              <div key={item.title} className="rounded-[24px] bg-[#f7f9ff] px-4 py-4">
                <div className="flex items-center gap-3 text-[#5d73ff]">
                  {item.icon}
                  <span className="text-sm font-black text-[#35456f]">{item.title}</span>
                </div>
                <div className="mt-2 text-xs leading-6 text-[#8b97b5]">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="moban-card px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.26em] text-[#8fa0c2]">Snapshot</p>
              <h3 className="mt-2 text-xl font-black text-[#35456f]">权限分布</h3>
            </div>
            <Crown size={18} className="text-[#f0b347]" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-[#f7f8ff] px-4 py-3">
              <span className="text-sm font-bold text-[#546387]">VIP 用户</span>
              <span className="text-sm font-black text-[#35456f]">{dashboardSummary.vipCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#fff7fb] px-4 py-3">
              <span className="text-sm font-bold text-[#546387]">管理员</span>
              <span className="text-sm font-black text-[#35456f]">{dashboardSummary.adminCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#eefbf3] px-4 py-3">
              <span className="text-sm font-bold text-[#546387]">小程序连接</span>
              <span className="text-sm font-black text-[#2f9b62]">{dashboardSummary.miniProgramStatus}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#fffaf0] px-4 py-3">
              <span className="text-sm font-bold text-[#546387]">系统接口</span>
              <span className="text-sm font-black text-[#d69218]">{systemConfig.length} 项</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderSystemConfig = () => (
    <div className="moban-card px-6 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#8ea0c3]">System Config</p>
          <h3 className="mt-2 text-xl font-black text-[#35456f]">系统配置</h3>
          <p className="mt-1 text-sm text-[#97a3c4]">管理系统用到的 API 文档配置入口，默认已填充当前项目接口。</p>
        </div>
        <button
          onClick={() => setIsSettingsModalOpen(true)}
          className="rounded-2xl bg-[#eef2ff] px-4 py-2 text-xs font-black text-[#5d73ff]"
        >
          打开高级设置
        </button>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {systemConfig.map((item) => (
          <div key={item.key} className="rounded-[24px] border border-[#edf1ff] bg-white px-4 py-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#f3f6ff] text-[#5d73ff]">
                <Globe size={18} />
              </div>
              <div>
                <div className="text-sm font-black text-[#35456f]">{item.label}</div>
                <div className="mt-1 text-xs text-[#94a1c2]">{item.description}</div>
              </div>
            </div>
            <input
              value={item.value}
              onChange={(e) => updateConfigValue(item.key, e.target.value)}
              className="mt-4 h-11 w-full rounded-2xl border-none bg-[#f7f9ff] px-4 text-sm font-medium text-[#42537b] outline-none ring-1 ring-[#e7ecfb]"
            />
            <button
              onClick={() => saveSystemConfigItem(item.key)}
              className="mt-3 rounded-2xl bg-[#eef2ff] px-4 py-2 text-xs font-black text-[#5d73ff]"
            >
              保存配置
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-6">
      <section className="moban-card px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#8fa0c2]">User Center</p>
            <h2 className="mt-2 text-2xl font-black text-[#35456f]">用户管理</h2>
            <p className="mt-2 text-sm text-[#7d89aa]">显示所有用户与管理员账号信息，并支持 VIP 和管理员权限操作。</p>
          </div>
          <div className="rounded-[28px] bg-[linear-gradient(180deg,#edf3ff,#ffffff)] px-5 py-4 shadow-[0_12px_28px_rgba(151,176,255,0.18)]">
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#8fa0c2]">Users</div>
            <div className="mt-2 text-3xl font-black text-[#5d73ff]">{dashboardSummary.userCount}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="moban-card px-6 py-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-black text-[#35456f]">成员列表</h3>
            <button className="rounded-2xl bg-[#eef2ff] px-4 py-2 text-xs font-black text-[#5d73ff]">真实用户数据</button>
          </div>
          <div className="space-y-4">
            {userRecords.map((user) => (
              <div key={user.id} className="rounded-[28px] border border-[#edf1ff] bg-white px-5 py-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`grid h-12 w-12 place-items-center rounded-2xl ${user.vip ? 'bg-[linear-gradient(180deg,#ffb869,#f0a132)] text-white' : 'bg-[#eef2ff] text-[#5d73ff]'}`}>
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="h-12 w-12 rounded-2xl object-cover" />
                      ) : user.vip ? (
                        <Crown size={18} />
                      ) : (
                        <UserRound size={18} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-[#35456f]">{user.name}</span>
                        {user.vip && <span className="rounded-full bg-[#fff3db] px-2 py-1 text-[10px] font-black text-[#d5941a]">VIP</span>}
                      </div>
                      <div className="mt-1 text-xs text-[#8f9bbb]">{user.note}</div>
                      <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#a2adca]">{user.phone}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-2xl bg-[#f7f9ff] px-3 py-2 text-xs font-black text-[#6f7fa8]">{user.role}</div>
                    <div className="rounded-2xl bg-[#f7f9ff] px-3 py-2 text-xs font-black text-[#6f7fa8]">{user.status}</div>
                    <button
                      onClick={() => void toggleVip(user.id)}
                      className={`rounded-2xl px-3 py-2 text-xs font-black transition ${user.vip ? 'bg-[#fff3db] text-[#d5941a]' : 'bg-[#eef2ff] text-[#5d73ff]'}`}
                    >
                      {user.vip ? '取消 VIP' : '设为 VIP'}
                    </button>
                    <button
                      onClick={() => void promoteAdmin(user.id)}
                      className={`rounded-2xl px-3 py-2 text-xs font-black transition ${user.role === 'Admin' ? 'bg-[#ffe8ef] text-[#e06286]' : 'bg-[#eefbf3] text-[#2f9b62]'}`}
                    >
                      {user.role === 'Admin' ? '取消管理员' : '升级管理员'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {userRecords.length === 0 && (
              <div className="rounded-[24px] border border-dashed border-[#dbe3fa] px-4 py-10 text-center text-sm font-bold text-[#98a6c7]">
                当前还没有用户数据
              </div>
            )}
          </div>
        </div>

        <div className="moban-card px-6 py-6">
          <h3 className="text-lg font-black text-[#35456f]">权限功能</h3>
          <div className="mt-5 space-y-3">
            {[
              '查看全部模板与分类',
              '修改 API 与系统配置',
              '设置 VIP 与管理员权限',
              '查看真实微信登录用户',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#f7f9ff] px-4 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#6a7fff] shadow-sm">
                  <ShieldCheck size={18} />
                </div>
                <span className="text-sm font-bold text-[#52617f]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  const renderTemplateManager = () => (
    <div className="space-y-6">
      <section className="moban-card px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#8fa0c2]">Template Center</p>
            <h2 className="mt-2 text-2xl font-black text-[#35456f]">模板管理</h2>
            <p className="mt-2 text-sm text-[#7d89aa]">支持按分类查看、筛选和管理模板库，保持现有模板能力不变。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsManageMode(!isManageMode)}
              className={`rounded-2xl px-4 py-2 text-xs font-black transition ${
                isManageMode ? 'bg-[#5d73ff] text-white shadow-[0_18px_26px_rgba(100,125,255,0.28)]' : 'bg-[#eef2ff] text-[#5d73ff]'
              }`}
            >
              {isManageMode ? '退出管理模式' : '进入管理模式'}
            </button>
            <button onClick={handleSave} className="rounded-2xl bg-[#f8f9ff] px-4 py-2 text-xs font-black text-[#6e7ea6]">
              保存当前模板
            </button>
          </div>
        </div>
      </section>

      <section className="moban-card px-6 py-6">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] transition ${
                activeCategory === cat ? 'bg-[#35456f] text-white' : 'bg-[#f5f7ff] text-[#8a98bc]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {isManageMode && selectedIds.length > 0 && (
          <div className="mt-5 flex items-center justify-between rounded-[26px] border border-[#ffd9df] bg-[#fff5f7] px-5 py-4">
            <div>
              <div className="text-sm font-black text-[#e16083]">已选中 {selectedIds.length} 个模板</div>
              <div className="mt-1 text-xs text-[#b87a8d]">你可以执行批量删除操作</div>
            </div>
            <button
              onClick={() => void handleBatchDelete()}
              className="rounded-2xl bg-[#ff6b8f] px-4 py-2 text-xs font-black text-white shadow-[0_18px_26px_rgba(255,108,144,0.22)]"
            >
              批量删除
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((item) => {
            const selected = selectedIds.includes(item.id);
            return (
              <div key={item.id} className="rounded-[28px] border border-[#edf1ff] bg-white p-4 shadow-sm">
                <div className="relative overflow-hidden rounded-[24px] bg-[#f6f8ff]">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt={item.name || 'template'} className="aspect-[4/5] w-full object-cover" />
                  ) : (
                    <div className="grid aspect-[4/5] place-items-center text-[#a6b1cd]">
                      <FileImage size={42} />
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6b7ca8] shadow-sm">
                    {item.category || '未分类'}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-sm font-black text-[#35456f]">{item.name || '未命名模板'}</div>
                  <div className="mt-1 text-xs text-[#93a0c2]">
                    {item.width} × {item.height} · {item.layers.length} layers
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => loadTemplateIntoStudio(item)}
                    className="rounded-2xl bg-[#eef2ff] px-3 py-2 text-xs font-black text-[#5d73ff]"
                  >
                    打开编辑
                  </button>
                  {isManageMode ? (
                    <>
                      <button
                        onClick={() => toggleSelect(item.id)}
                        className={`rounded-2xl px-3 py-2 text-xs font-black ${selected ? 'bg-[#35456f] text-white' : 'bg-[#f7f9ff] text-[#6f7fa8]'}`}
                      >
                        {selected ? '已选中' : '选择'}
                      </button>
                      <button
                        onClick={() => void handleDeleteTemplate(item.id)}
                        className="rounded-2xl bg-[#fff1f4] px-3 py-2 text-xs font-black text-[#df6688]"
                      >
                        删除
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => void handleDeleteTemplate(item.id)}
                      className="rounded-2xl bg-[#fff1f4] px-3 py-2 text-xs font-black text-[#df6688]"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="mt-8 rounded-[28px] border border-dashed border-[#d8e0f7] bg-[#f8faff] px-6 py-12 text-center text-sm font-bold text-[#90a0c2]">
            当前分类下还没有模板
          </div>
        )}
      </section>
    </div>
  );

  const renderLayersPanel = () => (
    <div className="space-y-4">
      <div className="rounded-[28px] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-5 py-5 shadow-[0_16px_32px_rgba(168,180,219,0.14)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-[#8ea0c3]">Canvas Layers</div>
            <div className="mt-2 text-lg font-black text-[#35456f]">图层概览</div>
          </div>
          <RefreshCcw size={16} className="text-[#9daccc]" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-white px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a0acce]">总数</div>
            <div className="mt-2 text-xl font-black text-[#35456f]">{template?.layers.length || 0}</div>
          </div>
          <div className="rounded-2xl bg-white px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a0acce]">文本</div>
            <div className="mt-2 text-xl font-black text-[#35456f]">{textLayerCount}</div>
          </div>
          <div className="rounded-2xl bg-white px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a0acce]">图片</div>
            <div className="mt-2 text-xl font-black text-[#35456f]">{imageLayerCount}</div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] bg-white px-5 py-5 shadow-[0_16px_32px_rgba(168,180,219,0.14)]">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-[#35456f]">图层列表</div>
          <div className="rounded-full bg-[#f4f7ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#91a0c3]">
            {visibleLayersCount} visible
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {template?.layers.length ? (
            [...template.layers].reverse().map((layer) => {
              const isSelected = selectedId === layer.id;
              return (
                <button
                  key={layer.id}
                  onClick={() => setSelectedId(layer.id)}
                  className={`w-full rounded-[22px] px-4 py-4 text-left transition ${
                    isSelected
                      ? 'bg-[linear-gradient(180deg,#667fff,#6d95ff)] text-white shadow-[0_18px_28px_rgba(100,126,255,0.22)]'
                      : 'bg-[#f8faff] text-[#55647f] hover:bg-[#f2f6ff]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`grid h-10 w-10 place-items-center rounded-2xl ${isSelected ? 'bg-white/20 text-white' : 'bg-white text-[#6b83ff]'}`}>
                        {layer.type === 'text' ? <Type size={16} /> : <ImageIcon size={16} />}
                      </div>
                      <div>
                        <div className="text-sm font-black">{layer.name || layer.text || '未命名图层'}</div>
                        <div className={`mt-1 text-[11px] font-bold ${isSelected ? 'text-white/75' : 'text-[#99a6c5]'}`}>
                          {layer.type} · {Math.round(layer.width)} × {Math.round(layer.height)}
                        </div>
                      </div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${isSelected ? 'bg-white/20 text-white' : 'bg-white text-[#90a0c2]'}`}>
                      {layer.visible === false ? 'hidden' : 'show'}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#dbe3fa] px-4 py-10 text-center text-sm font-bold text-[#98a6c7]">
              暂无图层，先导入模板或添加内容
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderToolsPanel = () => (
    <div className="space-y-4">
      <div className="rounded-[28px] bg-white px-5 py-5 shadow-[0_16px_32px_rgba(168,180,219,0.14)]">
        <div className="text-[11px] font-black uppercase tracking-[0.28em] text-[#8ea0c3]">Toolbox</div>
        <div className="mt-2 text-lg font-black text-[#35456f]">设计工具</div>
        <div className="mt-4 grid gap-3">
          <button
            onClick={handleAddText}
            className="flex items-center gap-3 rounded-2xl bg-[#f6f9ff] px-4 py-3 text-sm font-black text-[#52617f]"
          >
            <Type size={16} className="text-[#5d73ff]" />
            添加文本图层
          </button>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[#fef6e8] px-4 py-3 text-sm font-black text-[#8d650c]">
            <ImageIcon size={16} className="text-[#e3a329]" />
            添加图片图层
            <input type="file" hidden accept="image/*" onChange={handleAddImage} />
          </label>
          <button
            onClick={handleFetchMaskInfo}
            className="flex items-center gap-3 rounded-2xl bg-[#eef3ff] px-4 py-3 text-sm font-black text-[#52617f]"
          >
            <Layout size={16} className="text-[#5d73ff]" />
            获取蒙版信息
          </button>
          <button
            onClick={() => selectedId && deleteLayer(selectedId)}
            disabled={!selectedId}
            className="flex items-center gap-3 rounded-2xl bg-[#fff2f5] px-4 py-3 text-sm font-black text-[#d45f83] disabled:opacity-45"
          >
            <Trash2 size={16} />
            删除当前图层
          </button>
        </div>
      </div>

      {selectedLayer && (
        <div className="rounded-[28px] bg-white px-5 py-5 shadow-[0_16px_32px_rgba(168,180,219,0.14)]">
          <div className="text-[11px] font-black uppercase tracking-[0.28em] text-[#8ea0c3]">Selection</div>
          <div className="mt-2 text-lg font-black text-[#35456f]">{selectedLayer.name || selectedLayer.text || '当前选中图层'}</div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="rounded-2xl bg-[#f7f9ff] px-3 py-3 text-xs font-bold text-[#6f7ea4]">
                X
                <input
                  type="number"
                  value={Math.round(selectedLayer.x)}
                  onChange={(e) => updateLayer(selectedLayer.id, { x: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-sm font-black text-[#35456f] outline-none"
                />
              </label>
              <label className="rounded-2xl bg-[#f7f9ff] px-3 py-3 text-xs font-bold text-[#6f7ea4]">
                Y
                <input
                  type="number"
                  value={Math.round(selectedLayer.y)}
                  onChange={(e) => updateLayer(selectedLayer.id, { y: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-sm font-black text-[#35456f] outline-none"
                />
              </label>
            </div>

            {selectedLayer.type === 'text' && (
              <>
                <label className="rounded-2xl bg-[#f7f9ff] px-3 py-3 text-xs font-bold text-[#6f7ea4] block">
                  文本内容
                  <textarea
                    value={selectedLayer.text || ''}
                    onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                    className="mt-2 min-h-[96px] w-full rounded-xl bg-white px-3 py-3 text-sm font-medium text-[#35456f] outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="rounded-2xl bg-[#f7f9ff] px-3 py-3 text-xs font-bold text-[#6f7ea4]">
                    字号
                    <input
                      type="number"
                      value={selectedLayer.fontSize || 32}
                      onChange={(e) => updateLayer(selectedLayer.id, { fontSize: Number(e.target.value) })}
                      className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-sm font-black text-[#35456f] outline-none"
                    />
                  </label>
                  <label className="rounded-2xl bg-[#f7f9ff] px-3 py-3 text-xs font-bold text-[#6f7ea4]">
                    颜色
                    <input
                      type="color"
                      value={selectedLayer.color || '#1e293b'}
                      onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                      className="mt-2 h-11 w-full rounded-xl bg-white px-2 py-2"
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderInspector = () => (
    <div className="space-y-4">
      <div className="rounded-[30px] bg-[linear-gradient(180deg,#ecf2ff,#ffffff)] p-3 shadow-[0_20px_38px_rgba(160,176,215,0.16)]">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveInspector('layers')}
            className={`rounded-[22px] px-4 py-3 text-sm font-black transition ${activeInspector === 'layers' ? 'bg-[#35456f] text-white shadow-[0_14px_28px_rgba(53,69,111,0.18)]' : 'bg-white text-[#7f8cad]'}`}
          >
            图层
          </button>
          <button
            onClick={() => setActiveInspector('tools')}
            className={`rounded-[22px] px-4 py-3 text-sm font-black transition ${activeInspector === 'tools' ? 'bg-[#35456f] text-white shadow-[0_14px_28px_rgba(53,69,111,0.18)]' : 'bg-white text-[#7f8cad]'}`}
          >
            工具
          </button>
        </div>
      </div>
      {activeInspector === 'layers' ? renderLayersPanel() : renderToolsPanel()}
    </div>
  );

  const renderStudio = () => (
    <div className="space-y-4">
      {renderStudioQuickAccess()}
      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-0">{renderInspector()}</div>
        <div className="moban-card relative flex min-h-[680px] min-w-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#edf1ff] px-6 py-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#90a0c2]">Studio</p>
              <h2 className="mt-2 text-xl font-black text-[#35456f]">设计工作台</h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#97a3c4]">
              <span className="rounded-full bg-[#f5f7ff] px-3 py-2">{template ? `${template.width} × ${template.height}` : '未加载模板'}</span>
            </div>
          </div>

          {isUploading && (
            <div className="px-6 pt-4">
              <div className="overflow-hidden rounded-full bg-[#edf1ff]">
                <div
                  className="h-2 rounded-full bg-[linear-gradient(90deg,#6c7dff,#88a4ff)] transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(118,142,255,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(238,123,180,0.12),transparent_28%),linear-gradient(180deg,#eef3ff,#eef2f9)]">
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(125,145,206,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(125,145,206,0.08) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />
            <div className="relative z-10 h-full w-full p-4 md:p-6">
              <CanvasEditor />
            </div>
          </div>
        </div>
      </div>
      {renderSystemConfig()}
    </div>
  );

  return (
    <div className="moban-admin-shell h-screen w-screen overflow-hidden bg-[linear-gradient(135deg,#cdd9ff_0%,#eef3ff_33%,#edf1fb_100%)] text-[#1d1d1f]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(130,151,255,0.32),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(142,112,255,0.18),transparent_20%),radial-gradient(circle_at_right_center,rgba(255,255,255,0.66),transparent_28%)]" />

      <div className="relative z-10 flex h-full gap-4 p-4 md:p-6">
        <aside className="hidden w-[112px] shrink-0 rounded-[34px] bg-[linear-gradient(180deg,#dfe7ff,#f7f9ff)] px-4 py-6 shadow-[0_28px_56px_rgba(158,176,223,0.28)] lg:flex lg:flex-col">
          <div className="flex items-center justify-center gap-2 rounded-[24px] bg-white px-3 py-4 shadow-[0_12px_24px_rgba(183,196,231,0.24)]">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[linear-gradient(180deg,#6d82ff,#708cff)] text-white">
              <Sparkles size={18} />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {navigation.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveWorkspace(item.id)}
                className={`group flex w-full flex-col items-center gap-2 rounded-[26px] px-3 py-4 transition ${
                  activeWorkspace === item.id
                    ? 'bg-[linear-gradient(180deg,#6480ff,#6d93ff)] text-white shadow-[0_20px_34px_rgba(103,129,255,0.28)]'
                    : 'bg-white/80 text-[#8a97bb] shadow-[0_10px_22px_rgba(183,196,231,0.16)] hover:bg-white'
                }`}
              >
                {item.icon}
                <span className="text-[11px] font-black tracking-wide">{item.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="moban-stage-shell min-h-0 flex-1 overflow-hidden rounded-[38px] border border-white/70 bg-[linear-gradient(180deg,rgba(240,245,255,0.92),rgba(247,249,255,0.92))] p-4 shadow-[0_34px_60px_rgba(143,163,211,0.2)] md:p-5">
            <div className="h-full min-h-0 overflow-auto pr-1 custom-scrollbar">
              {activeWorkspace === 'dashboard' && renderDashboard()}
              {activeWorkspace === 'studio' && renderStudio()}
              {activeWorkspace === 'templates' && renderTemplateManager()}
              {activeWorkspace === 'users' && renderUsers()}
            </div>
          </div>
        </div>
      </div>

      {renderResult && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1a1f30]/45 p-4 backdrop-blur-xl">
          <div className="w-full max-w-5xl overflow-hidden rounded-[36px] bg-white shadow-[0_36px_76px_rgba(34,49,90,0.28)]">
            <div className="flex flex-col gap-3 border-b border-[#eef2ff] px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.28em] text-[#8ea0c3]">Render Result</div>
                <h3 className="mt-2 text-2xl font-black text-[#35456f]">导出完成</h3>
              </div>
              <div className="flex gap-2">
                <a
                  href={renderResult}
                  download
                  className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#5f79ff,#6f95ff)] px-5 py-3 text-sm font-black text-white"
                >
                  立即下载
                </a>
                <button
                  onClick={() => setRenderResult(null)}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#f4f7ff] px-5 py-3 text-sm font-black text-[#5f7096]"
                >
                  关闭预览
                </button>
              </div>
            </div>
            <div className="grid min-h-[420px] place-items-center bg-[linear-gradient(180deg,#f7f9ff,#edf2fb)] p-8">
              <img src={renderResult} className="max-h-[62vh] rounded-[28px] border-[14px] border-white object-contain shadow-[0_32px_58px_rgba(31,47,92,0.18)]" />
            </div>
          </div>
        </div>
      )}

      {maskInfo && (
        <div className="fixed right-6 top-24 z-[110] w-[320px] rounded-[30px] border border-white/80 bg-white/92 p-5 shadow-[0_28px_56px_rgba(149,163,203,0.24)] backdrop-blur-2xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-[#8ea0c3]">Mask Info</div>
              <div className="mt-2 text-lg font-black text-[#35456f]">替换蒙版数据</div>
            </div>
            <button
              onClick={() => setMaskInfo(null)}
              className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f6ff] text-[#7081ad]"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#f6f8ff] px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9aa8c8]">W</div>
              <div className="mt-1 text-lg font-black text-[#35456f]">{Math.round(maskInfo.width)}</div>
            </div>
            <div className="rounded-2xl bg-[#f6f8ff] px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9aa8c8]">H</div>
              <div className="mt-1 text-lg font-black text-[#35456f]">{Math.round(maskInfo.height)}</div>
            </div>
            <div className="rounded-2xl bg-[#f6f8ff] px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9aa8c8]">X</div>
              <div className="mt-1 text-lg font-black text-[#35456f]">{Math.round(maskInfo.x)}</div>
            </div>
            <div className="rounded-2xl bg-[#f6f8ff] px-3 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#9aa8c8]">Y</div>
              <div className="mt-1 text-lg font-black text-[#35456f]">{Math.round(maskInfo.y)}</div>
            </div>
          </div>

          <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${maskInfo.isReplaceable ? 'bg-[#eefbf3] text-[#2f9b62]' : 'bg-[#fff7ec] text-[#c78b1c]'}`}>
            {maskInfo.isReplaceable ? '该图层可用于替换素材' : '该图层未标记为可替换素材'}
          </div>

          {maskInfo.url && (
            <div className="mt-4 overflow-hidden rounded-[24px] border border-[#eef1ff] bg-[#f9fbff] p-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#97a4c4]">Preview</div>
              <div className="grid h-32 place-items-center rounded-[20px] bg-white">
                <img src={maskInfo.url} className="max-h-full max-w-full object-contain" alt="mask preview" />
              </div>
            </div>
          )}
        </div>
      )}

      {requestCropInfo && (
        <CropModal
          image={requestCropInfo.url}
          aspect={requestCropInfo.aspect}
          onClose={() => setRequestCropInfo(null)}
          onConfirm={handleCropConfirm}
        />
      )}

      {isSaveModalOpen && (
        <SaveModal
          initialCategory={template?.category}
          initialPreview={template?.thumbnail || (stageRef?.current ? stageRef.current.toDataURL({ pixelRatio: 0.5 }) : null)}
          onClose={() => setIsSaveModalOpen(false)}
          onConfirm={handleConfirmSave}
        />
      )}

      {isSettingsModalOpen && <SettingsModal onClose={() => setIsSettingsModalOpen(false)} />}
    </div>
  );
}

export default App;
