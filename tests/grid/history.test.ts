import { describe, expect, it } from "vitest";
import { CommandStack, type Command } from "../../src/grid/history.ts";

function setCmd(state: { value: number }, next: number): Command {
  const prev = state.value;
  return {
    kind: "setCell",
    apply: () => {
      state.value = next;
    },
    invert: () => {
      state.value = prev;
    },
  };
}

describe("CommandStack", () => {
  it("applies commands on push", () => {
    const state = { value: 0 };
    const stack = new CommandStack();
    stack.push(setCmd(state, 5));
    expect(state.value).toBe(5);
  });

  it("undoes and redoes a sequence in order", () => {
    const state = { value: 0 };
    const stack = new CommandStack();
    stack.push(setCmd(state, 1));
    stack.push(setCmd(state, 2));
    stack.push(setCmd(state, 3));
    expect(state.value).toBe(3);

    stack.undo();
    expect(state.value).toBe(2);
    stack.undo();
    expect(state.value).toBe(1);
    stack.redo();
    expect(state.value).toBe(2);
    stack.redo();
    expect(state.value).toBe(3);
  });

  it("clears the redo branch after a new push", () => {
    const state = { value: 0 };
    const stack = new CommandStack();
    stack.push(setCmd(state, 1));
    stack.undo();
    expect(stack.canRedo()).toBe(true);
    stack.push(setCmd(state, 9));
    expect(stack.canRedo()).toBe(false);
    expect(state.value).toBe(9);
  });

  it("reports canUndo / canRedo and no-ops on empty", () => {
    const stack = new CommandStack();
    expect(stack.canUndo()).toBe(false);
    expect(stack.undo()).toBe(false);
    expect(stack.redo()).toBe(false);
  });
});
