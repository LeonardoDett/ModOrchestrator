package gamesettings

import (
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// File is a settings file of the game that a profile may keep a copy of
// (core/07 §7, the game_settings feature). Folder names the known folder of
// the user the path starts from (ports.FolderDocuments); Path is relative to
// it, with "/" separators. The adapter declares them; the core never names
// a file of a game.
type File struct {
	Folder string
	Path   string
}

// Valid reports whether both parts are set.
func (f File) Valid() bool { return f.Folder != "" && f.Path != "" }

// Name is the file name, without the folders.
func (f File) Name() string {
	p := f.Path
	if i := strings.LastIndex(p, "/"); i >= 0 {
		p = p[i+1:]
	}
	return p
}

// Same reports whether two paths name the same file (Windows compares
// without case).
func Same(a, b string) bool { return strings.EqualFold(a, b) }

// Required is a key the game needs with a value for mods to work (M11 of
// the MO2/Vortex survey: the archive invalidation keys of Fallout 4 or
// Oblivion). File is the Path of one of the declared files. The check
// compares the value without case and without the spaces around it.
type Required struct {
	File    string
	Section string
	Key     string
	Value   string
}

// Valid reports whether every field is set (Value may be empty: the key
// must be present with an empty value).
func (r Required) Valid() bool { return r.File != "" && r.Section != "" && r.Key != "" }

// Satisfied reports whether a found value meets the requirement.
func (r Required) Satisfied(found Value) bool {
	return found.Present && strings.EqualFold(strings.TrimSpace(found.Text), strings.TrimSpace(r.Value))
}

// Copy is the copy of a settings file a profile keeps (desired state). A
// copy that is not Present stands for "the file does not exist" in that
// profile.
type Copy struct {
	// Profile is the id of the profile.
	Profile   string
	Path      string
	Present   bool
	Content   []byte
	UpdatedAt time.Time
}

// FileRecord is what the app last put in a settings file of the game
// (applied state). Profile is the profile whose copy is in the game; ""
// means the shared file, the one the game had before the app swapped it.
// While a copy of a profile is in the game, the shared file waits in
// Shared (SharedPresent false: there was no file).
//
// The write follows the journal discipline of the deploy: PendingHash is
// recorded before the file is written, so a crash between the write and the
// record is recognised. OriginalBackup is where the file found before the
// first swap was kept in the BackupStore.
type FileRecord struct {
	Instance      game.InstanceID
	Folder        string
	Path          string
	Profile       string
	Shared        []byte
	SharedPresent bool
	WrittenHash   string
	PendingHash   string
	// PendingProfile is the profile being written while PendingHash is set.
	PendingProfile string
	OriginalBackup string
	Operation      operation.ID
	AppliedAt      time.Time
}

// TweakOwnerPrefix starts the owner of the key records of the INI tweaks.
const TweakOwnerPrefix = "game_settings.tweak:"

// TweakOwner is the owner of the record of one key an INI tweak writes:
// file, section and key without case.
func TweakOwner(file, section, key string) string {
	return TweakOwnerPrefix + strings.ToLower(file) + "|" + strings.ToLower(section) + "|" + strings.ToLower(key)
}

// IsTweak reports whether a key record belongs to the INI tweaks.
func IsTweak(owner string) bool { return strings.HasPrefix(owner, TweakOwnerPrefix) }

// Active reports whether the app holds the key at a value of its own: the
// value it wrote differs from what the key would be without it. A record
// that gave its key back (Written equal to Original) only remembers.
func (r *KeyRecord) Active() bool { return !r.Written.Equal(r.Original) }
