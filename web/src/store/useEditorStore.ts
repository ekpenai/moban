import { create } from 'zustand';
import type { TemplateData, TemplateLayer } from '../types';

interface EditorState {
  template: TemplateData | null;
  selectedId: string | null;
  past: TemplateLayer[][];
  future: TemplateLayer[][];
  requestReplaceId: string | null;
  requestCropInfo: { id: string, url: string, aspect: number } | null;
  stageRef: any | null;
  
  setTemplate: (template: TemplateData) => void;
  setSelectedId: (id: string | null) => void;
  setRequestReplaceId: (id: string | null) => void;
  setRequestCropInfo: (info: { id: string, url: string, aspect: number } | null) => void;
  setStageRef: (ref: any | null) => void;
  updateLayer: (id: string, layer: Partial<TemplateLayer>) => void;
  addLayer: (layer: Omit<TemplateLayer, 'id'>) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  deleteLayer: (id: string) => void;
  undo: () => void;
  redo: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  template: null,
  selectedId: null,
  past: [],
  future: [],
  requestReplaceId: null,
  requestCropInfo: null,
  stageRef: null,

  setTemplate: (template) => set({ template, past: [], future: [] }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setRequestReplaceId: (requestReplaceId) => set({ requestReplaceId }),
  setRequestCropInfo: (requestCropInfo) => set({ requestCropInfo }),
  setStageRef: (stageRef) => set({ stageRef }),

  saveHistory: (state: any) => {
    if (!state.template) return {};
    return {
      past: [...state.past, JSON.parse(JSON.stringify(state.template.layers))].slice(-50), // 最多保留50步
      future: []
    };
  },

  updateLayer: (id, newProps) =>
    set((state) => {
      if (!state.template) return state;
      const history = (useEditorStore.getState() as any).saveHistory(state);
      return {
        ...history,
        template: {
          ...state.template,
          layers: state.template.layers.map((layer) =>
            layer.id === id ? { ...layer, ...newProps } : layer
          ),
        },
      };
    }),

  addLayer: (newLayer) =>
    set((state) => {
      if (!state.template) return state;
      const history = (useEditorStore.getState() as any).saveHistory(state);
      const id = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const layerWithId = { ...newLayer, id };
      return {
        ...history,
        template: {
          ...state.template,
          layers: [...state.template.layers, layerWithId],
        },
        selectedId: id,
      };
    }),

  moveLayerUp: (id) => set((state) => {
    if (!state.template) return state;
    const history = (useEditorStore.getState() as any).saveHistory(state);
    const layers = [...state.template.layers];
    const index = layers.findIndex(l => l.id === id);
    if (index > 0) {
      const temp = layers[index];
      layers[index] = layers[index - 1];
      layers[index - 1] = temp;
    }
    return { ...history, template: { ...state.template, layers } };
  }),

  moveLayerDown: (id) => set((state) => {
    if (!state.template) return state;
    const history = (useEditorStore.getState() as any).saveHistory(state);
    const layers = [...state.template.layers];
    const index = layers.findIndex(l => l.id === id);
    if (index < layers.length - 1 && index !== -1) {
      const temp = layers[index];
      layers[index] = layers[index + 1];
      layers[index + 1] = temp;
    }
    return { ...history, template: { ...state.template, layers } };
  }),

  deleteLayer: (id) => set((state) => {
    if (!state.template) return state;
    const history = (useEditorStore.getState() as any).saveHistory(state);
    return {
      ...history,
      template: {
        ...state.template,
        layers: state.template.layers.filter(l => l.id !== id),
      },
      selectedId: state.selectedId === id ? null : state.selectedId
    };
  }),

  undo: () => set((state) => {
    if (state.past.length === 0 || !state.template) return state;
    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, state.past.length - 1);
    return {
      past: newPast,
      future: [state.template.layers, ...state.future],
      template: { ...state.template, layers: previous }
    };
  }),

  redo: () => set((state) => {
    if (state.future.length === 0 || !state.template) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return {
      past: [...state.past, state.template.layers],
      future: newFuture,
      template: { ...state.template, layers: next }
    };
  }),
}));
