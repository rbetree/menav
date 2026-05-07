function escapeHtml(unsafe: unknown): string {
  if (unsafe === undefined || unsafe === null) {
    return '';
  }

  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  escapeHtml,
};
