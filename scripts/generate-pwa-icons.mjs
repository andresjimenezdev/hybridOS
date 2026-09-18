import sharp from "sharp";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../public/icon.svg", import.meta.url));
const outputs = [
  [180, "apple-touch-icon.png"],
  [192, "icon-192.png"],
  [512, "icon-512.png"],
];

await Promise.all(outputs.map(([size, name]) =>
  sharp(source).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url))),
));
