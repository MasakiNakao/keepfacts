import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const indexPath = path.join(root, "index.html");
const imagePath = path.join(root, "public", "keepfacts-share.jpg");
const legacyImagePath = path.join(root, "public", "keepfacts-share-v031.jpg");
const faviconPath = path.join(root, "public", "favicon.svg");
const canonicalUrl = "https://masakinakao.github.io/keepfacts/";
const imageUrl = `${canonicalUrl}keepfacts-share.jpg`;
const faviconUrl = `${canonicalUrl}favicon.svg`;
const socialTitle = "KeepFacts — AI 改写后，30 秒核对硬事实";
const socialDescription =
  "本地核对 AI 改写、摘要与翻译中被改变、遗漏或新增的日期、数字、金额和必保内容。无需登录，文本不会上传。";

interface Tag {
  name: string;
  attributes: Record<string, string>;
}

function parseTags(html: string): Tag[] {
  return [...html.matchAll(/<(meta|link)\b[^>]*>/giu)].map((match) => {
    const attributes: Record<string, string> = {};
    for (const attribute of match[0].matchAll(
      /([\w:-]+)\s*=\s*(["'])(.*?)\2/gsu,
    )) {
      attributes[attribute[1].toLowerCase()] = attribute[3];
    }
    return { name: match[1].toLowerCase(), attributes };
  });
}

const html = readFileSync(indexPath, "utf8");
const tags = parseTags(html);

function metaContent(key: "name" | "property", value: string) {
  const matches = tags.filter(
    (tag) => tag.name === "meta" && tag.attributes[key] === value,
  );
  assert.equal(matches.length, 1, `expected one ${key}=${value} meta tag`);
  return matches[0].attributes.content;
}

function linkHref(rel: string) {
  const matches = tags.filter(
    (tag) => tag.name === "link" && tag.attributes.rel === rel,
  );
  assert.equal(matches.length, 1, `expected one rel=${rel} link tag`);
  return matches[0].attributes.href;
}

function jpegDimensions(buffer: Buffer) {
  assert.equal(buffer[0], 0xff, "JPEG must start with 0xffd8");
  assert.equal(buffer[1], 0xd8, "JPEG must start with 0xffd8");

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    assert.ok(offset + 2 <= buffer.length, "truncated JPEG segment");
    const segmentLength = buffer.readUInt16BE(offset);
    assert.ok(segmentLength >= 2, "invalid JPEG segment length");

    if (startOfFrameMarkers.has(marker)) {
      assert.ok(offset + 7 <= buffer.length, "truncated JPEG frame header");
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }

  assert.fail("JPEG start-of-frame marker not found");
}

test("publishes complete canonical and social metadata", () => {
  assert.match(html, /<html\s+lang="zh-CN">/u);
  assert.equal(linkHref("canonical"), canonicalUrl);
  assert.equal(new URL(linkHref("canonical")).search, "");
  assert.equal(linkHref("icon"), faviconUrl);
  assert.equal(statSync(faviconPath).isFile(), true);

  assert.equal(metaContent("property", "og:type"), "website");
  assert.equal(metaContent("property", "og:site_name"), "KeepFacts");
  assert.equal(metaContent("property", "og:title"), socialTitle);
  assert.equal(metaContent("property", "og:description"), socialDescription);
  assert.equal(metaContent("property", "og:url"), canonicalUrl);
  assert.equal(metaContent("property", "og:image"), imageUrl);
  assert.equal(metaContent("property", "og:image:secure_url"), imageUrl);
  assert.equal(metaContent("property", "og:image:type"), "image/jpeg");
  assert.equal(metaContent("property", "og:image:width"), "1200");
  assert.equal(metaContent("property", "og:image:height"), "630");
  assert.ok(metaContent("property", "og:image:alt").length > 0);
  assert.equal(metaContent("property", "og:locale"), "zh_CN");
  assert.equal(metaContent("property", "og:locale:alternate"), "en_US");

  assert.equal(metaContent("name", "twitter:card"), "summary_large_image");
  assert.equal(metaContent("name", "twitter:title"), socialTitle);
  assert.equal(metaContent("name", "twitter:description"), socialDescription);
  assert.equal(metaContent("name", "twitter:url"), canonicalUrl);
  assert.equal(metaContent("name", "twitter:image"), imageUrl);
  assert.equal(
    metaContent("name", "twitter:image:alt"),
    metaContent("property", "og:image:alt"),
  );
  assert.equal(html.includes("twitter:site"), false);
  assert.equal(html.includes("twitter:creator"), false);
  assert.doesNotMatch(html, /keepfacts-share-v\d+/iu);
  assert.doesNotMatch(socialTitle, /\bv?\d+\.\d+\.\d+\b/iu);
});

test("ships a valid 1200 by 630 JPEG share image below five MiB", () => {
  const image = readFileSync(imagePath);
  assert.ok(image.byteLength > 0);
  assert.ok(image.byteLength < 5 * 1024 * 1024);
  assert.deepEqual(jpegDimensions(image), { width: 1200, height: 630 });
  assert.equal(statSync(legacyImagePath).isFile(), true);
});

test("keeps the share-card renderer self-contained and reproducible", () => {
  const renderer = readFileSync(
    path.join(root, "scripts", "render-share-card.mjs"),
    "utf8",
  );
  for (const text of [
    "KeepFacts",
    "硬事实核对",
    "AI 改写后",
    "30 秒",
    "9月15日",
    "9月18日",
    "100人",
    "80人",
    "发布链接",
    "缺失",
    "本地处理",
    "无需登录",
    "不上传",
  ]) {
    assert.ok(renderer.includes(text), `renderer must contain ${text}`);
  }
  assert.doesNotMatch(renderer, /\bv?\d+\.\d+\.\d+\b/iu);
  assert.equal(renderer.includes("keepfacts-share-v031.jpg"), false);
  assert.match(renderer, /viewport:\s*\{\s*width:\s*1200,\s*height:\s*630\s*\}/u);
  assert.equal(/https?:\/\//u.test(renderer), false);
});
