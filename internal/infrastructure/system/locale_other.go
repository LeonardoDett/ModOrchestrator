//go:build !windows

package system

import (
	"os"
	"strings"
)

// Locale reads the user's UI language from the POSIX environment.
type Locale struct{}

// Language returns the tag from LC_ALL, LC_MESSAGES or LANG ("pt_BR.UTF-8"
// becomes "pt_BR"), or "".
func (Locale) Language() string {
	for _, key := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if v := os.Getenv(key); v != "" && v != "C" && v != "POSIX" {
			tag, _, _ := strings.Cut(v, ".")
			return tag
		}
	}
	return ""
}
