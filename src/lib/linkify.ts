// 安全地把網址變成連結（docs/architecture.md 第 9.1 節）。
// 使用者內容一律用文字節點放進畫面，只有 http/https 網址用程式建立 <a>，絕不使用 innerHTML。

// 只吃網址允許的 ASCII 字元，所以「網址，中文」的全形標點和中文不會被算進網址
const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/g;
// 網址結尾常黏著的標點，不算在網址裡
const TRAILING_PUNCTUATION = /[.,!?;:)\]}>。，、！？；：）」』】》]+$/u;

export function renderTextWithLinks(target: HTMLElement, text: string): void {
  target.replaceChildren();
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const url = raw.replace(TRAILING_PUNCTUATION, '');
    if (!isSafeHttpUrl(url)) continue;

    target.append(document.createTextNode(text.slice(last, start)));
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer nofollow';
    target.append(link);
    last = start + url.length;
  }
  target.append(document.createTextNode(text.slice(last)));
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
