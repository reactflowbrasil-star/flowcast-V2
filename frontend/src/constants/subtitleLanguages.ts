/**
 * Subtitle language label utilities.
 *
 * The UI must stay in English, so labels are generated with English display names.
 */
const ISO3_TO_ISO1: Record<string, string> = {
  afr: 'af',
  alb: 'sq',
  amh: 'am',
  ara: 'ar',
  arm: 'hy',
  aze: 'az',
  baq: 'eu',
  bel: 'be',
  ben: 'bn',
  bos: 'bs',
  bul: 'bg',
  bur: 'my',
  cat: 'ca',
  ces: 'cs',
  chi: 'zh',
  cze: 'cs',
  dan: 'da',
  deu: 'de',
  dut: 'nl',
  ell: 'el',
  eng: 'en',
  est: 'et',
  eus: 'eu',
  fas: 'fa',
  fin: 'fi',
  fra: 'fr',
  fre: 'fr',
  geo: 'ka',
  ger: 'de',
  glg: 'gl',
  gre: 'el',
  guj: 'gu',
  heb: 'he',
  hin: 'hi',
  hrv: 'hr',
  hun: 'hu',
  hye: 'hy',
  ice: 'is',
  ind: 'id',
  isl: 'is',
  ita: 'it',
  jpn: 'ja',
  kan: 'kn',
  kat: 'ka',
  kaz: 'kk',
  khm: 'km',
  kor: 'ko',
  lao: 'lo',
  lav: 'lv',
  lit: 'lt',
  mac: 'mk',
  mal: 'ml',
  mar: 'mr',
  may: 'ms',
  mkd: 'mk',
  mon: 'mn',
  msa: 'ms',
  mya: 'my',
  nep: 'ne',
  nld: 'nl',
  nor: 'no',
  pan: 'pa',
  per: 'fa',
  pol: 'pl',
  por: 'pt',
  ron: 'ro',
  rum: 'ro',
  rus: 'ru',
  sin: 'si',
  slk: 'sk',
  slo: 'sk',
  slv: 'sl',
  som: 'so',
  spa: 'es',
  sqi: 'sq',
  srp: 'sr',
  swe: 'sv',
  tam: 'ta',
  tel: 'te',
  tha: 'th',
  tur: 'tr',
  ukr: 'uk',
  urd: 'ur',
  uzb: 'uz',
  vie: 'vi',
  yid: 'yi',
  zho: 'zh'
};

const SPECIAL_LANGUAGE_NAMES: Record<string, string> = {
  und: 'Unknown',
  unknown: 'Unknown',
  zxx: 'No linguistic content'
};

const LANGUAGE_NAME_ALIASES: Record<string, string> = {
  espanol: 'Spanish',
  spanish: 'Spanish',
  portugues: 'Portuguese',
  portuguese: 'Portuguese',
  francais: 'French',
  french: 'French',
  deutsch: 'German',
  german: 'German',
  italiano: 'Italian',
  italian: 'Italian',
  english: 'English'
};

const hasIntlDisplayNames = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function';
const languageDisplayNames = hasIntlDisplayNames ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;

function normalizeAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeLanguageCode(code: string): string {
  const normalized = code.toLowerCase().trim().replace(/_/g, '-');
  if (!normalized) return normalized;

  const [languagePart, ...rest] = normalized.split('-');
  const iso1Language = ISO3_TO_ISO1[languagePart] ?? languagePart;

  return [iso1Language, ...rest].join('-');
}

/**
 * Backward-compatible map for explicit overrides.
 */
export const SUBTITLE_LANGUAGE_NAMES: Record<string, string> = {
  ...SPECIAL_LANGUAGE_NAMES,
  'en-us': 'English (US)',
  'en-gb': 'English (UK)',
  'en-ca': 'English (Canada)',
  'en-au': 'English (Australia)',
  'es-419': 'Spanish (Latin America)',
  'pt-br': 'Portuguese (Brazil)',
  'pt-pt': 'Portuguese (Portugal)'
};

/**
 * Get the subtitle language name in English from a language code or label.
 */
export function getSubtitleLanguageName(code: string): string {
  if (!code) return 'Unknown';

  const normalizedCode = normalizeLanguageCode(code);

  if (SUBTITLE_LANGUAGE_NAMES[normalizedCode]) {
    return SUBTITLE_LANGUAGE_NAMES[normalizedCode];
  }

  if (languageDisplayNames) {
    const displayName = languageDisplayNames.of(normalizedCode);
    if (displayName && displayName.toLowerCase() !== normalizedCode) {
      return displayName;
    }
  }

  const alias = LANGUAGE_NAME_ALIASES[normalizeAscii(code)];
  if (alias) {
    return alias;
  }

  if (normalizedCode.length > 3) {
    return code;
  }

  return normalizedCode.toUpperCase();
}
