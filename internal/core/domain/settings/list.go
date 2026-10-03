package settings

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

// Dashlets are the dashlet ids of the V1 dashboard, in their default order
// (ui/telas/dashboard.md §2). Reserved dashlets (tools, news) are absent.
var Dashlets = []string{"first_steps", "attention", "active_game", "recent_games", "recent_operations", "whats_new"}

// ListMode is how one item of a list setting is shown.
type ListMode string

const (
	// ListShown is the default: shown (a self-hiding item may still hide,
	// e.g. "Primeiros passos" once complete).
	ListShown ListMode = ""
	// ListHidden is hidden by the user ("-id").
	ListHidden ListMode = "-"
	// ListPinned is shown even when the item would hide itself ("+id").
	ListPinned ListMode = "+"
)

// ListItem is one item of a list setting.
type ListItem struct {
	ID   string
	Mode ListMode
}

var errList = errors.New("invalid list")

// ParseList reads a list value: ids of options separated by commas, each
// optionally prefixed by "-" or "+", without repetition. Options missing
// from the value are appended at the end, shown, in catalog order, so a
// dashlet added by a new version appears without resetting the layout.
func ParseList(value string, options []string) ([]ListItem, error) {
	var out []ListItem
	seen := map[string]bool{}
	for _, raw := range strings.Split(value, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		it := ListItem{ID: raw}
		if p := raw[:1]; p == "-" || p == "+" {
			it.Mode, it.ID = ListMode(p), raw[1:]
		}
		if !slices.Contains(options, it.ID) {
			return nil, fmt.Errorf("%w: unknown item %q", errList, it.ID)
		}
		if seen[it.ID] {
			return nil, fmt.Errorf("%w: %q repeated", errList, it.ID)
		}
		seen[it.ID] = true
		out = append(out, it)
	}
	for _, o := range options {
		if !seen[o] {
			out = append(out, ListItem{ID: o})
		}
	}
	return out, nil
}

// FormatList writes items back as a list value.
func FormatList(items []ListItem) string {
	parts := make([]string, len(items))
	for i, it := range items {
		parts[i] = string(it.Mode) + it.ID
	}
	return strings.Join(parts, ",")
}
