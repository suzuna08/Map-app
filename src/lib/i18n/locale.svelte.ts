import en from './en';
import ja from './ja';
import zhTW from './zh-TW';

const dictionaries: Record<string, Record<string, string>> = { en, ja, 'zh-TW': zhTW };

export type Locale = 'en' | 'ja' | 'zh-TW';

export const LOCALE_LABELS: Record<Locale, string> = {
	en: 'English',
	ja: '日本語',
	'zh-TW': '繁體中文',
};

function detectLocale(): Locale {
	if (typeof window !== 'undefined') {
		const saved = localStorage.getItem('app-locale');
		if (saved && saved in dictionaries) return saved as Locale;
	}
	if (typeof window !== 'undefined') {
		const lang = navigator.language;
		if (lang.startsWith('ja')) return 'ja';
		if (lang === 'zh-TW' || lang.startsWith('zh-Hant')) return 'zh-TW';
	}
	return 'en';
}

class LocaleStore {
	current: Locale = $state(detectLocale());

	getLocale(): Locale {
		return this.current;
	}

	setLocale(l: Locale) {
		this.current = l;
		if (typeof window !== 'undefined') {
			localStorage.setItem('app-locale', l);
		}
	}

	t(key: string): string {
		return dictionaries[this.current]?.[key] ?? dictionaries.en[key] ?? key;
	}
}

const localeStore = new LocaleStore();

export function getLocale(): Locale {
	return localeStore.getLocale();
}

export function setLocale(l: Locale) {
	localeStore.setLocale(l);
}

export function t(key: string): string {
	return localeStore.t(key);
}
