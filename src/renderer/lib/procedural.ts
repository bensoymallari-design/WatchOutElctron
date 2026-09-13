export function drawProcedural(
  ctx: CanvasRenderingContext2D,
  kind: string,
  w: number,
  h: number,
  timeMs: number,
) {
  const t = timeMs / 1000;
  if (kind === "aurora") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    const a = (Math.sin(t * 0.35) + 1) / 2;
    g.addColorStop(0, `hsl(${190 + a * 40} 80% 45%)`);
    g.addColorStop(0.45, `hsl(${260 + a * 30} 70% 28%)`);
    g.addColorStop(1, `hsl(${330} 60% 16%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const x = ((t * 40 + i * 180) % (w + 200)) - 100;
      const band = ctx.createLinearGradient(x, 0, x + 240, h);
      band.addColorStop(0, "rgba(0,0,0,0)");
      band.addColorStop(0.5, `hsla(${170 + i * 18}, 90%, 60%, 0.18)`);
      band.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  if (kind === "ndi" || kind === "ndi-wait") {
    const waiting = kind === "ndi-wait";
    ctx.fillStyle = "#081018";
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2 + Math.sin(t) * 40;
    const cy = h / 2 + Math.cos(t * 0.8) * 20;
    const rg = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) * 0.55);
    rg.addColorStop(0, waiting ? "rgba(245,166,35,0.5)" : "rgba(74,222,128,0.55)");
    rg.addColorStop(1, "rgba(8,16,24,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = waiting ? "rgba(245,166,35,0.45)" : "rgba(74,222,128,0.45)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + i * 36 + (t * 30) % 36, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = waiting ? "#f5a623" : "#4ade80";
    ctx.font = `600 ${Math.max(18, w / 22)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(waiting ? "NDI  ·  WAITING" : "NDI  ·  PROGRAM", w / 2, h / 2 - 18);
    ctx.fillStyle = waiting ? "#fcd34d" : "#86efac";
    ctx.font = `${Math.max(11, w / 42)}px ui-sans-serif, system-ui`;
    ctx.fillText(
      waiting ? "OBS: camera or Color Source — not Display Capture of WatchJhon" : new Date().toISOString().slice(11, 23),
      w / 2,
      h / 2 + 22,
    );
    return;
  }

  if (kind === "noise") {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return;
  }

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);
}
