package game

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"modorchestrator/internal/core/domain/relpath"
)

// RootReason says why a folder is not a valid game installation.
type RootReason string

const (
	RootNotFound      RootReason = "not_found"
	RootNotDirectory  RootReason = "not_directory"
	RootMarkerMissing RootReason = "marker_missing"
	RootUnreadable    RootReason = "unreadable"
	RootNotAbsolute   RootReason = "not_absolute"
)

// ErrRootInvalid is wrapped by *RootError.
var ErrRootInvalid = errors.New("game: invalid installation folder")

// RootError is returned by adapters when a folder is not an installation of
// the game. Marker names the file that was expected, when that is the cause.
type RootError struct {
	Reason RootReason
	Marker string
}

func (e *RootError) Error() string {
	if e.Marker != "" {
		return fmt.Sprintf("%v: %s (%s)", ErrRootInvalid, e.Reason, e.Marker)
	}
	return fmt.Sprintf("%v: %s", ErrRootInvalid, e.Reason)
}

func (e *RootError) Unwrap() error { return ErrRootInvalid }

// TargetSpec is a target declared by the user for a generic game: an id and a
// folder relative to the game root ("" is the root itself).
type TargetSpec struct {
	ID   TargetID
	Path string
}

var targetIDPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,31}$`)

// ResolveCustomTargets validates user-declared targets against a root and
// returns the absolute targets. The first is the default target.
func ResolveCustomTargets(root string, specs []TargetSpec) ([]Target, error) {
	if len(specs) == 0 {
		return nil, fmt.Errorf("%w: at least one target is required", ErrInvalid)
	}
	out := make([]Target, 0, len(specs))
	seenID := map[TargetID]bool{}
	for _, s := range specs {
		if !targetIDPattern.MatchString(string(s.ID)) {
			return nil, fmt.Errorf("%w: target id %q must be 1-32 chars of a-z, 0-9, _ or - starting with a letter", ErrInvalid, s.ID)
		}
		if seenID[s.ID] {
			return nil, fmt.Errorf("%w: target id %q declared twice", ErrInvalid, s.ID)
		}
		seenID[s.ID] = true
		path := root
		if strings.TrimSpace(s.Path) != "" {
			rel, err := relpath.Parse(s.Path)
			if err != nil {
				return nil, fmt.Errorf("%w: target %q: %v", ErrInvalid, s.ID, err)
			}
			path = JoinPath(root, rel.String())
		}
		for _, o := range out {
			if SamePath(o.Path, path) {
				return nil, fmt.Errorf("%w: targets %q and %q point to the same folder", ErrInvalid, o.ID, s.ID)
			}
		}
		out = append(out, Target{ID: s.ID, Path: path})
	}
	return out, nil
}
