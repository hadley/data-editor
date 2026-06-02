// history.ts — command-history stack for undo/redo (FR-026, Constitution III).
// Every data mutation flows through a reversible Command so single-cell and bulk
// operations (paste, fill-down) undo uniformly.

export type CommandKind = "setCell" | "addRow" | "paste" | "fillDown";

export interface Command {
  kind: CommandKind;
  apply(): void;
  invert(): void;
}

export class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  /** Apply a command and record it; clears the redo branch. */
  push(command: Command): void {
    command.apply();
    this.undoStack.push(command);
    this.redoStack = [];
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.invert();
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.apply();
    this.undoStack.push(command);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
