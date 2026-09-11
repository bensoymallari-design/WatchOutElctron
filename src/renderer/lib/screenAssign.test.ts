import assert from "node:assert/strict";
import test from "node:test";
import { layoutDisplaysOnScreens, outputPool, screenForDisplay } from "./screenAssign";
import type { OutputScreen } from "./displayOutput";
import { emptyDisplay } from "./showFactory";

function screen(partial: Partial<OutputScreen> & Pick<OutputScreen, "id" | "label">): OutputScreen {
  return {
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    physicalWidth: 1920,
    physicalHeight: 1080,
    isPrimary: false,
    scaleFactor: 1,
    ...partial,
  };
}

test("output pool prefers the extra HDMI screens, not the laptop", () => {
  const laptop = screen({ id: "1", label: "Laptop", isPrimary: true });
  const a = screen({ id: "2", label: "TV A" });
  const b = screen({ id: "3", label: "TV B" });
  assert.deepEqual(
    outputPool([laptop, a, b]).map((s) => s.id),
    ["2", "3"],
  );
});

test("a display can pin a specific controller / monitor", () => {
  const screens = [
    screen({ id: "1", label: "Laptop", isPrimary: true }),
    screen({ id: "2", label: "Controller 1" }),
    screen({ id: "3", label: "Controller 2" }),
    screen({ id: "4", label: "Controller 3" }),
    screen({ id: "5", label: "Controller 4" }),
  ];
  const d = emptyDisplay({ channel: 1, screenId: "4" });
  assert.equal(screenForDisplay(d, screens)?.id, "4");
});

test("four displays tile onto four controllers with real pixels", () => {
  const screens = [
    screen({ id: "lap", label: "Laptop", isPrimary: true }),
    screen({ id: "c1", label: "C1", physicalWidth: 3840, physicalHeight: 2160 }),
    screen({ id: "c2", label: "C2", physicalWidth: 1920, physicalHeight: 1080 }),
    screen({ id: "c3", label: "C3", physicalWidth: 1920, physicalHeight: 1080 }),
    screen({ id: "c4", label: "C4", physicalWidth: 1920, physicalHeight: 1080 }),
  ];
  const laid = layoutDisplaysOnScreens([emptyDisplay({ name: "Display 1" })], screens);
  assert.equal(laid.length, 4);
  assert.equal(laid[0].screenId, "c1");
  assert.equal(laid[0].width, 3840);
  assert.equal(laid[1].screenId, "c2");
  assert.equal(laid[3].x, 3840 + 1920 + 1920);
  assert.equal(laid[3].channel, 4);
});
