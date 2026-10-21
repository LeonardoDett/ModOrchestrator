// Package savegame is the vocabulary of the save_games feature (D142): how
// an adapter points the game at a save folder and what it reads from a save
// file. The facts of a game (file names, the key, the format of a save) are
// the adapter's; the core only uses these shapes.
package savegame

import (
	"strings"
	"time"
)

// Redirect is how a game is pointed at a save folder: one key of a settings
// file whose value is a folder relative to Base. Folder names the known
// folder of the user the paths start from (ports.FolderDocuments).
type Redirect struct {
	Folder string
	// Settings is the settings file, relative to Folder ("/" separators).
	Settings string
	Section  string
	Key      string
	// Base is the folder the value is relative to, relative to Folder.
	Base string
	// Default is the value the game uses when the key is absent (its own
	// save folder, relative to Base).
	Default string
	// Separator ends the folders of the value ("\" for a Windows game).
	Separator string
}

// Value is the key value that makes the game use the save folder of a
// namespace: Default + namespace + Separator.
func (r Redirect) Value(namespace string) string {
	d := r.Default
	if d != "" && !strings.HasSuffix(d, r.Separator) {
		d += r.Separator
	}
	return d + namespace + r.Separator
}

// Folder of a value: the folder, relative to Redirect.Folder and with "/"
// separators, the game saves to when the key has that value. An empty value
// is the game's default folder.
func (r Redirect) FolderOf(value string) string {
	if strings.TrimSpace(value) == "" {
		value = r.Default
	}
	if r.Separator != "" && r.Separator != "/" {
		value = strings.ReplaceAll(value, r.Separator, "/")
	}
	value = strings.Trim(value, "/ ")
	if r.Base == "" {
		return value
	}
	return strings.TrimSuffix(r.Base, "/") + "/" + value
}

// Valid reports whether every field the core needs is set.
func (r Redirect) Valid() bool {
	return r.Folder != "" && r.Settings != "" && r.Section != "" && r.Key != "" && r.Default != "" && r.Separator != ""
}

// Screenshot is the picture stored in a save: Width × Height pixels, RGBA,
// 4 bytes per pixel, row by row from the top.
type Screenshot struct {
	Width, Height int
	RGBA          []byte
}

// Kind says how a save was made.
type Kind string

const (
	KindManual Kind = "manual"
	KindQuick  Kind = "quick"
	KindAuto   Kind = "auto"
)

// Header is what a save tells about itself without loading the game.
type Header struct {
	Kind Kind
	// Number is the save number the game shows ("Save 142"); 0 when the
	// game has none.
	Number    int
	Character string
	Level     int
	Location  string
	// GameTime is the date inside the game, as the game writes it;
	// GameDay, GameHour and GameMinute are it read by the adapter (GameDay 0
	// when the adapter could not read it).
	GameTime   string
	GameDay    int
	GameHour   int
	GameMinute int
	Race       string
	// SavedAt is when the save was written, from the save itself (zero
	// when it has none; the file time is used then).
	SavedAt time.Time
	// Plugins are the plugins the save was made with, in load order; light
	// plugins are listed after the full ones.
	Plugins    []string
	Screenshot *Screenshot
}
