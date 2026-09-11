export interface NdiAdvert {
  name: string;
  host: string;
  port: number;
  ip?: string;
}

export function tidyNdiName(name: string) {
  let n = name
    .replace(/\._ndi\._tcp\.local$/i, "")
    .replace(/\.local$/i, "")
    .replace(/\0/g, "")
    .trim();

  for (let i = 0; i < 4; i++) {
    const extra = n.match(/^(.*\))(\([^)]+\))$/);
    if (extra && extra[1].toLowerCase().includes(extra[2].slice(1, -1).toLowerCase())) {
      n = extra[1];
      continue;
    }
    // Truncated duplicate from an mDNS label jump: "LOCALHOST (Qubit Jhon NDI)ubit Jhon NDI)"
    const broken = n.match(/^(.*\(([^)]+)\))([^()]*\))$/);
    if (broken) {
      const inside = broken[2].toLowerCase();
      const tail = broken[3].replace(/\)+$/, "").toLowerCase();
      if (tail.length >= 4 && (inside.includes(tail) || inside.slice(1).startsWith(tail) || tail.includes(inside.slice(1)))) {
        n = broken[1];
        continue;
      }
    }
    break;
  }
  return n.trim();
}

/** NDI instance names are often `HOSTNAME (Source name)`. */
export function friendlyNdiName(name: string) {
  const n = tidyNdiName(name);
  const matches = [...n.matchAll(/\(([^)]+)\)/g)];
  const last = matches.at(-1)?.[1]?.trim();
  return last || n;
}

export function preferName(a: string, b: string) {
  const ta = tidyNdiName(a);
  const tb = tidyNdiName(b);
  if (ta === tb) return ta;
  if (ta.startsWith(tb) && ta.length > tb.length) return tb;
  if (tb.startsWith(ta) && tb.length > ta.length) return ta;
  const balanced = (s: string) => (s.match(/\(/g)?.length ?? 0) === (s.match(/\)/g)?.length ?? 0);
  if (balanced(ta) !== balanced(tb)) return balanced(ta) ? ta : tb;
  return ta.length >= tb.length ? ta : tb;
}

function namesRelated(a: string, b: string) {
  const na = tidyNdiName(a).toLowerCase();
  const nb = tidyNdiName(b).toLowerCase();
  if (na === nb) return true;
  const fa = friendlyNdiName(a).toLowerCase();
  const fb = friendlyNdiName(b).toLowerCase();
  if (fa && fb && fa === fb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 8 && longer.startsWith(shorter);
}

function relatedSource(a: NdiAdvert, b: NdiAdvert) {
  if (namesRelated(a.name, b.name)) {
    if (a.ip && b.ip && a.ip !== b.ip) return false;
    return true;
  }
  if (a.host && b.host && a.port && a.port === b.port && a.host.toLowerCase() === b.host.toLowerCase()) return true;
  return false;
}

export function collapseSources(sources: NdiAdvert[]): NdiAdvert[] {
  const cleaned = sources
    .map((s) => ({ ...s, name: tidyNdiName(s.name) }))
    .filter((s) => s.name.length > 2 && !s.name.startsWith("_"));
  const merged: NdiAdvert[] = [];
  for (const s of cleaned) {
    const idx = merged.findIndex((m) => relatedSource(m, s));
    if (idx < 0) {
      merged.push(s);
      continue;
    }
    const prev = merged[idx];
    merged[idx] = {
      ...prev,
      ...s,
      name: preferName(prev.name, s.name),
      port: s.port || prev.port,
      host: s.host || prev.host,
      ip: s.ip || prev.ip,
    };
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}
