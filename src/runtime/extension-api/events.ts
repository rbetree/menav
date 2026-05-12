import type { RuntimeEvents } from '../types';

module.exports = function createMenavEvents(): RuntimeEvents {
  return {
    listeners: {},

    // 添加事件监听器
    on: function (this: RuntimeEvents, event: string, callback: (data: unknown) => void): RuntimeEvents {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
      return this;
    },

    // 触发事件
    emit: function (this: RuntimeEvents, event: string, data?: unknown): RuntimeEvents {
      if (this.listeners[event]) {
        this.listeners[event].forEach((callback: (data: unknown) => void) => callback(data));
      }
      return this;
    },

    // 移除事件监听器
    off: function (this: RuntimeEvents, event: string, callback?: (data: unknown) => void): RuntimeEvents {
      if (this.listeners[event]) {
        if (callback) {
          this.listeners[event] = this.listeners[event].filter((cb: (data: unknown) => void) => cb !== callback);
        } else {
          delete this.listeners[event];
        }
      }
      return this;
    },
  };
};
