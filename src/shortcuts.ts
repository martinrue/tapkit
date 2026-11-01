export interface ShortcutBinding { accelerator: string; action: string }
export interface ShortcutAdapter { register(key: string, callback: () => void): boolean; unregister(key: string): void }

/** Own only our shortcuts; failed transitions restore the previous set. */
export class ShortcutRegistry {
  private current: ShortcutBinding[] = [];
  private registered = new Map<string, ShortcutBinding>();
  constructor(private adapter: ShortcutAdapter, private dispatch: (action: string) => void) {}
  bindings(): ShortcutBinding[] { return this.current.map(binding => ({ ...binding })); }
  replace(bindings: ShortcutBinding[]) {
    const normalized = bindings.map(binding => ({ ...binding, accelerator: binding.accelerator.toLowerCase() }));
    if (new Set(normalized.map(binding => binding.accelerator)).size !== bindings.length) throw new Error('Duplicate shortcuts.');
    const desired = new Map(normalized.map((binding, index) => [binding.accelerator, bindings[index]]));
    const added = new Map<string, ShortcutBinding>();
    try {
      // Keep existing native hotkey IDs, including when a shared playing key
      // changes voices. Tearing down the whole set leaves queued macOS events
      // referring to hotkey IDs that Chromium has already removed.
      for (const [key, binding] of desired) {
        if (this.registered.has(key)) continue;
        const entry = { ...binding };
        if (!this.adapter.register(binding.accelerator, () => {
          if (this.registered.get(key) === entry) this.dispatch(entry.action);
        })) throw new Error(`Shortcut ${binding.accelerator} is unavailable. Choose another binding.`);
        added.set(key, entry);
      }
    } catch (error) {
      for (const binding of added.values()) this.adapter.unregister(binding.accelerator);
      throw error;
    }
    const removed = [...this.registered].filter(([key]) => !desired.has(key));
    for (const [key] of removed) this.registered.delete(key);
    for (const [key, binding] of desired) {
      const entry = this.registered.get(key) ?? added.get(key)!;
      entry.action = binding.action;
      this.registered.set(key, entry);
    }
    this.current = bindings.map(binding => ({ ...binding }));
    for (const [, binding] of removed) this.adapter.unregister(binding.accelerator);
  }
  release() {
    const previous = [...this.registered.values()];
    this.registered.clear();
    this.current = [];
    for (const binding of previous) this.adapter.unregister(binding.accelerator);
  }
}

/** Audio stays synchronous; commands that can unregister keys leave Carbon's callback first. */
export function shortcutDispatcher(dispatch: (action: string) => void, defer: (callback: () => void) => void) {
  return (action: string) => {
    if (action.startsWith('voice:')) { dispatch(action); return; }
    defer(() => dispatch(action));
  };
}
