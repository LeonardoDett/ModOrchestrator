// Package system provides OS-backed implementations of small core ports:
// time and identifier generation.
package system

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"time"
)

// Clock is the wall clock, in UTC.
type Clock struct{}

// Now returns the current UTC time.
func (Clock) Now() time.Time { return time.Now().UTC() }

// IDs generates UUIDv7 identifiers: unique and roughly time-ordered, which
// keeps database indexes and logs readable.
type IDs struct{}

// NewID returns a new UUIDv7 string.
func (IDs) NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("system: crypto/rand failed: %v", err))
	}
	var ts [8]byte
	binary.BigEndian.PutUint64(ts[:], uint64(time.Now().UnixMilli()))
	copy(b[0:6], ts[2:8])
	b[6] = (b[6] & 0x0f) | 0x70 // version 7
	b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
