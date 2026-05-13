import type { AppConfig } from '../../types/config';
import type { IconMode, IconRegion, RenderContext } from '../../types/render';

const DEFAULT_ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

const DEFAULT_RENDER_CONTEXT: RenderContext = {
  icons: {
    mode: 'favicon',
    region: 'com',
  },
  allowedSchemes: DEFAULT_ALLOWED_SCHEMES,
};

function normalizeIconMode(value: unknown): IconMode {
  return value === 'manual' ? 'manual' : 'favicon';
}

function normalizeIconRegion(value: unknown): IconRegion {
  return value === 'cn' ? 'cn' : 'com';
}

function normalizeAllowedSchemes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [...DEFAULT_ALLOWED_SCHEMES];
  }

  const schemes = value
    .map((scheme) =>
      String(scheme || '')
        .trim()
        .toLowerCase()
        .replace(/:$/, '')
    )
    .filter(Boolean);

  return schemes.length > 0 ? schemes : [...DEFAULT_ALLOWED_SCHEMES];
}

function createRenderContext(config: AppConfig | null | undefined): RenderContext {
  return {
    icons: {
      mode: normalizeIconMode(config?.icons?.mode),
      region: normalizeIconRegion(config?.icons?.region),
    },
    allowedSchemes: normalizeAllowedSchemes(config?.site?.security?.allowedSchemes),
  };
}

export {
  DEFAULT_ALLOWED_SCHEMES,
  DEFAULT_RENDER_CONTEXT,
  createRenderContext,
  normalizeAllowedSchemes,
  normalizeIconMode,
  normalizeIconRegion,
};
