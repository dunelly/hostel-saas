import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export default function setup() {
  const source = resolve(process.cwd(), "local.db");
  const target = resolve(process.cwd(), "local.test.db");
  if (existsSync(source)) {
    copyFileSync(source, target);
  }
}
