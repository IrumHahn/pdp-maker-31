const fs = require("node:fs");
const path = require("node:path");
const source = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const destination = path.resolve(__dirname, "../public/pdf.worker.min.mjs");
const worker = fs.readFileSync(source);
if (!fs.existsSync(destination) || !worker.equals(fs.readFileSync(destination))) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, worker);
}
console.log(`PDF worker ready (${require("pdfjs-dist/package.json").version})`);

// JPEG2000/JBIG2 images require the matching PDF.js decoders.
const wasmSource = path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "wasm");
fs.cpSync(wasmSource, path.resolve(__dirname, "../public/pdfjs/wasm"), { recursive: true });
