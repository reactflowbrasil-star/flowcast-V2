/* eslint-disable @typescript-eslint/no-unused-vars */
import i18n, { type i18n as I18nType } from 'i18next';
import { APP_NAME } from '@/constants/app';
import en from '../locales/en.json';
import es from '../locales/es.json';
import zh from '../locales/zh.json';
import pt from '../locales/pt.json';
import fr from '../locales/fr.json';
import ru from '../locales/ru.json';
import tr from '../locales/tr.json';
import sk from '../locales/sk.json';
// user namespace stays bundled for now
import userEn from '../locales/user/en.json';
import userEs from '../locales/user/es.json';
import userZh from '../locales/user/zh.json';
import userPt from '../locales/user/pt.json';
import userFr from '../locales/user/fr.json';
import userRu from '../locales/user/ru.json';
import userTr from '../locales/user/tr.json';
import userSk from '../locales/user/sk.json';
// extension packs (kept bundled)
import extAdmin from '../locales/ext/admin.ext.json';

/**
 * Expand keys that contain dots into nested objects.
 * Example: { "deviceManagement.title": "Title" } => { deviceManagement: { title: "Title" } }
 * This handles cases where locale JSONs contain flattened keys with dots.
 */
function expandDotKeys(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let cursor = out;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (typeof cursor[p] !== 'object' || cursor[p] === null) {
          cursor[p] = {};
        }
        cursor = cursor[p];
      }
      const last = parts[parts.length - 1];
      cursor[last] = (value !== null && typeof value === 'object') ? expandDotKeys(value) : value;
    } else {
      out[key] = (value !== null && typeof value === 'object') ? expandDotKeys(value) : value;
    }
  }

  return out;
}

/**
 * Deep-merge two objects. Properties from `source` are merged into `target`
 * recursively so nested objects are combined instead of replaced.
 */
