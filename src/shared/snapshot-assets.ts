/** 快照只携带图片，不允许覆盖脚本、配置文件或跳出资源目录。 */
export function isSnapshotAssetPath(value: string): boolean {
  if (
    value.startsWith('/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    return false;
  if (value.includes('/') && !value.startsWith('assets/')) return false;
  return /^(?:assets\/)?[a-zA-Z0-9_./-]+\.(?:svg|png|jpe?g|gif|webp|ico|avif)$/i.test(value);
}

/** 把配置里的本地图片引用收敛为快照资产路径；外链与越界路径返回 null。 */
export function resolveSnapshotAssetReference(
  value: unknown
): { destination: string; source: string } | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return null;

  const relative = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  if (!isSnapshotAssetPath(relative)) return null;

  return {
    destination: relative,
    source: relative.startsWith('assets/') ? relative : `assets/${relative}`,
  };
}

export function isSnapshotAssetData(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 670_000 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}
