export function formatCzechText(text: string) {
  return text
    .replace(/(?<![\p{L}\p{N}])([ksvzouia]|do|na|po|od|za|ve|ze|ke|ku|se|až|že|či|ať|ba|ni|než)[ \t]+(?=\S)/giu, '$1\u00a0')
    .replace(/[ \t]+[-–—][ \t]+/g, '\u00a0– ')
    .replace(/(?<!\p{L})(např|tj|tzv|č|str|obr|ing|mgr|dr|prof|atd|apod)\.[ \t]+/giu, '$1.\u00a0')
}
