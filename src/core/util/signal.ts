/** Minimal typed observer. Core raises signals; the UI subscribes. */
export class Signal<T> {
  private readonly handlers = new Set<(value: T) => void>();

  /** Subscribes and returns a function that unsubscribes. */
  on(handler: (value: T) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(value: T): void {
    for (const handler of [...this.handlers]) {
      handler(value);
    }
  }
}
