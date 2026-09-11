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
      },
    },
  ]);
}

export function handleMediaProtocol() {
  protocol.handle("watchout", (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get("path");
    if (!filePath) return new Response("missing media", { status: 400 });
    return net.fetch(pathToFileURL(filePath).href);
  });
}
