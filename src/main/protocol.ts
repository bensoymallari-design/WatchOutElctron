import { protocol, net } from "electron";
import { pathToFileURL } from "node:url";

export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "watchout",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true,
        allowServiceWorkers: false,
      },
    },
  ]);
}

export function handleMediaProtocol() {
  protocol.handle("watchout", (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get("path") || decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (!filePath) return new Response("missing media", { status: 400 });
      return net.fetch(pathToFileURL(filePath).href);
    } catch {
      return new Response("bad media url", { status: 400 });
    }
  });
}
