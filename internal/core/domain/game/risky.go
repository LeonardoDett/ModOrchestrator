package game

import (
	"slices"
	"strings"
)

// PlaceKind names a folder of the user where the game, the staging or the
// archives should not be (D151, M6 of the MO2/Vortex survey).
type PlaceKind string

const (
	// PlaceOneDrive: a synced folder. Files on demand break hardlinks and
	// the journal, and the sync client locks files while it uploads them.
	PlaceOneDrive PlaceKind = "onedrive"
	// PlaceDesktop, PlaceDocuments and PlaceDownloads are often synced or
	// redirected, and cleaned by the user or by tools.
	PlaceDesktop   PlaceKind = "desktop"
	PlaceDocuments PlaceKind = "documents"
	PlaceDownloads PlaceKind = "downloads"
	// PlaceProgramFiles needs administrator rights to write; Windows may
	// redirect writes of a program without them to the VirtualStore.
	PlaceProgramFiles PlaceKind = "program_files"
	// PlaceWindowsApps is the protected folder of Microsoft Store and Game
	// Pass games: nothing can be deployed into it. It is refused, not
	// warned about.
	PlaceWindowsApps PlaceKind = "windows_apps"
)

// windowsAppsFolder is the protected folder of Microsoft Store packages, on
// any drive.
const windowsAppsFolder = "windowsapps"

// Place is a known folder of the user and its kind.
type Place struct {
	Kind PlaceKind
	Path string
}

// Refused reports whether a folder in this kind of place cannot be used.
func (k PlaceKind) Refused() bool { return k == PlaceWindowsApps }

// PlaceOf tells in which risky place folder is (the folder itself or one
// of its parents). A WindowsApps folder anywhere in the path wins; then
// OneDrive (a Documents or Desktop moved into OneDrive is synced); then
// the deepest of the places that contain it. ok is false when the folder
// is in none.
func PlaceOf(folder string, places []Place) (PlaceKind, bool) {
	c := CleanAbs(folder)
	if c == "" {
		return "", false
	}
	if slices.Contains(strings.Split(c, "/"), windowsAppsFolder) {
		return PlaceWindowsApps, true
	}
	var best Place
	found := false
	for _, p := range places {
		if strings.TrimSpace(p.Path) == "" || !(SamePath(folder, p.Path) || Within(folder, p.Path)) {
			continue
		}
		if !found || better(p, best) {
			best, found = p, true
		}
	}
	return best.Kind, found
}

// better reports whether p explains a folder better than q: OneDrive first,
// then the deeper place.
func better(p, q Place) bool {
	if po, qo := p.Kind == PlaceOneDrive, q.Kind == PlaceOneDrive; po != qo {
		return po
	}
	return len(CleanAbs(p.Path)) > len(CleanAbs(q.Path))
}
