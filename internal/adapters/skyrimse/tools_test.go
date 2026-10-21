package skyrimse

import "testing"

// D146: every known tool is a valid declaration with a unique id, and only
// Skyrim SE has them.
func TestKnownToolsAreValid(t *testing.T) {
	list := Adapter{}.KnownTools(GameID)
	if len(list) < 7 {
		t.Fatalf("known tools = %d", len(list))
	}
	seen := map[string]bool{}
	for _, k := range list {
		if !k.Valid() || seen[k.ID] {
			t.Errorf("invalid or repeated: %+v", k)
		}
		seen[k.ID] = true
	}
	for _, id := range []string{"xedit", "wrye_bash", "nemesis", "pandora", "bodyslide", "dyndolod", "creation_kit"} {
		if !seen[id] {
			t.Errorf("missing %s", id)
		}
	}
	if e, ok := list[0].Match(`C:\Modding\xEdit\xEdit64.exe`); !ok || e.Args != "-SSE" {
		t.Fatalf("generic xEdit needs the game argument: %+v", e)
	}
	if (Adapter{}).KnownTools("other") != nil {
		t.Fatal("tools of another game")
	}
}
