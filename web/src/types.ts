export interface LayerMaskInfo {
  url?: string;
  src?: string;
  path?: string;
  image?: string;
}

export interface TemplateLayer {
  id: string;
  name?: string;
  title?: string;
  label?: string;
  type: "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  url?: string;
  maskUrl?: string;
  mask_url?: string;
  maskSrc?: string;
  maskPath?: string;
  mask?: string | LayerMaskInfo;
  maskInfo?: LayerMaskInfo;
  clippingMask?: LayerMaskInfo;
  clipMask?: LayerMaskInfo;
  maskRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isReplaceable?: boolean;
  editable: boolean;
  visible?: boolean;
}

export interface TemplateData {
  id: string;
  name?: string;
  category?: string;
  thumbnail?: string;
  width: number;
  height: number;
  layers: TemplateLayer[];
}
