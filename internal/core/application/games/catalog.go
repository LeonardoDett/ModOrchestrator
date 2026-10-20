package games

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
)

// fallbackLanguage is the language every adapter catalog must have; a text
// missing in another language falls back to it.
const fallbackLanguage = "en"

// adapterTexts are the texts the adapters declare (D131), by language.
type adapterTexts map[string]map[string]string

// buildCatalogs gathers the codes and texts of every adapter that declares
// them. A code is declared once; a key declared by two adapters must have
// the same text in every language, so no adapter changes another's label.
func buildCatalogs(adapters []ports.GameAdapter) (diagnostic.Catalog, adapterTexts, error) {
	var codes []diagnostic.CodeSpec
	texts := adapterTexts{}
	owner := map[string]string{}
	for _, a := range adapters {
		cp, ok := a.(ports.CatalogProvider)
		if !ok {
			continue
		}
		c := cp.Catalog()
		if err := checkAdapterCatalog(c); err != nil {
			return diagnostic.Catalog{}, nil, fmt.Errorf("games: adapter %s: %w", a.Name(), err)
		}
		codes = append(codes, c.Diagnostics...)
		for lang, msgs := range c.Messages {
			if texts[lang] == nil {
				texts[lang] = map[string]string{}
			}
			for k, v := range msgs {
				if prev, dup := texts[lang][k]; dup && prev != v {
					return diagnostic.Catalog{}, nil, fmt.Errorf("games: adapters %s and %s give key %q different texts", owner[k], a.Name(), k)
				}
				texts[lang][k] = v
				if _, seen := owner[k]; !seen {
					owner[k] = a.Name()
				}
			}
		}
	}
	cat, err := diagnostic.NewCatalog(codes...)
	if err != nil {
		return diagnostic.Catalog{}, nil, fmt.Errorf("games: %w", err)
	}
	return cat, texts, nil
}

// checkAdapterCatalog refuses texts the UI could not use: keys outside the
// adapter namespaces, a language without the keys of "en", an empty text,
// or a declared code without its title.
func checkAdapterCatalog(c ports.AdapterCatalog) error {
	base, ok := c.Messages[fallbackLanguage]
	if !ok && (len(c.Messages) > 0 || len(c.Diagnostics) > 0) {
		return fmt.Errorf("catalog has no %q texts", fallbackLanguage)
	}
	for k := range base {
		if !slices.ContainsFunc(ports.AdapterMessagePrefixes, func(p string) bool { return strings.HasPrefix(k, p) && len(k) > len(p) }) {
			return fmt.Errorf("key %q is outside the adapter namespaces", k)
		}
	}
	for lang, msgs := range c.Messages {
		for k, v := range msgs {
			if _, ok := base[k]; !ok {
				return fmt.Errorf("key %q of %s is missing in %s", k, lang, fallbackLanguage)
			}
			if strings.TrimSpace(v) == "" {
				return fmt.Errorf("key %q of %s is empty", k, lang)
			}
		}
		for k := range base {
			if _, ok := msgs[k]; !ok {
				return fmt.Errorf("key %q is missing in %s", k, lang)
			}
		}
	}
	for _, s := range c.Diagnostics {
		if _, ok := base["diag.code."+string(s.Code)]; !ok {
			return fmt.Errorf("code %s has no text diag.code.%s", s.Code, s.Code)
		}
	}
	return nil
}

// Diagnostics is the catalog of codes in effect: the core's and the ones
// the adapters declare. Without a registry it is the core's.
func (r *Registry) Diagnostics() diagnostic.Catalog {
	if r == nil {
		return diagnostic.Catalog{}
	}
	return r.diagnostics
}

// Messages returns the adapter texts in a language, with "en" for a
// language no adapter translates. The UI adds them after its own catalog
// (D131).
func (r *Registry) Messages(language string) map[string]string {
	out := maps.Clone(r.texts[fallbackLanguage])
	if out == nil {
		out = map[string]string{}
	}
	maps.Copy(out, r.texts[language])
	return out
}
