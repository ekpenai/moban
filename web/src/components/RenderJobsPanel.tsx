import React from 'react';
import type { RenderJobLogEntry, RenderJobSummary } from '../types';
import api, { AUTH_TOKEN_STORAGE_KEY } from '../lib/axios';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  highlightedJobId?: string | null;
};

type StreamMessage =
  | { type: 'snapshot'; payload: RenderJobSummary }
  | { type: 'log'; payload: RenderJobLogEntry }
  | { type: 'logs'; payload: RenderJobLogEntry[] };

type SourceFilter = 'all' | 'mini_program' | 'web';

const sourceLabelMap: Record<string, string> = {
  mini_program: '小程序',
  web: 'Web',
};

const statusLabelMap: Record<string, string> = {
  queued: '排队中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

const stageLabelMap: Record<string, string> = {
  queued: '等待进入队列',
  booting_browser: '启动浏览器',
  normalizing_template: '整理模板数据',
  rendering_html: '渲染页面',
  loading_assets: '加载素材',
  capturing_image: '截图出图',
  uploading_result: '上传结果',
  completed: '导出完成',
  failed: '导出失败',
};

function formatSource(source?: string) {
  return sourceLabelMap[source || ''] || source || '未知来源';
}

function formatStatus(status?: string) {
  return statusLabelMap[status || ''] || status || '未知状态';
}

function formatStage(stage?: string) {
  return stageLabelMap[stage || ''] || stage || '等待状态';
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs) return '-';
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)}s`;
  return `${(durationMs / 60_000).toFixed(1)}min`;
}

function buildFallbackMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'response' in error) {
    const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

export function RenderJobsPanel({ isOpen, onClose, highlightedJobId }: Props) {
  const [jobs, setJobs] = React.useState<RenderJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);
  const [jobDetail, setJobDetail] = React.useState<RenderJobSummary | null>(null);
  const [logs, setLogs] = React.useState<RenderJobLogEntry[]>([]);
  const [tokenInput, setTokenInput] = React.useState(() => window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '');
  const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>('all');
  const [connectionState, setConnectionState] = React.useState<'idle' | 'streaming' | 'polling'>('idle');
  const [panelError, setPanelError] = React.useState<string | null>(null);
  const eventSourceRef = React.useRef<EventSource | null>(null);
  const logsContainerRef = React.useRef<HTMLDivElement | null>(null);
  const detailPollRef = React.useRef<number | null>(null);

  const closeStream = React.useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setConnectionState((current) => (current === 'streaming' ? 'idle' : current));
  }, []);

  const stopDetailPolling = React.useCallback(() => {
    if (detailPollRef.current) {
      window.clearInterval(detailPollRef.current);
      detailPollRef.current = null;
    }
    setConnectionState((current) => (current === 'polling' ? 'idle' : current));
  }, []);

  const fetchJobDetail = React.useCallback(async (jobId: string) => {
    const [detailRes, logsRes] = await Promise.all([
      api.get(`/me/render-jobs/${jobId}`),
      api.get(`/me/render-jobs/${jobId}/logs`),
    ]);
    setJobDetail(detailRes.data?.data || null);
    setLogs((logsRes.data?.data || []) as RenderJobLogEntry[]);
  }, []);

  const startDetailPolling = React.useCallback((jobId: string) => {
    stopDetailPolling();
    setConnectionState('polling');
    detailPollRef.current = window.setInterval(() => {
      fetchJobDetail(jobId).catch(() => undefined);
    }, 5000);
  }, [fetchJobDetail, stopDetailPolling]);

  const fetchJobs = React.useCallback(async () => {
    try {
      const params = sourceFilter === 'all' ? undefined : { source: sourceFilter };
      const res = await api.get('/me/render-jobs', { params });
      const list = (res.data?.data || []) as RenderJobSummary[];
      setJobs(list);
      setPanelError(null);
      if (!selectedJobId && list[0]?.jobId) {
        setSelectedJobId(highlightedJobId || list[0].jobId);
      }
      if (selectedJobId && !list.some((job) => job.jobId === selectedJobId)) {
        setSelectedJobId(list[0]?.jobId || null);
      }
    } catch (error) {
      setPanelError(buildFallbackMessage(error, '任务列表加载失败，请确认 token 和登录态。'));
    }
  }, [highlightedJobId, selectedJobId, sourceFilter]);

  const openStream = React.useCallback((jobId: string) => {
    closeStream();
    stopDetailPolling();
    const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
    const url = new URL(`${baseUrl}/me/render-jobs/${jobId}/stream`);
    if (token) {
      url.searchParams.set('token', token);
    }

    const source = new EventSource(url.toString());
    eventSourceRef.current = source;
    setConnectionState('streaming');

    source.addEventListener('snapshot', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as RenderJobSummary;
      setJobDetail(payload);
      setJobs((prev) => {
        const exists = prev.some((job) => job.jobId === payload.jobId);
        if (!exists) {
          return [payload, ...prev];
        }
        return prev.map((job) => (job.jobId === payload.jobId ? { ...job, ...payload } : job));
      });
    });

    source.addEventListener('logs', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as RenderJobLogEntry[];
      setLogs(payload);
    });

    source.addEventListener('log', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as RenderJobLogEntry;
      setLogs((prev) => [...prev, payload]);
    });

    source.onerror = () => {
      source.close();
      eventSourceRef.current = null;
      startDetailPolling(jobId);
    };
  }, [closeStream, startDetailPolling, stopDetailPolling]);

  React.useEffect(() => {
    if (!isOpen) {
      closeStream();
      stopDetailPolling();
      return;
    }
    fetchJobs();
    const timer = window.setInterval(fetchJobs, 5000);
    return () => {
      window.clearInterval(timer);
      closeStream();
      stopDetailPolling();
    };
  }, [isOpen, fetchJobs, closeStream, stopDetailPolling]);

  React.useEffect(() => {
    if (!isOpen || !selectedJobId) return;
    fetchJobDetail(selectedJobId)
      .then(() => setPanelError(null))
      .catch((error) => {
        setPanelError(buildFallbackMessage(error, '任务详情加载失败。'));
      });
    openStream(selectedJobId);
    return () => {
      closeStream();
      stopDetailPolling();
    };
  }, [isOpen, selectedJobId, fetchJobDetail, openStream, closeStream, stopDetailPolling]);

  React.useEffect(() => {
    if (highlightedJobId) {
      setSelectedJobId(highlightedJobId);
    }
  }, [highlightedJobId]);

  React.useEffect(() => {
    const container = logsContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [logs]);

  if (!isOpen) return null;

  const saveToken = () => {
    if (tokenInput.trim()) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, tokenInput.trim());
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    fetchJobs();
  };

  const visibleJobs = jobs;

  return (
    <div className="fixed inset-0 z-[160] bg-slate-900/30 backdrop-blur-sm flex justify-end">
      <div className="h-full w-full max-w-[1080px] bg-white shadow-2xl border-l border-slate-200 flex">
        <div className="w-[360px] border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-200 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">导出任务</h3>
                <p className="text-xs text-slate-500">查看当前用户的小程序与 Web 导出状态、进度和日志</p>
              </div>
              <button onClick={onClose} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold">
                关闭
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="粘贴 auth token"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button onClick={saveToken} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">
                保存
              </button>
            </div>
            <div className="flex gap-2">
              {[
                { key: 'all', label: '全部' },
                { key: 'mini_program', label: '小程序' },
                { key: 'web', label: 'Web' },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSourceFilter(item.key as SourceFilter)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                    sourceFilter === item.key
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">连接状态：{connectionState === 'streaming' ? 'SSE 实时' : connectionState === 'polling' ? '轮询回退' : '待连接'}</span>
              <span className="text-slate-400">{visibleJobs.length} 个任务</span>
            </div>
            {panelError && <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">{panelError}</div>}
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {visibleJobs.map((job) => {
              const isSelected = selectedJobId === job.jobId;
              const isHighlighted = highlightedJobId === job.jobId;
              const isFailed = job.status === 'failed';
              return (
                <button
                  key={job.jobId}
                  onClick={() => setSelectedJobId(job.jobId)}
                  className={`w-full text-left rounded-2xl border p-3 transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : isFailed
                        ? 'border-rose-200 bg-rose-50/60'
                        : 'border-slate-200 bg-white'
                  } ${isHighlighted ? 'ring-2 ring-amber-300' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black uppercase text-slate-400">{formatSource(job.source)}</span>
                    <span className={`text-xs font-bold ${isFailed ? 'text-rose-600' : 'text-slate-500'}`}>{job.progress}%</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      job.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : job.status === 'failed'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}>
                      {formatStatus(job.status)}
                    </span>
                    {isHighlighted && <span className="text-[11px] font-bold text-amber-600">当前导出</span>}
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-900">{formatStage(job.stage)}</div>
                  <div className="mt-1 text-xs text-slate-500 line-clamp-2">{job.message || '等待更多日志...'}</div>
                  <div className="mt-2 text-[11px] text-slate-400">开始时间：{formatDateTime(job.createdAt)}</div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full ${isFailed ? 'bg-rose-500' : 'bg-indigo-600'}`}
                      style={{ width: `${Math.max(2, job.progress || 0)}%` }}
                    />
                  </div>
                </button>
              );
            })}
            {visibleJobs.length === 0 && (
              <div className="text-sm text-slate-500 p-4">暂无任务。先保存 token，再从小程序或 web 发起一次导出即可在这里看到。</div>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-5 border-b border-slate-200 space-y-4">
            <div>
              <h4 className="text-lg font-black text-slate-900">{jobDetail ? formatStage(jobDetail.stage) : '未选择任务'}</h4>
              <p className="text-sm text-slate-500 mt-1">{jobDetail?.message || '请选择左侧任务查看详情。'}</p>
            </div>
            {jobDetail && (
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">状态</div>
                  <div className="font-bold text-slate-900 mt-1">{formatStatus(jobDetail.status)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">进度</div>
                  <div className="font-bold text-slate-900 mt-1">{jobDetail.progress}%</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">来源</div>
                  <div className="font-bold text-slate-900 mt-1">{formatSource(jobDetail.source)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">开始时间</div>
                  <div className="font-bold text-slate-900 mt-1 text-xs">{formatDateTime(jobDetail.startedAt || jobDetail.createdAt)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">耗时</div>
                  <div className="font-bold text-slate-900 mt-1">{formatDuration(jobDetail.durationMs)}</div>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
            <div className="p-5 overflow-hidden flex flex-col min-h-0">
              <h5 className="text-sm font-black text-slate-700 mb-3">实时日志</h5>
              <div ref={logsContainerRef} className="rounded-2xl bg-slate-950 text-emerald-300 p-4 flex-1 overflow-auto font-mono text-xs space-y-2">
                {logs.map((log) => (
                  <div key={`${log.id}-${log.time}`}>
                    <span className="text-slate-500">[{log.time ? new Date(log.time).toLocaleTimeString() : '--:--:--'}]</span>{' '}
                    <span className="text-indigo-300">{formatStage(log.stage)}</span>{' '}
                    <span className={log.level === 'error' ? 'text-rose-300' : log.level === 'warn' ? 'text-amber-300' : 'text-emerald-300'}>
                      {log.message}
                    </span>
                  </div>
                ))}
                {logs.length === 0 && <div className="text-slate-500">暂无日志</div>}
              </div>
            </div>
            <div className="border-l border-slate-200 p-5 overflow-auto">
              <h5 className="text-sm font-black text-slate-700 mb-3">结果与诊断</h5>
              {jobDetail?.imageUrl ? (
                <div className="space-y-3">
                  <img src={jobDetail.imageUrl} alt="render result" className="w-full rounded-2xl border border-slate-200" />
                  <a href={jobDetail.imageUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">
                    打开结果图
                  </a>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-6 text-sm text-slate-500">
                  {jobDetail?.failedReason || '任务尚未产出成图。导出慢时，可以先看左侧实时日志判断卡在浏览器启动、素材加载还是上传阶段。'}
                </div>
              )}
              {jobDetail?.recentLogs?.length ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-black text-slate-500 mb-2">最近事件</div>
                  <div className="space-y-2 text-xs text-slate-600">
                    {jobDetail.recentLogs.map((log) => (
                      <div key={`recent-${log.id}`}>
                        <span className="font-bold text-slate-800">{formatStage(log.stage)}</span>
                        <span className="mx-2 text-slate-300">|</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
