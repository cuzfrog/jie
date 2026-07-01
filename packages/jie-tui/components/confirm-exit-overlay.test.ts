import { ConfirmExitOverlay, confirmExitOverlayFromState } from "./confirm-exit-overlay";

describe("ConfirmExitOverlay", () => {
  test("renders nothing when hidden", () => {
    const overlay = new ConfirmExitOverlay();
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.render(60)).toEqual([]);
  });

  test("isVisible reflects setVisible", () => {
    const overlay = new ConfirmExitOverlay();
    overlay.setVisible(true);
    expect(overlay.isVisible()).toBe(true);
    overlay.setVisible(false);
    expect(overlay.isVisible()).toBe(false);
  });

  test("renders the prompt and default answer when shown", () => {
    const overlay = new ConfirmExitOverlay();
    overlay.setVisible(true);
    const flat = overlay.render(60).join("\n");
    expect(flat).toContain("A turn is in flight");
    expect(flat).toContain("[y/N]");
  });

  test("setVisible(false) clears the rendered output", () => {
    const overlay = new ConfirmExitOverlay();
    overlay.setVisible(true);
    expect(overlay.render(60).length).toBeGreaterThan(0);
    overlay.setVisible(false);
    expect(overlay.render(60)).toEqual([]);
  });
});

describe("confirmExitOverlayFromState", () => {
  test("constructs a hidden overlay", () => {
    const overlay = confirmExitOverlayFromState();
    expect(overlay.isVisible()).toBe(false);
    expect(overlay.render(60)).toEqual([]);
  });
});
