import WebSocket from "ws";
import { writeFile } from "node:fs/promises";

const targets = await fetch("http://127.0.0.1:9223/json").then((response) => response.json());
const pageTarget = targets.find((target) => target.type === "page" && target.url.startsWith("http://127.0.0.1:3000"));

if (!pageTarget) throw new Error("ClipFactory page target was not found");

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let commandId = 0;
const pending = new Map();
let browserErrors = [];

socket.on("message", (raw) => {
  const message = JSON.parse(String(raw));
  if (message.id) {
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      if (message.error) resolver.reject(new Error(message.error.message));
      else resolver.resolve(message.result);
    }
    return;
  }

  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(
      message.params.exceptionDetails.exception?.description ??
        message.params.exceptionDetails.text,
    );
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    browserErrors.push(message.params.entry.text);
  }
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function activateElement(expression) {
  const location = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const element = ${expression};
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return {
        x,
        y,
        html: element.outerHTML,
        hit: document.elementFromPoint(x, y)?.outerHTML ?? null
      };
    })()`,
  });
  if (!location.result.value) return null;
  const { x, y } = location.result.value;
  await send("Page.bringToFront");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  return location.result.value;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

const cases = [
  { name: "home-mobile", width: 390, height: 844, url: "http://127.0.0.1:3000/" },
  { name: "dashboard-desktop", width: 1440, height: 1100, url: "http://127.0.0.1:3000/app/dashboard" },
  { name: "project-desktop", width: 1440, height: 1100, url: "http://127.0.0.1:3000/app/projects/demo-podcast-launch" },
  { name: "clip-mobile", width: 390, height: 844, url: "http://127.0.0.1:3000/app/projects/demo-podcast-launch/clips/demo-founder-lesson" },
];

const results = [];

for (const testCase of cases) {
  browserErrors = [];
  await send("Emulation.setDeviceMetricsOverride", {
    width: testCase.width,
    height: testCase.height,
    deviceScaleFactor: 1,
    mobile: testCase.width < 600,
  });
  await send("Page.navigate", { url: testCase.url });
  await new Promise((resolve) => setTimeout(resolve, 1800));

  const evaluation = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `JSON.stringify({
      title: document.title,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyTextLength: document.body.innerText.trim().length,
      overlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
      wideElements: [...document.querySelectorAll('body *')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName.toLowerCase(), className: String(element.className).slice(0, 180), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
        })
        .filter((item) => item.left < -1 || item.right > window.innerWidth + 1)
        .slice(0, 12)
    })`,
  });

  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(
    `/Users/ibi/ClipFactory/work/cdp-${testCase.name}.png`,
    Buffer.from(screenshot.data, "base64"),
  );

  let interaction = null;
  if (testCase.name === "home-mobile") {
    const trigger = await activateElement(`document.querySelector('[aria-label="Open navigation"]')`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const menuCheck = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `JSON.stringify({
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        contentMounted: Boolean(document.querySelector('[data-slot="sheet-content"]')),
        triggerExpanded: document.querySelector('[aria-label="Open navigation"]')?.getAttribute('aria-expanded') ?? null,
        contentText: document.querySelector('[data-slot="sheet-content"]')?.innerText ?? null
      })`,
    });
    const themeCheck = await send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const before = document.documentElement.className;
        const toggles = [...document.querySelectorAll('[aria-label="Toggle colour theme"]')];
        const toggle = toggles.find((element) => element.getBoundingClientRect().width > 0);
        const labelBefore = toggle?.getAttribute('aria-label') ?? null;
        toggle?.click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { before, after: document.documentElement.className, labelBefore, labels: toggles.map((element) => element.getAttribute('aria-label')) };
      })()`,
    });
    interaction = {
      name: "mobile navigation",
      ...JSON.parse(menuCheck.result.value),
      trigger,
      themeCheck: themeCheck.result.value,
    };
  }

  if (testCase.name === "dashboard-desktop") {
    const trigger = await activateElement(
      `[...document.querySelectorAll('button')].find((button) => button.innerText.includes('New project'))`,
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
    const dialogCheck = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `JSON.stringify({
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        contentMounted: Boolean(document.querySelector('[data-slot="dialog-content"]')),
        contentText: document.querySelector('[data-slot="dialog-content"]')?.innerText ?? null
      })`,
    });
    interaction = {
      name: "new project dialog",
      ...JSON.parse(dialogCheck.result.value),
      trigger,
    };
  }

  results.push({
    name: testCase.name,
    ...JSON.parse(evaluation.result.value),
    browserErrors: [...new Set(browserErrors)],
    interaction,
  });
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
socket.close();
