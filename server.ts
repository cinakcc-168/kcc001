import express from "express";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Raw body parser for API requests to pass through to Netlify functions cleanly
app.use(
  express.raw({
    type: "*/*",
    limit: "50mb",
  })
);

// Map of route aliases to netlify function filename
const functionRouteMap: Record<string, string> = {
  "/api/public-config": "public-config.mjs",
  "/api/cloudinary-signature": "cloudinary-signature.mjs",
  "/api/cloudinary-delete": "cloudinary-delete.mjs",
  "/api/staff-admin": "staff-admin.mjs",
  "/api/shop-settings": "shop-settings.mjs",
  "/api/shop-logo": "shop-logo.mjs",
  "/api/backup-admin": "backup-admin.mjs",
  "/api/telegram-admin": "telegram-admin.mjs",
  "/api/telegram-webhook": "telegram-webhook.mjs",
  "/api/telegram-session": "telegram-session.mjs",
  "/api/telegram-event": "telegram-event.mjs",
  "/api/staff-file-signature": "staff-file-signature.mjs",
  "/api/system-health": "system-health.mjs",
  "/api/customer-campaigns": "customer-campaign-admin.mjs",
  "/api/integration-admin": "integration-admin.mjs",
  "/api/online-store-media": "online-store-media.mjs",
  "/api/storefront-public": "storefront-public.mjs",
};

async function executeNetlifyFunction(
  functionName: string,
  req: express.Request,
  res: express.Response
) {
  const cleanName = functionName.replace(/\.mjs$/, "");
  const functionFile = path.resolve(process.cwd(), "netlify", "functions", `${cleanName}.mjs`);

  if (!fs.existsSync(functionFile)) {
    res.status(404).json({ ok: false, error: `Function ${cleanName} not found` });
    return;
  }

  try {
    const fileUrl = pathToFileURL(functionFile).href;
    const mod = await import(fileUrl);
    const handler = mod.default || mod.handler;

    if (typeof handler !== "function") {
      res.status(500).json({ ok: false, error: `Handler in ${cleanName} is not a function` });
      return;
    }

    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:3000";
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, String(value));
        }
      }
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        init.body = req.body;
        // Node 18+ fetch Request body with stream / duplex
        (init as any).duplex = "half";
      }
    }

    const webRequest = new Request(fullUrl, init);
    const webResponse: Response = await handler(webRequest, {});

    res.status(webResponse.status);
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const arrayBuffer = await webResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error(`Error executing function ${cleanName}:`, error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || "Function execution error",
    });
  }
}

// 1. Specific API route redirects & Netlify function routes
for (const [routePath, functionFile] of Object.entries(functionRouteMap)) {
  app.all(routePath, (req, res) => {
    executeNetlifyFunction(functionFile, req, res);
  });
}

// 2. Integration API v1
app.use("/api/v1", (req, res) => {
  executeNetlifyFunction("integration-api.mjs", req, res);
});

// 3. Direct /.netlify/functions/:name routes
app.use("/.netlify/functions/:name", (req, res) => {
  const name = req.params.name;
  executeNetlifyFunction(name, req, res);
});

// 4. Fallback for any other /api/:name
app.use("/api/:name", (req, res) => {
  const name = req.params.name;
  executeNetlifyFunction(name, req, res);
});

// Start Server with Vite Middleware or Static Serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Tiny POS server running on http://0.0.0.0:${PORT}`);
  });
}

start();
