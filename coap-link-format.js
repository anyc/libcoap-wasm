// Parse RFC 6690 CoRE Link Format without splitting inside quoted values.
function splitOutsideQuotes(input, separator) {
  const parts = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  let inUri = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (escaped) {
      escaped = false;
    } else if (quoted && char === '\\') {
      escaped = true;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === '<') {
      inUri = true;
    } else if (!quoted && char === '>') {
      inUri = false;
    } else if (!quoted && !inUri && char === separator) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quoted || inUri) throw new SyntaxError('Incomplete CoRE Link Format');
  parts.push(input.slice(start).trim());
  return parts;
}

export function parseLinkFormat(input) {
  if (!input.trim()) return [];

  return splitOutsideQuotes(input, ',').map(link => {
    const match = /^<([^>]*)>(.*)$/.exec(link);
    if (!match) throw new SyntaxError(`Invalid CoRE link: ${link}`);

    const attributes = [];
    const suffix = match[2].trim();
    if (suffix) {
      if (!suffix.startsWith(';')) {
        throw new SyntaxError(`Invalid CoRE link attributes: ${link}`);
      }
      for (const part of splitOutsideQuotes(suffix.slice(1), ';')) {
        const equals = part.indexOf('=');
        const name = (equals < 0 ? part : part.slice(0, equals)).trim();
        if (!name) throw new SyntaxError(`Invalid CoRE link attribute: ${link}`);
        let value = equals < 0 ? true : part.slice(equals + 1).trim();
        if (typeof value === 'string' && value.startsWith('"')) {
          if (!value.endsWith('"') || value.length < 2) {
            throw new SyntaxError(`Invalid quoted CoRE attribute: ${link}`);
          }
          value = value.slice(1, -1).replace(/\\(.)/g, '$1');
        }
        attributes.push({name, value});
      }
    }
    return {href: match[1], attributes};
  });
}
