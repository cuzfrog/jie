import { visibleWidth } from "@earendil-works/pi-tui";
import type { MessageTurn } from "../../state";
import { UserMessage } from "./user-message";

const ROW_BACKGROUND = "\x1b[40m";
const ROW_BACKGROUND_END = "\x1b[49m";

function turn(userPrompt: string): MessageTurn {
  return { userPrompt, entries: [], streamId: null, seq: 0 };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function expectLine(line: string, expectedText: string, width: number): void {
  expect(visibleWidth(line)).toBe(width);
  expect(stripAnsi(line).trimEnd()).toBe(expectedText);
  expect(line.startsWith(ROW_BACKGROUND)).toBe(true);
  expect(line.endsWith(ROW_BACKGROUND_END)).toBe(true);
}

describe("UserMessage", () => {
  test("renders the prompt with a styled prefix and full-row background", () => {
    const [line] = new UserMessage("hello").render(80);
    expectLine(line, "› hello", 80);
  });

  test("wraps long prompts and pads each row to the full width", () => {
    const lines = new UserMessage("hello world foo bar").render(20);
    expect(lines.length).toBe(2);
    expectLine(lines[0]!, "› hello world foo", 20);
    expectLine(lines[1]!, "bar", 20);
  });

  test("update changes the rendered prompt", () => {
    const message = new UserMessage("a");
    message.update(turn("b"));
    expectLine(message.render(80)[0]!, "› b", 80);
  });

  test("a skill invocation renders the skill icon in place of the /skill: prefix", () => {
    const [line] = new UserMessage("/skill:say-hello Cause").render(80);
    expectLine(line, "› ⚡ say-hello Cause", 80);
  });

  test("a skill invocation without arguments renders the skill icon", () => {
    const [line] = new UserMessage("/skill:deploy").render(80);
    expectLine(line, "› ⚡ deploy", 80);
  });

  test("update to a skill invocation switches to the skill icon", () => {
    const message = new UserMessage("plain");
    message.update(turn("/skill:deploy now"));
    expectLine(message.render(80)[0]!, "› ⚡ deploy now", 80);
  });

  test("text merely containing /skill: mid-line keeps the plain prefix", () => {
    const [line] = new UserMessage("run /skill:say-hello for me").render(80);
    expectLine(line, "› run /skill:say-hello for me", 80);
  });

  test("renders nothing for an empty prompt (tool-continuation turns)", () => {
    const message = new UserMessage("");
    expect(message.render(80)).toEqual([]);
    message.update(turn("later"));
    expectLine(message.render(80)[0]!, "› later", 80);
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    const message = new UserMessage(`${"x".repeat(300)}${"中文🎉".repeat(40)}`);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of message.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
