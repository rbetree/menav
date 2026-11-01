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

export function isSnapshotAssetData(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 670_000 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}
