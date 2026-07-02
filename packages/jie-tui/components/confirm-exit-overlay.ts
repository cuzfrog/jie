import { Container, Text } from "@earendil-works/pi-tui";

export class ConfirmExitOverlay extends Container {
  private visible: boolean;
  private readonly line: Text;

  constructor() {
    super();
    this.visible = false;
    this.line = new Text("A turn is in flight; exit anyway? [y/N]");
    this.addChild(this.line);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  render(width: number): string[] {
    if (!this.visible) return [];
    return super.render(width);
  }

  invalidate(): void {
    super.invalidate();
  }
}
