const { execSync } = require("child_process");

console.log("🚀 Building EXE...");

execSync(
    `pkg . --targets node18-win-x64 --output print-service.exe`,
    { stdio: "inherit" }
);

console.log("✔ Build exe completed!");
