export function makeJsonSafeForHtmlScript(jsonString: unknown): string {
  if (typeof jsonString !== 'string') {
    return '';
  }

  // 保留原始大小写：`<\/script` 是合法 JSON 转义，浏览器不会把它当作结束标签
  return jsonString.replace(/<\/script/gi, (match) => `<\\/${match.slice(2)}`);
}
