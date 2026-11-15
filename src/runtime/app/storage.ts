// localStorage 在隐私模式或沙箱中会直接抛错；统一降级到内存，避免中断运行时初始化。
const memoryStore = new Map<string, string>();

function getNativeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch (error) {
    return null;
  }
}

function safeGetItem(key: string): string | null {
  try {
    const value = getNativeStorage()?.getItem(key);
    if (value !== null && value !== undefined) return value;
  } catch (error) {
    // 读取失败时继续使用内存副本
  }
  return memoryStore.get(key) ?? null;
}

function safeSetItem(key: string, value: string): void {
  memoryStore.set(key, value);
  try {
    getNativeStorage()?.setItem(key, value);
  } catch (error) {
    // 写入失败时保留内存副本，当前会话内仍可读
  }
}

export { safeGetItem, safeSetItem };
