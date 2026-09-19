/** Shared by the form and investigation tools. Extraction never opens a URL. */
export const MAX_INVESTIGATION_URLS = 5;

export function extractMessageUrls(text: string): string[] {
  const matches = (text.match(/https?:\/\/[^\s<>"']+/gi) ?? []).flatMap((match) =>
    match.split(/[,，;；](?=https?:\/\/)/i),
  );
  return [
    ...new Set(
      matches.map((match) => {
        let url = match.replace(/[.,;!?]+$/, '');
        // Keep balanced path parentheses, but drop punctuation surrounding a link.
        for (const [open, close] of [
          ['(', ')'],
          ['[', ']'],
          ['{', '}'],
        ] as const) {
          while (url.endsWith(close) && url.split(close).length > url.split(open).length)
            url = url.slice(0, -1);
        }
        return url.replace(/[.,;!?]+$/, '');
      }),
    ),
  ];
}
