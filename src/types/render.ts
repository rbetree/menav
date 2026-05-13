export type IconMode = 'favicon' | 'manual';
export type IconRegion = 'com' | 'cn';

export interface RenderContext {
  icons: {
    mode: IconMode;
    region: IconRegion;
  };
  allowedSchemes: string[];
}
