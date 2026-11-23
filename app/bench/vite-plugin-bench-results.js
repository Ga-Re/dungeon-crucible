// Renderer benchmark (T-105d): dev-server endpoint that receives the benchmark's report, prints it
// in the terminal and stores it as JSON in app/bench-results/ (git-ignored).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** @returns {import("vite").Plugin} */
export function benchResults() {
  const outDir = join(import.meta.dirname, "..", "bench-results");
  return {
    name: "bench-results",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__bench/results", (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end();
          return;
        }
        let body = "";
        request.on("data", (chunk) => (body += String(chunk)));
        request.on("end", () => {
          let pretty;
          try {
            pretty = JSON.stringify(JSON.parse(body), null, 2);
          } catch {
            response.statusCode = 400;
            response.end("invalid JSON");
            return;
          }
          mkdirSync(outDir, { recursive: true });
          const file = join(
            outDir,
            `${new Date().toISOString().replaceAll(":", "-")}.json`,
          );
          writeFileSync(file, pretty + "\n");
          console.log(
            `\n===== BENCH RESULTS (copy everything up to END) =====\n${pretty}\n===== END (saved to ${file}) =====\n`,
          );
          response.end("ok");
        });
      });
    },
  };
}
