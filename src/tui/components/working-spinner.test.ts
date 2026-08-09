import { PassThrough } from "node:stream";
import { Container, TuiMainScreen } from "@earendil-works/pi-tui";
import { StreamTerminalImpl } from "../stream-terminal";
import { _FlushLoader, _syncWorkingSlot } from "./working-spinner";

describe("FlushLoader", () => {
  test("renders the spinner at the chat column, without the loader's left padding", () => {
    const loader = makeFlushLoader("Working…", ["⠋"]);
    try {
      const lines = loader.render(80);
      expect(lines[0]).toBe("");
      expect(lines[1]!.trimEnd()).toBe("⠋ Working…");
    } finally {
      loader.stop();
    }
  });

  test("renders a frameless indicator label at the chat column", () => {
    const loader = makeFlushLoader("Interrupted", []);
    try {
      const lines = loader.render(80);
      expect(lines[0]).toBe("");
      expect(lines[1]!.trimEnd()).toBe("Interrupted");
    } finally {
      loader.stop();
    }
  });
});

describe("syncWorkingSlot", () => {
  let slot: Container;
  let working: InstanceType<typeof _FlushLoader>;
  let teamWorking: InstanceType<typeof _FlushLoader>;
  let interrupted: InstanceType<typeof _FlushLoader>;

  beforeEach(() => {
    slot = new Container();
    working = makeFlushLoader("Working…", ["⠋"]);
    teamWorking = makeFlushLoader("Team working…", ["⠙"]);
    interrupted = makeFlushLoader("Interrupted", []);
  });

  afterEach(() => {
    working.stop();
    teamWorking.stop();
    interrupted.stop();
  });

  test("an empty slot shows the focused indicator in focused mode", () => {
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "focused")).toBe(true);
    expect(slot.children).toEqual([working]);
  });

  test("an empty slot shows the team indicator in team mode", () => {
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "team")).toBe(true);
    expect(slot.children).toEqual([teamWorking]);
  });

  test("an empty slot shows the interrupted indicator in interrupted mode without starting it", () => {
    const start = vi.spyOn(interrupted, "start");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "interrupted")).toBe(true);
    expect(slot.children).toEqual([interrupted]);
    expect(start).not.toHaveBeenCalled();
  });

  test("none mode leaves an empty slot untouched", () => {
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "none")).toBe(false);
    expect(slot.children).toEqual([]);
  });

  test("returns false and does not restart when the target indicator is already shown", () => {
    _syncWorkingSlot(slot, working, teamWorking, interrupted, "focused");
    const start = vi.spyOn(working, "start");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "focused")).toBe(false);
    expect(slot.children).toEqual([working]);
    expect(start).not.toHaveBeenCalled();
  });

  test("switching from focused to team stops the focused spinner and starts the team spinner", () => {
    _syncWorkingSlot(slot, working, teamWorking, interrupted, "focused");
    const stopWorking = vi.spyOn(working, "stop");
    const startTeam = vi.spyOn(teamWorking, "start");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "team")).toBe(true);
    expect(stopWorking).toHaveBeenCalledTimes(1);
    expect(startTeam).toHaveBeenCalledTimes(1);
    expect(slot.children).toEqual([teamWorking]);
  });

  test("leaving team mode for none stops the team spinner and clears the slot", () => {
    _syncWorkingSlot(slot, working, teamWorking, interrupted, "team");
    const stopTeam = vi.spyOn(teamWorking, "stop");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "none")).toBe(true);
    expect(stopTeam).toHaveBeenCalledTimes(1);
    expect(slot.children).toEqual([]);
  });

  test("the interrupted indicator gives way to the focused spinner", () => {
    _syncWorkingSlot(slot, working, teamWorking, interrupted, "interrupted");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "focused")).toBe(true);
    expect(slot.children).toEqual([working]);
  });
});

function makeFlushLoader(message: string, frames: ReadonlyArray<string>): InstanceType<typeof _FlushLoader> {
  const stdout = Object.assign(new PassThrough(), { columns: 80, rows: 30 });
  const ui = new TuiMainScreen(new StreamTerminalImpl(new PassThrough(), stdout));
  const identity = (text: string): string => text;
  return new _FlushLoader(ui, identity, identity, message, { frames: [...frames] });
}
