package valheim

import (
	"testing"

	"modorchestrator/internal/core/domain/mod"
)

// D131: every id this adapter shows to the user has a label in every
// language of its catalog. The launch option "game" is labelled by the app.
func TestCatalogLabelsEveryID(t *testing.T) {
	var keys []string
	for _, f := range []mod.ContentFlag{FlagPlugin, FlagPatcher, FlagConfig, FlagRuntime} {
		keys = append(keys, content(f))
	}
	for _, in := range (Adapter{}).Installers(GameID) {
		keys = append(keys, "mods.installer."+in.ID())
	}
	cat := Adapter{}.Catalog()
	for _, lang := range []string{"en", "pt-BR"} {
		for _, k := range keys {
			if cat.Messages[lang][k] == "" {
				t.Errorf("%s: no text for %s", lang, k)
			}
		}
	}
}
