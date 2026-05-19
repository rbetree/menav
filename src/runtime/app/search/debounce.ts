function debounce(fn: (value: string) => void, delay: number): (value: string) => void {
  let timer: number | null = null;
  return (value: string) => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => {
      fn(value);
      timer = null;
    }, delay);
  };
}

module.exports = debounce;

