import type { Easing } from "../types/show";

function bounceOut(t: number) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const x = t - 1.5 / d1;
    return n1 * x * x + 0.75;
  }
  if (t < 2.5 / d1) {
    const x = t - 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  const x = t - 2.625 / d1;
  return n1 * x * x + 0.984375;
}

export function ease(type: Easing, t: number) {
  const x = Math.min(1, Math.max(0, t));
  switch (type) {
    case "linear":
      return x;
    case "quadIn":
      return x * x;
    case "quadOut":
      return 1 - (1 - x) * (1 - x);
    case "quadInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "cubicIn":
      return x * x * x;
    case "cubicOut":
      return 1 - Math.pow(1 - x, 3);
    case "cubicInOut":
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case "sineIn":
      return 1 - Math.cos((x * Math.PI) / 2);
    case "sineOut":
      return Math.sin((x * Math.PI) / 2);
    case "sineInOut":
      return -(Math.cos(Math.PI * x) - 1) / 2;
    case "expoIn":
      return x === 0 ? 0 : Math.pow(2, 10 * x - 10);
    case "expoOut":
      return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    case "expoInOut":
      if (x === 0 || x === 1) return x;
      return x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
    case "backOut": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case "bounceOut":
      return bounceOut(x);
    case "elasticOut": {
      const c4 = (2 * Math.PI) / 3;
      if (x === 0 || x === 1) return x;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
    default:
      return x;
  }
}

export const EASING_OPTIONS: { id: Easing; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "quadIn", label: "Quadratic In" },
  { id: "quadOut", label: "Quadratic Out" },
  { id: "quadInOut", label: "Quadratic InOut" },
  { id: "cubicIn", label: "Cubic In" },
  { id: "cubicOut", label: "Cubic Out" },
  { id: "cubicInOut", label: "Cubic InOut" },
  { id: "sineIn", label: "Sinusoidal In" },
  { id: "sineOut", label: "Sinusoidal Out" },
  { id: "sineInOut", label: "Sinusoidal InOut" },
  { id: "expoIn", label: "Exponential In" },
  { id: "expoOut", label: "Exponential Out" },
  { id: "expoInOut", label: "Exponential InOut" },
  { id: "backOut", label: "Back Out" },
  { id: "bounceOut", label: "Bounce Out" },
  { id: "elasticOut", label: "Elastic Out" },
];
