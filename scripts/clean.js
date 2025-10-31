const fs = require("fs");
const path = require("path");

const distPath = path.resolve(__dirname, "..", "dist");

try {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log(`Removed ${distPath}`);
} catch (error) {
  console.error(`Failed to remove ${distPath}`);
  console.error(error);
  process.exitCode = 1;
}
