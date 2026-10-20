package skyrimse

import (
	"testing"

	"modorchestrator/internal/core/domain/mod"
)

// D131: every id this adapter shows to the user has a label in every
// language of its catalog.
func TestCatalogLabelsEveryID(t *testing.T) {
	keys := []string{"launch.option." + LaunchSKSE}
	for _, f := range []mod.ContentFlag{
		FlagPlugin, FlagArchive, FlagTextures, FlagMeshes, FlagScripts, FlagInterface, FlagSounds,
		FlagSKSEPlugin, FlagSKSERuntime, FlagENB, FlagBodySlide, FlagAnimations, FlagStrings, FlagINI,
	} {
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
