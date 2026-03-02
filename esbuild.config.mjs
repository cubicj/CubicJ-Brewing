import esbuild from "esbuild";
import process from "process";
import builtins from "module";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const prod = process.argv[2] === "production";
const VAULT_PLUGIN_DIR = process.env.VAULT_PLUGIN_DIR || "<VAULT_PLUGIN_DIR>";

const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });
      copyFileSync("main.js", `${VAULT_PLUGIN_DIR}/main.js`);
      copyFileSync("manifest.json", `${VAULT_PLUGIN_DIR}/manifest.json`);
      const css = readFileSync("fonts.css", "utf8") + readFileSync("styles.css", "utf8");
      writeFileSync(`${VAULT_PLUGIN_DIR}/styles.css`, css);
      for (const f of ["MatrixSansScreen-Regular.woff2", "MatrixSansPrint-Regular.woff2"]) {
        copyFileSync(`fonts/${f}`, `${VAULT_PLUGIN_DIR}/${f}`);
      }
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
