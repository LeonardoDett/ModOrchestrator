// Package gamesettings records what the app last wrote into a game
// settings file (D142). State category: applied. It is the evidence that
// tells a value the app wrote from one the game, the user or another tool
// wrote: a key changed outside the app is never overwritten without the
// user's decision (D008, the spirit of INV-PLG-03).
//
// Today only single keys are recorded (the save folder of the save_games
// feature); the game_settings feature (LV8) adds whole files to the same
// record family.
package gamesettings

import (
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/operation"
)

// Value is the state of a key: absent, or present with a text.
type Value struct {
	Present bool
	Text    string
}

// Absent is a key that is not in the file.
var Absent = Value{}

// Text is a key present with t.
func Text(t string) Value { return Value{Present: true, Text: t} }

// Equal compares two key states.
func (v Value) Equal(o Value) bool {
	return v.Present == o.Present && (!v.Present || v.Text == o.Text)
}

// KeyRecord is what the app last wrote into one key of a game settings
// file. Owner is the feature module that writes it ("saves").
//
// The write follows the journal discipline of the deploy: Pending is
// recorded before the file is written, so a crash between the write and the
// record is recognised as the app's own value. Original is the state of the
// key before the first write, given back when the feature no longer needs
// the key (a profile without its own saves, a purge). OriginalBackup is where
// the file found before the first write was kept in the BackupStore ("" when
// there was no file).
type KeyRecord struct {
	Instance       game.InstanceID
	Owner          string
	Folder         string
	Path           string
	Section        string
	Key            string
	Original       Value
	OriginalBackup string
	Written        Value
	Pending        *Value
	// Profile is the profile the written value belongs to ("" when the
	// original was given back).
	Profile   string
	Operation operation.ID
	AppliedAt time.Time
}

// Ours reports whether the key found in the file is the last value the app
// wrote or is writing.
func (r *KeyRecord) Ours(found Value) bool {
	return found.Equal(r.Written) || (r.Pending != nil && found.Equal(*r.Pending))
}
