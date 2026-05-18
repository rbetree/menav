export function makeJsonSafeForHtmlScript(jsonString: unknown): string {
  if (typeof jsonString !== 'string') {
    return '';
  }

  return jsonString.replace(new RegExp('</script', 'gi'), '<\/script');
}