function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const out = { ...target };
  for (const [key, val] of Object.entries(source)) {
    if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      out[key] !== null &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Build core resources (keep runtime bundle small by excluding large feature namespaces).
 * We'll register feature namespaces (like 'admin') dynamically using loadNamespace.
 */
const expandedEn = expandDotKeys(en as unknown as Record<string, any>);
const expandedEs = expandDotKeys(es as unknown as Record<string, any>);
const expandedZh = expandDotKeys(zh as unknown as Record<string, any>);
const expandedPt = expandDotKeys(pt as unknown as Record<string, any>);
const expandedFr = expandDotKeys(fr as unknown as Record<string, any>);
const expandedRu = expandDotKeys(ru as unknown as Record<string, any>);
const expandedTr = expandDotKeys(tr as unknown as Record<string, any>);
const expandedSk = expandDotKeys(sk as unknown as Record<string, any>);

const expandedUserEn = expandDotKeys(userEn as unknown as Record<string, any>);
const expandedUserEs = expandDotKeys(userEs as unknown as Record<string, any>);
const expandedUserZh = expandDotKeys(userZh as unknown as Record<string, any>);
const expandedUserPt = expandDotKeys(userPt as unknown as Record<string, any>);
const expandedUserFr = expandDotKeys(userFr as unknown as Record<string, any>);
const expandedUserRu = expandDotKeys(userRu as unknown as Record<string, any>);
const expandedUserTr = expandDotKeys(userTr as unknown as Record<string, any>);
const expandedUserSk = expandDotKeys(userSk as unknown as Record<string, any>);

// Expand extension packs (optional modular additions)
const ext = (extAdmin as unknown as Record<string, any>) || {};
const expandedExtEn = expandDotKeys((ext.en ?? {}) as Record<string, any>);
const expandedExtEs = expandDotKeys((ext.es ?? {}) as Record<string, any>);
const expandedExtZh = expandDotKeys((ext.zh ?? {}) as Record<string, any>);
const expandedExtPt = expandDotKeys((ext.pt ?? {}) as Record<string, any>);
const expandedExtFr = expandDotKeys((ext.fr ?? {}) as Record<string, any>);
const expandedExtRu = expandDotKeys((ext.ru ?? {}) as Record<string, any>);
const expandedExtTr = expandDotKeys((ext.tr ?? {}) as Record<string, any>);
const expandedExtSk = expandDotKeys((ext.sk ?? {}) as Record<string, any>);

/**
 * Core resources — intentionally small. Feature namespaces such as "admin"
 * will be loaded dynamically when a component requests them.
 */
/**
 * Merge the user-specific locale bundle with the user keys from the main locale.
 * User-specific bundle takes priority (overrides main), but keys only present in
 * the main locale are preserved. This prevents missing translations for keys like
 * user.kids.*, user.anime.*, user.events.*, user.filters.allTypes, etc.
 */
function mergeUserBundle(
  mainLocale: Record<string, any>,
  userBundle: Record<string, any>,
): Record<string, any> {
  const mainUser = mainLocale.user ?? {};
  const userUser = userBundle.user ?? userBundle;
  // userUser takes priority so its values override main where both exist
  return deepMerge(mainUser, userUser);
}

const resources = {
  en: {
    translation: {
      ...deepMerge(expandedEn, expandedExtEn),
      user: mergeUserBundle(expandedEn, expandedUserEn)
    },
    user: expandedUserEn,
    // Convenience namespaces for code that calls useTranslation('admin'|'reseller'|'common').
    admin: deepMerge(expandedEn.admin ?? {}, expandedExtEn.admin ?? {}),
    reseller: expandedEn.reseller ?? {},
    common: expandedEn.common ?? {}
  },
  es: {
    translation: {
      ...deepMerge(expandedEs, expandedExtEs),
      user: mergeUserBundle(expandedEs, expandedUserEs)
    },
    user: expandedUserEs,
    admin: deepMerge(expandedEs.admin ?? {}, expandedExtEs.admin ?? {}),
    reseller: expandedEs.reseller ?? {},
    common: expandedEs.common ?? {}
  },
  zh: {
    translation: {
      ...deepMerge(expandedZh, expandedExtZh),
      user: mergeUserBundle(expandedZh, expandedUserZh)
    },
    user: expandedUserZh,
    admin: deepMerge(expandedZh.admin ?? {}, expandedExtZh.admin ?? {}),
    reseller: expandedZh.reseller ?? {},
    common: expandedZh.common ?? {}
  },
  pt: {
    translation: {
      ...deepMerge(expandedPt, expandedExtPt),
      user: mergeUserBundle(expandedPt, expandedUserPt)
    },
    user: expandedUserPt,
    admin: deepMerge(expandedPt.admin ?? {}, expandedExtPt.admin ?? {}),
    reseller: expandedPt.reseller ?? {},
    common: expandedPt.common ?? {}
  },
  fr: {
    translation: {
      ...deepMerge(expandedFr, expandedExtFr),
      user: mergeUserBundle(expandedFr, expandedUserFr)
    },
    user: expandedUserFr,
    admin: deepMerge(expandedFr.admin ?? {}, expandedExtFr.admin ?? {}),
    reseller: expandedFr.reseller ?? {},
    common: expandedFr.common ?? {}
  },
  ru: {
    translation: {
      ...deepMerge(expandedRu, expandedExtRu),
      user: mergeUserBundle(expandedRu, expandedUserRu)
    },
    user: expandedUserRu,
    admin: deepMerge(expandedRu.admin ?? {}, expandedExtRu.admin ?? {}),
    reseller: expandedRu.reseller ?? {},
    common: expandedRu.common ?? {}
  },
  tr: {
    translation: {
      ...deepMerge(expandedTr, expandedExtTr),
      user: mergeUserBundle(expandedTr, expandedUserTr)
    },
    user: expandedUserTr,
    admin: deepMerge(expandedTr.admin ?? {}, expandedExtTr.admin ?? {}),
    reseller: expandedTr.reseller ?? {},
    common: expandedTr.common ?? {}
  },
  sk: {
    translation: {
      ...deepMerge(expandedSk, expandedExtSk),
      user: mergeUserBundle(expandedSk, expandedUserSk)
    },
    user: expandedUserSk,
    admin: deepMerge(expandedSk.admin ?? {}, expandedExtSk.admin ?? {}),
    reseller: expandedSk.reseller ?? {},
    common: expandedSk.common ?? {}
  }
};

/**
 * Simple cache to avoid re-loading the same namespace multiple times.
 */
const loadedNamespaces = new Set<string>();

const SUPPORTED_LANGS = ['en', 'es', 'zh', 'pt', 'fr', 'ru', 'tr', 'sk'] as const;

function normalizeLng(input: string | undefined | null): string {
  const code = (input ?? 'en').replace('_', '-');
  const base = code.split('-')[0];
  const supported = SUPPORTED_LANGS as readonly string[];
  if (supported.includes(code)) return code;
  if (supported.includes(base)) return base;
  return 'en';
}


/**
 * Dynamically load a namespace for a given language.
 * This uses ESM dynamic imports which will be tree-shaken by bundlers and
 * create separate chunks for each namespace+language pair.
 *
 * Usage:
 *   await loadNamespace('en', 'admin');
 */
/**
 * Map legacy dotted keys (admin.<page>.*) to their per-page namespaces (admin/<page>).
 * This is a TEMPORARY compatibility layer so existing components using dotted keys
 * keep working while we migrate them to useTranslation('admin/<page>') + t('...').
 */
function wrapTWithCompatibility() {
  if ((i18n as any).__compat_wrapped) return;
  const origT = i18n.t.bind(i18n);

  function ensureDynamicNamespacesLoaded(lng: string, key: unknown, opts?: any) {
    const namespaces = new Set<string>();

    if (typeof key === 'string') {
      const colonIdx = key.indexOf(':');
      if (colonIdx > 0) {
        const nsFromKey = key.slice(0, colonIdx);
        if (nsFromKey.includes('/')) namespaces.add(nsFromKey);
      }
    }

    const nsOpt = opts?.ns;
    if (typeof nsOpt === 'string') {
      if (nsOpt.includes('/')) namespaces.add(nsOpt);
    } else if (Array.isArray(nsOpt)) {
      for (const ns of nsOpt) {
        if (typeof ns === 'string' && ns.includes('/')) namespaces.add(ns);
      }
    }

    for (const ns of namespaces) {
      loadNamespace(lng, ns).catch(() => { });
    }
  }

  const PAGE_MAP: Record<string, string> = {
    // admin pages we split into per-page namespaces
    'admin.overview': 'admin/overview',
    'admin.activity': 'admin/activityDashboard',
    'admin.loginHistory': 'admin/loginHistory',
    'admin.securityAlerts': 'admin/securityAlerts',
    'admin.masterKeys': 'admin/masterKeys',
    'admin.demos': 'admin/demos',
    'admin.giftcodes': 'admin/giftcodes',
    'admin.billing': 'admin/billing',
    'admin.devices': 'admin/devices',
    'admin.content': 'admin/content',
    'admin.tickets': 'admin/tickets',
    'admin.activityLogs': 'admin/activityLogs',
    'admin.viewingHistory': 'admin/viewingHistory',
    'admin.systemConfiguration': 'admin/systemConfiguration',
    'admin.resellerManagement': 'admin/resellerManagement',
    'admin.endUserManagement': 'admin/endUserManagement',
    'admin.mediaScanner': 'admin/mediaScanner',
    'admin.tvCategories': 'admin/tvCategories',
    'admin.createContent': 'admin/createContent',
    'admin.createSeries': 'admin/createSeries',
    'admin.epg': 'admin/epg',
    'admin.appUpdates': 'admin/appUpdates',

    // security pages (compat for dotted keys)
    'admin.securityBans': 'admin/securityBans',
    'admin.securityIncidents': 'admin/securityIncidents',
    'admin.blacklistedDevices': 'admin/blacklistedDevices',

    // additional admin pages
    'admin.createBan': 'admin/createBan',
    'admin.search': 'admin/search',
    'admin.dashboard': 'admin/dashboard',
    'admin.provider': 'admin/tvProviders'
  };

  // Infer dynamic namespace from first key segment for components that
  // call t('content.*') without explicitly binding the namespace.
  const ROOT_NS_MAP: Record<string, string> = {
    content: 'admin/content',
    devices: 'admin/devices',
    createContent: 'admin/createContent',
    editContent: 'admin/editContent',
    seriesManagement: 'admin/createSeries',
    apiKeys: 'reseller/apiKeys',
    episodes: 'admin/episodes',
    specializedContent: 'admin/specializedContent',
  };

  i18n.t = ((key: any, opts?: any) => {
    const lng = i18n.language || 'en';

    // Ensure per-page namespaces (admin/<page>) load when used via useTranslation('admin/<page>')
    // or via explicit colon keys like "admin/<page>:key".
    ensureDynamicNamespacesLoaded(lng, key, opts);

    // Resolve common root keys (content.*, createContent.*, etc.) against
    // their dynamic namespaces to avoid showing raw keys during lazy loading.
    if (typeof key === 'string' && !key.includes(':')) {
      const root = key.split('.')[0];
      const inferredNs = ROOT_NS_MAP[root];
      if (inferredNs) {
        loadNamespace(lng, inferredNs).catch(() => { });
        const namespacedKey = `${inferredNs}:${key}`;
        const out = origT(namespacedKey, opts);
        if (out !== namespacedKey) return out;
        const out2 = origT(key, { ...opts, ns: inferredNs });
        if (out2 !== key) return out2;
      }
    }

    // only handle string keys
    if (typeof key === 'string' && key.startsWith('admin.')) {
      // find which admin.<page>.* it belongs to
      const parts = key.split('.');
      if (parts.length >= 3) {
        const pagePrefix = `${parts[0]}.${parts[1]}`; // e.g., admin.billing
        const rest = parts.slice(2).join('.');       // e.g., overview.title
        const ns = PAGE_MAP[pagePrefix];
        if (ns) {
          // ensure the per-page namespace is loaded for current language
          // fire and forget; translation may resolve after load, so we also try immediate
          loadNamespace(lng, ns).catch(() => { });
          // Try resolving using explicit namespace override
          const namespacedKey = `${ns}:${rest}`;
          const out = origT(namespacedKey, opts);
          if (out !== namespacedKey) return out;
          // fallback attempt without colon (if already in correct ns)
          const out2 = origT(rest, { ...opts, ns });
          if (out2 !== rest) return out2;
          // compatibility: some per-page bundles keep keys nested under admin.<page>.*
          const innerDotted = `${pagePrefix}.${rest}`;
          const out3 = origT(innerDotted, { ...opts, ns });
          if (out3 !== innerDotted) return out3;
          // compatibility: most per-page bundles nest keys under a root object (e.g. { "content": { ... } })
          // so allow admin.<page>.<k> to resolve as <page>.<k> (and also ns tail) within the namespace.
          const rootCandidates = new Set<string>([
            parts[1], // e.g. "content" from admin.content.*
            ns.split('/').pop() || '', // e.g. "activityDashboard" from admin/activityDashboard
          ]);
          for (const root of rootCandidates) {
            if (!root) continue;
            const prefixed = rest.startsWith(`${root}.`) ? rest : `${root}.${rest}`;
            const out4 = origT(prefixed, { ...opts, ns });
            if (out4 !== prefixed) return out4;
          }
        }
      }
    }
    return origT(key, opts);
  }) as any;

  (i18n as any).__compat_wrapped = true;
}

export async function loadNamespace(lng: string, ns: string): Promise<void> {
  // Always load EN for dynamic namespaces so fallbackLng can work without showing raw keys.
  const normalized = normalizeLng(lng);
  await Promise.all([
    loadNamespaceInner('en', ns),
    normalized === 'en' ? Promise.resolve() : loadNamespaceInner(normalized, ns),
  ]);
}

async function loadNamespaceInner(lng: string, ns: string): Promise<void> {
  const key = `${lng}:${ns}`;
  if (loadedNamespaces.has(key)) return;

  try {
    // Try to dynamically import the namespace file under ../locales/{ns}/{lng}.json
    // Fallback to a namespaced ext pack if present.
    let bundle: Record<string, any> | undefined;

    try {
      bundle = (await import(`../locales/${ns}/${lng}.json`)).default;
    } catch (_e) {
      if (ns === 'admin' && (ext[lng]?.admin)) {
        bundle = ext[lng].admin;
      } else {
        bundle = undefined;
      }
    }

    if (bundle) {
      const expanded = expandDotKeys(bundle as Record<string, any>);
      i18n.addResourceBundle(lng, ns, expanded, true, true);
      loadedNamespaces.add(key);
    }
  } catch (_err) {
    // ignore
  }
}

const PRELOAD_DYNAMIC_NAMESPACES = [
  'admin/activityDashboard',
  'admin/activityLogs',
  'admin/appUpdates',
  'admin/billing',
  'admin/blacklistedDevices',
  'admin/bulkImportContent',
  'admin/bulkImportTVChannels',
  'admin/content',
  'admin/createBan',
  'admin/createContent',
  'admin/createSeries',
  'admin/creditsPricing',
  'admin/dashboard',
  'admin/demos',
  'admin/devices',
  'admin/editContent',
  'admin/editEvent',
  'admin/editSeries',
  'admin/editTVChannel',
  'admin/editUser',
  'admin/endUserManagement',
  'admin/epg',
  'admin/episodes',
  'admin/giftcodes',
  'admin/loginHistory',
  'admin/masterKeys',
  'admin/mediaScanner',
  'admin/mediaWatcher',
  'admin/overview',
  'admin/resellerManagement',
  'admin/scanFolder',
  'admin/search',
  'admin/security',
  'admin/securityAlerts',
  'admin/securityBans',
  'admin/securityIncidents',
  'admin/specializedContent',
  'admin/systemConfiguration',
  'admin/tickets',
  'admin/tvCategories',
  'admin/tvProviders',
  'admin/updateDemoLimit',
  'admin/viewResellerUsers',
  'admin/viewingHistory',
  'reseller/apiKeys',
  'reseller/demoManagement',
  'reseller/userDeviceMonitoring',
];

export async function preloadDynamicNamespacesForLanguage(lng: string): Promise<void> {
  const normalized = normalizeLng(lng);
  await Promise.all(
    PRELOAD_DYNAMIC_NAMESPACES.map((ns) =>
      loadNamespace(normalized, ns).catch(() => { }),
    ),
  );
}

export async function changeLanguageWithPreload(lng: string): Promise<void> {
  const normalized = normalizeLng(lng);
  await preloadDynamicNamespacesForLanguage(normalized);
  if (normalizeLng(i18n.language) !== normalized) {
    await i18n.changeLanguage(normalized);
  }
}

if (!i18n.isInitialized) {
  // Always start with 'en' to avoid SSR/CSR hydration mismatch.
  // The actual user language from localStorage is synced in providers.tsx after hydration.
  i18n.init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    nonExplicitSupportedLngs: true,
    // include 'admin' in the list of potential namespaces so useTranslation('admin') will work
    ns: ['translation', 'user', 'admin', 'reseller', 'common'],
    defaultNS: 'translation',
    fallbackNS: ['translation', 'user', 'common'],
    interpolation: {
      escapeValue: false,
      defaultVariables: {
        appName: APP_NAME
      }
    },
    react: {
      useSuspense: false,
      nsMode: 'fallback',
      bindI18n: 'languageChanged loaded',
      bindI18nStore: 'added removed'
    }
  });

  // Enable legacy dotted admin.* compatibility shim (maps to admin/<page>)
  wrapTWithCompatibility();

  // Preload dynamic namespaces to avoid showing raw i18n keys in UI while
  // route-level chunks mount and translation bundles hydrate.
  preloadDynamicNamespacesForLanguage(i18n.language || 'en').catch(() => { });
  i18n.on('languageChanged', (lng) => {
    preloadDynamicNamespacesForLanguage(lng).catch(() => { });
  });
}

export default i18n;
