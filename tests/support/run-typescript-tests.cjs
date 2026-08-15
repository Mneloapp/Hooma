const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "../..");
const testFiles = process.argv.slice(2).map((file) => path.resolve(projectRoot, file));

if (testFiles.length === 0) {
  throw new Error("TEST_FILE_REQUIRED");
}
for (const testFile of testFiles) {
  if (
    !testFile.startsWith(`${projectRoot}${path.sep}`)
    || !testFile.endsWith(".test.ts")
    || !fs.statSync(testFile).isFile()
  ) {
    throw new Error("INVALID_TEST_FILE");
  }
}

const serverOnlyTestStub = require.resolve("next/dist/build/jest/__mocks__/empty.js");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTestDependency(request, parent, isMain, options) {
  if (request === "server-only") return serverOnlyTestStub;
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScriptForTest(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

for (const testFile of testFiles) require(testFile);
