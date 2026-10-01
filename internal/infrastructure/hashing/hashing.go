// Package hashing implements ports.Hasher with SHA-256 (D063).
package hashing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"

	"modorchestrator/internal/core/application/ports"
)

// SHA256 hashes content as lowercase hex.
type SHA256 struct{}

var _ ports.Hasher = SHA256{}

// Hash streams r; a cancelled context stops it between chunks.
func (SHA256) Hash(ctx context.Context, r io.Reader) (string, error) {
	h := sha256.New()
	buf := make([]byte, 1<<20)
	for {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		n, err := r.Read(buf)
		h.Write(buf[:n])
		if err == io.EOF {
			return hex.EncodeToString(h.Sum(nil)), nil
		}
		if err != nil {
			return "", err
		}
	}
}
