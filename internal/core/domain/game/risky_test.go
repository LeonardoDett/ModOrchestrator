package game

import "testing"

func TestPlaceOf(t *testing.T) {
	places := []Place{
		{PlaceDocuments, `C:\Users\Ana\OneDrive\Documents`},
		{PlaceOneDrive, `C:\Users\Ana\OneDrive`},
		{PlaceDesktop, `C:\Users\Ana\Desktop`},
		{PlaceDownloads, `C:\Users\Ana\Downloads`},
		{PlaceProgramFiles, `C:\Program Files (x86)`},
		{PlaceProgramFiles, ""}, // unresolved folder
	}
	for _, c := range []struct {
		folder string
		want   PlaceKind
	}{
		{`C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition`, PlaceProgramFiles},
		{`c:/program files (x86)`, PlaceProgramFiles},
		{`C:\Users\Ana\OneDrive\Documents\Mods\staging`, PlaceOneDrive},
		{`C:\Users\Ana\Desktop\staging`, PlaceDesktop},
		{`C:\Users\Ana\Downloads`, PlaceDownloads},
		{`C:\Program Files\WindowsApps\BethesdaSoftworks.SkyrimSE-PC_1.0.0.0_x64__3275kfvn8vcwc`, PlaceWindowsApps},
		{`D:\WindowsApps\Game`, PlaceWindowsApps},
		{`C:\Games\Skyrim`, ""},
		{`C:\Users\Ana\Desktopia`, ""}, // a sibling with the same prefix
		{`relative\path`, ""},
	} {
		got, ok := PlaceOf(c.folder, places)
		if got != c.want || ok != (c.want != "") {
			t.Errorf("PlaceOf(%q) = %q, %v; want %q", c.folder, got, ok, c.want)
		}
	}
	if !PlaceWindowsApps.Refused() || PlaceOneDrive.Refused() {
		t.Fatal("only WindowsApps is refused")
	}
}
