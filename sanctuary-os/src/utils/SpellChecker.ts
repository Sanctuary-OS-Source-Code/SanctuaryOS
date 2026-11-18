import nspell from 'nspell';

class SpellChecker {
    private spell: any = null;
    public initialized = false;
    private initializationPromise: Promise<void> | null = null;

    async initialize() {
        if (this.initialized) return;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            try {
                const [affRes, dicRes] = await Promise.all([
                    fetch('/dict/en_US.aff'),
                    fetch('/dict/en_US.dic')
                ]);
                const aff = await affRes.text();
                const dic = await dicRes.text();
                this.spell = nspell(aff, dic);
                this.initialized = true;
            } catch (err) {
                console.error("Failed to initialize spell checker", err);
            }
        })();

        return this.initializationPromise;
    }

    isCorrect(word: string): boolean {
        if (!this.initialized || !this.spell || !word) return true;
        // Ignore numbers or special chars
        if (!/^[a-zA-Z]+$/.test(word)) return true;
        return this.spell.correct(word);
    }

    suggest(word: string): string[] {
        if (!this.initialized || !this.spell || !word) return [];
        return this.spell.suggest(word);
    }
}

export const spellChecker = new SpellChecker();
