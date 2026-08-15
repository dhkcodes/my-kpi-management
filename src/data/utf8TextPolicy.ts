/**
 * Application UTF-8 policy: strings must contain only Unicode scalar values
 * and must not contain U+FFFD, which indicates a prior lossy decode.
 */
export const hasValidUtf8Content = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0xFFFD) return false;
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
      index += 1;
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      return false;
    }
  }
  return true;
};

export const assertValidUtf8Content = (values: readonly string[]): void => {
  if (values.some((value) => !hasValidUtf8Content(value))) {
    throw new Error("Content must be valid UTF-8 without replacement characters or unpaired surrogates.");
  }
};
