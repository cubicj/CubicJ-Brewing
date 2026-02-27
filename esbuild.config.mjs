import esbuild from "esbuild";
import process from "process";
import builtins from "module";
import { copyFileSync, mkdirSync } from "fs";

const prod = process.argv[2] === "production";
const VAULT_PLUGIN_DIR = "<VAULT_PLUGIN_DIR>";

const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });
      copyFileSync("main.js", `${VAULT_PLUGIN_DIR}/main.js`);
      copyFileSync("manifest.json", `${VAULT_PLUGIN_DIR}/manifest.json`);
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    "@stoprocent/noble",
    ...builtins.builtinModules,
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  plugins: [copyToVault],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
