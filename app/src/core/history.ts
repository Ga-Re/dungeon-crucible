/** Undo/redo stack of serialized snapshots. Generic so it can be unit-tested. */
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  constructor(private readonly limit = 100) {}

  /** Records the state *before* a change. Clears the redo stack. */
  push(snapshot: T): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Returns the state to restore, given the current one, or null when there is nothing to undo. */
  undo(current: T): T | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    return next;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
