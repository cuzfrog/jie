import { visibleWidth } from "@earendil-works/pi-tui";
import type { MessageTurn } from "../../state";
import { UserMessage } from "./user-message";

function turn(userPrompt: string): MessageTurn {
  return { userPrompt, cards: [], blocks: [], streamId: null, seq: 0 };
}

describe("UserMessage", () => {
  test("renders the prompt with a styled prefix", () => {
    const message = new UserMessage("hello");
    expect(message.render(80)).toEqual(["\x1b[36m› \x1b[39mhello"]);
  });

  test("wraps long prompts at the given width", () => {
    const message = new UserMessage("hello world foo bar");
    const lines = message.render(20);
    expect(lines).toEqual(["\x1b[36m› \x1b[39mhello world foo", "bar"]);
  });

  test("update changes the rendered prompt", () => {
    const message = new UserMessage("a");
    message.update(turn("b"));
    expect(message.render(80)).toEqual(["\x1b[36m› \x1b[39mb"]);
  });

  test("a skill invocation renders the skill icon in place of the /skill: prefix", () => {
    const message = new UserMessage("/skill:say-hello Cause");
    expect(message.render(80)).toEqual(["\x1b[36m› ⚡ \x1b[39msay-hello Cause"]);
  });

  test("update to a skill invocation switches to the skill icon", () => {
    const message = new UserMessage("plain");
    message.update(turn("/skill:deploy now"));
    expect(message.render(80)).toEqual(["\x1b[36m› ⚡ \x1b[39mdeploy now"]);
  });

  test("text merely containing /skill: mid-line keeps the plain prefix", () => {
    const message = new UserMessage("run /skill:say-hello for me");
    expect(message.render(80)).toEqual(["\x1b[36m› \x1b[39mrun /skill:say-hello for me"]);
  });

  test("renders nothing for an empty prompt (tool-continuation turns)", () => {
    const message = new UserMessage("");
    expect(message.render(80)).toEqual([]);
    message.update(turn("later"));
    expect(message.render(80)).toEqual(["\x1b[36m› \x1b[39mlater"]);
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
