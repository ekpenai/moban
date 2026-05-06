export interface TemplateLayer {
  id: string;
  name?: string;
  type: "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  text?: string;
  fontSize?: number;
  color?: string;
  url?: string;
  maskUrl?: string;
  editable: boolean;
}

export interface TemplateData {
  id: string;
  name?: string;
  width: number;
  height: number;
  layers: TemplateLayer[];
}
