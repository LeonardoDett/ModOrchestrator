package game

import "strings"

// UserEntryPrefix starts the id of every game the user describes (D117), so
// it can never collide with a game the app ships, now or later.
const UserEntryPrefix = "user."

// IsUserEntry reports whether id names a game described by the user.
func IsUserEntry(id ID) bool { return strings.HasPrefix(string(id), UserEntryPrefix) }

// UserEntryID turns a game id of a manifest into the id it gets as a user
// entry: the same id inside the user namespace.
func UserEntryID(id ID) ID {
	if IsUserEntry(id) {
		return id
	}
	return ID(UserEntryPrefix + string(id))
}

// NewUserEntryID derives the id of a user entry from the name of the game:
// "user." plus the name in lower case with everything but letters and
// digits turned into single dashes. taken reports ids already in use; a
// number is appended until the id is free.
func NewUserEntryID(name string, taken func(ID) bool) ID {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			dash = false
			b.WriteRune(r)
		default:
			dash = true
		}
		if b.Len() >= 40 {
			break
		}
	}
	slug := b.String()
	if slug == "" {
		slug = "game"
	}
	id := ID(UserEntryPrefix + slug)
	for n := 2; taken != nil && taken(id); n++ {
		id = ID(UserEntryPrefix + slug + "-" + itoa(n))
	}
	return id
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var d []byte
	for ; n > 0; n /= 10 {
		d = append([]byte{byte('0' + n%10)}, d...)
	}
	return string(d)
}
